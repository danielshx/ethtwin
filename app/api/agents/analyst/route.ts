// Sample x402-enabled sub-agent. Other Twins can hire this one to do DeFi
// research; payment is settled via @x402/next middleware before this handler
// runs. For Phase 2 we'll wrap this with the paymentMiddleware exported from
// @x402/next; for now this stub demonstrates the response shape.

import { anthropic } from "@ai-sdk/anthropic"
import { generateText } from "ai"

export const runtime = "nodejs"
export const maxDuration = 60

export async function POST(req: Request) {
  const { task } = (await req.json()) as { task: string }
  const result = await generateText({
    model: anthropic("claude-sonnet-4-6"),
    system:
      "You are analyst.ethtwin.eth, a specialist sub-agent that answers DeFi research questions concisely with sources when possible.",
    prompt: task,
  })
  return Response.json({
    agent: "analyst.ethtwin.eth",
    answer: result.text,
  })
}
