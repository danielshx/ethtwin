// Sample x402-enabled sub-agent. Other Twins discover this peer via the
// on-chain agent directory (lib/agents.ts), verify ENSIP-25, then POST a task
// here. Payment is settled via @x402/next's withX402 wrapper before the LLM
// runs — only when X402_ANALYST_PAY_TO is configured. Unset = free in dev.

import { NextRequest, NextResponse } from "next/server"
import { anthropic } from "@ai-sdk/anthropic"
import { generateText } from "ai"
import {
  x402ResourceServer,
  withX402,
  type RouteConfig,
} from "@x402/next"
import { HTTPFacilitatorClient } from "@x402/core/server"
import { facilitator } from "@coinbase/x402"

export const runtime = "nodejs"
export const maxDuration = 60

const AGENT_ENS =
  process.env.NEXT_PUBLIC_ANALYST_ENS ?? "analyst.ethtwin.eth"

async function handler(req: NextRequest) {
  const { task } = (await req.json()) as { task: string }
  const result = await generateText({
    model: anthropic("claude-sonnet-4-6"),
    system:
      `You are ${AGENT_ENS}, a specialist sub-agent that answers DeFi research questions concisely with sources when possible.`,
    prompt: task,
  })
  return NextResponse.json({
    agent: AGENT_ENS,
    answer: result.text,
  })
}

function buildPaidHandler() {
  const payTo = process.env.X402_ANALYST_PAY_TO
  if (!payTo) return null

  // Apify-style minimum is $1 USDC; let env override (e.g. "$0.10" for tests).
  const price = process.env.X402_ANALYST_PRICE ?? "$1.00"
  // Default to Base Sepolia for the demo; switch to "eip155:8453" for mainnet.
  const network =
    (process.env.X402_ANALYST_NETWORK as `eip155:${string}`) ??
    "eip155:84532"

  const routeConfig: RouteConfig = {
    accepts: {
      scheme: "exact",
      payTo: payTo as `0x${string}`,
      price,
      network,
    },
    description: `Hire ${AGENT_ENS} for one DeFi research task.`,
  }

  const server = new x402ResourceServer(
    new HTTPFacilitatorClient(facilitator),
  )

  return withX402(handler, routeConfig, server)
}

const paidHandler = buildPaidHandler()

export const POST = paidHandler ?? handler
