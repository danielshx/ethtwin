// End-to-end verifier: prove a twin is REALLY anchored in SpaceComputer KMS
// and ENS, and that its messages are stealth-encrypted on chain.
//
//   pnpm verify:twin <label>
//
// Example:
//   pnpm verify:twin daniel
//
// Reports:
//   ENS  →  is the subname registered? what's the addr? text records?
//   KMS  →  does the published `twin.kms-key-id` exist in our KMS account?
//          a fresh EIP-191 sig roundtrip proves it's reachable + enabled.
//   CHATS → for each chat the twin is in, list the on-chain text records
//          including the RAW stealth ciphertext (so you can see plaintext is
//          NOT on chain), the cTRNG attestation hash, and the AES nonce.
//          We also surface the decrypted plaintext side-by-side as proof
//          the round-trip works.

import { OrbitportSDK } from "@spacecomputer-io/orbitport-sdk-ts"
import { PARENT_DOMAIN } from "../lib/viem"
import {
  readAddrFast,
  readSubnameOwner,
  readTextRecordFast,
} from "../lib/ens"
import { decryptMessage, isStealthBlob } from "../lib/message-crypto"

async function main() {
  const arg = process.argv[2]
  if (!arg) {
    console.error("usage: pnpm verify:twin <label>")
    console.error("  e.g. pnpm verify:twin daniel")
    process.exit(1)
  }
  const ens = arg.includes(".") ? arg : `${arg}.${PARENT_DOMAIN}`
  console.log(`\n──────────  Verifying ${ens}  ──────────\n`)

  // ── ENS subname ────────────────────────────────────────────────────────
  console.log("● ENS subname (Sepolia)")
  const owner = await readSubnameOwner(ens).catch((err) => {
    console.error("  failed to read subname owner:", err)
    return null
  })
  if (!owner || owner === "0x0000000000000000000000000000000000000000") {
    console.log("  ✗ subname not registered.")
    console.log("  Register with the onboarding flow first. Exiting.")
    process.exit(1)
  }
  const addr = await readAddrFast(ens).catch(() => null)
  console.log(`  registry owner: ${owner}`)
  console.log(`  addr record   : ${addr ?? "(unset)"}`)
  console.log(`  ENS app       : https://sepolia.app.ens.domains/${ens}`)

  const TEXT_KEYS = [
    "twin.kms-key-id",
    "twin.persona",
    "twin.endpoint",
    "twin.version",
    "stealth-meta-address",
    "avatar",
    "description",
    "chats.list",
  ] as const
  const texts: Record<string, string> = {}
  for (const k of TEXT_KEYS) {
    texts[k] = (await readTextRecordFast(ens, k).catch(() => "")) || ""
  }
  console.log("  text records  :")
  for (const k of TEXT_KEYS) {
    const v = texts[k] ?? ""
    if (v) console.log(`    ${k.padEnd(24)} ${truncate(v, 80)}`)
  }
  if (!texts["twin.kms-key-id"]) {
    console.log(
      "\n  ⚠  No twin.kms-key-id text record. This twin was NOT minted via the KMS path.",
    )
  }

  // ── SpaceComputer KMS ──────────────────────────────────────────────────
  console.log("\n● SpaceComputer KMS")
  const kmsKeyId = texts["twin.kms-key-id"]
  if (!kmsKeyId) {
    console.log("  (skipped — no key id on chain)")
  } else {
    if (!process.env.ORBITPORT_CLIENT_ID || !process.env.ORBITPORT_CLIENT_SECRET) {
      console.log("  ⚠ ORBITPORT_CLIENT_ID / SECRET missing — can't query KMS.")
    } else {
      try {
        const sdk = new OrbitportSDK({
          config: {
            clientId: process.env.ORBITPORT_CLIENT_ID,
            clientSecret: process.env.ORBITPORT_CLIENT_SECRET,
          },
        })
        const probe = `verify-twin probe ${ens} @ ${Date.now()}`
        const sigRes = await sdk.kms.sign({
          keyId: kmsKeyId,
          message: probe,
          signingAlgorithm: "ETHEREUM_SECP256K1",
          messageType: "EIP191",
        })
        console.log(`  ✓ KMS key reachable      : ${kmsKeyId}`)
        console.log(`    EIP-191 sig (truncated): ${truncate(sigRes.data.Signature, 32)}`)
      } catch (err) {
        console.log(
          `  ✗ KMS sign failed for ${kmsKeyId}: ${err instanceof Error ? err.message : err}`,
        )
      }
    }
  }
  if (kmsKeyId && addr) {
    console.log(`  Etherscan        : https://sepolia.etherscan.io/address/${addr}`)
  }

  // ── Chats ──────────────────────────────────────────────────────────────
  console.log("\n● Chats (one ENS subname per pair)")
  const chatsRaw = texts["chats.list"]
  let chats: string[] = []
  if (chatsRaw) {
    try {
      const parsed = JSON.parse(chatsRaw)
      if (Array.isArray(parsed)) {
        chats = parsed.filter((x): x is string => typeof x === "string")
      }
    } catch {
      // ignore
    }
  }
  if (chats.length === 0) {
    console.log("  (none yet — this twin hasn't sent or received any messages)")
  } else {
    for (const chatEns of chats) {
      console.log(`\n  ${chatEns}`)
      const [participantsRaw, countRaw] = await Promise.all([
        readTextRecordFast(chatEns, "chat.participants").catch(() => ""),
        readTextRecordFast(chatEns, "messages.count").catch(() => ""),
      ])
      const count = Number.parseInt(countRaw || "0", 10) || 0
      console.log(`    participants : ${participantsRaw || "(missing)"}`)
      console.log(`    messages.cnt : ${count}`)
      console.log(`    ENS app      : https://sepolia.app.ens.domains/${chatEns}`)
      // Walk every message record on the chat subname and show the raw
      // ciphertext alongside the decrypted plaintext.
      for (let i = 0; i < count; i++) {
        const raw = await readTextRecordFast(chatEns, `msg.${i}`).catch(() => "")
        if (!raw) {
          console.log(`    msg.${i}        : (missing on chain)`)
          continue
        }
        let parsed: {
          from?: string
          body?: string
          at?: number
          cosmicAttestation?: string
          nonce?: string
        }
        try {
          parsed = JSON.parse(raw)
        } catch {
          console.log(`    msg.${i}        : (unparseable JSON)`)
          continue
        }
        const stealthOnChain = parsed.body ? isStealthBlob(parsed.body) : false
        const decrypted =
          parsed.body && parsed.from && stealthOnChain
            ? decryptMessage({
                senderEns: parsed.from,
                recipientEns: ens,
                ciphertext: parsed.body,
              })
            : parsed.body ?? null
        const attestation = parsed.cosmicAttestation ?? "(none)"
        const orbitPort =
          attestation === "mock-attestation"
            ? "MOCK (no Orbitport credentials at send time)"
            : truncate(attestation, 64)
        console.log(`\n    ── msg.${i} ──`)
        console.log(`    from            : ${parsed.from ?? "(missing)"}`)
        console.log(
          `    at              : ${
            parsed.at ? new Date(parsed.at * 1000).toISOString() : "(missing)"
          }`,
        )
        console.log(
          `    on-chain body   : ${truncate(parsed.body ?? "", 90)}` +
            `  ← ${stealthOnChain ? "stealth ciphertext (✓ encrypted)" : "PLAINTEXT (no encryption)"}`,
        )
        console.log(`    decrypted       : ${truncate(decrypted ?? "(decrypt failed)", 90)}`)
        console.log(`    cTRNG attest    : ${orbitPort}`)
        if (parsed.nonce) {
          console.log(`    AES-GCM nonce   : ${parsed.nonce}`)
        }
      }
    }
  }

  console.log("\n──────────  done  ──────────\n")
}

function truncate(s: string, n: number): string {
  if (!s) return ""
  if (s.length <= n) return s
  return s.slice(0, n) + "…"
}

main().catch((err) => {
  console.error("\n❌ verifier crashed:")
  console.error(err)
  process.exit(1)
})
