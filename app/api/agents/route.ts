// On-chain twin directory listing. Returns just `{ ens, addedAt }` per agent —
// the messenger / chat / notifications display avatars by mounting <EnsAvatar>
// which calls /api/agent/[ens] for each row (cached client-side). Keeps this
// route fast and side-steps a class of caching/RPC issues we hit when reading
// the avatar text record per-agent here.

import { readAgentDirectory } from "@/lib/agents"
import { jsonError } from "@/lib/api-guard"

export const runtime = "nodejs"
export const maxDuration = 15
export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const agents = await readAgentDirectory()
    return Response.json({ ok: true, agents })
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Failed to read agent directory",
      502,
    )
  }
}
