import { verifyAuthToken as privyVerifyAuthToken } from "@privy-io/node"

/**
 * `@privy-io/node` v0.18 ships free verify functions (no PrivyClient class)
 * and feeds `verification_key` to `jose.importSPKI`, which requires the
 * SubjectPublicKeyInfo wrapped in PEM headers. The Privy dashboard sometimes
 * gives only the base64 body — auto-wrap so either form works.
 */
function normalizeToPem(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed.includes("BEGIN PUBLIC KEY")) {
    // already PEM (env files may have stripped newlines — restore them)
    if (trimmed.includes("\n")) return trimmed
    return trimmed
      .replace(/-----BEGIN PUBLIC KEY-----/, "-----BEGIN PUBLIC KEY-----\n")
      .replace(/-----END PUBLIC KEY-----/, "\n-----END PUBLIC KEY-----")
  }
  // Plain base64 body → wrap with header/footer + 64-char line breaks (PEM convention).
  const body = trimmed.replace(/\s+/g, "")
  const wrapped = body.match(/.{1,64}/g)?.join("\n") ?? body
  return `-----BEGIN PUBLIC KEY-----\n${wrapped}\n-----END PUBLIC KEY-----`
}

export async function verifyAuthToken(token: string) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID
  const rawKey = process.env.PRIVY_VERIFICATION_KEY
  if (!appId || !rawKey) {
    throw new Error(
      "Privy env vars missing (NEXT_PUBLIC_PRIVY_APP_ID + PRIVY_VERIFICATION_KEY)",
    )
  }
  return privyVerifyAuthToken({
    auth_token: token,
    app_id: appId,
    verification_key: normalizeToPem(rawKey),
  })
}
