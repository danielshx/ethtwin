import { readAgentDirectory } from "@/lib/agents"
import { readAddrFast, readTextRecordFast } from "@/lib/ens"
import { jsonError } from "@/lib/api-guard"

export const runtime = "nodejs"
export const maxDuration = 15
// Run on every request — without this Next.js caches the build-time response,
// which froze each agent's `avatar` field to whatever was on-chain at deploy
// time (often empty for freshly-minted twins).
export const dynamic = "force-dynamic"
export const revalidate = 0
// Bypass Next.js's fetch-level cache too. viem's http transport uses fetch()
// under the hood, and Next aggressively dedupes/caches those by request body.
// Without this, two parallel `eth_call`s with the same `to` address but
// different `data` payloads can return stale responses to one another.
export const fetchCache = "force-no-store"

// Returns the directory with each agent's on-chain `avatar` text record.
// Reads run in parallel via the fast direct-resolver path (single eth_call
// per agent) so this stays under ~1s even with a dozen agents — much faster
// than the old Universal-Resolver / CCIP-Read flow that was hanging Vercel.
//
// Description stays omitted from the listing; clients fetch the full profile
// from /api/agent/[ens] when opening the profile dialog.
export async function GET() {
  try {
    const agents = await readAgentDirectory()
    const enriched = await Promise.all(
      agents.map(async (a) => {
        // Mirror the per-agent read pattern from /api/agent/[ens] which is
        // confirmed working: addr + text in one Promise.all so viem batches
        // them through the same RPC connection.
        const [addr, avatar] = await Promise.all([
          readAddrFast(a.ens).catch(() => null),
          readTextRecordFast(a.ens, "avatar").catch(() => ""),
        ])
        return {
          ...a,
          addr,
          avatar: avatar || null,
          description: null,
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
