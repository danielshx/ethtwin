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
import { sendMessage } from "@/lib/messages"
import { getSession } from "@/lib/session"
import { jsonError, parseJsonBody } from "@/lib/api-guard"

export const runtime = "nodejs"
export const maxDuration = 60

// Match the cap in /api/transfer (1 USDC) — same risk model.
const MAX_USDC = parseUnits("1", 6)

const stealthSendBodySchema = z.object({
  // Privy auth optional — KMS-onboarded twins have no Privy token.
  privyToken: z.string().nullable().optional(),
  recipientEnsName: z.string().min(1),
  amountUsdc: z.union([z.string(), z.number()]),
  chain: z.enum(["sepolia", "base-sepolia"]).optional(),
})

export async function POST(req: Request) {
  const parsed = await parseJsonBody(req, stealthSendBodySchema)
  if (!parsed.ok) return parsed.response
  const { privyToken, recipientEnsName, amountUsdc, chain } = parsed.data

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

  const amountWei = parseUnits(String(amountUsdc), 6)
  if (amountWei > MAX_USDC) {
    return jsonError(
      `Amount exceeds demo cap of 1 USDC. Bump MAX_USDC in code if you mean it.`,
      400,
    )
  }

  try {
    const result = await sendStealthUSDC({
      recipientEnsName,
      amountUsdc,
      ...(chain ? { chain } : {}),
    })

    // Notify the recipient via the chat-subname so it shows up in their
    // Messages tab. Without this, stealth recipients have no UX surface
    // that tells them anything happened — their twin's address has no tx
    // (that's the whole point of stealth) and their wallet history shows
    // nothing. The message is the demo-friendly bridge until the proper
    // Announcer-scanning inbox is wired up.
    const session = await getSession()
    if (session?.ens) {
      const ipfsHash = result.stealth.ephemeralPublicKey.slice(2, 18)
      const explorerLink = result.announceExplorerUrl ?? result.blockExplorerUrl
      const body =
        `💸 Stealth payment incoming: ${result.amountHuman} USDC on ${result.chain}.\n` +
        `→ stealth address ${result.stealth.stealthAddress}\n` +
        `→ ephemeral pub-key 0x${ipfsHash}…\n` +
        `→ verify: ${explorerLink}`
      try {
        await sendMessage({
          fromEns: session.ens,
          toEns: result.recipient.ens,
          body,
        })
      } catch (err) {
        // Don't fail the whole request — the on-chain stealth send already
        // landed. Log and let the client surface the partial success.
        console.warn(
          "[stealth/send] receipt-message post failed:",
          err instanceof Error ? err.message : err,
        )
      }
    }

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
      chain: result.chain,
      txHash: result.txHash,
      announceTxHash: result.announceTxHash,
      announced: result.announced,
      blockNumber: result.blockNumber.toString(),
      blockExplorerUrl: result.blockExplorerUrl,
      announceExplorerUrl: result.announceExplorerUrl,
    })
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Stealth USDC send failed",
      502,
    )
  }
}
