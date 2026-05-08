// Stealth USDC send — the hero flow.
//
// Pattern matches /api/transfer: dev wallet is the actual sender, Privy auth
// gates access. Hard-cap the amount so a leaked token can't drain the wallet.
//
// 1. Privy verify
// 2. payments.sendStealthUSDC (cosmic-seeded EIP-5564 stealth address → USDC.transfer)
// 3. Return tx hash + stealth address + cosmic attestation for the UI hero.

import { z } from "zod"
import { parseUnits } from "viem"
import { verifyAuthToken } from "@/lib/privy-server"
import { sendStealthUSDC } from "@/lib/payments"
import { jsonError, parseJsonBody } from "@/lib/api-guard"

export const runtime = "nodejs"
export const maxDuration = 60

// Match the cap in /api/transfer (1 USDC) — same risk model.
const MAX_USDC = parseUnits("1", 6)

const stealthSendBodySchema = z.object({
  privyToken: z.string().min(1),
  recipientEnsName: z.string().min(1),
  amountUsdc: z.union([z.string(), z.number()]),
})

export async function POST(req: Request) {
  const parsed = await parseJsonBody(req, stealthSendBodySchema)
  if (!parsed.ok) return parsed.response
  const { privyToken, recipientEnsName, amountUsdc } = parsed.data

  try {
    await verifyAuthToken(privyToken)
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Privy token verification failed",
      401,
    )
  }

  const amountWei = parseUnits(String(amountUsdc), 6)
  if (amountWei > MAX_USDC) {
    return jsonError(
      `Amount exceeds demo cap of 1 USDC. Bump MAX_USDC in code if you mean it.`,
      400,
    )
  }

  try {
    const result = await sendStealthUSDC({ recipientEnsName, amountUsdc })
    return Response.json({
      ok: true,
      recipientEnsName: result.recipient.ens,
      recipientResolvedAddress: result.recipient.resolvedAddress,
      stealthAddress: result.stealth.stealthAddress,
      ephemeralPublicKey: result.stealth.ephemeralPublicKey,
      viewTag: result.stealth.viewTag,
      cosmicSeeded: result.stealth.cosmicSeeded,
      attestation: result.stealth.attestation,
      mocked: result.stealth.mocked,
      amountHuman: result.amountHuman,
      txHash: result.txHash,
      blockNumber: result.blockNumber.toString(),
      blockExplorerUrl: result.blockExplorerUrl,
    })
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Stealth USDC send failed",
      502,
    )
  }
}
