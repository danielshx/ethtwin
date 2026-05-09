// Per-twin recovery code — the bare-minimum ownership proof for the
// KMS-only login flow.
//
// Without this, anyone who knows a twin's ENS name can log in as it (the
// previous behaviour the user flagged). With it:
//   - At mint time the server generates a 16-byte URL-safe code, HMAC's it
//     with a server secret, and writes the hash to the twin's
//     `twin.login-hash` text record. The plaintext is returned to the
//     client and is the only artefact the user needs to log in from a new
//     browser.
//   - At login time `/api/session` reads the twin's `twin.login-hash`,
//     hashes the supplied recovery code the same way, and compares the
//     two with `timingSafeEqual`.
//
// This is the moral equivalent of a per-twin password — not a seed phrase
// in scale, but the same shape: lose it and you can't log back in. The
// honest framing for the demo: "your twin is portable as long as you keep
// this code; lose it and the twin keeps existing on-chain but you can't
// claim it from a fresh browser."
//
// The HMAC uses the same secret() resolver as lib/session.ts, so the same
// server can verify both kinds of artefact without extra config.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"

export const LOGIN_HASH_TEXT_KEY = "twin.login-hash"
const RECOVERY_BYTES = 16 // 128 bits of entropy → 22 base64url chars

function secret(): Buffer {
  const raw =
    process.env.SESSION_SECRET ?? process.env.DEV_WALLET_PRIVATE_KEY ?? "ethtwin-dev-secret"
  return Buffer.from(raw.startsWith("0x") ? raw.slice(2) : raw, "utf8")
}

/** Generate a fresh recovery code. URL-safe, no padding. */
export function generateRecoveryCode(): string {
  return randomBytes(RECOVERY_BYTES)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}

/** HMAC-SHA256 of the recovery code, hex-encoded. Stored as the text record. */
export function hashRecoveryCode(code: string): string {
  return createHmac("sha256", secret()).update(code, "utf8").digest("hex")
}

/** Constant-time compare of a candidate code against a stored hash. */
export function verifyRecoveryCode(candidate: string, storedHashHex: string): boolean {
  if (!candidate || !storedHashHex) return false
  const candidateHash = hashRecoveryCode(candidate)
  if (candidateHash.length !== storedHashHex.length) return false
  try {
    return timingSafeEqual(
      Buffer.from(candidateHash, "utf8"),
      Buffer.from(storedHashHex, "utf8"),
    )
  } catch {
    return false
  }
}
