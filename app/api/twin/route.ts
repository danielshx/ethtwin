import { z } from "zod"
import { anthropic } from "@ai-sdk/anthropic"
import { openai } from "@ai-sdk/openai"
import { convertToModelMessages, streamText, type UIMessage } from "ai"
import { buildTwinTools } from "@/lib/twin-tools"
import { buildSystemPrompt } from "@/lib/prompts"
import { readTwinRecords } from "@/lib/ens"
import { jsonError, parseJsonBody } from "@/lib/api-guard"

export const runtime = "nodejs"
export const maxDuration = 60

const twinChatBodySchema = z.object({
  messages: z.array(z.custom<UIMessage>()).min(1, "At least one message is required"),
  ensName: z.string().optional(),
})

/**
 * Pick the LLM provider based on which API key is configured.
 * Order: OpenAI → Anthropic → null (mock). Never expose the choice to the client.
 */
function selectModel() {
  if (process.env.OPENAI_API_KEY) {
    return openai("gpt-4o-mini")
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return anthropic("claude-sonnet-4-6")
  }
  return null
}

function mockTwinReply(ensName: string) {
  return [
    `${ensName} online — but no model key is configured.`,
    "Add OPENAI_API_KEY (or ANTHROPIC_API_KEY) to .env.local and restart.",
  ].join(" ")
}

export async function POST(req: Request) {
  const parsed = await parseJsonBody(req, twinChatBodySchema)
  if (!parsed.ok) return parsed.response

  const body = parsed.data
  const ensName = body.ensName ?? "twin.ethtwin.eth"

  const model = selectModel()
  if (!model) {
    return Response.json({
      id: crypto.randomUUID(),
      role: "assistant",
      content: mockTwinReply(ensName),
    })
  }

  let records = null
  try {
    records = await readTwinRecords(ensName)
  } catch {
    // Fresh twin without records — fall back to defaults.
  }

  try {
    const messages = await convertToModelMessages(body.messages)

    const result = streamText({
      model,
      system: buildSystemPrompt(records, ensName),
      messages,
      tools: buildTwinTools({ fromEns: ensName }),
    })

    return result.toUIMessageStreamResponse()
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Twin chat request failed",
      500,
    )
  }
}
