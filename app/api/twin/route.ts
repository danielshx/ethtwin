import { z } from "zod"
import { anthropic } from "@ai-sdk/anthropic"
import { convertToModelMessages, streamText, type UIMessage } from "ai"
import { twinTools } from "@/lib/twin-tools"
import { buildSystemPrompt } from "@/lib/prompts"
import { readTwinRecords } from "@/lib/ens"
import { jsonError, parseJsonBody, requireEnv } from "@/lib/api-guard"

export const runtime = "nodejs"
export const maxDuration = 60

const twinChatBodySchema = z.object({
  messages: z.array(z.custom<UIMessage>()).min(1, "At least one message is required"),
  ensName: z.string().optional(),
})

export async function POST(req: Request) {
  const anthropicKey = requireEnv("ANTHROPIC_API_KEY")
  if (!anthropicKey.ok) return anthropicKey.response

  const parsed = await parseJsonBody(req, twinChatBodySchema)
  if (!parsed.ok) return parsed.response

  const body = parsed.data
  const ensName = body.ensName ?? "twin.twinpilot.eth"

  let records = null
  try {
    records = await readTwinRecords(ensName)
  } catch {
    // Fresh twin without records — fall back to defaults.
  }

  try {
    const messages = await convertToModelMessages(body.messages)

    const result = streamText({
      model: anthropic("claude-sonnet-4-6"),
      system: buildSystemPrompt(records, ensName),
      messages,
      tools: twinTools,
    })

    return result.toUIMessageStreamResponse()
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Twin chat request failed",
      500,
    )
  }
}
