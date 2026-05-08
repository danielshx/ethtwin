import { z } from "zod"
import { getWalletSummary } from "@/lib/wallet-summary"
import { ethereumAddressSchema, jsonError } from "@/lib/api-guard"

export const runtime = "nodejs"

const querySchema = z.object({
  address: ethereumAddressSchema,
})

export async function GET(req: Request) {
  const url = new URL(req.url)
  const parsed = querySchema.safeParse({
    address: url.searchParams.get("address"),
  })

  if (!parsed.success) {
    return jsonError("Invalid wallet-summary query", 400, parsed.error.flatten())
  }

  try {
    const summary = await getWalletSummary(parsed.data.address)
    return Response.json({ ok: true, summary })
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Failed to read wallet summary",
      502,
    )
  }
}
