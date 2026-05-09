// On-chain ENS messenger — chat-as-ENS-subname architecture.
//
// Each pair of twins shares ONE deterministic chat subname under the parent:
//
//   chat-<labelA>-<labelB>.ethtwin.eth   (labels sorted lexically)
//
// Every message in that chat is a TEXT RECORD on the chat subname:
//   chat.participants                  → JSON [aEns, bEns]
//   messages.count                      → "<N>" (string of total count)
//   msg.<i>                             → JSON { from, body (stealth), at,
//                                          nonce }
//
// Each participant ALSO carries a `chats.list` text record on their own
// twin ENS — a JSON array of chat subnames they're a part of. The inbox
// view uses it to enumerate threads.
//
// ENS + Stealth bounty story:
//   - The chat itself is a real ENS subname; resolves on standard ENS apps.
//   - Message bodies are encrypted with EIP-5564 stealth-key ECDH:
//       ECDH(senderSpendingPriv, recipientSpendingPub)
//     where the spending keys come from each twin's stealth-meta-address
//     text record (published on their own ENS subname).
//   - Both sides decrypt symmetrically via static-static ECDH.
//   - Anyone reading the chain sees only AES-256-GCM ciphertext.

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
const MAX_MESSAGES_PER_CHAT = 200

export type Message = {
  index: number
  chatEns: string
  from: string
  body: string
  at: number
  stealth: boolean
  /** Kept for compatibility with older history rows; currently always "" under
   *  the ECDH-only encryption path. */
  cosmicAttestation: string
}

// ── Chat subname derivation ─────────────────────────────────────────────────

/**
 * Deterministic chat subname for a pair of twins. Both sides resolve the
 * same name regardless of who sends first — labels are sorted before
 * concatenation. Result is a normal ENS subname (normalizable ASCII).
 */
export function chatSubnameFor(aEns: string, bEns: string): string {
  const aLabel = labelOf(aEns)
  const bLabel = labelOf(bEns)
  const [lo, hi] = [aLabel, bLabel].sort()
  return `chat-${lo}-${hi}.${PARENT_DOMAIN}`
}

/** Compatibility shim — older code paths called this name. */
export function chatSubnamesFor(myEns: string, peerEns: string) {
  const shared = chatSubnameFor(myEns, peerEns)
  return { mine: shared, theirs: shared }
}

function labelOf(ens: string): string {
  const parts = ens.toLowerCase().split(".")
  if (parts.length === 0) throw new Error(`Invalid ENS name: "${ens}"`)
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
  body: string
  at: number
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
    return { from: parsed.from, body: parsed.body, at: parsed.at }
  } catch {
    return null
  }
}

/**
 * Read the conversation between `myEns` and `peerEns`. Decrypts each body
 * via ECDH(myEns, peerEns) — symmetric, so it doesn't matter which side
 * sent the message.
 */
export async function readChatThread(
  myEns: string,
  peerEns: string,
): Promise<Message[]> {
  const chatEns = chatSubnameFor(myEns, peerEns)
  const [count, participants] = await Promise.all([
    readChatMessageCount(chatEns),
    readChatParticipants(chatEns),
  ])
  if (count === 0) return []

  // Resolve the actual peer from chat.participants (canonical) so we
  // tolerate reads where the caller passed slightly off-case ENS names.
  const peer = pickPeer(participants, myEns) ?? peerEns

  const indices = Array.from({ length: count }, (_, i) => i)
  const stored = await Promise.all(
    indices.map((i) => readStoredMessage(chatEns, i)),
  )
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
      cosmicAttestation: "",
    })
  }
  return out
}

function pickPeer(
  participants: [string, string] | null,
  myEns: string,
): string | null {
  if (!participants) return null
  const me = myEns.toLowerCase()
  if (participants[0].toLowerCase() === me) return participants[1]
  if (participants[1].toLowerCase() === me) return participants[0]
  return null
}

/** Aggregate inbox view across every chat the twin is in. */
export async function readInbox(
  recipientEns: string,
  limit = 30,
): Promise<Message[]> {
  const chats = await readChatList(recipientEns)
  if (chats.length === 0) return []
  const threads = await Promise.all(
    chats.map(async (chatEns) => {
      const participants = await readChatParticipants(chatEns)
      const peer = pickPeer(participants, recipientEns)
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
  message: Message
  chatEns: string
  /** Backwards-compat fields used by twin-tools / scripts. Both alias
   *  `chatEns` since this architecture has one shared subname. */
  mineChatEns: string
  theirsChatEns: string
  createdChat: boolean
  createSubnameTx: Hash | null
  /** Backwards-compat alias for the legacy two-tx pipeline. */
  createSubnameTxs: Hash[]
  recordsMulticallTx: Hash
  blockExplorerUrl: string
  cosmicAttestation: string
  cosmicSeeded: boolean
}

/**
 * Send a stealth-encrypted message from `fromEns` to `toEns`. Mints the
 * shared chat subname on first message, otherwise appends.
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
  const chatEns = chatSubnameFor(fromEns, toEns)
  const chatLabel = chatEns.split(".")[0]!
  const parentNode = namehash(PARENT_DOMAIN)
  const chatNode = namehash(chatEns)
  const fromNode = namehash(fromEns)
  const toNode = namehash(toEns)
  const labelHash = keccak256(toBytes(chatLabel))

  // Sanity: setSubnodeRecord-derived node MUST equal namehash(chatEns).
  const expectedChatNode = keccak256(concat([parentNode, labelHash]))
  if (expectedChatNode !== chatNode) {
    throw new Error(
      `chatNode namehash mismatch — reads and writes target different nodes.`,
    )
  }

  // Encrypt body via EIP-5564-style ECDH on the pair's stealth keys.
  const encrypted = await encryptMessage({
    senderEns: fromEns,
    recipientEns: toEns,
    body,
  })

  // Pre-flight reads in parallel.
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
      `Chat ${chatEns} reached the ${MAX_MESSAGES_PER_CHAT}-message cap.`,
    )
  }
  const newIndex = messageCount
  const at = Math.floor(Date.now() / 1000)

  const messageJson = JSON.stringify({
    from: fromEns,
    body: encrypted.ciphertext,
    at,
    nonce: encrypted.nonceHex,
  })

  // Step 1 (only on first message): mint the chat subname.
  let createSubnameTx: Hash | null = null
  let recordsNonce = startingNonce
  if (needsCreate) {
    const createData = encodeFunctionData({
      abi: ensRegistryAbi,
      functionName: "setSubnodeRecord",
      args: [parentNode, labelHash, account.address, PARENT_RESOLVER, 0n],
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
      confirmations: 2,
    })
    if (createReceipt.status !== "success") {
      throw new Error(
        `createSubname reverted on-chain (block ${createReceipt.blockNumber}). tx=${createSubnameTx}`,
      )
    }
    recordsNonce = await sepoliaClient.getTransactionCount({
      address: account.address,
      blockTag: "pending",
    })
  }

  // Step 2: multicall on the parent resolver — message + count + (first time)
  // participants + chats.list updates on each twin.
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
          JSON.stringify(
            [fromEns.toLowerCase(), toEns.toLowerCase()].sort(),
          ),
        ],
      }),
    )
  }
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
  const recordsReceipt = await sepoliaClient.waitForTransactionReceipt({
    hash: recordsMulticallTx,
    timeout: 60_000,
    pollingInterval: 1_500,
  })
  if (recordsReceipt.status !== "success") {
    throw new Error(
      `Records multicall reverted on-chain (block ${recordsReceipt.blockNumber}). tx=${recordsMulticallTx}`,
    )
  }

  // RPC consistency dance — wait until count reflects the new value.
  const expectedCount = String(newIndex + 1)
  for (let i = 0; i < 60; i++) {
    const observed = await readTextRecordFast(
      chatEns,
      MESSAGES_COUNT_KEY,
    ).catch(() => "")
    if (observed === expectedCount) break
    await new Promise((r) => setTimeout(r, 1_000))
  }

  return {
    message: {
      index: newIndex,
      chatEns,
      from: fromEns,
      body,
      at,
      stealth: true,
      cosmicAttestation: "",
    },
    chatEns,
    mineChatEns: chatEns,
    theirsChatEns: chatEns,
    createdChat: needsCreate,
    createSubnameTx,
    createSubnameTxs: createSubnameTx ? [createSubnameTx] : [],
    recordsMulticallTx,
    blockExplorerUrl: `https://sepolia.etherscan.io/tx/${recordsMulticallTx}`,
    cosmicAttestation: "",
    cosmicSeeded: encrypted.cosmicSeeded,
  }
}
