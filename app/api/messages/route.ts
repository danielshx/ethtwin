import { z } from "zod"
import { verifyAuthToken } from "@/lib/privy-server"
import { readChatThread, readInbox, sendMessage } from "@/lib/messages"
import { jsonError, parseJsonBody } from "@/lib/api-guard"

export const runtime = "nodejs"
// Send path on the FIRST message between a pair runs two sequential txs:
//   1. setSubnodeRecord for the chat subname (mint) — wait for 2-conf receipt
//   2. multicall on the resolver writing msg/count/participants/chats.list
//      — wait for receipt + RPC consistency poll
// Each step is ~12-24s on Sepolia, so 90s covers the worst case. Subsequent
// messages on an existing chat skip step 1 and finish in ~25-35s.
//
// Vercel ceilings: Hobby = 60s (will time out — upgrade to Pro), Pro = 300s.
export const maxDuration = 90

// GET /api/messages?for=alice.ethtwin.eth[&limit=10]
//   → aggregated inbox across every chat the twin is in.
// GET /api/messages?between=alice.ethtwin.eth&and=bob.ethtwin.eth
//   → just the thread between this pair. Skips chats.list entirely (which is
//     racy right after the very first send), goes straight to the chat
//     subname's `msg.<i>` records.
export async function GET(req: Request) {
  const url = new URL(req.url)
  const between = url.searchParams.get("between")
  const and = url.searchParams.get("and")

  if (between && and) {
    try {
      const messages = await readChatThread(between, and)
      // chatEns surfaced to the client is the reader's own copy
      // (chat-<peer>.<me>.ethtwin.eth) — useful for links to the ENS app.
      const chatEns = messages[0]?.chatEns ?? null
      return Response.json({ ok: true, between, and, chatEns, messages })
    } catch (error) {
      return jsonError(
        error instanceof Error ? error.message : "Failed to read chat thread",
        502,
      )
    }
  }

  const forEns = url.searchParams.get("for")
  if (!forEns) {
    return jsonError(
      "Provide ?for=<ensName> or ?between=<a>&and=<b>",
      400,
    )
  }
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
  // Privy auth is now optional — the KMS-onboarded path doesn't issue a
  // Privy access token. We still verify the token if one is supplied so
  // legacy callers that rely on Privy keep working.
  privyToken: z.string().nullable().optional(),
  fromEns: z.string().min(1),
  toEns: z.string().min(1),
  body: z.string().min(1).max(1000),
})

export async function POST(req: Request) {
  const parsed = await parseJsonBody(req, sendBodySchema)
  if (!parsed.ok) return parsed.response
  const { privyToken, fromEns, toEns, body } = parsed.data

  if (privyToken) {
    try {
      await verifyAuthToken(privyToken)
    } catch (error) {
      return jsonError(
        error instanceof Error ? error.message : "Privy token verification failed",
        401,
      )
    }
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
