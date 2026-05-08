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
import { ENS_REGISTRY, readResolver, readTextRecord } from "./ens"
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
    const raw = await readTextRecord(recipientEns, MESSAGES_LIST_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((x): x is string => typeof x === "string")
  } catch {
    return []
  }
}

/** Read a single message by its full subname. */
async function readSingleMessage(messageEns: string, label: string): Promise<Message | null> {
  try {
    const [from, body, at] = await Promise.all([
      readTextRecord(messageEns, "from"),
      readTextRecord(messageEns, "body"),
      readTextRecord(messageEns, "at"),
    ])
    if (!from || !body || !at) return null
    return {
      label,
      ens: messageEns,
      from,
      body,
      at: Number(at),
    }
  } catch {
    return null
  }
}

/** Full inbox read for a recipient ENS, sorted newest-first. */
export async function readInbox(recipientEns: string): Promise<Message[]> {
  const labels = await readMessageList(recipientEns)
  const messages = await Promise.all(
    labels.map((label) => readSingleMessage(`${label}.${recipientEns}`, label)),
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
export async function sendMessage(args: {
  fromEns: string
  toEns: string
  body: string
}): Promise<SendMessageResult> {
  const { fromEns, toEns, body } = args
  if (!body.trim()) throw new Error("Message body is empty.")
  if (body.length > 1000) throw new Error("Message body exceeds 1000 chars.")

  const recipientResolver = await readResolver(toEns)
  if (recipientResolver === "0x0000000000000000000000000000000000000000") {
    throw new Error(`${toEns} has no resolver — recipient is not provisioned.`)
  }

  const existingList = await readMessageList(toEns)
  const at = Math.floor(Date.now() / 1000)
  const seq = existingList.length
  const label = `msg-${at}-${seq}`
  const messageEns = `${label}.${toEns}`

  const { wallet, account } = getDevWalletClient()

  // Step 1: create the message subname (owned by dev wallet, same resolver as parent).
  const createSubnameTx = await wallet.writeContract({
    account,
    chain: wallet.chain,
    address: ENS_REGISTRY,
    abi: ensRegistryAbi,
    functionName: "setSubnodeRecord",
    args: [
      namehash(toEns),
      keccak256(toBytes(label)),
      account.address,
      recipientResolver,
      0n,
    ],
  })
  await sepoliaClient.waitForTransactionReceipt({ hash: createSubnameTx })

  // Step 2: one multicall on the resolver writes all four text records.
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

  const recordsMulticallTx = await wallet.writeContract({
    account,
    chain: wallet.chain,
    address: recipientResolver as Address,
    abi: ensResolverAbi,
    functionName: "multicall",
    args: [calls],
  })
  await sepoliaClient.waitForTransactionReceipt({ hash: recordsMulticallTx })

  return {
    message: { label, ens: messageEns, from: fromEns, body, at },
    createSubnameTx,
    recordsMulticallTx,
    blockExplorerUrl: `https://sepolia.etherscan.io/tx/${recordsMulticallTx}`,
  }
}
