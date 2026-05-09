// On-chain ENS messenger — sub-subdomain-per-agent architecture.
//
// Each pair of twins gets TWO chat sub-subdomains, one under each side's
// own ENS namespace:
//
//   chat-<peer>.<me>.ethtwin.eth   ← "me's chat with peer", lives under me
//   chat-<me>.<peer>.ethtwin.eth   ← "peer's chat with me", lives under peer
//
// e.g. for alice <-> bob:
//   chat-bob.alice.ethtwin.eth     ← alice's view
//   chat-alice.bob.ethtwin.eth     ← bob's view
//
// Both subdomains carry the SAME stealth-encrypted text records:
//   chat.participants               → JSON [aEns, bEns]
//   messages.count                  → "<N>" (string of total count)
//   msg.<i>                         → JSON { from, body (stealth blob), at,
//                                            cosmicAttestation, nonce }
//
// Each twin also carries a `chats.list` text record on its own ENS
// (e.g. on alice.ethtwin.eth) listing the chat sub-subdomains it owns.
// That's how the inbox enumerates threads.
//
// Why sub-subdomain instead of one shared subname:
//   - ENS apps show "chat-bob" as a sub-record under alice's profile —
//     the conversation is part of alice's ENS namespace, visible in any
//     standard ENS browser.
//   - Each side has full ownership/control of their own chat archive.
//   - Names are normalizable ASCII (chat-bob.alice.ethtwin.eth) instead
//     of bracket-encoded labelhashes that ENS apps refuse to render.
//
// Stealth: bodies are AES-256-GCM ciphertext with HKDF-derived per-pair keys
// (see lib/message-crypto.ts), with AES nonces seeded from Orbitport cTRNG.
// Only the two participants can decrypt.

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
const RESOLVER_MULTICALL_GAS = 1_500_000n
const ZERO_ADDRESS: Address = "0x0000000000000000000000000000000000000000"

const CHATS_LIST_KEY = "chats.list"
const PARTICIPANTS_KEY = "chat.participants"
const MESSAGES_COUNT_KEY = "messages.count"
const MAX_MESSAGES_PER_CHAT = 200

const CHAT_LABEL_PREFIX = "chat-"

export type Message = {
  /** Index within the chat (matches `msg.<i>` text record key). */
  index: number
  /** ENS of the chat sub-subdomain this message belongs to (the reader's view). */
  chatEns: string
  /** Sender twin ENS. */
  from: string
  /** Decrypted plaintext body (or `[encrypted — could not decrypt]`). */
  body: string
  /** Unix-seconds timestamp from the on-chain JSON. */
  at: number
  /** Always true under this architecture (every body is stealth-encrypted). */
  stealth: boolean
  /** Orbitport cTRNG attestation (or `mock-attestation` when no key set). */
  cosmicAttestation: string
}

// ── Chat sub-subdomain derivation ───────────────────────────────────────────

export type ChatPair = {
  /** chat-<peer>.<me>.ethtwin.eth — the reader's own copy. */
  mine: string
  /** chat-<me>.<peer>.ethtwin.eth — the peer's copy. */
  theirs: string
}

/**
 * Derive the two chat sub-subdomains for a (me, peer) pair.
 * Each sub-subdomain lives directly under the relevant twin's own ENS.
 */
export function chatSubnamesFor(myEns: string, peerEns: string): ChatPair {
  if (myEns.toLowerCase() === peerEns.toLowerCase()) {
    throw new Error(`Cannot derive chat sub-subdomain for self (${myEns}).`)
  }
  const myLabel = labelOf(myEns)
  const peerLabel = labelOf(peerEns)
  return {
    mine: `${CHAT_LABEL_PREFIX}${peerLabel}.${myEns}`,
    theirs: `${CHAT_LABEL_PREFIX}${myLabel}.${peerEns}`,
  }
}

/**
 * Given a chat sub-subdomain like "chat-bob.alice.ethtwin.eth" and the reader
 * ("alice.ethtwin.eth"), return the peer's ENS ("bob.ethtwin.eth").
 * Returns null if the format doesn't match.
 */
export function peerEnsFromChatSubname(
  chatEns: string,
  myEns: string,
): string | null {
  const expectedSuffix = `.${myEns.toLowerCase()}`
  const lower = chatEns.toLowerCase()
  if (!lower.endsWith(expectedSuffix)) return null
  const head = lower.slice(0, -expectedSuffix.length)
  if (!head.startsWith(CHAT_LABEL_PREFIX)) return null
  const peerLabel = head.slice(CHAT_LABEL_PREFIX.length)
  if (!peerLabel || !/^[a-z0-9-]+$/.test(peerLabel)) return null
  return `${peerLabel}.${PARENT_DOMAIN.toLowerCase()}`
}

function labelOf(ens: string): string {
  const parts = ens.toLowerCase().split(".")
  if (parts.length === 0) throw new Error(`Invalid ENS name: "${ens}"`)
  const expectedSuffix = `.${PARENT_DOMAIN.toLowerCase()}`
  if (!ens.toLowerCase().endsWith(expectedSuffix)) {
    throw new Error(
      `Refusing to derive chat sub-subdomain for "${ens}" — must end in .${PARENT_DOMAIN}`,
    )
  }
  // Twin must be a *direct* child of PARENT_DOMAIN (one label).
  const remainder = ens.toLowerCase().slice(0, -expectedSuffix.length)
  if (!remainder || remainder.includes(".")) {
    throw new Error(
      `Twin ENS "${ens}" must be a direct child of ${PARENT_DOMAIN} (no nested labels).`,
    )
  }
  if (!/^[a-z0-9-]+$/.test(remainder)) {
    throw new Error(
      `Twin label "${remainder}" contains characters that aren't ENS-normalizable (a-z, 0-9, -).`,
    )
  }
  return remainder
}

// ── Read helpers ────────────────────────────────────────────────────────────

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

type StoredMessage = {
  from: string
  body: string // stealth blob
  at: number
  cosmicAttestation: string
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

/**
 * Read every message in the conversation between `myEns` and `peerEns`,
 * decrypting the stealth bodies.
 *
 * Reads from the reader's own copy: chat-<peer>.<me>.ethtwin.eth.
 */
export async function readChatThread(
  myEns: string,
  peerEns: string,
): Promise<Message[]> {
  const { mine } = chatSubnamesFor(myEns, peerEns)
  const count = await readChatMessageCount(mine)
  if (count === 0) return []

  const indices = Array.from({ length: count }, (_, i) => i)
  const stored = await Promise.all(indices.map((i) => readStoredMessage(mine, i)))
  const out: Message[] = []
  for (let i = 0; i < stored.length; i++) {
    const m = stored[i]
    if (!m) continue
    let body = m.body
    let stealth = false
    if (isStealthBlob(m.body)) {
      stealth = true
      const plain = decryptMessage({
        senderEns: myEns,
        recipientEns: peerEns,
        ciphertext: m.body,
      })
      body = plain ?? "[encrypted — could not decrypt]"
    }
    out.push({
      index: i,
      chatEns: mine,
      from: m.from,
      body,
      at: m.at,
      stealth,
      cosmicAttestation: m.cosmicAttestation,
    })
  }
  return out
}

/**
 * Aggregate inbox view: every message across every chat the twin is part
 * of, sorted newest-first. Hard-capped per call.
 */
export async function readInbox(
  recipientEns: string,
  limit = 30,
): Promise<Message[]> {
  const chats = await readChatList(recipientEns)
  if (chats.length === 0) return []
  const threads = await Promise.all(
    chats.map(async (chatEns) => {
      const peer = peerEnsFromChatSubname(chatEns, recipientEns)
      if (!peer) return [] as Message[]
      return readChatThread(recipientEns, peer)
    }),
  )
  const flat = threads.flat()
  flat.sort((a, b) => b.at - a.at)
  return flat.slice(0, Math.max(1, limit))
}

// ── Send side ──────────────────────────────────────────────────────────────

export type SendMessageResult = {
  /** Message as the sender sees it (in their chat-<peer>.<me>… subname). */
  message: Message
  /** chat-<peer>.<me>.ethtwin.eth — the sender's own copy. */
  mineChatEns: string
  /** chat-<me>.<peer>.ethtwin.eth — the recipient's copy (mirror of mine). */
  theirsChatEns: string
  /** True iff this send minted at least one fresh chat sub-subdomain. */
  createdChat: boolean
  /** Tx hashes of the up-to-2 setSubnodeRecord calls. */
  createSubnameTxs: Hash[]
  /** Tx hash of the resolver multicall that wrote the message + counts. */
  recordsMulticallTx: Hash
  blockExplorerUrl: string
  cosmicAttestation: string
  cosmicSeeded: boolean
}

/**
 * Send a stealth-encrypted message from `fromEns` to `toEns`. Mints either
 * side's chat sub-subdomain on first use, then writes msg.<i> to BOTH sides
 * in a single resolver multicall.
 */
export async function sendMessage(args: {
  fromEns: string
  toEns: string
  body: string
}): Promise<SendMessageResult> {
  const { fromEns, toEns, body } = args
  if (!body.trim()) throw new Error("Message body is empty.")
  if (body.length > 1000) throw new Error("Message body exceeds 1000 chars.")
  if (fromEns.toLowerCase() === toEns.toLowerCase()) {
    throw new Error("Sender and recipient are the same twin.")
  }

  const { account } = getDevWalletClient()
  const { mine: mineChatEns, theirs: theirsChatEns } = chatSubnamesFor(
    fromEns,
    toEns,
  )

  const fromNode = namehash(fromEns)
  const toNode = namehash(toEns)
  const mineChatNode = namehash(mineChatEns)
  const theirsChatNode = namehash(theirsChatEns)

  // Each chat-<peer>.<me>.ethtwin.eth has parent = me's twin node, label = "chat-<peer>".
  const mineChatLabel = `${CHAT_LABEL_PREFIX}${labelOf(toEns)}` // chat-<toLabel>
  const theirsChatLabel = `${CHAT_LABEL_PREFIX}${labelOf(fromEns)}` // chat-<fromLabel>
  const mineLabelHash = keccak256(toBytes(mineChatLabel))
  const theirsLabelHash = keccak256(toBytes(theirsChatLabel))

  // Sanity: the node setSubnodeRecord will create has to equal namehash().
  const expectedMineNode = keccak256(concat([fromNode, mineLabelHash]))
  if (expectedMineNode !== mineChatNode) {
    throw new Error(
      `mine chatNode namehash mismatch — reads and writes target different nodes.`,
    )
  }
  const expectedTheirsNode = keccak256(concat([toNode, theirsLabelHash]))
  if (expectedTheirsNode !== theirsChatNode) {
    throw new Error(
      `theirs chatNode namehash mismatch — reads and writes target different nodes.`,
    )
  }

  // Encrypt body — same key both sides derive (pairKey is symmetric).
  const encrypted = await encryptMessage({
    senderEns: fromEns,
    recipientEns: toEns,
    body,
  })

  // Pre-flight reads: ownership + counts on both chat sub-subdomains, plus
  // both twins' chats.list, plus the dev wallet's pending nonce. We use the
  // MAX of mine/theirs counts as the message index so concurrent sends from
  // either side don't collide on `msg.<i>`. (In a steady state both counts
  // are equal because every multicall writes both atomically.)
  const [
    mineOwner,
    theirsOwner,
    mineCount,
    theirsCount,
    fromChats,
    toChats,
    startingNonce,
  ] = await Promise.all([
    readSubnameOwner(mineChatEns).catch(() => ZERO_ADDRESS),
    readSubnameOwner(theirsChatEns).catch(() => ZERO_ADDRESS),
    readChatMessageCount(mineChatEns),
    readChatMessageCount(theirsChatEns),
    readChatList(fromEns),
    readChatList(toEns),
    sepoliaClient.getTransactionCount({
      address: account.address,
      blockTag: "pending",
    }),
  ])

  const mineNeedsCreate = mineOwner === ZERO_ADDRESS
  const theirsNeedsCreate = theirsOwner === ZERO_ADDRESS
  const newIndex = Math.max(mineCount, theirsCount)
  if (newIndex >= MAX_MESSAGES_PER_CHAT) {
    throw new Error(
      `Chat between ${fromEns} and ${toEns} reached the ${MAX_MESSAGES_PER_CHAT}-message cap.`,
    )
  }
  const at = Math.floor(Date.now() / 1000)

  const messageJson = JSON.stringify({
    from: fromEns,
    body: encrypted.ciphertext,
    at,
    cosmicAttestation: encrypted.cosmic.attestation,
    nonce: encrypted.nonceHex,
  })

  // ── Step 1: mint missing chat sub-subdomains. ──
  // Two separate setSubnodeRecord calls, one per chat node. We sequence them
  // by nonce and wait for both receipts before broadcasting the multicall —
  // the multicall's setText reverts if the parent node has no registered
  // owner, and we've seen RPCs return success-status receipts even when
  // inner state never landed.
  let nonce = startingNonce
  const createSubnameTxs: Hash[] = []
  const broadcastCreate = async (
    parentN: Hex,
    label: string,
    labelH: Hex,
  ): Promise<Hash> => {
    const data = encodeFunctionData({
      abi: ensRegistryAbi,
      functionName: "setSubnodeRecord",
      args: [parentN, labelH, account.address, PARENT_RESOLVER, 0n],
    })
    const signed = await account.signTransaction({
      chainId: sepoliaChain.id,
      type: "eip1559",
      to: ENS_REGISTRY,
      data,
      nonce,
      gas: CREATE_SUBNAME_GAS,
      maxFeePerGas: SEPOLIA_MAX_FEE_PER_GAS,
      maxPriorityFeePerGas: SEPOLIA_MAX_PRIORITY_FEE_PER_GAS,
      value: 0n,
    })
    nonce += 1
    void label // kept for future logging if needed
    return sepoliaClient.sendRawTransaction({ serializedTransaction: signed })
  }

  if (mineNeedsCreate) {
    createSubnameTxs.push(
      await broadcastCreate(fromNode, mineChatLabel, mineLabelHash),
    )
  }
  if (theirsNeedsCreate) {
    createSubnameTxs.push(
      await broadcastCreate(toNode, theirsChatLabel, theirsLabelHash),
    )
  }

  if (createSubnameTxs.length > 0) {
    const receipts = await Promise.all(
      createSubnameTxs.map((hash) =>
        sepoliaClient.waitForTransactionReceipt({
          hash,
          timeout: 60_000,
          pollingInterval: 1_500,
          confirmations: 2,
        }),
      ),
    )
    for (const r of receipts) {
      if (r.status !== "success") {
        throw new Error(
          `setSubnodeRecord reverted on-chain (block ${r.blockNumber}). ` +
            `tx=${r.transactionHash}`,
        )
      }
    }
    // Re-read pending nonce for the multicall — both creates have moved on.
    nonce = await sepoliaClient.getTransactionCount({
      address: account.address,
      blockTag: "pending",
    })
  }

  // ── Step 2: one multicall writes msg.<i> + counts to BOTH sides. ──
  const calls: Hex[] = [
    encodeFunctionData({
      abi: ensResolverAbi,
      functionName: "setText",
      args: [mineChatNode, `msg.${newIndex}`, messageJson],
    }),
    encodeFunctionData({
      abi: ensResolverAbi,
      functionName: "setText",
      args: [mineChatNode, MESSAGES_COUNT_KEY, String(newIndex + 1)],
    }),
    encodeFunctionData({
      abi: ensResolverAbi,
      functionName: "setText",
      args: [theirsChatNode, `msg.${newIndex}`, messageJson],
    }),
    encodeFunctionData({
      abi: ensResolverAbi,
      functionName: "setText",
      args: [theirsChatNode, MESSAGES_COUNT_KEY, String(newIndex + 1)],
    }),
  ]

  const participantsJson = JSON.stringify(
    [fromEns.toLowerCase(), toEns.toLowerCase()].sort(),
  )
  if (mineNeedsCreate) {
    calls.push(
      encodeFunctionData({
        abi: ensResolverAbi,
        functionName: "setText",
        args: [mineChatNode, PARTICIPANTS_KEY, participantsJson],
      }),
    )
  }
  if (theirsNeedsCreate) {
    calls.push(
      encodeFunctionData({
        abi: ensResolverAbi,
        functionName: "setText",
        args: [theirsChatNode, PARTICIPANTS_KEY, participantsJson],
      }),
    )
  }

  if (!fromChats.includes(mineChatEns)) {
    calls.push(
      encodeFunctionData({
        abi: ensResolverAbi,
        functionName: "setText",
        args: [fromNode, CHATS_LIST_KEY, JSON.stringify([...fromChats, mineChatEns])],
      }),
    )
  }
  if (!toChats.includes(theirsChatEns)) {
    calls.push(
      encodeFunctionData({
        abi: ensResolverAbi,
        functionName: "setText",
        args: [toNode, CHATS_LIST_KEY, JSON.stringify([...toChats, theirsChatEns])],
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
    nonce,
    gas: RESOLVER_MULTICALL_GAS,
    maxFeePerGas: SEPOLIA_MAX_FEE_PER_GAS,
    maxPriorityFeePerGas: SEPOLIA_MAX_PRIORITY_FEE_PER_GAS,
    value: 0n,
  })
  const recordsMulticallTx = await sepoliaClient.sendRawTransaction({
    serializedTransaction: signedRecords,
  })

  const recordsReceipt = await sepoliaClient.waitForTransactionReceipt({
    hash: recordsMulticallTx,
    timeout: 60_000,
    pollingInterval: 1_500,
  })
  if (recordsReceipt.status !== "success") {
    throw new Error(
      `Records multicall reverted on-chain (block ${recordsReceipt.blockNumber}). ` +
        `tx=${recordsMulticallTx}`,
    )
  }

  // RPC consistency dance — wait until both sides reflect the new count.
  const expectedCount = String(newIndex + 1)
  const consistencyDeadline = Date.now() + 60_000
  while (Date.now() < consistencyDeadline) {
    const [mineNow, theirsNow] = await Promise.all([
      readTextRecordFast(mineChatEns, MESSAGES_COUNT_KEY).catch(() => ""),
      readTextRecordFast(theirsChatEns, MESSAGES_COUNT_KEY).catch(() => ""),
    ])
    if (mineNow === expectedCount && theirsNow === expectedCount) break
    await new Promise((r) => setTimeout(r, 1_000))
  }

  return {
    message: {
      index: newIndex,
      chatEns: mineChatEns,
      from: fromEns,
      body, // plaintext for the UI; chain stays as ciphertext
      at,
      stealth: true,
      cosmicAttestation: encrypted.cosmic.attestation,
    },
    mineChatEns,
    theirsChatEns,
    createdChat: mineNeedsCreate || theirsNeedsCreate,
    createSubnameTxs,
    recordsMulticallTx,
    blockExplorerUrl: `https://sepolia.etherscan.io/tx/${recordsMulticallTx}`,
    cosmicAttestation: encrypted.cosmic.attestation,
    cosmicSeeded: encrypted.cosmicSeeded,
  }
}
