import { z } from "zod"
import { anthropic } from "@ai-sdk/anthropic"
import { openai } from "@ai-sdk/openai"
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai"
import type { Address } from "viem"
import { buildTwinTools } from "@/lib/twin-tools"
import { buildSystemPrompt } from "@/lib/prompts"
import { readTwinRecords, readAddrFast } from "@/lib/ens"
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

  // Resolve the twin's bound wallet + records in parallel so the model gets
  // both as context. Both reads use the fast direct-resolver path so this
  // adds <500ms even on Sepolia.
  const [records, fromAddress] = await Promise.all([
    readTwinRecords(ensName).catch(() => null),
    readAddrFast(ensName).catch(() => null),
  ])

  try {
    const messages = await convertToModelMessages(body.messages)

    const result = streamText({
      model,
      system: buildSystemPrompt(records, ensName, fromAddress),
      messages,
      tools: buildTwinTools({
        fromEns: ensName,
        ...(fromAddress ? { fromAddress: fromAddress as Address } : {}),
      }),
      // Allow the agent to chain tool calls in a single turn — e.g.
      // sendMessage → waitForReply → final summary — so it can carry out
      // multi-step coordination on the user's behalf without losing the thread.
      stopWhen: stepCountIs(8),
    })

    return result.toUIMessageStreamResponse()
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Twin chat request failed",
      500,
    )
  }
}
