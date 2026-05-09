// On-chain ENS messenger — chat-as-ENS-subname architecture.
//
// Each pair of twins gets ONE chat subname under the parent:
//   chat-<labelA>-<labelB>.ethtwin.eth   (labels sorted lexically)
//
// Every message in that chat is a TEXT RECORD on the chat subname:
//   chat.participants                  → JSON [aEns, bEns]
//   messages.count                      → "<N>" (string of total count)
//   msg.<i>                             → JSON { from, body (stealth), at,
//                                          stealth.cosmic-attestation, stealth.nonce }
//
// Each participant ALSO carries a `chats.list` text record on their own
// twin ENS — a JSON array of chat subnames they're a part of. That's what
// the inbox-view uses to enumerate threads.
//
// Why this shape (vs one-subname-per-message):
//   - Cleaner: 1 chat = 1 ENS name. The subname itself is a meaningful
//     ENS identity ("daniel-tom.ethtwin.eth"-style) instead of a
//     bracket-encoded labelhash that ENS apps can't display.
//   - Cheaper: subsequent messages are 1 tx (just setText), not 2.
//   - Stronger ENS-bounty story: each conversation IS an ENS name with
//     stealth-encrypted records.
//
// Backwards compat: the public surface stays — `sendMessage`, `readInbox`,
// `Message` shape — only the on-chain layout changes. Old messages stored
// under the previous `msg-<ts>-<seq>.<recipient>` layout are unreadable
// through this code path; the demo's existing test messages are fine to
// abandon.

import {
  concat,
  encodeFunctionData,
  keccak256,
  namehash,
  toBytes,
  type Address,
  type Hash,
  type Hex,
} from "viem"
import { ENS_REGISTRY, readSubnameOwner, readTextRecordFast } from "./ens"
import { ensResolverAbi, ensRegistryAbi } from "./abis"
import { PARENT_DOMAIN, getDevWalletClient, sepoliaClient } from "./viem"
import { sepolia as sepoliaChain } from "viem/chains"
import { encryptMessage, decryptMessage, isStealthBlob } from "./message-crypto"

// ── Constants & shared types ────────────────────────────────────────────────

const PARENT_RESOLVER: `0x${string}` = "0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5"
const SEPOLIA_MAX_FEE_PER_GAS = 5_000_000_000n
const SEPOLIA_MAX_PRIORITY_FEE_PER_GAS = 1_500_000_000n
const CREATE_SUBNAME_GAS = 200_000n
const RESOLVER_MULTICALL_GAS = 1_000_000n
const ZERO_ADDRESS: Address = "0x0000000000000000000000000000000000000000"

const CHATS_LIST_KEY = "chats.list"
const PARTICIPANTS_KEY = "chat.participants"
const MESSAGES_COUNT_KEY = "messages.count"
const MAX_MESSAGES_PER_CHAT = 200 // keeps msg.<i> records bounded

export type Message = {
  /** Index within the chat (matches `msg.<i>` text record key). */
  index: number
  /** ENS of the chat subname this message belongs to. Lets the UI thread
   *  messages by chat without re-deriving the pair. */
  chatEns: string
  /** Sender twin ENS. */
  from: string
  /** Decrypted plaintext body (or `[encrypted — could not decrypt]` on key
   *  derivation failure). */
  body: string
  /** Unix-seconds timestamp from the on-chain JSON. */
  at: number
  /** Always true on the new architecture (every body is stealth-encrypted). */
  stealth: boolean
  /** Orbitport cTRNG attestation (or `mock-attestation` when no key set). */
  cosmicAttestation: string
}

// ── Chat subname derivation ─────────────────────────────────────────────────

/**
 * Deterministic chat subname for a pair of twins. Both sides resolve the
 * same name regardless of who sends first — labels are sorted before
 * concatenation.
 *
 * Rules:
 *   - Both inputs must end in `.<PARENT_DOMAIN>` (otherwise they're not
 *     twins under our parent and we'd be writing to a name we don't own).
 *   - The chat label is `chat-<a>-<b>` where (a, b) are sorted lowercase
 *     ASCII labels.
 *   - The result lives directly under the parent: `chat-<a>-<b>.<PARENT>`.
 */
export function chatSubnameFor(aEns: string, bEns: string): string {
  const aLabel = labelOf(aEns)
  const bLabel = labelOf(bEns)
  const [lo, hi] = [aLabel, bLabel].sort()
  return `chat-${lo}-${hi}.${PARENT_DOMAIN}`
}

function labelOf(ens: string): string {
  const parts = ens.toLowerCase().split(".")
  if (parts.length === 0) throw new Error(`Invalid ENS name: "${ens}"`)
  // Must be a direct child of the parent: <label>.<parent>
  const expectedSuffix = `.${PARENT_DOMAIN.toLowerCase()}`
  if (!ens.toLowerCase().endsWith(expectedSuffix)) {
    throw new Error(
      `Refusing to derive chat subname for "${ens}" — must end in .${PARENT_DOMAIN}`,
    )
  }
  const label = parts[0]!
  if (!/^[a-z0-9-]+$/.test(label)) {
    throw new Error(
      `Twin label "${label}" contains characters that aren't ENS-normalizable (a-z, 0-9, -).`,
    )
  }
  return label
}

// ── Read side ───────────────────────────────────────────────────────────────

async function readChatList(twinEns: string): Promise<string[]> {
  try {
    const raw = await readTextRecordFast(twinEns, CHATS_LIST_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((x): x is string => typeof x === "string")
  } catch {
    return []
  }
}

async function readChatMessageCount(chatEns: string): Promise<number> {
  try {
    const raw = await readTextRecordFast(chatEns, MESSAGES_COUNT_KEY)
    if (!raw) return 0
    const n = Number.parseInt(raw, 10)
    return Number.isFinite(n) && n >= 0 ? n : 0
  } catch {
    return 0
  }
}

/** Read the chat.participants text record, returning the two-ENS array.
 *  Set on first message of every chat, so any non-empty chat has it. */
async function readChatParticipants(
  chatEns: string,
): Promise<[string, string] | null> {
  try {
    const raw = await readTextRecordFast(chatEns, PARTICIPANTS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed) || parsed.length !== 2) return null
    const [a, b] = parsed
    if (typeof a !== "string" || typeof b !== "string") return null
    return [a, b]
  } catch {
    return null
  }
}

type StoredMessage = {
  from: string
  body: string // stealth blob
  at: number
  cosmicAttestation: string
  // nonce is part of the blob; we still publish it for verifier clarity
}

async function readStoredMessage(
  chatEns: string,
  index: number,
): Promise<StoredMessage | null> {
  try {
    const raw = await readTextRecordFast(chatEns, `msg.${index}`)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredMessage>
    if (
      typeof parsed.from !== "string" ||
      typeof parsed.body !== "string" ||
      typeof parsed.at !== "number"
    ) {
      return null
    }
    return {
      from: parsed.from,
      body: parsed.body,
      at: parsed.at,
      cosmicAttestation: parsed.cosmicAttestation ?? "",
    }
  } catch {
    return null
  }
}

/** Read every message in a single chat, decrypting the stealth bodies. */
export async function readChatThread(
  chatEns: string,
  myEns: string,
): Promise<Message[]> {
  // Pull count + participants in parallel — both are tiny text reads on the
  // chat node. The participants record (set on first message) is what lets
  // us derive the same per-pair HMAC key the sender used; without it,
  // decryption silently fails because pairKey(myEns, myEns) ≠
  // pairKey(myEns, peerEns).
  const [count, participants] = await Promise.all([
    readChatMessageCount(chatEns),
    readChatParticipants(chatEns),
  ])
  if (count === 0) return []

  // Identify the peer (the other participant). Falls back to a label-parse
  // for chats that pre-date the participants record, then to myEns as a
  // last resort (which produces the wrong key but at least doesn't throw).
  const peer =
    pickPeerFromParticipants(participants, myEns) ??
    pickPeerFromChatLabel(chatEns, myEns) ??
    myEns

  const indices = Array.from({ length: count }, (_, i) => i)
  const stored = await Promise.all(indices.map((i) => readStoredMessage(chatEns, i)))
  const out: Message[] = []
  for (let i = 0; i < stored.length; i++) {
    const m = stored[i]
    if (!m) continue
    let body = m.body
    let stealth = false
    if (isStealthBlob(m.body)) {
      stealth = true
      // pairKey sorts its two inputs, so we just need the unordered pair
      // {myEns, peerEns} to match what the sender used. Pass them in any
      // order — pairKey(a, b) === pairKey(b, a).
      const plain = decryptMessage({
        senderEns: myEns,
        recipientEns: peer,
        ciphertext: m.body,
      })
      body = plain ?? "[encrypted — could not decrypt]"
    }
    out.push({
      index: i,
      chatEns,
      from: m.from,
      body,
      at: m.at,
      stealth,
      cosmicAttestation: m.cosmicAttestation,
    })
  }
  return out
}

function pickPeerFromParticipants(
  participants: [string, string] | null,
  myEns: string,
): string | null {
  if (!participants) return null
  const me = myEns.toLowerCase()
  if (participants[0].toLowerCase() === me) return participants[1]
  if (participants[1].toLowerCase() === me) return participants[0]
  // Neither participant matches me — odd, but fall through to other strategies.
  return null
}

/** Best-effort fallback when chat.participants isn't available: parse the
 *  chat label "chat-<a>-<b>" and reconstruct the peer ENS. Ambiguous when
 *  either label contains a dash, so this is only a last resort. */
function pickPeerFromChatLabel(chatEns: string, myEns: string): string | null {
  const dot = chatEns.indexOf(".")
  if (dot < 0) return null
  const label = chatEns.slice(0, dot)
  const suffix = chatEns.slice(dot + 1)
  if (!label.startsWith("chat-")) return null
  const myLabel = myEns.toLowerCase().split(".")[0]
  if (!myLabel) return null
  const inner = label.slice(5) // strip "chat-"
  // Two cases for unambiguous parsing:
  //   inner = "<myLabel>-<peer>"  → peer = inner.slice(myLabel.length + 1)
  //   inner = "<peer>-<myLabel>"  → peer = inner.slice(0, -myLabel.length - 1)
  if (inner.startsWith(`${myLabel}-`)) {
    const peerLabel = inner.slice(myLabel.length + 1)
    if (peerLabel) return `${peerLabel}.${suffix}`
  }
  if (inner.endsWith(`-${myLabel}`)) {
    const peerLabel = inner.slice(0, -myLabel.length - 1)
    if (peerLabel) return `${peerLabel}.${suffix}`
  }
  return null
}

/**
 * Aggregate inbox view: every message across every chat the twin is in,
 * sorted newest-first. Hard-capped per call.
 */
export async function readInbox(
  recipientEns: string,
  limit = 30,
): Promise<Message[]> {
  const chats = await readChatList(recipientEns)
  if (chats.length === 0) return []
  const threads = await Promise.all(
    chats.map((chat) => readChatThread(chat, recipientEns)),
  )
  const flat = threads.flat()
  flat.sort((a, b) => b.at - a.at)
  return flat.slice(0, Math.max(1, limit))
}

// ── Send side ──────────────────────────────────────────────────────────────

export type SendMessageResult = {
  message: Message
  chatEns: string
  /** True iff this send minted a fresh chat subname (vs appended to an
   *  existing thread). UI can label "started a new conversation" once. */
  createdChat: boolean
  createSubnameTx: Hash | null
  recordsMulticallTx: Hash
  blockExplorerUrl: string
  cosmicAttestation: string
  cosmicSeeded: boolean
}

/**
 * Send a stealth-encrypted message from `fromEns` to `toEns`. Mints the
 * pair's chat subname on first message, otherwise appends.
 */
export async function sendMessage(args: {
  fromEns: string
  toEns: string
  body: string
}): Promise<SendMessageResult> {
  const { fromEns, toEns, body } = args
  if (!body.trim()) throw new Error("Message body is empty.")
  if (body.length > 1000) throw new Error("Message body exceeds 1000 chars.")

  const { account } = getDevWalletClient()
  const chatEns = chatSubnameFor(fromEns, toEns)
  const chatLabel = chatEns.split(".")[0]!
  const parentNode = namehash(PARENT_DOMAIN)
  const chatNode = namehash(chatEns)
  const fromNode = namehash(fromEns)
  const toNode = namehash(toEns)

  // Sanity: the node setSubnodeRecord will create equals
  // keccak256(parentNode || labelhash). The same node has to be what
  // namehash(chatEns) produces; otherwise reads and writes target
  // different storage slots and the chat looks empty forever.
  const labelHash = keccak256(toBytes(chatLabel))
  const expectedChatNode = keccak256(concat([parentNode, labelHash]))
  if (expectedChatNode !== chatNode) {
    throw new Error(
      `chatNode namehash mismatch: setSubnodeRecord would create ${expectedChatNode}, ` +
        `but namehash(${chatEns}) = ${chatNode}. Reads and writes target different nodes.`,
    )
  }

  // Encrypt body — same crypto as before; we just store on the chat node.
  const encrypted = await encryptMessage({
    senderEns: fromEns,
    recipientEns: toEns,
    body,
  })

  // Read existing state in parallel: does the chat exist? what's the count?
  // Each twin's current chats.list (so we can append the chat ENS).
  const [chatOwner, messageCount, fromChats, toChats, startingNonce] =
    await Promise.all([
      readSubnameOwner(chatEns).catch(() => ZERO_ADDRESS),
      readChatMessageCount(chatEns),
      readChatList(fromEns),
      readChatList(toEns),
      sepoliaClient.getTransactionCount({
        address: account.address,
        blockTag: "pending",
      }),
    ])

  const needsCreate = chatOwner === ZERO_ADDRESS
  if (messageCount >= MAX_MESSAGES_PER_CHAT) {
    throw new Error(
      `Chat ${chatEns} reached the ${MAX_MESSAGES_PER_CHAT}-message cap. (Demo limit; bump MAX_MESSAGES_PER_CHAT to lift.)`,
    )
  }
  const at = Math.floor(Date.now() / 1000)
  const newIndex = messageCount

  // The single message JSON written to the on-chain `msg.<i>` record. Carries
  // the stealth ciphertext — anyone reading on-chain sees `body` as a
  // `stl1:<base64url>` blob, not plaintext.
  const messageJson = JSON.stringify({
    from: fromEns,
    body: encrypted.ciphertext,
    at,
    cosmicAttestation: encrypted.cosmic.attestation,
    nonce: encrypted.nonceHex,
  })

  // Step 1 (only on first message of this pair): mint the chat subname.
  // We MUST wait for this to land before broadcasting the records multicall —
  // the multicall's setText calls revert if chatNode has no registry owner,
  // and the receipt of a reverted multicall isn't always status="reverted"
  // under all RPCs (we've seen success-status receipts where the inner state
  // never actually applied). Waiting eliminates the entire class of bugs.
  let createSubnameTx: Hash | null = null
  let recordsNonce = startingNonce
  if (needsCreate) {
    const createData = encodeFunctionData({
      abi: ensRegistryAbi,
      functionName: "setSubnodeRecord",
      args: [
        parentNode,
        labelHash,
        account.address,
        PARENT_RESOLVER,
        0n,
      ],
    })
    const signedCreate = await account.signTransaction({
      chainId: sepoliaChain.id,
      type: "eip1559",
      to: ENS_REGISTRY,
      data: createData,
      nonce: startingNonce,
      gas: CREATE_SUBNAME_GAS,
      maxFeePerGas: SEPOLIA_MAX_FEE_PER_GAS,
      maxPriorityFeePerGas: SEPOLIA_MAX_PRIORITY_FEE_PER_GAS,
      value: 0n,
    })
    createSubnameTx = await sepoliaClient.sendRawTransaction({
      serializedTransaction: signedCreate,
    })
    const createReceipt = await sepoliaClient.waitForTransactionReceipt({
      hash: createSubnameTx,
      timeout: 60_000,
      pollingInterval: 1_500,
      // Two confirmations means the parent block has another block on top —
      // shallow reorgs (which we've seen on Sepolia) won't pull the rug.
      confirmations: 2,
    })
    if (createReceipt.status !== "success") {
      throw new Error(
        `createSubname reverted on-chain (block ${createReceipt.blockNumber}). ` +
          `tx=${createSubnameTx}`,
      )
    }
    // Re-read the pending nonce so the records multicall picks the right
    // value even after the create mined and the dev wallet account moved on.
    recordsNonce = await sepoliaClient.getTransactionCount({
      address: account.address,
      blockTag: "pending",
    })
  }

  // Step 2: multicall on the parent resolver. One tx contains:
  //   - the new message record (msg.<i>)
  //   - bumped messages.count
  //   - chat.participants (only on first message)
  //   - chats.list update on each twin (only when adding a new chat to them)
  const calls: Hex[] = [
    encodeFunctionData({
      abi: ensResolverAbi,
      functionName: "setText",
      args: [chatNode, `msg.${newIndex}`, messageJson],
    }),
    encodeFunctionData({
      abi: ensResolverAbi,
      functionName: "setText",
      args: [chatNode, MESSAGES_COUNT_KEY, String(newIndex + 1)],
    }),
  ]

  if (needsCreate) {
    calls.push(
      encodeFunctionData({
        abi: ensResolverAbi,
        functionName: "setText",
        args: [
          chatNode,
          PARTICIPANTS_KEY,
          JSON.stringify([fromEns.toLowerCase(), toEns.toLowerCase()].sort()),
        ],
      }),
    )
  }
  // Update chats.list on each twin's ENS — once per pair, on the first message.
  if (!fromChats.includes(chatEns)) {
    calls.push(
      encodeFunctionData({
        abi: ensResolverAbi,
        functionName: "setText",
        args: [
          fromNode,
          CHATS_LIST_KEY,
          JSON.stringify([...fromChats, chatEns]),
        ],
      }),
    )
  }
  if (!toChats.includes(chatEns)) {
    calls.push(
      encodeFunctionData({
        abi: ensResolverAbi,
        functionName: "setText",
        args: [toNode, CHATS_LIST_KEY, JSON.stringify([...toChats, chatEns])],
      }),
    )
  }

  const multicallData = encodeFunctionData({
    abi: ensResolverAbi,
    functionName: "multicall",
    args: [calls],
  })
  const signedRecords = await account.signTransaction({
    chainId: sepoliaChain.id,
    type: "eip1559",
    to: PARENT_RESOLVER,
    data: multicallData,
    nonce: recordsNonce,
    gas: RESOLVER_MULTICALL_GAS,
    maxFeePerGas: SEPOLIA_MAX_FEE_PER_GAS,
    maxPriorityFeePerGas: SEPOLIA_MAX_PRIORITY_FEE_PER_GAS,
    value: 0n,
  })
  const recordsMulticallTx = await sepoliaClient.sendRawTransaction({
    serializedTransaction: signedRecords,
  })

  // Wait for the records-multicall to mine so the caller's immediate refresh
  // (and the recipient's first inbox read) actually sees the new message.
  // Without this, the chat-subname multicall is only "broadcast" — there's a
  // ~12-30s window where reading `messages.count` returns the old value and
  // a follow-up send writes msg.<i> with a stale i, overwriting the previous
  // message. 60s is generous for Sepolia's ~12s block time.
  let mined = false
  try {
    const receipt = await sepoliaClient.waitForTransactionReceipt({
      hash: recordsMulticallTx,
      timeout: 60_000,
      pollingInterval: 1_500,
    })
    if (receipt.status !== "success") {
      throw new Error(
        `Records multicall reverted on-chain (block ${receipt.blockNumber}). ` +
          `Likely cause: dev wallet doesn't own one of the nodes being written. ` +
          `tx=${recordsMulticallTx}`,
      )
    }
    mined = true
  } catch (err) {
    throw err instanceof Error
      ? err
      : new Error(`Records multicall failed: ${String(err)}`)
  }

  // RPC consistency dance: viem's fallback transport routes each request
  // to whichever RPC is up. Receipt confirmation can come from one node
  // while a follow-up read hits another that's still syncing — so a
  // second send sees a stale count and overwrites msg.<i>. Poll the
  // count text record until it matches what we just wrote (or until we
  // run out of patience and surface the inconsistency).
  if (mined) {
    const expectedCount = String(newIndex + 1)
    let observed = ""
    for (let i = 0; i < 60; i++) {
      observed = await readTextRecordFast(chatEns, MESSAGES_COUNT_KEY).catch(() => "")
      if (observed === expectedCount) break
      await new Promise((r) => setTimeout(r, 1_000))
    }
    if (observed !== expectedCount) {
      // Surface enough state to diagnose. Pull the resolver / owner via
      // the same fallback transport so we know whether the createSubname
      // even landed on the RPC we're reading from.
      const [chatOwnerNow, msg0, participants] = await Promise.all([
        readSubnameOwner(chatEns).catch(() => "<unreadable>"),
        readTextRecordFast(chatEns, `msg.${newIndex}`).catch(() => "<unreadable>"),
        readTextRecordFast(chatEns, PARTICIPANTS_KEY).catch(() => "<unreadable>"),
      ])
      throw new Error(
        `Send mined but RPC reads still return count="${observed}" after 60s ` +
          `(expected ${expectedCount}).\n` +
          `  tx=${recordsMulticallTx}\n` +
          `  chatEns=${chatEns}\n` +
          `  owner=${chatOwnerNow}\n` +
          `  msg.${newIndex}=${typeof msg0 === "string" ? msg0.slice(0, 80) : msg0}\n` +
          `  participants=${participants}`,
      )
    }
  }

  return {
    message: {
      index: newIndex,
      chatEns,
      from: fromEns,
      body, // plaintext — for the UI/history. on-chain stays as ciphertext.
      at,
      stealth: true,
      cosmicAttestation: encrypted.cosmic.attestation,
    },
    chatEns,
    createdChat: needsCreate,
    createSubnameTx,
    recordsMulticallTx,
    blockExplorerUrl: `https://sepolia.etherscan.io/tx/${recordsMulticallTx}`,
    cosmicAttestation: encrypted.cosmic.attestation,
    cosmicSeeded: encrypted.cosmicSeeded,
  }
}
