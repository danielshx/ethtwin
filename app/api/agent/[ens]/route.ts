// Full profile read for a single agent. Used by the agent profile dialog.
//
// Returns avatar, description, persona, capabilities, addr record, plus a
// generated-avatar fallback for older twins that pre-date the profile defaults.
// Also reads the on-chain USDC allowance the twin's owner has granted to
// the dev wallet, so the dialog can show "Agent can spend N USDC" live.

import { type Address, getAddress, isAddress } from "viem"
import { jsonError } from "@/lib/api-guard"
import { readAddrFast, readTextRecordFast } from "@/lib/ens"
import { buildAvatarUrl } from "@/lib/twin-profile"
import { getDevWalletClient, sepoliaClient } from "@/lib/viem"

const SEPOLIA_USDC: Address = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238"
const ERC20_ALLOWANCE_ABI = [
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
] as const

const TWIN_TEXT_KEYS = [
  "description",
  "avatar",
  "url",
  "twin.persona",
  "twin.capabilities",
  "twin.endpoint",
  "twin.version",
  "stealth-meta-address",
  "twin.vault",
  "twin.owner",
] as const
type TwinKey = (typeof TWIN_TEXT_KEYS)[number]

export const runtime = "nodejs"
export const maxDuration = 15

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ ens: string }> },
) {
  const { ens: rawEns } = await params
  const ens = decodeURIComponent(rawEns)
  if (!ens.includes(".")) {
    return jsonError("Invalid ENS name", 400)
  }
  const label = ens.split(".")[0] ?? ens

  try {
    // All direct calls to the known parent resolver — bypass Universal
    // Resolver / CCIP-Read which can hang for minutes on Vercel-Sepolia.
    const reads: Promise<unknown>[] = [
      readAddrFast(ens).catch(() => null),
      ...TWIN_TEXT_KEYS.map((key) =>
        readTextRecordFast(ens, key).catch(() => ""),
      ),
    ]
    const [addrResult, ...textResults] = await Promise.all(reads)
    const addr = addrResult as `0x${string}` | null
    const recordMap = Object.fromEntries(
      TWIN_TEXT_KEYS.map((key, i) => [key, (textResults[i] as string) || null]),
    ) as Record<TwinKey, string | null>

    // Best-effort: if `twin.owner` is set, read the on-chain USDC allowance
    // that owner has granted to the dev wallet. UI uses this to show the
    // user "agent can currently spend N USDC" without making them refresh
    // after the approve tx mines.
    let agentUsdcAllowance: string | null = null
    const ownerRaw = recordMap["twin.owner"]
    if (ownerRaw && isAddress(ownerRaw)) {
      try {
        const { account: devAccount } = getDevWalletClient()
        const allowance = (await sepoliaClient.readContract({
          address: SEPOLIA_USDC,
          abi: ERC20_ALLOWANCE_ABI,
          functionName: "allowance",
          args: [getAddress(ownerRaw) as Address, devAccount.address],
        })) as bigint
        agentUsdcAllowance = allowance.toString()
      } catch {
        // non-fatal — UI just won't show the live allowance
      }
    }

    return Response.json({
      ok: true,
      ens,
      addr,
      avatar: recordMap.avatar ?? buildAvatarUrl(label),
      description: recordMap.description,
      url: recordMap.url,
      persona: recordMap["twin.persona"],
      capabilities: recordMap["twin.capabilities"],
      endpoint: recordMap["twin.endpoint"],
      stealthMeta: recordMap["stealth-meta-address"],
      version: recordMap["twin.version"],
      vault: recordMap["twin.vault"] ?? null,
      vaultOwner: recordMap["twin.owner"] ?? null,
      agentUsdcAllowance,
    })
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Failed to read agent profile",
      502,
    )
  }
}
