import { readTwinRecords, resolveEnsAddress, reverseResolve } from "@/lib/ens"

export const runtime = "nodejs"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const name = searchParams.get("name")
  const address = searchParams.get("address") as `0x${string}` | null

  if (name) {
    const [resolved, records] = await Promise.all([
      resolveEnsAddress(name),
      readTwinRecords(name),
    ])
    return Response.json({ name, address: resolved, records })
  }
  if (address) {
    const ens = await reverseResolve(address)
    return Response.json({ address, name: ens })
  }
  return Response.json({ error: "pass ?name=... or ?address=0x..." }, { status: 400 })
}
