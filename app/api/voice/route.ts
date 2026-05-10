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

    `# Voice — narrate BEFORE every tool call`,
    `In voice mode the user can only hear you. Silence === broken. NEVER call a tool without first saying out loud what you are about to do, in 5–10 words.`,
    `When the user asks you to do something that triggers a tool, your reply MUST start with audio that names the action, AND THEN you call the tool. Do not call the tool first and narrate after — that produces dead air.`,
    `Examples (the audio leads, the tool call follows in the same turn):`,
    `  - User: "send 1 USDC to Rami" → say "Sending 1 dollar to Rami now." → call sendStealthUsdc.`,
    `  - User: "reach out to Tom and ask if 12pm works" → say "Pinging Tom about 12pm — give me a moment." → call sendMessage → call waitForReply.`,
    `  - User: "any new messages?" → say "Checking your inbox." → call readMyMessages.`,
    `  - User: "what's my balance?" → say "Pulling your balances." → call inspectMyWallet.`,

    `# Voice — multi-step coordination (background channel, NOT waitForReply)`,
    `When the user asks you to coordinate with another twin (schedule, ask, propose, negotiate):`,
    `  1. Say a short progress line out loud ("Pinging Rami about 12pm now…").`,
    `  2. Call sendMessage with a CONCRETE proposal (include the specific time/place if the user mentioned them). Do NOT include the recipient ENS in the body — just the message.`,
    `  3. Once sendMessage returns ok, narrate one short closer ("Sent. I'll let you know the moment Rami answers — what else can I do?") and END THE TURN. The user can ask other things while we wait.`,
    `**Do NOT call waitForReply** in voice mode. The Realtime channel can't speak while waitForReply polls, which produces a long dead-air gap. The voice client runs a background inbox watcher; when the peer's reply lands on chain (usually 12–30s on Sepolia), it injects a tagged \`[Background]\` message into the conversation automatically and you'll be invoked to narrate it.`,
    `When you receive a \`[Background] <peer> just replied on-chain: "..."\` message, narrate it briefly + ask the user how they want to handle it. Examples:`,
    `  - "[Background] rami.ethtwin.eth just replied: 'sounds good for 12pm'." → "Heads up — Rami's good for 12pm. Want me to confirm?"`,
    `  - "[Background] rami.ethtwin.eth just replied: '12 doesn't work, can we do 1?'." → "Rami's pushing back to 1pm — does that work for you?"`,
    `If sendMessage itself fails, say what failed in plain English ("Rami's twin doesn't have a published key yet, so the message can't sign — re-mint his twin and try again."). NEVER say just "I had a glitch" or "I'm having trouble" — that's a non-answer.`,

    `# Voice — names`,
    `When the user says a bare first name like "Rami", "Tom", "Daniel", treat it as the twin label \`<name>.ethtwin.eth\`. The tool layer auto-expands bare names, so you can pass them either way — but in your spoken reply use the bare name capitalised ("Rami", "Tom") for warmth.`,
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
