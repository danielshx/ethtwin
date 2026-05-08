// Proxy endpoint the Realtime voice client hits when it wants to invoke a
// registered tool. Mirrors the tools available to the text agent so the
// LLM behavior is consistent across modes.

import { twinTools } from "@/lib/twin-tools"

export const runtime = "nodejs"

type ToolCall = {
  name: keyof typeof twinTools
  input: unknown
}

export async function POST(req: Request) {
  const body = (await req.json()) as ToolCall
  const t = twinTools[body.name]
  if (!t || typeof t.execute !== "function") {
    return Response.json({ error: `unknown tool: ${body.name}` }, { status: 400 })
  }
  try {
    const result = await t.execute(body.input as never, {} as never)
    return Response.json({ ok: true, result })
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
