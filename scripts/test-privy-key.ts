// Sanity check: confirm PRIVY_VERIFICATION_KEY parses correctly through the same
// jose.importSPKI pipeline that @privy-io/node uses internally. Catches PEM/format
// issues at design time instead of waiting for a real auth token to fail.

import { importSPKI } from "jose"

const JWT_ALGORITHM = "ES256"

function normalizeToPem(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed.includes("BEGIN PUBLIC KEY")) {
    if (trimmed.includes("\n")) return trimmed
    return trimmed
      .replace(/-----BEGIN PUBLIC KEY-----/, "-----BEGIN PUBLIC KEY-----\n")
      .replace(/-----END PUBLIC KEY-----/, "\n-----END PUBLIC KEY-----")
  }
  const body = trimmed.replace(/\s+/g, "")
  const wrapped = body.match(/.{1,64}/g)?.join("\n") ?? body
  return `-----BEGIN PUBLIC KEY-----\n${wrapped}\n-----END PUBLIC KEY-----`
}

async function main() {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID
  const raw = process.env.PRIVY_VERIFICATION_KEY
  console.log(`NEXT_PUBLIC_PRIVY_APP_ID:   ${appId ?? "(missing)"}`)
  console.log(`PRIVY_VERIFICATION_KEY:    ${raw ? `${raw.length} chars` : "(missing)"}`)
  if (!raw) {
    console.log("FAIL  No verification key set.")
    process.exit(1)
  }

  const pem = normalizeToPem(raw)
  console.log(`\nPEM after normalization (first 80 chars):\n  ${pem.slice(0, 80)}…`)

  try {
    const key = await importSPKI(pem, JWT_ALGORITHM)
    console.log(`\nOK    importSPKI accepted the key.`)
    console.log(`      type:      ${key.type}`)
    console.log(`      algorithm: ${(key.algorithm as { name: string }).name}`)
    console.log(`\nPrivy server-side verification will work end-to-end once a real auth token arrives.`)
  } catch (err) {
    console.log(`\nFAIL  importSPKI rejected the key: ${err instanceof Error ? err.message : err}`)
    console.log("      Re-copy the verification key from Privy dashboard → Settings → API Keys → Verification keys.")
    process.exit(1)
  }
}

main()
