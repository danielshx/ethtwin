// Retroactively deploy a TwinVault for an existing twin and bind it to
// the ENS subdomain. Used when:
//   - a twin was minted before the factory was deployed,
//   - or the user wants to switch a legacy twin onto the vault path
//     after the fact.
//
// What this does, in order:
//   1. Deploy a new TwinVault via the factory, owner = userWallet, agent =
//      dev wallet.
//   2. multicall on the parent resolver to set:
//        - `addr` text record  → vault address (so transfers land in vault)
//        - `twin.vault` text record → vault address
//        - `twin.owner` text record → user wallet
//
// POST /api/profile/bind-vault
//   body: { privyToken?, ens, userWallet }
//   returns: { ok, ensName, vaultAddress, deployTx, recordsTx, blockExplorerUrl }

import {
  encodeFunctionData,
  getAddress,
  namehash,
  type Address,
  type Hash,
} from "viem"
import { sepolia } from "viem/chains"
import { z } from "zod"
import { verifyAuthToken } from "@/lib/privy-server"
import { ensResolverAbi } from "@/lib/abis"
import { getDevWalletClient, sepoliaClient } from "@/lib/viem"
import { jsonError, parseJsonBody, ethereumAddressSchema } from "@/lib/api-guard"
import { deployVaultForUser, isVaultEnabled } from "@/lib/vault"
import { readTextRecordFast } from "@/lib/ens"

export const runtime = "nodejs"
export const maxDuration = 60
export const dynamic = "force-dynamic"

// Same Sepolia public resolver every twin uses.
const PARENT_RESOLVER: Address = "0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5"
const RESOLVER_GAS = 800_000n
const SEPOLIA_MAX_FEE = 5_000_000_000n // 5 gwei
const SEPOLIA_PRIORITY = 1_500_000_000n // 1.5 gwei

const bindBodySchema = z.object({
  privyToken: z.string().nullable().optional(),
  ens: z
    .string()
    .min(3)
    .regex(/\.ethtwin\.eth$/i, "Must be an ethtwin.eth subname"),
  userWallet: ethereumAddressSchema,
})

export async function POST(req: Request) {
  if (!isVaultEnabled()) {
    return jsonError(
      "TWIN_VAULT_FACTORY env var not set — cannot bind a vault until the factory is deployed and the env var is configured.",
      409,
    )
  }

  const parsed = await parseJsonBody(req, bindBodySchema)
  if (!parsed.ok) return parsed.response
  const { privyToken, ens, userWallet } = parsed.data

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
    const ownerAddr = getAddress(userWallet) as Address

    // Refuse to deploy a vault that's owner == agent — pointless config.
    if (ownerAddr.toLowerCase() === devAccount.address.toLowerCase()) {
      return jsonError(
        "User wallet equals dev wallet — vault would have no privilege split. Connect a real wallet first.",
        400,
      )
    }

    // Idempotency: if `twin.vault` is already set, return early.
    try {
      const existing = await readTextRecordFast(ens, "twin.vault")
      if (existing && existing.startsWith("0x") && existing.length === 42) {
        return Response.json({
          ok: true,
          alreadyBound: true,
          ensName: ens,
          vaultAddress: existing,
        })
      }
    } catch {
      // proceed
    }

    // 1. Deploy the vault (uses dev wallet's nonce internally).
    const { vault, deployTx } = await deployVaultForUser(ownerAddr)

    // 2. Re-read post-deploy nonce so the records tx doesn't collide.
    const nonce = await sepoliaClient.getTransactionCount({
      address: devAccount.address,
      blockTag: "pending",
    })
    const node = namehash(ens)
    const calls: `0x${string}`[] = [
      encodeFunctionData({
        abi: ensResolverAbi,
        functionName: "setAddr",
        args: [node, vault],
      }),
      encodeFunctionData({
        abi: ensResolverAbi,
        functionName: "setText",
        args: [node, "twin.vault", vault],
      }),
      encodeFunctionData({
        abi: ensResolverAbi,
        functionName: "setText",
        args: [node, "twin.owner", ownerAddr],
      }),
    ]
    const data = encodeFunctionData({
      abi: ensResolverAbi,
      functionName: "multicall",
      args: [calls],
    })

    const signed = await devAccount.signTransaction({
      chainId: sepolia.id,
      type: "eip1559",
      to: PARENT_RESOLVER,
      data,
      nonce,
      gas: RESOLVER_GAS,
      maxFeePerGas: SEPOLIA_MAX_FEE,
      maxPriorityFeePerGas: SEPOLIA_PRIORITY,
      value: 0n,
    })
    const recordsTx: Hash = await sepoliaClient.sendRawTransaction({
      serializedTransaction: signed,
    })

    return Response.json({
      ok: true,
      ensName: ens,
      vaultAddress: vault,
      deployTx,
      recordsTx,
      blockExplorerUrl: `https://sepolia.etherscan.io/address/${vault}`,
    })
  } catch (error) {
    console.error("[profile/bind-vault] failed:", error)
    return jsonError(
      error instanceof Error ? error.message : "Bind vault failed",
      502,
    )
  }
}
