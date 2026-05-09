// Cookie-based session — replaces Privy's access-token model.
//
// The user's identity is their twin ENS (e.g. "daniel.ethtwin.eth"). The cookie
// carries a base64url JSON payload + HMAC-SHA256 signature. No external auth
// provider, no embedded wallet — KMS holds the keys, the cookie just records
// which twin the browser is acting as.
//
// Wire format:  <base64url(payload)>.<base64url(hmac(payload))>
//
// payload is JSON: { ens, kmsKeyId, exp }
//   - ens:        twin ENS the session is bound to
//   - kmsKeyId:   the SpaceComputer KMS keyId published in twin.kms-key-id
//   - exp:        unix-seconds expiry (default 7d)
//
// Honest demo caveat: this proves nothing cryptographically — anyone who knows
// a twin's ENS can claim it. Sufficient for the hackathon demo, where every
// twin is throwaway. A production path would gate /api/session POST behind a
// SIWE-style challenge against an EOA recorded in `twin.owner-eoa`.
//
// Server-only — uses node:crypto and next/headers.

import { cookies } from "next/headers"
import { createHmac, timingSafeEqual } from "node:crypto"

export const SESSION_COOKIE = "ethtwin.session.v1"
const TTL_SECONDS = 7 * 24 * 60 * 60 // 7 days

export type Session = {
  ens: string
  kmsKeyId: string | null
  exp: number
}

function b64urlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function b64urlDecode(s: string): Buffer {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)
  return Buffer.from(padded, "base64")
}

function secret(): Buffer {
  // Prefer an explicit SESSION_SECRET; fall back to the dev wallet key so
  // local dev works out of the box. Either way, sessions only need to be
  // verifiable on the same server, so a per-deploy secret is fine.
  const raw =
    process.env.SESSION_SECRET ?? process.env.DEV_WALLET_PRIVATE_KEY ?? "ethtwin-dev-secret"
  return Buffer.from(raw.startsWith("0x") ? raw.slice(2) : raw, "utf8")
}

function sign(payload: string): string {
  return b64urlEncode(createHmac("sha256", secret()).update(payload).digest())
}

function verify(payload: string, sig: string): boolean {
  try {
    const expected = sign(payload)
    if (expected.length !== sig.length) return false
    return timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(sig, "utf8"))
  } catch {
    return false
  }
}

/** Issue a session cookie for `ens`. Caller is the route handler. */
export async function setSessionCookie(input: {
  ens: string
  kmsKeyId: string | null
}): Promise<Session> {
  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS
  const session: Session = { ens: input.ens.toLowerCase(), kmsKeyId: input.kmsKeyId, exp }
  const payload = b64urlEncode(Buffer.from(JSON.stringify(session), "utf8"))
  const value = `${payload}.${sign(payload)}`
  const jar = await cookies()
  jar.set(SESSION_COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(exp * 1000),
  })
  return session
}

/** Read the session from the cookie jar (next/headers). Returns null if
 *  unset, malformed, expired, or the signature doesn't verify. */
export async function getSession(): Promise<Session | null> {
  const jar = await cookies()
  const raw = jar.get(SESSION_COOKIE)?.value
  return parseSessionCookie(raw)
}

/** Same as `getSession` but reads from a Request (for cases where
 *  next/headers cookies() isn't available — e.g. if a route is invoked
 *  outside the App Router request scope). */
export function getSessionFromRequest(req: Request): Session | null {
  const cookieHeader = req.headers.get("cookie")
  if (!cookieHeader) return null
  const cookieMap = Object.fromEntries(
    cookieHeader.split(";").map((c) => {
      const [k, ...rest] = c.trim().split("=")
      return [k, rest.join("=")]
    }),
  )
  return parseSessionCookie(cookieMap[SESSION_COOKIE])
}

function parseSessionCookie(value: string | undefined): Session | null {
  if (!value) return null
  const dot = value.indexOf(".")
  if (dot < 0) return null
  const payload = value.slice(0, dot)
  const sig = value.slice(dot + 1)
  if (!verify(payload, sig)) return null
  try {
    const json = b64urlDecode(payload).toString("utf8")
    const parsed = JSON.parse(json) as Partial<Session>
    if (
      typeof parsed.ens !== "string" ||
      typeof parsed.exp !== "number" ||
      parsed.exp < Math.floor(Date.now() / 1000)
    ) {
      return null
    }
    return {
      ens: parsed.ens,
      kmsKeyId: typeof parsed.kmsKeyId === "string" ? parsed.kmsKeyId : null,
      exp: parsed.exp,
    }
  } catch {
    return null
  }
}

/** Clear the session cookie. Caller is the route handler. */
export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies()
  jar.delete(SESSION_COOKIE)
}
