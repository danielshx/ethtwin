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
import { readSubnameOwner, readTextRecordFast } from "@/lib/ens"
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

  // Three reads in parallel:
  //   1. registry owner — confirms the subname hasn't been orphaned/deleted
  //   2. KMS keyId text record — "is this a managed twin?"
  //   3. login-hash text record — "what does ownership look like?"
  // The registry-owner check is essential because text records persist in
  // resolver storage even after `setSubnodeRecord(0x0, 0x0, 0)` orphans
  // the subname. Without this check, deleted twins would still log in.
  const [registryOwner, kmsKeyId, loginHash] = await Promise.all([
    readSubnameOwner(ens).catch(
      () => "0x0000000000000000000000000000000000000000",
    ),
    readTextRecordFast(ens, "twin.kms-key-id").catch(() => ""),
    readTextRecordFast(ens, LOGIN_HASH_TEXT_KEY).catch(() => ""),
  ])
  if (
    registryOwner.toLowerCase() === "0x0000000000000000000000000000000000000000"
  ) {
    return jsonError(
      `${ens} has been deleted (or never minted). Mint a fresh twin to log in.`,
      404,
    )
  }
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
