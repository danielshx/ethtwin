import { readAgentDirectory } from "@/lib/agents"
import { buildAvatarUrl } from "@/lib/twin-profile"
import { jsonError } from "@/lib/api-guard"

export const runtime = "nodejs"
export const maxDuration = 15

// Returns the directory with deterministic avatar URLs computed locally.
// Avoids per-agent RPC reads — those previously caused 5-min hangs on Vercel
// when the directory grew. Description is omitted here; clients fetch the
// full profile from /api/agent/[ens] when opening the profile dialog.
export async function GET() {
  try {
    const agents = await readAgentDirectory()
    const enriched = agents.map((a) => {
      const label = a.ens.split(".")[0] ?? a.ens
      return {
        ...a,
        avatar: buildAvatarUrl(label),
        description: null,
      }
    })
    return Response.json({ ok: true, agents: enriched })
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Failed to read agent directory",
      502,
    )
  }
}
