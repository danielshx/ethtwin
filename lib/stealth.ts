// EIP-5564 stealth address helper, backed by @scopelift/stealth-address-sdk (beta).
// Wrapped in try/catch with a clearly-labelled mock fallback so the demo never
// crashes if the SDK regresses, but the fallback is *visibly* mocked, not silent.

import { secp256k1 } from "@noble/curves/secp256k1"
import { createHmac } from "node:crypto"
import {
  checkStealthAddress,
  computeStealthKey,
  generateRandomStealthMetaAddress,
  generateStealthAddress as sdkGenerateStealthAddress,
  parseKeysFromStealthMetaAddress,
  parseStealthMetaAddressURI,
  VALID_SCHEME_ID,
} from "@scopelift/stealth-address-sdk"
import { bytesToHex, hexToBytes } from "viem"
import { resolveDevWalletKey } from "./viem"

export type StealthResult = {
  stealthAddress: `0x${string}`
  ephemeralPublicKey: `0x${string}`
  viewTag: `0x${string}`
  /** Empty under the post-cosmic flow; kept for backwards-compat with
   *  receipt-card consumers that displayed an attestation hash. */
  attestation: string
  /** True when the SDK threw and we returned deterministic fake data instead. */
  mocked: boolean
  /** Always false now — left for type-stable downstream code. */
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
 * Uses the SDK's internal CSPRNG for the ephemeral key.
 */
export async function generatePrivateAddress(
  stealthMetaAddressURI: string,
): Promise<StealthResult> {
  try {
    const result = sdkGenerateStealthAddress({
      stealthMetaAddressURI,
      schemeId: SCHEME,
    })
    return {
      stealthAddress: result.stealthAddress,
      ephemeralPublicKey: result.ephemeralPublicKey,
      viewTag: result.viewTag,
      attestation: "",
      mocked: false,
      cosmicSeeded: false,
    }
  } catch (err) {
    console.warn(
      "[stealth] SDK generateStealthAddress failed, returning labelled mock:",
      err instanceof Error ? err.message : err,
    )
    return mockResult()
  }
}

// ── Recipient side ───────────────────────────────────────────────────────────

/** Generate a fresh spending + viewing keypair and the matching meta-address URI. */
export function generateStealthMetaKeys(): StealthMetaKeys {
  return generateRandomStealthMetaAddress()
}

/**
 * Deterministic per-twin stealth meta-keys derived from the dev wallet
 * master secret + the twin's ENS. Both keys (spending + viewing) are
 * HMAC-SHA256 of (master, domain-tag || ens), then mapped to valid
 * secp256k1 scalars; the public keys are compressed and concatenated to
 * form the EIP-5564 meta-address URI.
 *
 * Why deterministic instead of `generateRandomStealthMetaAddress`: the
 * recipient (or anyone with the master secret) can re-derive the *private*
 * keys later to scan for inbound stealth payments. Random keys would be
 * lost the moment the page reloads — useless for the demo.
 *
 * Honest demo caveat: the dev wallet key is a single point of failure;
 * compromising it lets the operator decrypt every twin's stealth payments.
 * A production version would derive viewing keys from the user's own
 * KMS-managed key (and never the server's).
 */
export function deriveTwinStealthKeys(twinEns: string): StealthMetaKeys {
  const master = devKeyBytes()
  const spendingPrivateKey = scalarFromHmac(master, "ethtwin/stealth/spend/v1\n", twinEns)
  const viewingPrivateKey = scalarFromHmac(master, "ethtwin/stealth/view/v1\n", twinEns)
  const spendingPublicKey = bytesToHex(secp256k1.getPublicKey(hexToBytes(spendingPrivateKey), true))
  const viewingPublicKey = bytesToHex(secp256k1.getPublicKey(hexToBytes(viewingPrivateKey), true))
  const stealthMetaAddress = ("0x" +
    spendingPublicKey.slice(2) +
    viewingPublicKey.slice(2)) as `0x${string}`
  const stealthMetaAddressURI = `st:eth:${stealthMetaAddress}`
  return {
    spendingPrivateKey,
    spendingPublicKey,
    viewingPrivateKey,
    viewingPublicKey,
    stealthMetaAddress,
    stealthMetaAddressURI,
  }
}

function devKeyBytes(): Buffer {
  const raw = resolveDevWalletKey()
  return Buffer.from(raw.startsWith("0x") ? raw.slice(2) : raw, "hex")
}

function scalarFromHmac(
  master: Buffer,
  domainTag: string,
  ens: string,
): `0x${string}` {
  // HMAC-SHA256 → 32 bytes. Reject the (vanishingly rare) 0 / >= n case
  // by re-hashing with a counter byte, RFC-6979 style.
  const n = secp256k1.CURVE.n
  let counter = 0
  while (counter < 256) {
    const h = createHmac("sha256", master)
      .update(domainTag)
      .update(ens.toLowerCase())
      .update(Buffer.from([counter]))
      .digest()
    const candidate = BigInt("0x" + h.toString("hex"))
    if (candidate > 0n && candidate < n) {
      return ("0x" + h.toString("hex")) as `0x${string}`
    }
    counter += 1
  }
  // Statistically impossible: >= 256 consecutive HMACs producing 0 or > n.
  throw new Error("Could not derive a valid secp256k1 scalar from the master secret")
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

function mockResult(): StealthResult {
  return {
    stealthAddress: "0x000000000000000000000000000000000000dead" as `0x${string}`,
    ephemeralPublicKey: ("0x04" + "ab".repeat(64)) as `0x${string}`,
    viewTag: "0x00",
    attestation: "",
    mocked: true,
    cosmicSeeded: false,
  }
}
