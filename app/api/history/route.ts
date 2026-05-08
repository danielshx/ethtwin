// History API. GET reads any agent's full history (all entries including failures);
// POST appends an entry, gated by Privy auth so random callers can't pollute it.
//
// Persistence is server-side (lib/history-server.ts) so history survives logouts,
// works across devices, and captures failures alongside successes.

import { z } from "zod"
import { verifyAuthToken } from "@/lib/privy-server"
import { jsonError, parseJsonBody } from "@/lib/api-guard"
import { appendServerHistory, readServerHistory } from "@/lib/history-server"

export const runtime = "nodejs"

// GET /api/history?for=<ens>
export async function GET(req: Request) {
  const url = new URL(req.url)
  const ens = url.searchParams.get("for")
  if (!ens) return jsonError("?for=<ens> is required", 400)
  try {
    const entries = await readServerHistory(ens)
    return Response.json({ ok: true, ens, entries })
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Failed to read history",
      502,
    )
  }
}

const postBodySchema = z.object({
  privyToken: z.string().min(1),
  ens: z.string().min(1),
  kind: z.enum(["transfer", "message", "mint", "stealth-send", "other"]),
  status: z.enum(["success", "failed", "pending"]),
  summary: z.string().min(1).max(500),
  description: z.string().max(2000).optional(),
  txHash: z.string().optional(),
  explorerUrl: z.string().url().optional(),
  chain: z.string().optional(),
  errorMessage: z.string().max(1000).optional(),
  id: z.string().optional(),
})

export async function POST(req: Request) {
  const parsed = await parseJsonBody(req, postBodySchema)
  if (!parsed.ok) return parsed.response
  const body = parsed.data

  try {
    await verifyAuthToken(body.privyToken)
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Privy token verification failed",
      401,
    )
  }

  try {
    const entry = await appendServerHistory(body.ens, {
      id: body.id,
      kind: body.kind,
      status: body.status,
      summary: body.summary,
      description: body.description,
      txHash: body.txHash,
      explorerUrl: body.explorerUrl,
      chain: body.chain,
      errorMessage: body.errorMessage,
    })
    return Response.json({ ok: true, entry })
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Failed to append history",
      502,
    )
  }
}
