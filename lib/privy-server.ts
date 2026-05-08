import { verifyAuthToken as privyVerifyAuthToken } from "@privy-io/node"

// Privy v0.18 ships free verify functions (no PrivyClient class). The
// verification_key is the public key from the Privy dashboard. For Hackathon
// we accept either a PEM string in PRIVY_VERIFICATION_KEY or fall back to
// PRIVY_APP_SECRET (NOT recommended for production — it lets us boot quickly
// without copying the dashboard key).
export async function verifyAuthToken(token: string) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID
  const verificationKey =
    process.env.PRIVY_VERIFICATION_KEY ?? process.env.PRIVY_APP_SECRET
  if (!appId || !verificationKey) {
    throw new Error(
      "Privy env vars missing (NEXT_PUBLIC_PRIVY_APP_ID + PRIVY_VERIFICATION_KEY)",
    )
  }
  return privyVerifyAuthToken({
    auth_token: token,
    app_id: appId,
    verification_key: verificationKey,
  })
}
