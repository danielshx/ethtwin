// Orbitport cTRNG client with rolling cache.
//
// Source: SpaceComputer Orbitport — true randomness from a satellite
// constellation (cTRNG). Each `/randomness` call returns:
//   - `bytes`: 32 bytes of cosmic-sourced entropy
//   - `attestation`: a signed/hashed proof of provenance the recipient can
//     publish on-chain so anyone can verify the seed came from cTRNG and
//     not a local CSPRNG fallback.
//
// We use it to:
//   1. Seed AES-GCM nonces for stealth-encrypted messages (lib/message-crypto)
//   2. Seed EIP-5564 stealth address generation for USDC sends (lib/payments)
//   3. Stamp every stealth artifact with the attestation hash so anyone
//      reading the on-chain record can cross-check provenance.
//
// The mock fallback is *visibly* labelled (attestation = "mock-attestation")
// so a missed env var doesn't silently degrade security claims.

export type CosmicSample = {
  bytes: `0x${string}`
  attestation: string
  fetchedAt: number
  /** True when this sample came from a real Orbitport response. False when
   *  the env var is unset or the call failed and we fell back to local
   *  randomBytes(). UI / on-chain artifacts should label accordingly. */
  fromOrbitport: boolean
}

const CACHE_SIZE = 10
const TTL_MS = 60_000
const REQUEST_TIMEOUT_MS = 8_000
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
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[cosmic] ORBITPORT_API_URL / ORBITPORT_API_KEY not set — falling back to local randomBytes. Stealth artifacts will be labelled mock-attestation.",
      )
    }
    return mockSample()
  }
  try {
    // Endpoint shape: GET <ORBITPORT_API_URL>/randomness with Bearer auth.
    // Returns { bytes: hex(32), attestation: string }. Manual timeout so a
    // hung satellite link doesn't lock up an /api/twin or /api/messages
    // request behind it.
    const res = await fetch(`${url}/randomness`, {
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => "")
      throw new Error(`Orbitport ${res.status} ${body.slice(0, 200)}`)
    }
    const data = (await res.json()) as {
      bytes?: string
      attestation?: string
      // Some Orbitport variants nest the payload — be defensive.
      randomness?: { bytes?: string; attestation?: string }
    }
    const bytes = data.bytes ?? data.randomness?.bytes
    const attestation = data.attestation ?? data.randomness?.attestation
    if (!bytes || !attestation) {
      throw new Error("Orbitport response missing bytes/attestation")
    }
    const hex = ensureHex(bytes)
    if (hex.length !== 66) {
      // 0x + 64 hex chars = 32 bytes. Anything else means a different scheme.
      console.warn(`[cosmic] unusual byte length from Orbitport: ${hex.length}`)
    }
    return {
      bytes: hex,
      attestation,
      fetchedAt: Date.now(),
      fromOrbitport: true,
    }
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[cosmic] Orbitport fetch failed, falling back:",
        err instanceof Error ? err.message : err,
      )
    }
    return mockSample()
  }
}

function mockSample(): CosmicSample {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return {
    bytes: ("0x" + Buffer.from(bytes).toString("hex")) as `0x${string}`,
    attestation: "mock-attestation",
    fetchedAt: Date.now(),
    fromOrbitport: false,
  }
}

function ensureHex(b: string): `0x${string}` {
  return (b.startsWith("0x") ? b : "0x" + b) as `0x${string}`
}
