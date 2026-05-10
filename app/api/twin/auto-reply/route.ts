// Auto-responder for agent-to-agent communication.
//
// Called fire-and-forget from `sendMessage` (server-side) whenever a twin posts
// an on-chain message to another `*.ethtwin.eth` twin. Unlike the original
// implementation (one-shot text generation), this runs a REAL agent loop with
// the recipient twin's full tool surface — so Tom's twin can autonomously
// decide to look something up, message a third twin, hire an analyst, or check
// its own inbox before replying.
//
// Loop control: callers pass `chainDepth` (0 = top-level user turn). The
// `sendMessage` tool refuses to trigger another auto-reply once depth hits
// MAX_AUTO_REPLY_CHAIN_DEPTH, so a chain like Maria→Tom→Alice→Bob can't run
// away. The final reply back to the original sender is posted via
// `sendEnsMessage` directly, which never re-triggers auto-reply.

import { z } from "zod"
import { anthropic } from "@ai-sdk/anthropic"
import { openai } from "@ai-sdk/openai"
import { generateText, stepCountIs } from "ai"
import type { Address } from "viem"
import { jsonError, parseJsonBody } from "@/lib/api-guard"
import { readTwinRecords, readAddrFast, displayNameFromEns } from "@/lib/ens"
import { sendMessage as sendEnsMessage } from "@/lib/messages"
import { buildTwinTools } from "@/lib/twin-tools"

export const runtime = "nodejs"
export const maxDuration = 90
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
  chainDepth: z
    .number()
    .int()
    .min(0)
    .max(5)
    .optional()
    .describe(
      "Hop count from the original user-driven turn. Forwarded into TwinToolContext so nested sendMessage calls cap recursion.",
    ),
})

function selectModel() {
  if (process.env.OPENAI_API_KEY) return openai("gpt-4o-mini")
  if (process.env.ANTHROPIC_API_KEY) return anthropic("claude-sonnet-4-6")
  return null
}

export async function POST(req: Request) {
  const parsed = await parseJsonBody(req, bodySchema)
  if (!parsed.ok) return parsed.response
  const { fromEns, toEns, incomingBody, chainDepth = 0 } = parsed.data

  const model = selectModel()
  if (!model) {
    return jsonError("No model API key configured for auto-reply", 500)
  }

  try {
    const [records, fromAddress] = await Promise.all([
      readTwinRecords(fromEns).catch(
        () => ({}) as Record<string, string | undefined>,
      ),
      readAddrFast(fromEns).catch(() => null),
    ])
    const persona = records["twin.persona"] ?? null
    const description = records["description"] ?? null
    const myName = displayNameFromEns(fromEns).displayName
    const theirName = displayNameFromEns(toEns).displayName

    const system = [
      `You ARE ${fromEns}. Another twin (${toEns}) just sent you a message on-chain. You are deciding how to respond.`,
      `Your persona: ${persona ?? "concise, friendly, slightly dry — plain English."}`,
      description ? `Your bio: ${description}` : "",

      `# How to act — autonomously`,
      `You are not a human-facing chatbot in this turn. You are an autonomous twin reading a message from another agent and choosing what to do.`,
      `If their message asks you to look something up, ask another twin, check your own inbox, verify a counterparty, or perform an on-chain action — DO IT via your tools, then craft a reply that includes the result.`,
      `If it's a simple greeting / scheduling / question you can answer from persona alone — reply directly without calling tools.`,
      `Whatever assistant text you produce at the end of this turn becomes the on-chain reply body to ${toEns}. Do not address a human — address ${theirName} directly.`,

      `# Tool subset you should prefer`,
      `- readMyMessages — to see if there's prior context from this peer.`,
      `- listAgentDirectory / findAgents — to discover other peers when their message references one by name.`,
      `- sendMessage — to ask a third twin (e.g. "Maria asked me to ask Alice when she's free" → sendMessage to alice.ethtwin.eth, then waitForReply, then summarise).`,
      `- waitForReply — pair with sendMessage when you need that third twin's answer before replying.`,
      `- inspectMyWallet / readMyEnsRecords — when their message asks about you specifically.`,
      `- hireAgent — only if their message clearly asks for analyst-grade verification or research.`,
      `Avoid sendToken / sendStealthUsdc / hireAgent unless the incoming message explicitly authorises a payment.`,

      `# Constraints — strict`,
      `- Final reply: one short paragraph, max ~3 sentences. No greetings like "Sure!" / "Of course!".`,
      `- If the incoming message proposes a meeting or coordination → accept or counter with a concrete time/place; don't ask permission, decide.`,
      `- Don't refer to yourself as an AI or model. You are ${myName}, replying to ${theirName}.`,
      `- Don't repeat their words back. Just answer.`,
      chainDepth > 0
        ? `- This is a NESTED auto-reply (hop ${chainDepth}). Be terse. Avoid further outbound sendMessage calls unless strictly necessary — the chain is already deep.`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n")

    const tools = buildTwinTools({
      fromEns,
      ...(fromAddress ? { fromAddress: fromAddress as Address } : {}),
      chainDepth,
    })

    // Bounded agent loop. 6 steps comfortably covers
    // sendMessage→waitForReply→summarise (the deepest useful pattern) plus a
    // verify-on-doubt chain. Capped via chainDepth elsewhere so deeper
    // auto-reply hops can't keep nesting.
    const { text, steps } = await generateText({
      model,
      system,
      prompt: incomingBody,
      tools,
      stopWhen: stepCountIs(6),
    })

    let replyBody = text.trim().slice(0, 800)
    if (!replyBody) {
      // The model exhausted its step budget on tools without composing a final
      // assistant message. Salvage a reply from the last successful tool call
      // so the original sender's `waitForReply` doesn't time out silently.
      replyBody = synthesiseFallback(steps)
    }
    if (!replyBody) {
      return jsonError("Auto-reply was empty", 502)
    }

    // Post the reply back on-chain. Uses the dev wallet (parent owner) to
    // write `msg-…` subnames under the ORIGINAL sender's ENS — same path as
    // the user's own sendMessage, just inverted from/to. Calling the lib
    // function directly (not the tool) means this final reply does NOT
    // re-trigger another auto-reply.
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
      chainDepth,
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

/** Best-effort textual fallback when the model spent its step budget on tools
 *  without producing a final assistant message. We surface the most recent
 *  meaningful tool outcome so the original sender's waitForReply still receives
 *  *something* coherent on-chain instead of silently timing out. */
function synthesiseFallback(steps: unknown): string {
  if (!Array.isArray(steps) || steps.length === 0) return ""
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i] as { text?: string }
    if (typeof step?.text === "string" && step.text.trim()) {
      return step.text.trim().slice(0, 800)
    }
  }
  return "Got your message — I worked on it but couldn't compose a clean reply this round. Ping again if you need a confirmation."
}
