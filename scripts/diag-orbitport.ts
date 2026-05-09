// Live diagnostic: prove KMS + cTRNG are hitting the real Orbitport API.
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })
loadEnv()

import { OrbitportSDK } from "@spacecomputer-io/orbitport-sdk-ts"
import { getCosmicSeed } from "../lib/cosmic"

async function main() {
  const cid = process.env.ORBITPORT_CLIENT_ID
  const cs = process.env.ORBITPORT_CLIENT_SECRET
  console.log("\n=== ENV ===")
  console.log("ORBITPORT_CLIENT_ID:", cid ? `${cid.slice(0, 8)}…` : "(missing)")
  console.log("ORBITPORT_CLIENT_SECRET:", cs ? `${cs.slice(0, 8)}…` : "(missing)")
  if (!cid || !cs) {
    console.error("\n❌ KMS/cTRNG credentials not loaded. Cannot run diagnostic.")
    process.exit(1)
  }

  console.log("\n=== Direct SDK probe ===")
  const sdk = new OrbitportSDK({ config: { clientId: cid, clientSecret: cs } })

  try {
    console.log("→ sdk.ctrng.random({ src: 'trng' })…")
    const result = await sdk.ctrng.random({ src: "trng" }, { timeout: 10_000 })
    console.log("✓ cTRNG returned:")
    console.log("    service:", result.data.service)
    console.log("    src:", result.data.src)
    console.log("    data (32-byte hex):", result.data.data?.slice(0, 18) + "…")
    if (result.data.signature) {
      console.log("    signature.algo:", result.data.signature.algo)
      console.log("    signature.pk:", result.data.signature.pk?.slice(0, 18) + "…")
      console.log("    signature.value:", result.data.signature.value?.slice(0, 18) + "…")
    } else {
      console.log("    (no signature payload — sample is unsigned)")
    }
  } catch (err) {
    console.error("✗ cTRNG failed:", err instanceof Error ? err.message : err)
  }

  console.log("\n=== via lib/cosmic.ts ===")
  try {
    const sample = await getCosmicSeed()
    console.log("  fromOrbitport:", sample.fromOrbitport)
    console.log("  bytes:", sample.bytes.slice(0, 18) + "…")
    console.log("  attestation:", sample.attestation.slice(0, 60))
    console.log("  attestation === 'mock-attestation':", sample.attestation === "mock-attestation")
  } catch (err) {
    console.error("✗ getCosmicSeed failed:", err instanceof Error ? err.message : err)
  }

  console.log("\n=== KMS probe ===")
  try {
    console.log("→ sdk.kms.createKey({ alias: diag-..., scheme: ETHEREUM })…")
    const alias = `diag-ctrng-${Date.now()}`
    const k = await sdk.kms.createKey({
      alias,
      keySpec: "ECC_SECG_P256K1",
      keyUsage: "SIGN_VERIFY",
      scheme: "ETHEREUM",
      description: "diagnostic key — safe to ignore",
      tags: [],
    })
    console.log("✓ KMS createKey returned:")
    console.log("    KeyId:", k.data.KeyMetadata.KeyId)
    console.log("    Address:", k.data.KeyMetadata.Address)
    console.log("    PublicKey:", k.data.KeyMetadata.PublicKey?.slice(0, 18) + "…")
  } catch (err) {
    console.error("✗ KMS failed:", err instanceof Error ? err.message : err)
  }
}

main().catch(console.error)
