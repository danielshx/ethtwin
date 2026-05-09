import { z } from "zod"
import { verifyAuthToken } from "@/lib/privy-server"
import { chatSubnameFor, readChatThread, readInbox, sendMessage } from "@/lib/messages"
import { jsonError, parseJsonBody } from "@/lib/api-guard"

export const runtime = "nodejs"
// Send path needs to broadcast (≤2s) AND wait for the records-multicall to
// mine (~12-24s on Sepolia) so the client's immediate refresh actually sees
// the message. 45s budget covers the slowest realistic send; reads finish
// well within this. (Vercel function ceiling is 60s on hobby, 300s on pro.)
export const maxDuration = 45

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
      const chatEns = chatSubnameFor(between, and)
      const messages = await readChatThread(chatEns, between)
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
