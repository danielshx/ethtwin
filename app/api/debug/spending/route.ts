// Diagnostic endpoint: tells you exactly why a chat-driven USDC send is
// (or isn't) routing through the user's wallet via the approve+transferFrom
// path. Reads everything live from chain — no caching.
//
//   GET /api/debug/spending?ens=<label>.ethtwin.eth
//
// Returns:
//   {
//     ens, owner, allowanceUsdc, ownerUsdcBalance, devWalletAddress,
//     willRouteThroughUserWallet: boolean, reason: string
//   }

import { type Address, formatUnits, getAddress, isAddress } from "viem"
import { jsonError } from "@/lib/api-guard"
import { readTextRecordFast } from "@/lib/ens"
import { getDevWalletClient, sepoliaClient } from "@/lib/viem"

export const runtime = "nodejs"
export const maxDuration = 15
export const dynamic = "force-dynamic"

const SEPOLIA_USDC: Address = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238"
const ABI = [
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const

export async function GET(req: Request) {
  const url = new URL(req.url)
  const ens = url.searchParams.get("ens")
  if (!ens || !ens.includes(".")) {
    return jsonError("Invalid or missing ?ens parameter", 400)
  }

  try {
    const { account: devAccount } = getDevWalletClient()
    const ownerRaw = await readTextRecordFast(ens, "twin.owner").catch(() => "")
    if (!ownerRaw || !isAddress(ownerRaw)) {
      return Response.json({
        ok: true,
        ens,
        owner: null,
        devWalletAddress: devAccount.address,
        willRouteThroughUserWallet: false,
        reason: `No twin.owner text record on ${ens} (got: ${
          ownerRaw ? `'${ownerRaw}'` : "empty"
        }). Click "Enable agent spending" in the profile dialog.`,
      })
    }

    const owner = getAddress(ownerRaw) as Address
    const [allowance, balance] = await Promise.all([
      sepoliaClient.readContract({
        address: SEPOLIA_USDC,
        abi: ABI,
        functionName: "allowance",
        args: [owner, devAccount.address],
      }),
      sepoliaClient.readContract({
        address: SEPOLIA_USDC,
        abi: ABI,
        functionName: "balanceOf",
        args: [owner],
      }),
    ])

    const allowanceUsdc = formatUnits(allowance as bigint, 6)
    const balanceUsdc = formatUnits(balance as bigint, 6)
    let willRoute = false
    let reason: string

    if ((allowance as bigint) === 0n) {
      reason = `Allowance is 0 — re-approve from the funding wallet so the agent can pull USDC.`
    } else if ((balance as bigint) === 0n) {
      reason = `Owner allowance is ${allowanceUsdc} USDC, but the owner wallet (${owner}) holds 0 USDC — nothing to pull. Send USDC to that wallet first.`
    } else {
      willRoute = true
      reason = `OK — agent can pull up to min(${allowanceUsdc}, ${balanceUsdc}) USDC from the user wallet via transferFrom on Sepolia.`
    }

    return Response.json({
      ok: true,
      ens,
      owner,
      devWalletAddress: devAccount.address,
      allowanceUsdc,
      allowanceRaw: (allowance as bigint).toString(),
      ownerUsdcBalance: balanceUsdc,
      ownerUsdcBalanceRaw: (balance as bigint).toString(),
      willRouteThroughUserWallet: willRoute,
      reason,
    })
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Spending debug failed",
      502,
    )
  }
}
