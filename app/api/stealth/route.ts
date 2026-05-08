import { readTwinRecords } from "@/lib/ens"
import { generatePrivateAddress } from "@/lib/stealth"

export const runtime = "nodejs"

export async function POST(req: Request) {
  const { recipientEnsName } = (await req.json()) as {
    recipientEnsName: string
  }
  const records = await readTwinRecords(recipientEnsName)
  const meta = records["stealth-meta-address"]
  if (!meta) {
    return Response.json(
      { ok: false, error: `${recipientEnsName} has no stealth-meta-address` },
      { status: 400 },
    )
  }
  const result = await generatePrivateAddress(meta)
  return Response.json({ ok: true, recipientEnsName, ...result })
}
