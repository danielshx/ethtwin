import { callApifyX402 } from "@/lib/x402-client"

export const runtime = "nodejs"
export const maxDuration = 60

export async function POST(req: Request) {
  const { actor, input } = (await req.json()) as {
    actor: string
    input: unknown
  }
  try {
    const data = await callApifyX402(actor, input)
    return Response.json({ ok: true, data })
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
