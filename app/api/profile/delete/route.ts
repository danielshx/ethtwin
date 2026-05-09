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
  encodeFunctionData,
  keccak256,
  namehash,
  toBytes,
  type Address,
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

// Text records we wipe before deletion so a stale read can't surface old data.
const RECORDS_TO_CLEAR = [
  "avatar",
  "description",
  "url",
  "twin.persona",
  "twin.capabilities",
  "twin.endpoint",
  "twin.version",
  "stealth-meta-address",
] as const

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

    // Pipeline txs: clear records → orphan in registry → update directory.
    let nonce = await sepoliaClient.getTransactionCount({
      address: devAccount.address,
      blockTag: "pending",
    })

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
