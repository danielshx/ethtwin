// Write the `twin.owner` text record on a twin's ENS subdomain. This is the
// server-side half of the "agent spending" enablement flow:
//
//   1. Server (this route): write `twin.owner = userWallet` so lib/transfers
//      knows whose wallet to pull USDC from.
//   2. Client: user signs `USDC.approve(devWallet, amount)` from their own
//      wallet — that allowance becomes the agent's spending cap.
//
// After both steps, every chat-driven USDC send moves funds straight from
// the user's wallet via `USDC.transferFrom`. No custom contract.
//
// POST /api/profile/set-owner
//   body: { privyToken?, ens, userWallet }
//   returns: { ok, ensName, owner, recordsTx, blockExplorerUrl }

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
import { readTextRecordFast } from "@/lib/ens"

export const runtime = "nodejs"
export const maxDuration = 45
export const dynamic = "force-dynamic"

const PARENT_RESOLVER: Address = "0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5"
const RESOLVER_GAS = 200_000n
const SEPOLIA_MAX_FEE = 5_000_000_000n
const SEPOLIA_PRIORITY = 1_500_000_000n

const bodySchema = z.object({
  privyToken: z.string().nullable().optional(),
  ens: z
    .string()
    .min(3)
    .regex(/\.ethtwin\.eth$/i, "Must be an ethtwin.eth subname"),
  userWallet: ethereumAddressSchema,
})

export async function POST(req: Request) {
  const parsed = await parseJsonBody(req, bodySchema)
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

    if (ownerAddr.toLowerCase() === devAccount.address.toLowerCase()) {
      return jsonError(
        "Owner equals dev wallet — agent can't spend from itself. Use a different wallet.",
        400,
      )
    }

    // Idempotency: if the record is already what we'd write, skip the tx.
    try {
      const existing = await readTextRecordFast(ens, "twin.owner")
      if (
        existing &&
        existing.toLowerCase() === ownerAddr.toLowerCase()
      ) {
        return Response.json({
          ok: true,
          alreadySet: true,
          ensName: ens,
          owner: ownerAddr,
        })
      }
    } catch {
      // proceed
    }

    const node = namehash(ens)
    const data = encodeFunctionData({
      abi: ensResolverAbi,
      functionName: "setText",
      args: [node, "twin.owner", ownerAddr],
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
      gas: RESOLVER_GAS,
      maxFeePerGas: SEPOLIA_MAX_FEE,
      maxPriorityFeePerGas: SEPOLIA_PRIORITY,
      value: 0n,
    })
    const recordsTx: Hash = await sepoliaClient.sendRawTransaction({
      serializedTransaction: signed,
    })

    // Wait for the records tx so the next read reliably finds the record.
    const receipt = await sepoliaClient.waitForTransactionReceipt({
      hash: recordsTx,
    })
    if (receipt.status !== "success") {
      return jsonError(
        `set-owner records tx reverted (gasUsed=${receipt.gasUsed.toString()}). tx=${recordsTx}`,
        502,
      )
    }

    return Response.json({
      ok: true,
      ensName: ens,
      owner: ownerAddr,
      recordsTx,
      blockExplorerUrl: `https://sepolia.etherscan.io/tx/${recordsTx}`,
    })
  } catch (error) {
    console.error("[profile/set-owner] failed:", error)
    return jsonError(
      error instanceof Error ? error.message : "set-owner failed",
      502,
    )
  }
}
