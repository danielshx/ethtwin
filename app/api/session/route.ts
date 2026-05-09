// Session endpoint — replaces the Privy access-token gate.
//
// GET    /api/session         → { session: { ens, kmsKeyId, exp } | null }
// POST   /api/session  { ens } → set cookie, return session.
//                                  Verifies the ENS resolves under the parent
//                                  domain and has a `twin.kms-key-id` text
//                                  record so we don't issue sessions for
//                                  arbitrary names.
// DELETE /api/session         → clear cookie.
//
// No challenge/response — see the demo-caveat note in lib/session.ts.

import { z } from "zod"
import { jsonError, parseJsonBody } from "@/lib/api-guard"
import { readTextRecordFast } from "@/lib/ens"
import { PARENT_DOMAIN } from "@/lib/viem"
import {
  clearSessionCookie,
  getSession,
  setSessionCookie,
} from "@/lib/session"
import { LOGIN_HASH_TEXT_KEY, verifyRecoveryCode } from "@/lib/recovery"

export const runtime = "nodejs"
export const maxDuration = 10

const loginSchema = z.object({
  ens: z
    .string()
    .min(3)
    .max(80)
    .regex(/^[a-z0-9][a-z0-9-.]+\.[a-z0-9-]+$/i, "Looks like an invalid ENS name"),
  // Plaintext recovery code emitted by /api/onboarding. Required for any
  // twin minted after the recovery-code rollout (= has `twin.login-hash`).
  // Older twins minted before this change can still log in code-less so
  // existing test agents on Sepolia don't brick — see legacy branch below.
  recoveryCode: z.string().min(1).max(120).optional(),
})

export async function GET() {
  const session = await getSession()
  return Response.json({ ok: true, session })
}

export async function POST(req: Request) {
  const parsed = await parseJsonBody(req, loginSchema)
  if (!parsed.ok) return parsed.response
  const ens = parsed.data.ens.toLowerCase().trim()
  const recoveryCode = parsed.data.recoveryCode

  const expectedSuffix = `.${PARENT_DOMAIN.toLowerCase()}`
  if (!ens.endsWith(expectedSuffix)) {
    return jsonError(
      `Only twins under .${PARENT_DOMAIN} can log in (got "${ens}").`,
      400,
    )
  }

  // Two reads in parallel: KMS key id (= "is this a managed twin?") +
  // login hash (= "what does ownership look like?").
  const [kmsKeyId, loginHash] = await Promise.all([
    readTextRecordFast(ens, "twin.kms-key-id").catch(() => ""),
    readTextRecordFast(ens, LOGIN_HASH_TEXT_KEY).catch(() => ""),
  ])
  if (!kmsKeyId) {
    return jsonError(
      `No KMS-managed twin found at ${ens}. Mint a new twin first.`,
      404,
    )
  }

  // Owner-proof gate. Twins minted after the recovery-code rollout publish
  // an HMAC of the user's recovery code as `twin.login-hash`; we require
  // and verify it. Twins minted before the rollout have no hash — we let
  // them through with a flag so the UI can prompt the user to re-mint.
  if (loginHash) {
    if (!recoveryCode) {
      return jsonError(
        `Recovery code required for ${ens}.`,
        401,
      )
    }
    if (!verifyRecoveryCode(recoveryCode, loginHash)) {
      return jsonError(`Recovery code didn't match for ${ens}.`, 403)
    }
  }

  const session = await setSessionCookie({ ens, kmsKeyId })
  return Response.json({
    ok: true,
    session,
    // Tell the client whether this twin pre-dates the recovery-code rollout.
    legacy: !loginHash,
  })
}

export async function DELETE() {
  await clearSessionCookie()
  return Response.json({ ok: true })
}
