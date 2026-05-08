// EIP-5564 stealth address helper, backed by @scopelift/stealth-address-sdk (beta).
// Wrapped in try/catch with a clearly-labelled mock fallback so the demo never
// crashes if the SDK regresses, but the fallback is *visibly* mocked, not silent.

import {
  checkStealthAddress,
  computeStealthKey,
  generateRandomStealthMetaAddress,
  generateStealthAddress as sdkGenerateStealthAddress,
  parseKeysFromStealthMetaAddress,
  parseStealthMetaAddressURI,
  VALID_SCHEME_ID,
} from "@scopelift/stealth-address-sdk"
import { hexToBytes } from "viem"
import { getCosmicSeed } from "./cosmic"

export type StealthResult = {
  stealthAddress: `0x${string}`
  ephemeralPublicKey: `0x${string}`
  viewTag: `0x${string}`
  attestation: string
  /** True when the SDK threw and we returned deterministic fake data instead. */
  mocked: boolean
  /** True when the ephemeral key came from cosmic cTRNG (not the SDK's RNG). */
  cosmicSeeded: boolean
}

export type StealthMetaKeys = {
  spendingPrivateKey: `0x${string}`
  spendingPublicKey: `0x${string}`
  viewingPrivateKey: `0x${string}`
  viewingPublicKey: `0x${string}`
  stealthMetaAddress: `0x${string}`
  stealthMetaAddressURI: string
}

const SCHEME = VALID_SCHEME_ID.SCHEME_ID_1

// ── Sender side ──────────────────────────────────────────────────────────────

/**
 * Generate a one-time stealth address for the recipient identified by the URI.
 * Attempts to seed the ephemeral key from cosmic cTRNG; falls back to SDK randomness.
 */
export async function generatePrivateAddress(
  stealthMetaAddressURI: string,
): Promise<StealthResult> {
  const seed = await getCosmicSeed()
  const cosmicBytes = tryToUint8Array32(seed.bytes)
  const cosmicSeeded = cosmicBytes !== null && seed.attestation !== "mock-attestation"

  try {
    const result = sdkGenerateStealthAddress({
      stealthMetaAddressURI,
      schemeId: SCHEME,
      ephemeralPrivateKey: cosmicBytes ?? undefined,
    })
    return {
      stealthAddress: result.stealthAddress,
      ephemeralPublicKey: result.ephemeralPublicKey,
      viewTag: result.viewTag,
      attestation: seed.attestation,
      mocked: false,
      cosmicSeeded,
    }
  } catch (err) {
    console.warn(
      "[stealth] SDK generateStealthAddress failed, returning labelled mock:",
      err instanceof Error ? err.message : err,
    )
    return mockResult(seed.bytes, seed.attestation, cosmicSeeded)
  }
}

// ── Recipient side ───────────────────────────────────────────────────────────

/** Generate a fresh spending + viewing keypair and the matching meta-address URI. */
export function generateStealthMetaKeys(): StealthMetaKeys {
  return generateRandomStealthMetaAddress()
}

/** Parse a stealth meta-address URI into the embedded compressed pubkeys. */
export function parseMetaAddress(uri: string) {
  const stealthMetaAddress = parseStealthMetaAddressURI({
    stealthMetaAddressURI: uri,
    schemeId: SCHEME,
  })
  const { spendingPublicKey, viewingPublicKey } = parseKeysFromStealthMetaAddress({
    stealthMetaAddress,
    schemeId: SCHEME,
  })
  return { stealthMetaAddress, spendingPublicKey, viewingPublicKey }
}

/** Recipient: derive the stealth-address private key from an on-chain announcement. */
export function deriveStealthPrivateKey(args: {
  ephemeralPublicKey: `0x${string}`
  spendingPrivateKey: `0x${string}`
  viewingPrivateKey: `0x${string}`
}): `0x${string}` {
  return computeStealthKey({
    ephemeralPublicKey: args.ephemeralPublicKey,
    schemeId: SCHEME,
    spendingPrivateKey: args.spendingPrivateKey,
    viewingPrivateKey: args.viewingPrivateKey,
  })
}

/** Recipient: filter an announcement by view tag + verify the derived address matches. */
export function isAnnouncementForMe(args: {
  userStealthAddress: `0x${string}`
  ephemeralPublicKey: `0x${string}`
  viewTag: `0x${string}`
  spendingPublicKey: `0x${string}`
  viewingPrivateKey: `0x${string}`
}): boolean {
  return checkStealthAddress({
    userStealthAddress: args.userStealthAddress,
    ephemeralPublicKey: args.ephemeralPublicKey,
    viewTag: args.viewTag,
    spendingPublicKey: args.spendingPublicKey,
    viewingPrivateKey: args.viewingPrivateKey,
    schemeId: SCHEME,
  })
}

// ── Internal ─────────────────────────────────────────────────────────────────

function tryToUint8Array32(hex: `0x${string}`): Uint8Array | null {
  try {
    const bytes = hexToBytes(hex)
    return bytes.length === 32 ? bytes : null
  } catch {
    return null
  }
}

function mockResult(
  seedBytes: `0x${string}`,
  attestation: string,
  cosmicSeeded: boolean,
): StealthResult {
  return {
    stealthAddress: ("0x" + seedBytes.slice(2, 42)) as `0x${string}`,
    ephemeralPublicKey: ("0x04" + "ab".repeat(64)) as `0x${string}`,
    viewTag: ("0x" + seedBytes.slice(2, 4)) as `0x${string}`,
    attestation,
    mocked: true,
    cosmicSeeded,
  }
}
