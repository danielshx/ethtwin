// Smoke test for SpaceComputer Orbitport KMS.
//
//   pnpm tsx --env-file=.env.local scripts/test-kms.ts
//
// 1. Auth via OAuth2 client-credentials (handled by SDK).
// 2. GetCapabilities — confirms ETHEREUM scheme is exposed.
// 3. CreateKey — mints an ETHEREUM secp256k1 key, prints the address.
// 4. Sign — signs a fake EVM tx digest with messageType=DIGEST, prints sig.
// 5. EIP-191 sign — signs a personal-sign message, prints sig.
//
// Output proves we can replace the dev-wallet local key with a KMS-managed
// key for everything the app does on Sepolia.

import { OrbitportSDK } from "@spacecomputer-io/orbitport-sdk-ts"
import { keccak256, toHex } from "viem"

async function main() {
  const sdk = new OrbitportSDK({
    config: {
      clientId: process.env.ORBITPORT_CLIENT_ID!,
      clientSecret: process.env.ORBITPORT_CLIENT_SECRET!,
    },
  })

  console.log("[kms] checking capabilities…")
  const caps = await sdk.kms.getCapabilities()
  const ethScheme = caps.data.Schemes.find((s) => s.Scheme === "ETHEREUM")
  if (!ethScheme) throw new Error("ETHEREUM scheme not exposed by KMS")
  console.log("  ETHEREUM scheme: ", ethScheme.SigningCapabilities)

  // Use a unique alias so we don't collide with prior runs.
  const alias = `ethtwin-smoke-${Date.now()}`
  console.log(`[kms] creating ETHEREUM key (alias=${alias})…`)
  // Workaround: SDK 0.2.1 omits `Tags` from the wire payload when the user
  // doesn't pass any, but the gateway rejects requests missing the field.
  // Passing an empty array forces the SDK to include `Tags: []`.
  const created = await sdk.kms.createKey({
    alias,
    keySpec: "ECC_SECG_P256K1",
    keyUsage: "SIGN_VERIFY",
    scheme: "ETHEREUM",
    description: "smoke test from ethtwin",
    tags: [],
  })
  const meta = created.data.KeyMetadata
  console.log("  KeyId        :", meta.KeyId)
  console.log("  PublicKey    :", meta.PublicKey)
  console.log("  Address      :", meta.Address)

  if (!meta.Address) {
    throw new Error("KMS did not return an EVM Address for the ETHEREUM key")
  }

  // Build a fake digest (32 bytes) and sign as if it were an EVM tx hash.
  const fakeMessage = "ethtwin smoke test " + Date.now()
  const digest = keccak256(toHex(fakeMessage))
  console.log(`\n[kms] signing DIGEST ${digest} (ETHEREUM_SECP256K1)…`)
  const sigDigest = await sdk.kms.sign({
    keyId: meta.KeyId,
    // SDK accepts string or Uint8Array; for DIGEST we pass the 32-byte hash bytes.
    message: hexToBytes(digest),
    signingAlgorithm: "ETHEREUM_SECP256K1",
    messageType: "DIGEST",
  })
  console.log("  Signature    :", sigDigest.data.Signature)
  console.log("  SigningAlgo  :", sigDigest.data.SigningAlgorithm)

  // Also try EIP-191 personal-sign — the form we'd use for SIWE-style auth.
  console.log("\n[kms] signing EIP191 personal-sign…")
  const sigEip = await sdk.kms.sign({
    keyId: meta.KeyId,
    message: "Sign in to ethtwin",
    signingAlgorithm: "ETHEREUM_SECP256K1",
    messageType: "EIP191",
  })
  console.log("  Signature    :", sigEip.data.Signature)

  console.log("\n✅ KMS works. Hand the KeyId to the runtime, swap dev wallet → KMS sign.")
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

main().catch((err) => {
  console.error("\n❌ KMS smoke test failed:")
  console.error(err)
  process.exit(1)
})
