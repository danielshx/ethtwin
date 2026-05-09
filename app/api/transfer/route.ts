// Authenticated transfer endpoint backing the Send Tokens UI.
//
// Pattern matches /api/messages: the dev wallet is the actual sender.
// Privy token gates access. Hard caps prevent accidental drain.

import { z } from "zod"
import { verifyAuthToken } from "@/lib/privy-server"
import { getTokenBalance, sendToken } from "@/lib/transfers"
import { jsonError, parseJsonBody } from "@/lib/api-guard"
import { getDevWalletClient } from "@/lib/viem"
import { sepolia } from "viem/chains"
import { parseEther, parseUnits } from "viem"

export const runtime = "nodejs"
export const maxDuration = 60

// Demo safety caps. Bigger sends require a code change — intentional.
const MAX_ETH = parseEther("0.01")
const MAX_USDC = parseUnits("1", 6)

const transferBodySchema = z.object({
  privyToken: z.string().nullable().optional(),
  chain: z.enum(["sepolia", "base-sepolia"]),
  token: z.enum(["ETH", "USDC"]),
  to: z.string().min(1),
  amount: z.union([z.string(), z.number()]),
  /** Sender's twin ENS — when present + the ENS has a `twin.vault` record,
   *  the spend routes through the user's vault. */
  fromEns: z.string().optional(),
})

export async function POST(req: Request) {
  const parsed = await parseJsonBody(req, transferBodySchema)
  if (!parsed.ok) return parsed.response
  const { privyToken, chain, token, to, amount, fromEns } = parsed.data

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

  // Cap the amount before broadcasting.
  const requested =
    token === "ETH" ? parseEther(String(amount)) : parseUnits(String(amount), 6)
  const cap = token === "ETH" ? MAX_ETH : MAX_USDC
  if (requested > cap) {
    return jsonError(
      `Demo cap exceeded: max ${token === "ETH" ? "0.01 ETH" : "1 USDC"} per transfer.`,
      400,
    )
  }

  try {
    const result = await sendToken({
      chain,
      token,
      to,
      amount,
      ...(fromEns ? { fromEns } : {}),
    })
    return Response.json({
      ok: true,
      chain: result.chain,
      token: result.token,
      from: result.from,
      to: result.to,
      recipientInput: result.recipientInput,
      amount: result.amountHuman,
      txHash: result.txHash,
      blockNumber: result.blockNumber.toString(),
      blockExplorerUrl: result.blockExplorerUrl,
      viaVault: result.viaVault,
    })
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Transfer failed",
      502,
    )
  }
}

// GET /api/transfer?chain=base-sepolia&token=USDC[&address=0x…|ens]
// Returns balance for the given address (or treasury if omitted).
export async function GET(req: Request) {
  const url = new URL(req.url)
  const chain = url.searchParams.get("chain")
  const token = url.searchParams.get("token")
  const addressInput = url.searchParams.get("address")
  if (chain !== "sepolia" && chain !== "base-sepolia") {
    return jsonError("?chain must be sepolia or base-sepolia", 400)
  }
  if (token !== "ETH" && token !== "USDC") {
    return jsonError("?token must be ETH or USDC", 400)
  }
  try {
    let address: `0x${string}`
    if (addressInput) {
      const { parseRecipient } = await import("@/lib/transfers")
      address = await parseRecipient(addressInput)
    } else {
      const { account } = getDevWalletClient(sepolia)
      address = account.address
    }
    const balance = await getTokenBalance({ chain, token, address })
    return Response.json({
      ok: true,
      chain,
      token,
      address,
      balance: balance.human,
      raw: balance.raw.toString(),
    })
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Balance read failed", 502)
  }
}
