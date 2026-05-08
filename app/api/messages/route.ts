import { z } from "zod"
import { verifyAuthToken } from "@/lib/privy-server"
import { readInbox, sendMessage } from "@/lib/messages"
import { jsonError, parseJsonBody } from "@/lib/api-guard"

export const runtime = "nodejs"
// Read path has bounded fan-out (cap of 10 messages × 3 reads via universal
// resolver). 15s leaves headroom on Vercel without freezing the UI.
export const maxDuration = 15

// GET /api/messages?for=alice.ethtwin.eth[&limit=10]
export async function GET(req: Request) {
  const url = new URL(req.url)
  const forEns = url.searchParams.get("for")
  if (!forEns) return jsonError("?for=<ensName> is required", 400)
  const limitRaw = url.searchParams.get("limit")
  const limit = limitRaw ? Math.min(50, Math.max(1, Number(limitRaw))) : undefined

  try {
    const messages = await readInbox(forEns, limit)
    return Response.json({ ok: true, ensName: forEns, messages })
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Failed to read inbox",
      502,
    )
  }
}

const sendBodySchema = z.object({
  privyToken: z.string().min(1),
  fromEns: z.string().min(1),
  toEns: z.string().min(1),
  body: z.string().min(1).max(1000),
})

export async function POST(req: Request) {
  const parsed = await parseJsonBody(req, sendBodySchema)
  if (!parsed.ok) return parsed.response
  const { privyToken, fromEns, toEns, body } = parsed.data

  try {
    await verifyAuthToken(privyToken)
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Privy token verification failed",
      401,
    )
  }

  try {
    const result = await sendMessage({ fromEns, toEns, body })
    return Response.json({ ok: true, ...result })
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Failed to send message",
      502,
    )
  }
}
