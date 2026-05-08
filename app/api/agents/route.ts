import { readAgentDirectory } from "@/lib/agents"
import { readTextRecord } from "@/lib/ens"
import { buildAvatarUrl } from "@/lib/twin-profile"
import { jsonError } from "@/lib/api-guard"

export const runtime = "nodejs"

// Returns the directory enriched with each agent's avatar + description.
// Reads in parallel so the response stays snappy even with many agents.
export async function GET() {
  try {
    const agents = await readAgentDirectory()
    const enriched = await Promise.all(
      agents.map(async (a) => {
        const label = a.ens.split(".")[0] ?? a.ens
        const [avatar, description] = await Promise.all([
          readTextRecord(a.ens, "avatar").catch(() => null),
          readTextRecord(a.ens, "description").catch(() => null),
        ])
        return {
          ...a,
          // If a twin was minted before profile defaults existed, fall back
          // to a generated URL so every entry has an avatar.
          avatar: avatar ?? buildAvatarUrl(label),
          description: description ?? null,
        }
      }),
    )
    return Response.json({ ok: true, agents: enriched })
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Failed to read agent directory",
      502,
    )
  }
}
