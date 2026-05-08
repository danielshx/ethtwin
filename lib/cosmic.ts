// Orbitport cTRNG client with rolling cache.
// Stable for demo: pre-warm cache; expose attestation hash for UI.

type CosmicSample = {
  bytes: `0x${string}`
  attestation: string
  fetchedAt: number
}

const CACHE_SIZE = 10
const TTL_MS = 60_000
const cache: CosmicSample[] = []

function isFresh(sample: CosmicSample) {
  return Date.now() - sample.fetchedAt < TTL_MS
}

export async function getCosmicSeed(): Promise<CosmicSample> {
  while (cache.length > 0) {
    const next = cache.shift()!
    if (isFresh(next)) return next
  }
  return fetchSampleDirect()
}

export async function warmCache(target = CACHE_SIZE) {
  const need = Math.max(0, target - cache.length)
  const fresh = await Promise.all(
    Array.from({ length: need }, () => fetchSampleDirect()),
  )
  cache.push(...fresh)
}

async function fetchSampleDirect(): Promise<CosmicSample> {
  const url = process.env.ORBITPORT_API_URL
  const key = process.env.ORBITPORT_API_KEY
  if (!url || !key) {
    return mockSample()
  }
  try {
    const res = await fetch(`${url}/randomness`, {
      headers: { Authorization: `Bearer ${key}` },
    })
    if (!res.ok) throw new Error(`Orbitport ${res.status}`)
    const data = (await res.json()) as { bytes: string; attestation: string }
    return {
      bytes: ensureHex(data.bytes),
      attestation: data.attestation,
      fetchedAt: Date.now(),
    }
  } catch {
    return mockSample()
  }
}

function mockSample(): CosmicSample {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return {
    bytes: ("0x" + Buffer.from(bytes).toString("hex")) as `0x${string}`,
    attestation: "mock-attestation",
    fetchedAt: Date.now(),
  }
}

function ensureHex(b: string): `0x${string}` {
  return (b.startsWith("0x") ? b : "0x" + b) as `0x${string}`
}
