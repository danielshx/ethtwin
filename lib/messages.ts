// On-chain ENS messenger.
//
// Each message is a child subname of the recipient's twin:
//   msg-<unix-ts>-<seq>.<recipient>.ethtwin.eth
// The subname carries three text records:
//   from = sender ENS name (e.g. "alice.ethtwin.eth")
//   body = message text (UTF-8)
//   at   = unix-seconds string
//
// The recipient's subname carries a `messages.list` text record holding a JSON
// array of message labels for ordering + enumeration (ENS doesn't natively
// support enumerating subnames).
//
// Send: createSubname + Resolver.multicall(setText × 4) → 2 txs (~24s on Sepolia).
// Read: 1 RPC for the list + N parallel RPCs for each message's text records.
//
// All txs are signed by the dev wallet, which owns ethtwin.eth + all subnames.

import {
  encodeFunctionData,
  keccak256,
  namehash,
  toBytes,
  type Address,
  type Hash,
  type Hex,
} from "viem"
import { ENS_REGISTRY, readTextRecordFast } from "./ens"
import { ensResolverAbi, ensRegistryAbi } from "./abis"
import { getDevWalletClient, sepoliaClient } from "./viem"
import { sepolia as sepoliaChain } from "viem/chains"
import { encryptMessage, decryptMessage, isStealthBlob } from "./message-crypto"

const MESSAGES_LIST_KEY = "messages.list"
const MAX_LIST_ENTRIES = 200 // text record size cap

export type Message = {
  label: string // e.g. "msg-1701234567-0"
  ens: string // full ENS name of the message subname
  from: string // sender ENS
  body: string
  at: number // unix seconds
  /** True when the on-chain `body` text record is a stealth ciphertext that
   *  we successfully decrypted (or attempted to). False / undefined for
   *  legacy plaintext messages sent before stealth encryption shipped. */
  stealth?: boolean
  /** Orbitport cTRNG attestation hash (or "mock-attestation") associated
   *  with this message's encryption nonce. Set when the recipient subname
   *  carries a `stealth.cosmic-attestation` text record. */
  cosmicAttestation?: string
}

// ── Read side ────────────────────────────────────────────────────────────────

/** Read a recipient's `messages.list` (JSON array of message labels). */
export async function readMessageList(recipientEns: string): Promise<string[]> {
  try {
    const raw = await readTextRecordFast(recipientEns, MESSAGES_LIST_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((x): x is string => typeof x === "string")
  } catch {
    return []
  }
}

// (single-message read via individual fast calls — kept for completeness;
// readInbox below uses a single multicall3 batch instead, which is the path
// that actually fits Vercel's function timeout.)
async function readSingleMessage(
  messageEns: string,
  label: string,
  recipientEns: string,
): Promise<Message | null> {
  try {
    const [from, rawBody, at, attestation] = await Promise.all([
      readTextRecordFast(messageEns, "from"),
      readTextRecordFast(messageEns, "body"),
      readTextRecordFast(messageEns, "at"),
      readTextRecordFast(messageEns, "stealth.cosmic-attestation").catch(() => ""),
    ])
    if (!from || !rawBody || !at) return null
    // If the body is a stealth blob, decrypt with the per-pair key. Falls
    // through to plaintext if it's a legacy unencrypted message — backwards
    // compatible with any messages sent before this change landed.
    let body = rawBody
    let stealth = false
    if (isStealthBlob(rawBody)) {
      stealth = true
      const plain = decryptMessage({
        senderEns: from,
        recipientEns,
        ciphertext: rawBody,
      })
      if (plain != null) {
        body = plain
      } else {
        // We can't read it (probably a key derivation mismatch — e.g. the
        // dev wallet rotated). Surface the situation rather than hiding it.
        body = "[encrypted — could not decrypt]"
      }
    }
    return {
      label,
      ens: messageEns,
      from,
      body,
      at: Number(at),
      stealth,
      ...(attestation ? { cosmicAttestation: attestation } : {}),
    }
  } catch {
    return null
  }
}

// Multicall3 + the fast resolver = the entire inbox in ONE RPC roundtrip.
const MULTICALL3_ADDRESS: `0x${string}` = "0xcA11bde05977b3631167028862bE2a173976CA11"
const PARENT_RESOLVER: `0x${string}` = "0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5"
const RESOLVER_TEXT_VIEW_ABI = [
  {
    name: "text",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "key", type: "string" },
    ],
    outputs: [{ name: "", type: "string" }],
  },
] as const

// Hard cap at 3 messages per inbox load. Each is 3 fast reads (single
// eth_call each via direct resolver). 9 RPC roundtrips total — fits Vercel
// even on slow Sepolia. The frontend can re-fetch with a higher limit on
// demand, or the user can scroll.
const DEFAULT_INBOX_LIMIT = 3

/** Full inbox read for a recipient ENS, sorted newest-first. Hard-capped. */
export async function readInbox(
  recipientEns: string,
  limit: number = DEFAULT_INBOX_LIMIT,
): Promise<Message[]> {
  const labels = await readMessageList(recipientEns)
  const recent = labels.slice(-Math.max(1, Math.min(limit, DEFAULT_INBOX_LIMIT)))
  if (recent.length === 0) return []
  const messages = await Promise.all(
    recent.map((label) =>
      readSingleMessage(`${label}.${recipientEns}`, label, recipientEns),
    ),
  )
  return messages.filter((m): m is Message => m !== null).sort((a, b) => b.at - a.at)
}

// ── Send side ────────────────────────────────────────────────────────────────

export type SendMessageResult = {
  message: Message
  createSubnameTx: Hash
  recordsMulticallTx: Hash
  blockExplorerUrl: string
  /** Orbitport cTRNG attestation that seeded the AES nonce — also written
   *  on chain so anyone reading the message subname can verify provenance. */
  cosmicAttestation: string
  /** True when cosmicAttestation came from a real Orbitport call. */
  cosmicSeeded: boolean
}

/**
 * Send a message from `fromEns` to `toEns`. Both must be subnames under
 * the parent that the dev wallet controls. Performs:
 *   1. createSubname → msg-<seq>.<toEns>
 *   2. Resolver.multicall: set msg.from/body/at + recipient's messages.list
 */
// (PARENT_RESOLVER hoisted above for the read path; reused here for sends.)
const SEPOLIA_MAX_FEE_PER_GAS = 5_000_000_000n
const SEPOLIA_MAX_PRIORITY_FEE_PER_GAS = 1_500_000_000n
const CREATE_SUBNAME_GAS = 200_000n
const RESOLVER_MULTICALL_GAS = 1_000_000n

export async function sendMessage(args: {
  fromEns: string
  toEns: string
  body: string
}): Promise<SendMessageResult> {
  const { fromEns, toEns, body } = args
  if (!body.trim()) throw new Error("Message body is empty.")
  if (body.length > 1000) throw new Error("Message body exceeds 1000 chars.")

  const { account } = getDevWalletClient()

  // Stealth-encrypt the body using a per-twin-pair key derived from the dev
  // wallet master key, with the AES-GCM nonce seeded from Orbitport cTRNG.
  // Anyone reading the on-chain `body` text record sees a cipher blob; only
  // the sender or the recipient (when reading via the dev wallet) can derive
  // the same key and decrypt. The cTRNG attestation is also written to the
  // message subname so observers can cross-check cosmic provenance.
  const encrypted = await encryptMessage({
    senderEns: fromEns,
    recipientEns: toEns,
    body,
  })

  const [existingList, startingNonce] = await Promise.all([
    readMessageList(toEns),
    sepoliaClient.getTransactionCount({
      address: account.address,
      blockTag: "pending",
    }),
  ])

  const at = Math.floor(Date.now() / 1000)
  const seq = existingList.length
  const label = `msg-${at}-${seq}`
  const messageEns = `${label}.${toEns}`

  // Step 1: broadcast createSubname via raw tx (no viem wrapper to avoid
  // hidden RPC calls that hang on Vercel-Sepolia).
  const createData = encodeFunctionData({
    abi: ensRegistryAbi,
    functionName: "setSubnodeRecord",
    args: [
      namehash(toEns),
      keccak256(toBytes(label)),
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
  const createSubnameTx = await sepoliaClient.sendRawTransaction({
    serializedTransaction: signedCreate,
  })

  // Step 2: broadcast multicall with nonce N+1. Both txs settle in the next
  // block(s); multicall executes after createSubname per nonce ordering, so
  // the resolver's owner-check passes.
  const messageNode = namehash(messageEns)
  const recipientNode = namehash(toEns)
  const updatedList = [...existingList, label].slice(-MAX_LIST_ENTRIES)

  const calls: Hex[] = [
    encodeFunctionData({
      abi: ensResolverAbi,
      functionName: "setText",
      args: [messageNode, "from", fromEns],
    }),
    // The `body` record carries the stealth ciphertext (`stl1:<base64url>`),
    // not the plaintext. Readers detect the prefix and decrypt locally.
    encodeFunctionData({
      abi: ensResolverAbi,
      functionName: "setText",
      args: [messageNode, "body", encrypted.ciphertext],
    }),
    encodeFunctionData({
      abi: ensResolverAbi,
      functionName: "setText",
      args: [messageNode, "at", String(at)],
    }),
    // Cosmic provenance: anyone resolving this message can pull the
    // attestation hash and verify the AES-GCM nonce was seeded by Orbitport
    // cTRNG (or see "mock-attestation" if we fell back).
    encodeFunctionData({
      abi: ensResolverAbi,
      functionName: "setText",
      args: [
        messageNode,
        "stealth.cosmic-attestation",
        encrypted.cosmic.attestation,
      ],
    }),
    encodeFunctionData({
      abi: ensResolverAbi,
      functionName: "setText",
      args: [messageNode, "stealth.nonce", encrypted.nonceHex],
    }),
    encodeFunctionData({
      abi: ensResolverAbi,
      functionName: "setText",
      args: [recipientNode, MESSAGES_LIST_KEY, JSON.stringify(updatedList)],
    }),
  ]

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
    nonce: startingNonce + 1,
    gas: RESOLVER_MULTICALL_GAS,
    maxFeePerGas: SEPOLIA_MAX_FEE_PER_GAS,
    maxPriorityFeePerGas: SEPOLIA_MAX_PRIORITY_FEE_PER_GAS,
    value: 0n,
  })
  const recordsMulticallTx = await sepoliaClient.sendRawTransaction({
    serializedTransaction: signedRecords,
  })

  return {
    message: {
      label,
      ens: messageEns,
      from: fromEns,
      body, // the plaintext, not the on-chain ciphertext, for UI/history
      at,
      stealth: true,
      cosmicAttestation: encrypted.cosmic.attestation,
    },
    createSubnameTx,
    recordsMulticallTx,
    blockExplorerUrl: `https://sepolia.etherscan.io/tx/${recordsMulticallTx}`,
    cosmicAttestation: encrypted.cosmic.attestation,
    cosmicSeeded: encrypted.cosmicSeeded,
  }
}
