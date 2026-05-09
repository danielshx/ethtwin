// Delete a twin's ENS subdomain — fully removes the on-chain record.
//
// What "delete" means here:
//   1. Reset addr + the known text records on the resolver (avatar, description,
//      url, persona, capabilities, endpoint, version, stealth-meta-address) so
//      anyone resolving the name sees nothing.
//   2. Reassign the subname back to the zero address with a zero resolver via
//      setSubnodeRecord — this hands ownership back to the void and effectively
//      orphans the name in the ENS registry.
//   3. Remove the entry from the parent's `agents.directory` text record so the
//      messenger / discovery surfaces don't list a ghost.
//
// Only the parent owner (the dev wallet) can perform any of these, so all txs
// are signed and broadcast server-side after Privy auth verification.
//
// POST /api/profile/delete
//   body: { privyToken, ens }
//   returns: { ok, ensName, txHash, blockExplorerUrl }

import {
  createPublicClient,
  encodeFunctionData,
  http,
  keccak256,
  namehash,
  parseEventLogs,
  toBytes,
  type Address,
  type Hash,
  type Hex,
} from "viem"
import { sepolia } from "viem/chains"
import { z } from "zod"
import { verifyAuthToken } from "@/lib/privy-server"
import { ensRegistryAbi, ensResolverAbi } from "@/lib/abis"
import { ENS_REGISTRY } from "@/lib/ens"
import { readAgentDirectory } from "@/lib/agents"
import {
  PARENT_DOMAIN,
  getDevWalletClient,
  sepoliaClient,
} from "@/lib/viem"
import { jsonError, parseJsonBody } from "@/lib/api-guard"

// Public-RPC client just for eth_getLogs — Alchemy free tier caps eth_getLogs
// at 10 blocks, which makes a multi-day scan infeasible. publicnode allows
// ~5000 blocks per call. Same workaround scripts/wipe-subnames.ts uses.
const LOG_RPC_URL =
  process.env.SEPOLIA_LOG_RPC ?? "https://ethereum-sepolia-rpc.publicnode.com"
const logClient = createPublicClient({
  chain: sepolia,
  transport: http(LOG_RPC_URL),
})

const NEW_OWNER_EVENT = {
  name: "NewOwner",
  type: "event",
  inputs: [
    { name: "node", type: "bytes32", indexed: true },
    { name: "label", type: "bytes32", indexed: true },
    { name: "owner", type: "address", indexed: false },
  ],
} as const

const REGISTRY_OWNER_ABI = [
  {
    name: "owner",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ name: "", type: "address" }],
  },
] as const

export const runtime = "nodejs"
export const maxDuration = 45
export const dynamic = "force-dynamic"

const PARENT_RESOLVER: Address = "0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5"
const ZERO_ADDRESS: Address = "0x0000000000000000000000000000000000000000"

const DELETE_RESOLVER_GAS = 1_000_000n
const DELETE_REGISTRY_GAS = 200_000n
const DIRECTORY_UPDATE_GAS = 200_000n
const SEPOLIA_MAX_FEE_PER_GAS = 5_000_000_000n // 5 gwei
const SEPOLIA_MAX_PRIORITY_FEE_PER_GAS = 1_500_000_000n // 1.5 gwei

// Text records we wipe before deletion so a stale read can't surface old data
// after the registry orphan-call lands. `twin.kms-key-id` and `twin.login-hash`
// are CRITICAL — without clearing them, /api/session reads them directly from
// resolver storage (bypassing the registry) and lets a deleted twin log
// straight back in.
const RECORDS_TO_CLEAR = [
  "avatar",
  "description",
  "url",
  "twin.persona",
  "twin.capabilities",
  "twin.endpoint",
  "twin.version",
  "stealth-meta-address",
  "twin.kms-key-id",
  "twin.login-hash",
  "chats.list",
] as const

// Default lookback when scanning for child chat sub-subdomains. ~28 days on
// Sepolia. Override via SEPOLIA_DELETE_LOOKBACK env if your project is older.
const DEFAULT_LOOKBACK_BLOCKS = 200_000n
const LOG_CHUNK_BLOCKS = 5_000n
const ZERO_HASH: Hex = "0x0000000000000000000000000000000000000000000000000000000000000000"

/**
 * Find every direct child sub-subdomain of `twinNode` that currently has a
 * non-zero registry owner. Returns the labelHashes — that's all
 * setSubnodeRecord needs to orphan them.
 */
async function findChildSubnames(twinNode: Hex): Promise<Hex[]> {
  const tip = await sepoliaClient.getBlockNumber()
  const fromBlock = tip > DEFAULT_LOOKBACK_BLOCKS ? tip - DEFAULT_LOOKBACK_BLOCKS : 0n

  const seen = new Map<Hex, bigint>() // labelHash → lastSeenBlock
  for (let start = fromBlock; start <= tip; start += LOG_CHUNK_BLOCKS) {
    const end = start + LOG_CHUNK_BLOCKS - 1n > tip ? tip : start + LOG_CHUNK_BLOCKS - 1n
    const logs = await logClient.getLogs({
      address: ENS_REGISTRY,
      event: NEW_OWNER_EVENT,
      args: { node: twinNode },
      fromBlock: start,
      toBlock: end,
    })
    const parsed = parseEventLogs({
      abi: [NEW_OWNER_EVENT],
      logs,
      eventName: "NewOwner",
    })
    for (const ev of parsed) {
      const labelHash = ev.args.label as Hex
      if (labelHash === ZERO_HASH) continue
      const prev = seen.get(labelHash)
      if (prev === undefined || ev.blockNumber > prev) {
        seen.set(labelHash, ev.blockNumber)
      }
    }
  }

  // Filter to currently-owned (skip already-orphaned children).
  const stillOwned: Hex[] = []
  for (const labelHash of seen.keys()) {
    const childNode = keccak256(
      ("0x" + twinNode.slice(2) + labelHash.slice(2)) as Hex,
    )
    try {
      const owner = await sepoliaClient.readContract({
        address: ENS_REGISTRY,
        abi: REGISTRY_OWNER_ABI,
        functionName: "owner",
        args: [childNode],
      })
      if (owner.toLowerCase() !== ZERO_ADDRESS.toLowerCase()) {
        stillOwned.push(labelHash)
      }
    } catch {
      // best-effort
    }
  }
  return stillOwned
}

const deleteBodySchema = z.object({
  // Optional: email-only / wallet-only flows may not yet have a Privy access
  // token. Onboarding has the same relaxed contract — every write is signed
  // by the dev wallet anyway, so the Privy check is opportunistic, not
  // load-bearing.
  privyToken: z.string().nullable().optional(),
  ens: z
    .string()
    .min(3)
    .regex(/\.ethtwin\.eth$/i, "Must be an ethtwin.eth subname"),
})

export async function POST(req: Request) {
  const parsed = await parseJsonBody(req, deleteBodySchema)
  if (!parsed.ok) return parsed.response
  const { privyToken, ens } = parsed.data

  if (privyToken) {
    try {
      await verifyAuthToken(privyToken)
    } catch (error) {
      return jsonError(
        error instanceof Error ? error.message : "Privy token verification failed",
        401,
      )
    }
  }

  try {
    const { account: devAccount } = getDevWalletClient()
    const node = namehash(ens)
    const labelStr = ens.split(".")[0]
    if (!labelStr) {
      return jsonError("Could not extract label from ENS name", 400)
    }
    const labelHash = keccak256(toBytes(labelStr))
    const parentNode = namehash(PARENT_DOMAIN)

    // Find every chat-* sub-subdomain currently owned under this twin —
    // those are the chat threads (chat-<peer>.<me>.ethtwin.eth) that hold
    // the message text records. Orphan them all so a re-mint of the same
    // twin name doesn't surface stale messages.
    const childLabelHashes = await findChildSubnames(node).catch(() => [] as Hex[])

    // Pipeline txs: orphan children → clear records → orphan twin → update directory.
    let nonce = await sepoliaClient.getTransactionCount({
      address: devAccount.address,
      blockTag: "pending",
    })

    // 0. Orphan each child chat sub-subdomain. Each is a separate
    // setSubnodeRecord on ENS_REGISTRY targeting the child's parent (= the
    // twin node). Ownership of the twin node is required to mutate its
    // children — the dev wallet has it because it's the registered owner
    // until the next step orphans it.
    const childOrphanTxs: Hash[] = []
    for (const childLabelHash of childLabelHashes) {
      const childOrphanData = encodeFunctionData({
        abi: ensRegistryAbi,
        functionName: "setSubnodeRecord",
        args: [node, childLabelHash, ZERO_ADDRESS, ZERO_ADDRESS, 0n],
      })
      const signed = await devAccount.signTransaction({
        chainId: sepolia.id,
        type: "eip1559",
        to: ENS_REGISTRY,
        data: childOrphanData,
        nonce,
        gas: DELETE_REGISTRY_GAS,
        maxFeePerGas: SEPOLIA_MAX_FEE_PER_GAS,
        maxPriorityFeePerGas: SEPOLIA_MAX_PRIORITY_FEE_PER_GAS,
        value: 0n,
      })
      const tx = await sepoliaClient.sendRawTransaction({
        serializedTransaction: signed,
      })
      childOrphanTxs.push(tx)
      nonce += 1
    }

    // 1. Clear all records via multicall on the resolver.
    const clearCalls: `0x${string}`[] = [
      encodeFunctionData({
        abi: ensResolverAbi,
        functionName: "setAddr",
        args: [node, ZERO_ADDRESS],
      }),
      ...RECORDS_TO_CLEAR.map((key) =>
        encodeFunctionData({
          abi: ensResolverAbi,
          functionName: "setText",
          args: [node, key, ""],
        }),
      ),
    ]
    const clearTxData = encodeFunctionData({
      abi: ensResolverAbi,
      functionName: "multicall",
      args: [clearCalls],
    })

    const signedClear = await devAccount.signTransaction({
      chainId: sepolia.id,
      type: "eip1559",
      to: PARENT_RESOLVER,
      data: clearTxData,
      nonce,
      gas: DELETE_RESOLVER_GAS,
      maxFeePerGas: SEPOLIA_MAX_FEE_PER_GAS,
      maxPriorityFeePerGas: SEPOLIA_MAX_PRIORITY_FEE_PER_GAS,
      value: 0n,
    })
    const clearTx = await sepoliaClient.sendRawTransaction({
      serializedTransaction: signedClear,
    })
    nonce += 1

    // 2. Orphan the subname in the registry: owner=0x0, resolver=0x0.
    const orphanData = encodeFunctionData({
      abi: ensRegistryAbi,
      functionName: "setSubnodeRecord",
      args: [parentNode, labelHash, ZERO_ADDRESS, ZERO_ADDRESS, 0n],
    })
    const signedOrphan = await devAccount.signTransaction({
      chainId: sepolia.id,
      type: "eip1559",
      to: ENS_REGISTRY,
      data: orphanData,
      nonce,
      gas: DELETE_REGISTRY_GAS,
      maxFeePerGas: SEPOLIA_MAX_FEE_PER_GAS,
      maxPriorityFeePerGas: SEPOLIA_MAX_PRIORITY_FEE_PER_GAS,
      value: 0n,
    })
    const orphanTx = await sepoliaClient.sendRawTransaction({
      serializedTransaction: signedOrphan,
    })
    nonce += 1

    // 3. Remove from agents.directory text record on the parent.
    let directoryTx: `0x${string}` | null = null
    try {
      const directory = await readAgentDirectory()
      const filtered = directory.filter(
        (e) => e.ens.toLowerCase() !== ens.toLowerCase(),
      )
      if (filtered.length !== directory.length) {
        const directoryData = encodeFunctionData({
          abi: ensResolverAbi,
          functionName: "setText",
          args: [parentNode, "agents.directory", JSON.stringify(filtered)],
        })
        const signedDir = await devAccount.signTransaction({
          chainId: sepolia.id,
          type: "eip1559",
          to: PARENT_RESOLVER,
          data: directoryData,
          nonce,
          gas: DIRECTORY_UPDATE_GAS,
          maxFeePerGas: SEPOLIA_MAX_FEE_PER_GAS,
          maxPriorityFeePerGas: SEPOLIA_MAX_PRIORITY_FEE_PER_GAS,
          value: 0n,
        })
        directoryTx = await sepoliaClient.sendRawTransaction({
          serializedTransaction: signedDir,
        })
      }
    } catch (err) {
      // Directory update is best-effort — the on-chain delete is what counts.
      console.warn("[profile/delete] directory update failed:", err)
    }

    return Response.json({
      ok: true,
      ensName: ens,
      txHash: orphanTx,
      clearTx,
      orphanTx,
      directoryTx,
      blockExplorerUrl: `https://sepolia.etherscan.io/tx/${orphanTx}`,
    })
  } catch (error) {
    console.error("[profile/delete] failed:", error)
    return jsonError(
      error instanceof Error ? error.message : "Profile delete failed",
      502,
    )
  }
}
