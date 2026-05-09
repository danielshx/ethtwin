// Mints an OpenAI Realtime ephemeral key (60s TTL) for the browser to open
// a WebRTC peer connection. Frontend must reconnect ~50s in or auto-renew.
//
// Hydrates the system prompt from the user's ENS text records (matches the
// /api/twin pattern) so Voice mode and Chat mode share the same Twin persona.
// If OPENAI_API_KEY is missing we return a clean 503 with a typed error so
// the client can fall back to chat (drop rule from CLAUDE.md).

import { z } from "zod"
import { buildSystemPrompt } from "@/lib/prompts"
import { readTwinRecords, type TwinTextRecords } from "@/lib/ens"
import { verifyAuthToken } from "@/lib/privy-server"
import { jsonError, parseJsonBody } from "@/lib/api-guard"

export const runtime = "nodejs"
export const maxDuration = 30

const REALTIME_MODEL = "gpt-4o-realtime-preview"
const REALTIME_VOICE = "alloy"

const voiceBodySchema = z.object({
  privyToken: z.string().nullable().optional(),
  ensName: z.string().optional(),
})

type RealtimeSession = {
  id?: string
  model?: string
  expires_at?: number
  client_secret?: { value: string; expires_at: number }
}

export async function POST(req: Request) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    // 503 = client should degrade gracefully to chat-only mode.
    return Response.json(
      { error: "voice-unavailable", reason: "OPENAI_API_KEY not set" },
      { status: 503 },
    )
  }

  const parsed = await parseJsonBody(req, voiceBodySchema)
  if (!parsed.ok) return parsed.response
  const body = parsed.data
  const ensName = body.ensName ?? "twin.ethtwin.eth"

  // Auth is best-effort here (matches onboarding pattern). If a token is
  // present, verify it; if it's missing we still mint — voice is gated by
  // the UI tab which only renders for signed-in users.
  if (body.privyToken) {
    try {
      await verifyAuthToken(body.privyToken)
    } catch (error) {
      return jsonError(
        error instanceof Error ? error.message : "Privy token verification failed",
        401,
      )
    }
  }

  let records: TwinTextRecords | null = null
  try {
    records = await readTwinRecords(ensName)
  } catch {
    // Fresh twin or ENS read flake — fall back to defaults.
  }

  const systemPrompt = [
    buildSystemPrompt(records, ensName),
    `# Language`,
    `Always speak and respond in English, regardless of the language the user speaks to you in. If the user addresses you in another language, understand them but reply in English.`,
  ].join("\n\n")

  let res: Response
  try {
    res = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: REALTIME_MODEL,
        voice: REALTIME_VOICE,
        instructions: systemPrompt,
        modalities: ["audio", "text"],
        input_audio_transcription: { model: "whisper-1", language: "en" },
      }),
    })
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "OpenAI Realtime mint failed",
      502,
    )
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    return jsonError(
      `OpenAI Realtime session mint failed: ${res.status} ${text}`,
      502,
    )
  }

  const data = (await res.json()) as RealtimeSession
  const secret = data.client_secret?.value
  const expiresAt = data.client_secret?.expires_at ?? data.expires_at
  if (!secret || !expiresAt) {
    return jsonError("OpenAI returned no client_secret", 502)
  }

  return Response.json({
    client_secret: secret,
    model: data.model ?? REALTIME_MODEL,
    expires_at: expiresAt,
    ensName,
  })
}
