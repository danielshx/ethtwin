// Auto-responder for agent-to-agent communication.
//
// Called fire-and-forget from `sendMessage` (server-side) whenever a user's
// twin posts an on-chain message to another `*.ethtwin.eth` twin. We:
//   1. Read the recipient's persona / description text records from ENS.
//   2. Synthesize a short reply in that persona via the configured LLM.
//   3. Post the reply on-chain as a message FROM the recipient TO the sender.
//
// This is what lets the user's agent autonomously coordinate ("schedule
// breakfast with Daniel") — the recipient twin appears to respond on its own,
// the user's agent then polls for the reply (waitForReply) and reacts.

import { z } from "zod"
import { anthropic } from "@ai-sdk/anthropic"
import { openai } from "@ai-sdk/openai"
import { generateText } from "ai"
import { jsonError, parseJsonBody } from "@/lib/api-guard"
import { readTwinRecords } from "@/lib/ens"
import { sendMessage as sendEnsMessage } from "@/lib/messages"
import { displayNameFromEns } from "@/lib/ens"

export const runtime = "nodejs"
export const maxDuration = 60
export const dynamic = "force-dynamic"

const bodySchema = z.object({
  fromEns: z
    .string()
    .min(1)
    .describe("The recipient twin who is auto-replying"),
  toEns: z
    .string()
    .min(1)
    .describe("The original sender — receives the auto-reply"),
  incomingBody: z.string().min(1).max(2000),
})

function selectModel() {
  if (process.env.OPENAI_API_KEY) return openai("gpt-4o-mini")
  if (process.env.ANTHROPIC_API_KEY) return anthropic("claude-sonnet-4-6")
  return null
}

export async function POST(req: Request) {
  const parsed = await parseJsonBody(req, bodySchema)
  if (!parsed.ok) return parsed.response
  const { fromEns, toEns, incomingBody } = parsed.data

  const model = selectModel()
  if (!model) {
    return jsonError("No model API key configured for auto-reply", 500)
  }

  try {
    const records = await readTwinRecords(fromEns).catch(
      () => ({}) as Record<string, string | undefined>,
    )
    const persona = records["twin.persona"] ?? null
    const description = records["description"] ?? null
    const myName = displayNameFromEns(fromEns).displayName
    const theirName = displayNameFromEns(toEns).displayName

    const system = [
      `You ARE ${fromEns}. Another twin (${toEns}) just sent you a message and you are replying to it. Reply in first person, briefly, in plain English.`,
      `Your persona: ${persona ?? "concise, friendly, slightly dry — plain English."}`,
      description ? `Your bio: ${description}` : "",
      `Constraints — strict:`,
      `- One short paragraph, max ~3 sentences. No greetings like "Sure!" or "Of course!".`,
      `- If the incoming message proposes a meeting or coordination, accept or counter with a concrete time/place — don't ask for permission, decide.`,
      `- Don't refer to yourself as an AI or model. You are ${myName}, replying to ${theirName}.`,
      `- Don't repeat what they said back. Just answer.`,
      `- No tool calls. Just text.`,
    ]
      .filter(Boolean)
      .join("\n\n")

    const { text } = await generateText({
      model,
      system,
      prompt: `Their message: """${incomingBody}"""\n\nYour reply:`,
    })

    const replyBody = text.trim().slice(0, 800)
    if (!replyBody) {
      return jsonError("Auto-reply was empty", 502)
    }

    // Post the reply back on-chain. Note: this uses the dev wallet (parent
    // owner) to write `msg-…` subnames under the ORIGINAL sender's ENS —
    // same path as the user's own sendMessage, just inverted from/to.
    const result = await sendEnsMessage({
      fromEns,
      toEns,
      body: replyBody,
    })

    return Response.json({
      ok: true,
      from: fromEns,
      to: toEns,
      reply: replyBody,
      txHash: result.recordsMulticallTx,
      blockExplorerUrl: result.blockExplorerUrl,
    })
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Auto-reply failed",
      502,
    )
  }
}
