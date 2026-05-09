// Stealth-encrypted on-chain messages — EIP-5564 key derivation.
//
// Each message body is wrapped in AES-256-GCM before being written to a
// `msg.<i>` text record on the shared chat subname, so anyone reading the
// chain sees a stealth blob instead of plaintext. Format on-chain:
//
//   stl1:<base64url-of(nonce(12) || ciphertext || authtag(16))>
//
// Key derivation (EIP-5564 ECDH primitives, symmetric for chat):
//   - Each twin has a stealth-meta-address: two compressed secp256k1
//     public keys (spending + viewing). See lib/stealth.ts.
//   - The pair-shared secret is static-static ECDH on the SPENDING keys:
//        secret = ECDH(senderSpendingPriv, recipientSpendingPub)
//               = ECDH(recipientSpendingPriv, senderSpendingPub)   ← symmetric
//   - HMAC-SHA256 over the secret + domain tag + sorted-pair ENS yields
//     the AES-256-GCM key. The sorted-pair binding means encrypt(a,b) and
//     encrypt(b,a) derive the same key — both sides decrypt cleanly.
//
// Why this is a real EIP-5564 use, not just a label:
//   - Same primitive that derives stealth addresses (ECDH on secp256k1)
//   - Same key material (the on-chain stealth-meta-address text record
//     publishes the public keys; the private keys come from the same
//     deterministic derivation as the stealth meta-key)
//   - Recipient can decrypt without storing per-message ephemeral keys
//
// Honest demo caveat: the dev wallet deterministically derives every twin's
// spending+viewing privkeys (see deriveTwinStealthKeys). A production deploy
// would derive viewing keys from each user's own KMS-managed key instead of
// the shared master.

import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto"
import { hexToBytes } from "viem"
import { secp256k1 } from "@noble/curves/secp256k1"
import { getCosmicSeed, type CosmicSample } from "./cosmic"
import { deriveTwinStealthKeys } from "./stealth"

const STEALTH_PREFIX = "stl1:"
const ALGO = "aes-256-gcm"
const NONCE_LEN = 12
const TAG_LEN = 16

/**
 * Static-static ECDH on each twin's spending keys + HMAC-SHA256 for an
 * AES-256-GCM key. Symmetric: pairKey(a, b) === pairKey(b, a).
 */
function pairKey(senderEns: string, recipientEns: string): Buffer {
  const a = deriveTwinStealthKeys(senderEns)
  const b = deriveTwinStealthKeys(recipientEns)
  // ECDH on secp256k1: same primitive EIP-5564 uses to derive stealth
  // addresses. getSharedSecret returns a 33-byte compressed point — slice
  // off the leading 0x02/0x03 sign byte to get 32 bytes of secret material.
  const point = secp256k1.getSharedSecret(
    hexToBytes(a.spendingPrivateKey),
    hexToBytes(b.spendingPublicKey),
    true,
  )
  const sharedSecret = Buffer.from(point.slice(1))
  const [lo, hi] = [senderEns.toLowerCase(), recipientEns.toLowerCase()].sort()
  return createHmac("sha256", sharedSecret)
    .update("ethtwin/chat-ecdh/v1\n")
    .update(`${lo}\n${hi}`)
    .digest()
}

function toBase64Url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}
function fromBase64Url(s: string): Buffer {
  const padded =
    s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)
  return Buffer.from(padded, "base64")
}

export type EncryptedMessage = {
  /** Wire-format string: "stl1:<base64url(nonce||cipher||tag)>". */
  ciphertext: string
  /** Hex of the AES nonce. */
  nonceHex: `0x${string}`
  /** Cosmic sample used to seed the nonce — kept for backwards compat with
   *  the receipt-card UI. */
  cosmic: CosmicSample
  cosmicSeeded: boolean
}

/** Encrypt a message body for the (sender, recipient) pair. */
export async function encryptMessage(args: {
  senderEns: string
  recipientEns: string
  body: string
}): Promise<EncryptedMessage> {
  // Pull a cosmic sample so the receipt card can render attestation history,
  // but don't depend on it for the actual nonce — node:crypto.randomBytes is
  // a CSPRNG and avoids leaking attestation length / format into the wire.
  const sample = await getCosmicSeed().catch(
    () =>
      ({
        bytes: ("0x" + Buffer.from(randomBytes(32)).toString("hex")) as `0x${string}`,
        attestation: "mock-attestation",
        fetchedAt: Date.now(),
        fromOrbitport: false,
      }) satisfies CosmicSample,
  )
  const nonce = randomBytes(NONCE_LEN)
  const key = pairKey(args.senderEns, args.recipientEns)
  const cipher = createCipheriv(ALGO, key, nonce)
  const ct = Buffer.concat([
    cipher.update(Buffer.from(args.body, "utf8")),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()
  if (tag.length !== TAG_LEN) {
    throw new Error(`stealth tag wrong length: ${tag.length}`)
  }
  const wire =
    STEALTH_PREFIX + toBase64Url(Buffer.concat([nonce, ct, tag]))
  return {
    ciphertext: wire,
    nonceHex: ("0x" + nonce.toString("hex")) as `0x${string}`,
    cosmic: sample,
    cosmicSeeded: sample.fromOrbitport,
  }
}

/** Detect whether an on-chain `body` value is a stealth blob. */
export function isStealthBlob(body: string): boolean {
  return typeof body === "string" && body.startsWith(STEALTH_PREFIX)
}

/** Decrypt a stealth-encrypted body. Returns null on auth failure. */
export function decryptMessage(args: {
  senderEns: string
  recipientEns: string
  ciphertext: string
}): string | null {
  if (!isStealthBlob(args.ciphertext)) return args.ciphertext
  try {
    const blob = fromBase64Url(args.ciphertext.slice(STEALTH_PREFIX.length))
    if (blob.length < NONCE_LEN + TAG_LEN) return null
    const nonce = blob.subarray(0, NONCE_LEN)
    const tag = blob.subarray(blob.length - TAG_LEN)
    const ct = blob.subarray(NONCE_LEN, blob.length - TAG_LEN)
    const key = pairKey(args.senderEns, args.recipientEns)
    const decipher = createDecipheriv(ALGO, key, nonce)
    decipher.setAuthTag(tag)
    const pt = Buffer.concat([decipher.update(ct), decipher.final()])
    return pt.toString("utf8")
  } catch {
    return null
  }
}
