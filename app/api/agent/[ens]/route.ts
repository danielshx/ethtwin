// Full profile read for a single agent. Used by the agent profile dialog.
//
// Returns avatar, description, persona, capabilities, addr record, plus a
// generated-avatar fallback for older twins that pre-date the profile defaults.

import { jsonError } from "@/lib/api-guard"
import { readAddrFast, readTextRecordFast } from "@/lib/ens"
import { buildAvatarUrl } from "@/lib/twin-profile"

const TWIN_TEXT_KEYS = [
  "description",
  "avatar",
  "url",
  "twin.persona",
  "twin.capabilities",
  "twin.endpoint",
  "twin.version",
  "stealth-meta-address",
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
    })
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Failed to read agent profile",
      502,
    )
  }
}
