// Full profile read for a single agent. Used by the agent profile dialog.
//
// Returns avatar, description, persona, capabilities, addr record, plus a
// generated-avatar fallback for older twins that pre-date the profile defaults.

import { jsonError } from "@/lib/api-guard"
import { readTwinRecords, resolveEnsAddress } from "@/lib/ens"
import { buildAvatarUrl } from "@/lib/twin-profile"

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
    const [records, addr] = await Promise.all([
      readTwinRecords(ens),
      resolveEnsAddress(ens).catch(() => null),
    ])

    return Response.json({
      ok: true,
      ens,
      addr: addr ?? null,
      avatar: records.avatar ?? buildAvatarUrl(label),
      description: records.description ?? null,
      url: records.url ?? null,
      persona: records["twin.persona"] ?? null,
      capabilities: records["twin.capabilities"] ?? null,
      endpoint: records["twin.endpoint"] ?? null,
      stealthMeta: records["stealth-meta-address"] ?? null,
      version: records["twin.version"] ?? null,
    })
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Failed to read agent profile",
      502,
    )
  }
}
