// On-chain ENS messenger — text-records-on-twin architecture.
//
// Storage lives DIRECTLY on each twin's existing ENS subname (no new chat
// subnames are minted). For the alice ↔ bob conversation:
//
//   alice.ethtwin.eth has text records:
//     chat.bob.count           → "<N>"
//     chat.bob.msg.<i>          → JSON { from, body (stealth), at, kmsSig }
//     chat.bob.participants     → JSON [aEns, bEns]
//
//   bob.ethtwin.eth has the same with the peer label flipped:
//     chat.alice.count, chat.alice.msg.<i>, chat.alice.participants
//
//   Both twins also carry `chats.list` = JSON of peer ENS names, used to
//   enumerate the inbox.
//
// Why this shape (vs minting chat-<a>-<b>.ethtwin.eth subnames):
//   - ENS apps display existing twin subnames as readable labels because
//     those labels were registered visibly (during onboarding, with the
//     dev wallet broadcasting the literal username). Newly-minted
//     setSubnodeRecord subnames only know their LABELHASH, so apps fall
//     back to "[<hash>].ethtwin.eth" — the bracket-encoded display the
//     user kept hitting.
//   - Each twin's ENS subname is now a self-contained inbox. Open it in
//     the ENS app and you see the conversations as text records, alongside
//     stealth-meta-address, twin.kms-key-id, twin.kms-public-key, etc.
//
// Encryption: AES-256-GCM with EIP-5564 static-static ECDH on the pair's
// stealth spending keys (lib/message-crypto.ts). Same as before.
// Authentication: per-message SpaceComputer KMS signature (EIP-191) over
// a canonical payload. Verified against the sender's ENS-published
// twin.kms-public-key. Dev wallet pays gas (meta-tx pattern).

import {
  encodeFunctionData,
  hashMessage,
  namehash,
  recoverAddress,
  type Hash,
  type Hex,
} from "viem"
import { readSubnameOwner, readTextRecordFast } from "./ens"
import { ensResolverAbi } from "./abis"
import { PARENT_DOMAIN, getDevWalletClient, sepoliaClient } from "./viem"
import { sepolia as sepoliaChain } from "viem/chains"
import { encryptMessage, decryptMessage, isStealthBlob } from "./message-crypto"
import { kmsAccountForEns, kmsSignEIP191 } from "./kms"

// ── Constants ──────────────────────────────────────────────────────────────

const PARENT_RESOLVER: `0x${string}` = "0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5"
const SEPOLIA_MAX_FEE_PER_GAS = 5_000_000_000n
const SEPOLIA_MAX_PRIORITY_FEE_PER_GAS = 1_500_000_000n
const RESOLVER_MULTICALL_GAS = 1_500_000n
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"

const CHATS_LIST_KEY = "chats.list"
const MAX_MESSAGES_PER_CHAT = 200

// ── Types ──────────────────────────────────────────────────────────────────

export type Message = {
  index: number
  /** ENS where this message lives — the reader's own twin. */
  chatEns: string
  /** Peer ENS in this conversation. */
  peer: string
  from: string
  body: string
  at: number
  stealth: boolean
  cosmicAttestation: string
  kmsSig?: string | null
  kmsVerified?: boolean
}

// ── Label helpers ─────────────────────────────────────────────────────────

function labelOf(ens: string): string {
  const lower = ens.toLowerCase()
  const expectedSuffix = `.${PARENT_DOMAIN.toLowerCase()}`
  if (!lower.endsWith(expectedSuffix)) {
    throw new Error(
      `Refusing to derive twin label for "${ens}" — must end in .${PARENT_DOMAIN}`,
    )
  }
  const label = lower.slice(0, -expectedSuffix.length)
  if (!/^[a-z0-9-]+$/.test(label)) {
    throw new Error(
      `Twin label "${label}" contains characters that aren't ENS-normalizable.`,
    )
  }
  return label
}

function chatKey(peerLabel: string, suffix: string): string {
  return `chat.${peerLabel}.${suffix}`
}

/** Backwards-compat shim — older callers / scripts request a "chat subname"
 *  for a pair. Under this architecture there is no such subname; we return
 *  a deterministic label for stable IDs/comparisons. */
export function chatSubnameFor(aEns: string, bEns: string): string {
  const a = labelOf(aEns)
  const b = labelOf(bEns)
  const [lo, hi] = [a, b].sort()
  return `chat-${lo}-${hi}.${PARENT_DOMAIN}`
}

export function chatSubnamesFor(myEns: string, peerEns: string) {
  const shared = chatSubnameFor(myEns, peerEns)
  return { mine: shared, theirs: shared }
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

async function readMessageCount(twinEns: string, peerLabel: string): Promise<number> {
  try {
    const raw = await readTextRecordFast(twinEns, chatKey(peerLabel, "count"))
    if (!raw) return 0
    const n = Number.parseInt(raw, 10)
    return Number.isFinite(n) && n >= 0 ? n : 0
  } catch {
    return 0
  }
}

type StoredMessage = {
  from: string
  body: string
  at: number
  kmsSig?: string | null
}

async function readStoredMessage(
  twinEns: string,
  peerLabel: string,
  index: number,
): Promise<StoredMessage | null> {
  try {
    const raw = await readTextRecordFast(twinEns, chatKey(peerLabel, `msg.${index}`))
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
      kmsSig: typeof parsed.kmsSig === "string" ? parsed.kmsSig : null,
    }
  } catch {
    return null
  }
}

// ── Canonical KMS-signing payload ──────────────────────────────────────────

function canonicalSignPayload(args: {
  fromEns: string
  twinEns: string
  peerLabel: string
  ciphertext: string
  at: number
  index: number
}): string {
  return [
    "ethtwin/msg/v2",
    args.fromEns.toLowerCase(),
    args.twinEns.toLowerCase(),
    args.peerLabel,
    String(args.index),
    String(args.at),
    args.ciphertext,
  ].join("\n")
}

/**
 * Verify a stored message's per-message KMS signature. Recovers the
 * EIP-191 signer and compares to the sender's twin's `addr` record (=
 * KMS-derived address). Returns true iff they match.
 */
export async function verifyMessageKms(args: {
  fromEns: string
  twinEns: string
  peerLabel: string
  ciphertext: string
  at: number
  index: number
  kmsSig: string
}): Promise<boolean> {
  if (!args.kmsSig || !args.kmsSig.startsWith("0x")) return false
  try {
    const payload = canonicalSignPayload(args)
    const digest = hashMessage(payload)
    const recovered = await recoverAddress({
      hash: digest,
      signature: args.kmsSig as `0x${string}`,
    })
    const owner = await readSubnameOwner(args.fromEns).catch(() => "")
    const addrRecord = await readTextRecordFast(args.fromEns, "addr").catch(() => "")
    const candidates = [owner, addrRecord]
      .map((s) => (typeof s === "string" ? s.toLowerCase() : ""))
      .filter(Boolean)
    return candidates.includes(recovered.toLowerCase())
  } catch {
    return false
  }
}

// ── Public read API ────────────────────────────────────────────────────────

/**
 * Read the conversation between `myEns` and `peerEns` from `myEns`'s own
 * text records. Decrypts each body via EIP-5564 ECDH on the pair's
 * stealth spending keys. Verifies per-message KMS signatures in parallel.
 */
export async function readChatThread(
  myEns: string,
  peerEns: string,
): Promise<Message[]> {
  const peerLabel = labelOf(peerEns)
  const count = await readMessageCount(myEns, peerLabel)
  if (count === 0) return []

  const indices = Array.from({ length: count }, (_, i) => i)
  const stored = await Promise.all(
    indices.map((i) => readStoredMessage(myEns, peerLabel, i)),
  )

  const verifications = await Promise.all(
    stored.map(async (m, i) => {
      if (!m?.kmsSig) return false
      return verifyMessageKms({
        fromEns: m.from,
        twinEns: myEns,
        peerLabel,
        ciphertext: m.body,
        at: m.at,
        index: i,
        kmsSig: m.kmsSig,
      })
    }),
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
        recipientEns: peerEns,
        ciphertext: m.body,
      })
      body = plain ?? "[encrypted — could not decrypt]"
    }
    out.push({
      index: i,
      chatEns: myEns,
      peer: peerEns,
      from: m.from,
      body,
      at: m.at,
      stealth,
      cosmicAttestation: "",
      kmsSig: m.kmsSig ?? null,
      kmsVerified: verifications[i] ?? false,
    })
  }
  return out
}

/**
 * Aggregate inbox: every conversation `myEns` is part of (per `chats.list`
 * on their twin), flattened newest-first.
 */
export async function readInbox(
  recipientEns: string,
  limit = 30,
): Promise<Message[]> {
  const peers = await readChatList(recipientEns)
  if (peers.length === 0) return []
  const threads = await Promise.all(
    peers.map((peer) => readChatThread(recipientEns, peer).catch(() => [])),
  )
  const flat = threads.flat()
  flat.sort((a, b) => b.at - a.at)
  return flat.slice(0, Math.max(1, limit))
}

// ── Send side ──────────────────────────────────────────────────────────────

export type SendMessageResult = {
  message: Message
  /** Where THIS sender's view of the message lives. */
  chatEns: string
  /** Backwards-compat fields (twin-tools / scripts referenced these). */
  mineChatEns: string
  theirsChatEns: string
  /** First time we wrote to this chat-key on EITHER twin? */
  createdChat: boolean
  createSubnameTx: Hash | null
  createSubnameTxs: Hash[]
  recordsMulticallTx: Hash
  blockExplorerUrl: string
  cosmicAttestation: string
  cosmicSeeded: boolean
}

/**
 * Send an encrypted message from `fromEns` to `toEns`. Writes msg.<i> +
 * count text records to BOTH twins' ENS subnames in a single resolver
 * multicall. Dev wallet pays gas (parent owner — already authorised on
 * both subnames). The sender's KMS signs the canonical payload for
 * authentication; that signature is bundled into the on-chain JSON.
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

  const fromLabel = labelOf(fromEns)
  const toLabel = labelOf(toEns)
  const fromNode = namehash(fromEns)
  const toNode = namehash(toEns)
  const { account } = getDevWalletClient()

  // Pre-flight reads. We use the MAX of both sides' counts as the index for
  // collision safety in case they ever drift (shouldn't, since every send
  // writes both atomically, but still cheap insurance).
  const [myCount, theirCount, fromChats, toChats, startingNonce] =
    await Promise.all([
      readMessageCount(fromEns, toLabel),
      readMessageCount(toEns, fromLabel),
      readChatList(fromEns),
      readChatList(toEns),
      sepoliaClient.getTransactionCount({
        address: account.address,
        blockTag: "pending",
      }),
    ])

  const newIndex = Math.max(myCount, theirCount)
  if (newIndex >= MAX_MESSAGES_PER_CHAT) {
    throw new Error(
      `Chat between ${fromEns} and ${toEns} reached the ${MAX_MESSAGES_PER_CHAT}-message cap.`,
    )
  }
  const at = Math.floor(Date.now() / 1000)

  // Encrypt: EIP-5564 ECDH on stealth spending keys.
  const encrypted = await encryptMessage({
    senderEns: fromEns,
    recipientEns: toEns,
    body,
  })

  // KMS-sign the canonical payload using the sender's twin key. We sign
  // ONCE here (the payload binds index + at + ciphertext) and store the
  // same signature on both twins' records. The verifier reconstructs the
  // payload using the twin it's reading from.
  let kmsSigForFromTwin: string | null = null
  let kmsSigForToTwin: string | null = null
  try {
    const senderKms = await kmsAccountForEns(fromEns)
    if (senderKms) {
      const fromPayload = canonicalSignPayload({
        fromEns,
        twinEns: fromEns,
        peerLabel: toLabel,
        ciphertext: encrypted.ciphertext,
        at,
        index: newIndex,
      })
      const toPayload = canonicalSignPayload({
        fromEns,
        twinEns: toEns,
        peerLabel: fromLabel,
        ciphertext: encrypted.ciphertext,
        at,
        index: newIndex,
      })
      // Sign both so verification works on either side's records.
      const [s1, s2] = await Promise.all([
        kmsSignEIP191(senderKms.keyId, fromPayload),
        kmsSignEIP191(senderKms.keyId, toPayload),
      ])
      kmsSigForFromTwin = s1
      kmsSigForToTwin = s2
    }
  } catch (err) {
    console.warn(
      `[messages] KMS signing failed for ${fromEns}; posting unsigned msg:`,
      err instanceof Error ? err.message : err,
    )
  }

  const buildJson = (kmsSig: string | null) =>
    JSON.stringify({
      from: fromEns,
      body: encrypted.ciphertext,
      at,
      nonce: encrypted.nonceHex,
      ...(kmsSig ? { kmsSig } : {}),
    })

  // Multicall: write msg.<i> + count to BOTH twins, plus participants on
  // first message + chats.list updates when a new peer is added.
  const calls: Hex[] = [
    encodeFunctionData({
      abi: ensResolverAbi,
      functionName: "setText",
      args: [fromNode, chatKey(toLabel, `msg.${newIndex}`), buildJson(kmsSigForFromTwin)],
    }),
    encodeFunctionData({
      abi: ensResolverAbi,
      functionName: "setText",
      args: [fromNode, chatKey(toLabel, "count"), String(newIndex + 1)],
    }),
    encodeFunctionData({
      abi: ensResolverAbi,
      functionName: "setText",
      args: [toNode, chatKey(fromLabel, `msg.${newIndex}`), buildJson(kmsSigForToTwin)],
    }),
    encodeFunctionData({
      abi: ensResolverAbi,
      functionName: "setText",
      args: [toNode, chatKey(fromLabel, "count"), String(newIndex + 1)],
    }),
  ]

  const isFirstMessage = myCount === 0 && theirCount === 0
  const participantsJson = JSON.stringify(
    [fromEns.toLowerCase(), toEns.toLowerCase()].sort(),
  )
  if (isFirstMessage) {
    calls.push(
      encodeFunctionData({
        abi: ensResolverAbi,
        functionName: "setText",
        args: [fromNode, chatKey(toLabel, "participants"), participantsJson],
      }),
      encodeFunctionData({
        abi: ensResolverAbi,
        functionName: "setText",
        args: [toNode, chatKey(fromLabel, "participants"), participantsJson],
      }),
    )
  }
  if (!fromChats.includes(toEns)) {
    calls.push(
      encodeFunctionData({
        abi: ensResolverAbi,
        functionName: "setText",
        args: [fromNode, CHATS_LIST_KEY, JSON.stringify([...fromChats, toEns])],
      }),
    )
  }
  if (!toChats.includes(fromEns)) {
    calls.push(
      encodeFunctionData({
        abi: ensResolverAbi,
        functionName: "setText",
        args: [toNode, CHATS_LIST_KEY, JSON.stringify([...toChats, fromEns])],
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
    nonce: startingNonce,
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
        `Likely cause: dev wallet doesn't own one of the twin nodes. ` +
        `tx=${recordsMulticallTx}`,
    )
  }

  // RPC consistency dance — wait until both twins reflect the new count.
  const expected = String(newIndex + 1)
  const consistencyDeadline = Date.now() + 60_000
  while (Date.now() < consistencyDeadline) {
    const [a, b] = await Promise.all([
      readTextRecordFast(fromEns, chatKey(toLabel, "count")).catch(() => ""),
      readTextRecordFast(toEns, chatKey(fromLabel, "count")).catch(() => ""),
    ])
    if (a === expected && b === expected) break
    await new Promise((r) => setTimeout(r, 1_000))
  }
  void ZERO_ADDRESS

  return {
    message: {
      index: newIndex,
      chatEns: fromEns,
      peer: toEns,
      from: fromEns,
      body, // plaintext for the UI; chain stays as ciphertext
      at,
      stealth: true,
      cosmicAttestation: "",
      kmsSig: kmsSigForFromTwin,
      kmsVerified: kmsSigForFromTwin !== null, // optimistic; reader re-verifies
    },
    chatEns: fromEns,
    mineChatEns: fromEns,
    theirsChatEns: toEns,
    createdChat: isFirstMessage,
    createSubnameTx: null,
    createSubnameTxs: [],
    recordsMulticallTx,
    blockExplorerUrl: `https://sepolia.etherscan.io/tx/${recordsMulticallTx}`,
    cosmicAttestation: "",
    cosmicSeeded: encrypted.cosmicSeeded,
  }
}
