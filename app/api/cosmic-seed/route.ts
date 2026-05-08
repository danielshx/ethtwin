import { getCosmicSeed, warmCache } from "@/lib/cosmic"

export const runtime = "nodejs"

export async function GET() {
  const sample = await getCosmicSeed()
  // fire-and-forget refill to keep cache warm
  warmCache().catch(() => {})
  return Response.json(sample)
}
