// Stealth-encrypted on-chain messages.
//
// Each message body is wrapped in AES-256-GCM before being written to a
// `body` text record on the message subname, so anyone reading the chain
// sees a stealth blob instead of plaintext. Format on-chain:
//
//   stl1:<base64url-of(nonce(12) || ciphertext || authtag(16))>
//
// Key derivation:
//   - Per-twin-pair symmetric key, deterministic so both sender and
//     recipient (when reading their own inbox via the dev wallet) can derive
//     the same key without storing anything client-side.
//   - HKDF-SHA256(masterKey, "ethtwin/msg/v1" || sortedPair).
//   - masterKey = the dev wallet private key. Since the dev wallet acts on
//     behalf of every twin in this demo, both sides can re-derive without
//     bespoke key management. (For a production version, derive per-twin
//     viewing keys from each user's own wallet instead.)
//
// Cosmic seed integration:
//   - The 12-byte AES nonce is the LEFT-MOST 12 bytes of an Orbitport
//     cTRNG sample, not Math.random. Each message's stealth blob therefore
//     carries verifiable cosmic randomness; the nonce is also published as
//     hex so anyone can cross-check it against the Orbitport attestation
//     written alongside (see `stealth.cosmic-attestation` text record).

import { createHmac, randomBytes, createCipheriv, createDecipheriv } from "node:crypto"
import { resolveDevWalletKey } from "./viem"
import { getCosmicSeed, type CosmicSample } from "./cosmic"

const STEALTH_PREFIX = "stl1:"
const ALGO = "aes-256-gcm"
const KEY_LEN = 32
const NONCE_LEN = 12
const TAG_LEN = 16

function masterKey(): Buffer {
  // Strip the 0x prefix and use the raw 32-byte key as our master HKDF input.
  const hex = resolveDevWalletKey().slice(2)
  return Buffer.from(hex, "hex")
}

function pairKey(senderEns: string, recipientEns: string): Buffer {
  // Sort lexically so (a,b) and (b,a) derive the same key. Same key on both
  // sides means decryption works whether you're the sender re-reading your
  // sent thread or the recipient seeing your inbox.
  const [lo, hi] = [senderEns.toLowerCase(), recipientEns.toLowerCase()].sort()
  const info = Buffer.concat([
    Buffer.from("ethtwin/msg/v1\n"),
    Buffer.from(`${lo}\n${hi}`),
  ])
  return createHmac("sha256", masterKey()).update(info).digest()
}

function toBase64Url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}
function fromBase64Url(s: string): Buffer {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/") +
    "===".slice((s.length + 3) % 4)
  return Buffer.from(padded, "base64")
}

export type EncryptedMessage = {
  /** Wire-format string: "stl1:<base64url(nonce||cipher||tag)>". Goes into the `body` text record. */
  ciphertext: string
  /** Hex of the AES nonce — written separately so the cosmic-attestation can be cross-checked. */
  nonceHex: `0x${string}`
  /** The cosmic sample used to seed the nonce. Caller can publish the
   *  attestation hash to ENS so anyone can verify cTRNG provenance. */
  cosmic: CosmicSample
  /** True when the cosmic seed came from a real Orbitport response (vs a
   *  local-fallback mock). UI can badge accordingly. */
  cosmicSeeded: boolean
}

/** Encrypt a message body and return the on-chain wire format + the cosmic
 *  sample used to seed the AES nonce. */
export async function encryptMessage(args: {
  senderEns: string
  recipientEns: string
  body: string
}): Promise<EncryptedMessage> {
  const sample = await getCosmicSeed()
  const cosmicSeeded = sample.fromOrbitport
  // Nonce = first 12 bytes of cosmic sample. Cosmic bytes are 32 bytes hex
  // (33 chars including 0x), so we have 20 spare bytes if we ever want to
  // make the nonce wider.
  const cosmicBytes = Buffer.from(sample.bytes.slice(2), "hex")
  // Mix in 4 bytes of local randomness in case the cosmic cache served a
  // recently-used sample — collisions on AES-GCM nonce reuse are catastrophic.
  const localSalt = randomBytes(4)
  const nonce = Buffer.concat([cosmicBytes.subarray(0, 8), localSalt])
  // Belt-and-braces: ensure exactly 12 bytes.
  if (nonce.length !== NONCE_LEN) {
    throw new Error(`stealth nonce wrong length: ${nonce.length}`)
  }
  const key = pairKey(args.senderEns, args.recipientEns)
  const cipher = createCipheriv(ALGO, key, nonce)
  const ct = Buffer.concat([cipher.update(Buffer.from(args.body, "utf8")), cipher.final()])
  const tag = cipher.getAuthTag()
  if (tag.length !== TAG_LEN) {
    throw new Error(`stealth tag wrong length: ${tag.length}`)
  }
  const wire = STEALTH_PREFIX + toBase64Url(Buffer.concat([nonce, ct, tag]))
  return {
    ciphertext: wire,
    nonceHex: ("0x" + nonce.toString("hex")) as `0x${string}`,
    cosmic: sample,
    cosmicSeeded,
  }
}

/** Detect whether an on-chain `body` value is a stealth blob. */
export function isStealthBlob(body: string): boolean {
  return typeof body === "string" && body.startsWith(STEALTH_PREFIX)
}

/** Decrypt a stealth-encrypted body. Returns null if decryption fails — caller
 *  should display the raw blob with a hint that the message couldn't be
 *  decrypted (wrong viewer, key rotation, etc.). */
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
