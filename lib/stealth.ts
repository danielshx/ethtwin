// EIP-5564 stealth address generation seeded with cosmic randomness.
// Wraps the beta @scopelift/stealth-address-sdk in try/catch with a mock
// fallback so the demo never crashes if the SDK regresses.

import { getCosmicSeed } from "./cosmic"

export type StealthResult = {
  stealthAddress: `0x${string}`
  ephemeralPublicKey: `0x${string}`
  viewTag: number
  attestation: string
  mocked: boolean
}

export async function generatePrivateAddress(
  stealthMetaAddressURI: string,
): Promise<StealthResult> {
  const seed = await getCosmicSeed()
  try {
    const sdk = await import("@scopelift/stealth-address-sdk")
    const fn =
      (sdk as unknown as { generateStealthAddress?: Function })
        .generateStealthAddress ??
      (sdk as unknown as { default?: { generateStealthAddress?: Function } })
        .default?.generateStealthAddress
    if (typeof fn !== "function") throw new Error("SDK shape changed")
    const result = fn({ stealthMetaAddressURI, ephemeralPrivateKey: seed.bytes }) as {
      stealthAddress: `0x${string}`
      ephemeralPublicKey: `0x${string}`
      viewTag: number
    }
    return {
      ...result,
      attestation: seed.attestation,
      mocked: false,
    }
  } catch {
    return {
      stealthAddress: pseudoAddr(seed.bytes),
      ephemeralPublicKey: ("0x04" + "ab".repeat(64)) as `0x${string}`,
      viewTag: Number(seed.bytes.slice(2, 4)),
      attestation: seed.attestation,
      mocked: true,
    }
  }
}

function pseudoAddr(bytes: `0x${string}`): `0x${string}` {
  return ("0x" + bytes.slice(2, 42)) as `0x${string}`
}
