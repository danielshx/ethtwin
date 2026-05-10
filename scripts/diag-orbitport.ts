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
    console.error("✗ KMS sign-key creation failed:", err instanceof Error ? err.message : err)
  }

  console.log("\n=== KMS encrypt/decrypt probe ===")
  // Try several keySpec/keyUsage combos; we don't yet know which the
  // gateway accepts for asymmetric encrypt. Whichever succeeds is the one
  // we'll use for messaging.
  const ENC_VARIANTS: Array<{
    keySpec: string
    scheme?: string
    keyUsage: string
    encryptionAlgorithm?: string
  }> = [
    { keySpec: "RSA_2048", keyUsage: "ENCRYPT_DECRYPT", encryptionAlgorithm: "RSAES_OAEP_SHA_256" },
    { keySpec: "RSA_4096", keyUsage: "ENCRYPT_DECRYPT", encryptionAlgorithm: "RSAES_OAEP_SHA_256" },
    { keySpec: "ECC_NIST_P256", keyUsage: "ENCRYPT_DECRYPT" },
    { keySpec: "SYMMETRIC_DEFAULT", keyUsage: "ENCRYPT_DECRYPT" },
  ]
  for (const v of ENC_VARIANTS) {
    const alias = `diag-enc-${v.keySpec}-${Date.now()}`
    try {
      console.log(`→ createKey(${v.keySpec}, ${v.keyUsage})…`)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const k = await sdk.kms.createKey({
        alias,
        keySpec: v.keySpec,
        keyUsage: v.keyUsage,
        ...(v.scheme ? { scheme: v.scheme } : {}),
        description: "diagnostic encrypt key",
        tags: [],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
      const keyId = k.data.KeyMetadata.KeyId
      console.log(`  ✓ keyId=${keyId}`)
      const plaintext = `hello-from-twinpilot-${Date.now()}`
      const enc = await sdk.kms.encrypt({
        keyId,
        plaintext,
        encoding: "utf8",
        ...(v.encryptionAlgorithm
          ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ({ encryptionAlgorithm: v.encryptionAlgorithm } as any)
          : {}),
      })
      console.log(
        `  ✓ encrypt ok — ciphertext length=${enc.data.CiphertextBlob.length} chars, algo=${enc.data.EncryptionAlgorithm}`,
      )
      const dec = await sdk.kms.decrypt({
        ciphertextBlob: enc.data.CiphertextBlob,
        keyId,
        encoding: "utf8",
        ...(v.encryptionAlgorithm
          ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ({ encryptionAlgorithm: v.encryptionAlgorithm } as any)
          : {}),
      })
      const decrypted =
        typeof dec.data.Plaintext === "string"
          ? dec.data.Plaintext
          : new TextDecoder().decode(dec.data.Plaintext)
      const ok = decrypted === plaintext
      console.log(`  ${ok ? "✓" : "✗"} decrypt round-trip ${ok ? "matched" : "MISMATCH"}`)
      if (ok) {
        console.log(
          `\n>>> WORKING VARIANT: keySpec=${v.keySpec} keyUsage=${v.keyUsage}` +
            (v.encryptionAlgorithm ? ` algo=${v.encryptionAlgorithm}` : ""),
        )
        break
      }
    } catch (err) {
      console.log(`  ✗ ${v.keySpec}/${v.keyUsage}:`, err instanceof Error ? err.message : err)
    }
  }
}

main().catch(console.error)
