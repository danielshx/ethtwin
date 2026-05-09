// Update the avatar + description text records on the user's twin ENS subdomain.
// Writes are signed by the dev wallet (parent registry owner), which is also
// the resolver-side approved operator for every subname under ethtwin.eth.
//
// POST /api/profile
//   body: { privyToken, ens, avatar?, description? }
//   returns: { ok, ensName, txHash, blockExplorerUrl }

import { encodeFunctionData, namehash, type Address, type Hash } from "viem"
import { sepolia } from "viem/chains"
import { z } from "zod"
import { verifyAuthToken } from "@/lib/privy-server"
import { ensResolverAbi } from "@/lib/abis"
import { getDevWalletClient, sepoliaClient } from "@/lib/viem"
import { jsonError, parseJsonBody } from "@/lib/api-guard"

export const runtime = "nodejs"
export const maxDuration = 30

// Same Sepolia public resolver used at onboarding — every subname under
// ethtwin.eth is bound to it, so we can skip the resolverOf RPC read.
const PARENT_RESOLVER: Address = "0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5"

const PROFILE_UPDATE_GAS = 600_000n
const SEPOLIA_MAX_FEE_PER_GAS = 5_000_000_000n // 5 gwei
const SEPOLIA_MAX_PRIORITY_FEE_PER_GAS = 1_500_000_000n // 1.5 gwei

const profileBodySchema = z
  .object({
    privyToken: z.string().min(1),
    ens: z.string().min(3).regex(/\.ethtwin\.eth$/i, "Must be an ethtwin.eth subname"),
    avatar: z.string().url().optional(),
    description: z.string().max(280).optional(),
  })
  .refine(
    (b) => b.avatar !== undefined || b.description !== undefined,
    { message: "Provide at least one of avatar / description" },
  )

export async function POST(req: Request) {
  const parsed = await parseJsonBody(req, profileBodySchema)
  if (!parsed.ok) return parsed.response
  const { privyToken, ens, avatar, description } = parsed.data

  try {
    await verifyAuthToken(privyToken)
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Privy token verification failed",
      401,
    )
  }

  try {
    const { account: devAccount } = getDevWalletClient()
    const node = namehash(ens)

    const updates: Array<[string, string]> = []
    if (avatar !== undefined) updates.push(["avatar", avatar])
    if (description !== undefined) updates.push(["description", description])

    const calls: `0x${string}`[] = updates.map(([key, value]) =>
      encodeFunctionData({
        abi: ensResolverAbi,
        functionName: "setText",
        args: [node, key, value],
      }),
    )

    const data =
      calls.length === 1
        ? calls[0]!
        : encodeFunctionData({
            abi: ensResolverAbi,
            functionName: "multicall",
            args: [calls],
          })

    const nonce = await sepoliaClient.getTransactionCount({
      address: devAccount.address,
      blockTag: "pending",
    })

    const signed = await devAccount.signTransaction({
      chainId: sepolia.id,
      type: "eip1559",
      to: PARENT_RESOLVER,
      data,
      nonce,
      gas: PROFILE_UPDATE_GAS,
      maxFeePerGas: SEPOLIA_MAX_FEE_PER_GAS,
      maxPriorityFeePerGas: SEPOLIA_MAX_PRIORITY_FEE_PER_GAS,
      value: 0n,
    })

    const txHash = await sepoliaClient.sendRawTransaction({
      serializedTransaction: signed,
    })

    return Response.json({
      ok: true,
      ensName: ens,
      txHash,
      blockExplorerUrl: `https://sepolia.etherscan.io/tx/${txHash}`,
      updated: Object.fromEntries(updates),
    })
  } catch (error) {
    console.error("[profile] update failed:", error)
    return jsonError(
      error instanceof Error ? error.message : "Profile update failed",
      502,
    )
  }
}
