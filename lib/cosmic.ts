// Orbitport cTRNG client.
//
// Source: SpaceComputer Orbitport — true randomness from a satellite
// constellation (cTRNG). We call `sdk.ctrng.random()` from the Orbitport
// SDK using the SAME OAuth2 credentials (ORBITPORT_CLIENT_ID/SECRET) that
// power KMS — no separate API key required.
//
// Each call returns:
//   - data: 32-byte hex string (the cosmic-sourced entropy)
//   - signature: { value, pk, algo } proof of provenance the recipient can
//     publish on-chain so anyone can verify the seed came from a real
//     satellite source and not a local CSPRNG fallback.
//
// We use it to:
//   1. Seed AES-GCM nonces for stealth-encrypted messages (lib/message-crypto)
//   2. Seed EIP-5564 stealth address generation for USDC sends (lib/payments)
//   3. Stamp every stealth artifact with the attestation hash so anyone
//      reading the on-chain record can cross-check provenance.
//
// The mock fallback is *visibly* labelled (attestation = "mock-attestation")
// so a missed env var doesn't silently degrade security claims.

import { OrbitportSDK } from "@spacecomputer-io/orbitport-sdk-ts"

export type CosmicSample = {
  bytes: `0x${string}`
  attestation: string
  fetchedAt: number
  /** True when this sample came from a real Orbitport response. False when
   *  the env var is unset or the call failed and we fell back to local
   *  randomBytes(). UI / on-chain artifacts should label accordingly. */
  fromOrbitport: boolean
}

const REQUEST_TIMEOUT_MS = 8_000

let _sdk: OrbitportSDK | null = null

function sdk(): OrbitportSDK | null {
  if (_sdk) return _sdk
  const clientId = process.env.ORBITPORT_CLIENT_ID
  const clientSecret = process.env.ORBITPORT_CLIENT_SECRET
  if (!clientId || !clientSecret) return null
  _sdk = new OrbitportSDK({ config: { clientId, clientSecret } })
  return _sdk
}

export async function getCosmicSeed(): Promise<CosmicSample> {
  return fetchSampleDirect()
}

export async function warmCache(_target = 0) {
  // Cache eliminated: the SDK already pools its OAuth token, and a fresh
  // satellite sample per-send is the bounty-defining behaviour we want
  // showing up in the demo. Kept as a no-op so existing call sites compile.
  void _target
}

async function fetchSampleDirect(): Promise<CosmicSample> {
  const client = sdk()
  if (!client) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[cosmic] ORBITPORT_CLIENT_ID / ORBITPORT_CLIENT_SECRET not set — " +
          "falling back to local randomBytes. Stealth artifacts will be labelled mock-attestation.",
      )
    }
    return mockSample()
  }
  try {
    const result = await client.ctrng.random(
      { src: "trng" },
      { timeout: REQUEST_TIMEOUT_MS },
    )
    // SDK returns ServiceResult<CTRNGResponse> = { data: CTRNGResponse, ... }
    // CTRNGResponse = { service, src, data: hex, signature?: { value, pk, algo? } }
    const inner = result.data
    if (!inner || typeof inner.data !== "string") {
      throw new Error("Orbitport cTRNG returned empty data")
    }
    const hex = ensureHex(inner.data)
    // Attestation = signature.value when present, else the data hash itself.
    // The signature value IS the proof of provenance — it's signed by the
    // satellite's public key (inner.signature.pk).
    const attestation =
      inner.signature?.value ??
      `unsigned:${hex.slice(2, 18)}` // fall back to a short hash-tag
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
