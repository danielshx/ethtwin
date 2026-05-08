import { anthropic } from "@ai-sdk/anthropic"
import { convertToModelMessages, streamText, type UIMessage } from "ai"
import { twinTools } from "@/lib/twin-tools"
import { buildSystemPrompt } from "@/lib/prompts"
import { readTwinRecords } from "@/lib/ens"

export const runtime = "nodejs"
export const maxDuration = 60

type TwinChatBody = {
  messages: UIMessage[]
  ensName?: string
}

export async function POST(req: Request) {
  const body = (await req.json()) as TwinChatBody
  const ensName = body.ensName ?? "twin.twinpilot.eth"

  let records = null
  try {
    records = await readTwinRecords(ensName)
  } catch {
    // Fresh twin without records — fall back to defaults.
  }

  const messages = await convertToModelMessages(body.messages)
  const result = streamText({
    model: anthropic("claude-sonnet-4-6"),
    system: buildSystemPrompt(records, ensName),
    messages,
    tools: twinTools,
  })

  return result.toUIMessageStreamResponse()
}
