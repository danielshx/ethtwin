import { z } from "zod"
import { jsonError, parseJsonBody } from "@/lib/api-guard"
import { describeTx } from "@/lib/tx-decoder"

export const runtime = "nodejs"

const bodySchema = z.object({
  to: z.string().min(1),
  data: z.string().optional(),
  value: z.string().optional(),
  chainId: z.number().int().positive().optional(),
})

function bigintJson(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString()
  if (Array.isArray(value)) return value.map(bigintJson)
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, val]) => [key, bigintJson(val)]))
  }
  return value
}

export async function POST(req: Request) {
  const parsed = await parseJsonBody(req, bodySchema)
  if (!parsed.ok) return parsed.response

  try {
    const decoded = await describeTx({
      to: parsed.data.to as `0x${string}`,
      data: (parsed.data.data ?? "0x") as `0x${string}`,
      value: parsed.data.value ? BigInt(parsed.data.value) : undefined,
      chainId: parsed.data.chainId,
    })

    return Response.json({ ok: true, decoded: bigintJson(decoded) })
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Failed to decode transaction", 502)
  }
}
