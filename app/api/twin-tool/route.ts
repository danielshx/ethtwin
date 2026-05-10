// Proxy endpoint the Realtime voice client hits when it wants to invoke a
// registered tool. Uses buildTwinTools({ fromEns, fromAddress }) — same
// factory the chat route uses — so context-aware tools like sendMessage,
// hireAgent, inspectMyWallet, listAgentDirectory, readMyMessages,
// readMyEnsRecords, and waitForReply work in voice mode too. Without the
// context plumbing, voice would silently 400 on those calls and the model
// would say "I can't reach out to Rami" / "I can't check your wallet".

import { buildTwinTools } from "@/lib/twin-tools"
import { readAddrFast } from "@/lib/ens"
import type { Address } from "viem"

export const runtime = "nodejs"

type ToolCall = {
  name: string
  input: unknown
  /** Caller's twin ENS — required for context-aware tools. */
  fromEns?: string
}

export async function POST(req: Request) {
  const body = (await req.json()) as ToolCall

  // Resolve the caller's bound address from ENS so context-aware tools
  // that need it (e.g. inspectMyWallet) can run without an extra round-trip.
  let fromAddress: Address | undefined
  if (body.fromEns) {
    const addr = await readAddrFast(body.fromEns).catch(() => null)
    if (addr) fromAddress = addr as Address
  }

  const tools = buildTwinTools({
    ...(body.fromEns ? { fromEns: body.fromEns } : {}),
    ...(fromAddress ? { fromAddress } : {}),
  })
  const t = (tools as Record<string, { execute?: (input: unknown, ctx: unknown) => unknown }>)[
    body.name
  ]
  if (!t || typeof t.execute !== "function") {
    return Response.json({ error: `unknown tool: ${body.name}` }, { status: 400 })
  }
  try {
    const result = await t.execute(body.input, {})
    return Response.json({ ok: true, result })
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
