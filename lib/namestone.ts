const NAMESTONE_BASE = "https://namestone.com/api/public_v1"

type TextRecord = Record<string, string>

type SetNameInput = {
  domain: string
  name: string
  address: `0x${string}`
  textRecords?: TextRecord
}

function authHeader() {
  const key = process.env.NAMESTONE_API_KEY
  if (!key) throw new Error("NAMESTONE_API_KEY missing")
  return { Authorization: key, "Content-Type": "application/json" }
}

export async function setName(input: SetNameInput) {
  const res = await fetch(`${NAMESTONE_BASE}/set-name`, {
    method: "POST",
    headers: authHeader(),
    body: JSON.stringify({
      domain: input.domain,
      name: input.name,
      address: input.address,
      text_records: input.textRecords ?? {},
    }),
  })
  if (!res.ok) {
    throw new Error(`NameStone set-name failed: ${res.status} ${await res.text()}`)
  }
  return res.json() as Promise<{ success: boolean }>
}

export async function getNames(domain: string) {
  const res = await fetch(`${NAMESTONE_BASE}/get-names?domain=${domain}`, {
    headers: authHeader(),
  })
  if (!res.ok) {
    throw new Error(`NameStone get-names failed: ${res.status}`)
  }
  return res.json()
}
