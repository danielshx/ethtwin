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

const MESSAGES_LIST_KEY = "messages.list"
const MAX_LIST_ENTRIES = 200 // text record size cap

export type Message = {
  label: string // e.g. "msg-1701234567-0"
  ens: string // full ENS name of the message subname
  from: string // sender ENS
  body: string
  at: number // unix seconds
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
async function readSingleMessage(messageEns: string, label: string): Promise<Message | null> {
  try {
    const [from, body, at] = await Promise.all([
      readTextRecordFast(messageEns, "from"),
      readTextRecordFast(messageEns, "body"),
      readTextRecordFast(messageEns, "at"),
    ])
    if (!from || !body || !at) return null
    return { label, ens: messageEns, from, body, at: Number(at) }
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
    recent.map((label) => readSingleMessage(`${label}.${recipientEns}`, label)),
  )
  return messages.filter((m): m is Message => m !== null).sort((a, b) => b.at - a.at)
}

// ── Send side ────────────────────────────────────────────────────────────────

export type SendMessageResult = {
  message: Message
  createSubnameTx: Hash
  recordsMulticallTx: Hash
  blockExplorerUrl: string
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

  const { wallet, account } = getDevWalletClient()

  // Parallel reads — avoid sequential RPC waterfall on Vercel.
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

  // Step 1: broadcast createSubname (no wait for receipt — fits Vercel timeouts)
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
  const createSubnameTx = await wallet.sendTransaction({
    account,
    chain: wallet.chain,
    to: ENS_REGISTRY,
    data: createData,
    nonce: startingNonce,
    gas: CREATE_SUBNAME_GAS,
    maxFeePerGas: SEPOLIA_MAX_FEE_PER_GAS,
    maxPriorityFeePerGas: SEPOLIA_MAX_PRIORITY_FEE_PER_GAS,
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
    encodeFunctionData({
      abi: ensResolverAbi,
      functionName: "setText",
      args: [messageNode, "body", body],
    }),
    encodeFunctionData({
      abi: ensResolverAbi,
      functionName: "setText",
      args: [messageNode, "at", String(at)],
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
  const recordsMulticallTx = await wallet.sendTransaction({
    account,
    chain: wallet.chain,
    to: PARENT_RESOLVER,
    data: multicallData,
    nonce: startingNonce + 1,
    gas: RESOLVER_MULTICALL_GAS,
    maxFeePerGas: SEPOLIA_MAX_FEE_PER_GAS,
    maxPriorityFeePerGas: SEPOLIA_MAX_PRIORITY_FEE_PER_GAS,
  })

  return {
    message: { label, ens: messageEns, from: fromEns, body, at },
    createSubnameTx,
    recordsMulticallTx,
    blockExplorerUrl: `https://sepolia.etherscan.io/tx/${recordsMulticallTx}`,
  }
}
