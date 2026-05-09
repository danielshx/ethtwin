// Live KMS signing proof.
//
// GET /api/kms/verify?ens=<twin>
//
// 1. Read the twin's `twin.kms-key-id` and on-chain `addr` from ENS.
// 2. Ask SpaceComputer Orbitport KMS to sign a fresh server-generated
//    nonce via EIP-191.
// 3. ECrecover the signer from the signature locally.
// 4. Compare the recovered address to the on-chain `addr` record.
//
// If they match, the KMS service really did sign the challenge with the key
// bound to this twin. That's the entire chain of trust:
//
//   ENS resolves twin.ethtwin.eth → addr (= keccak(KMS_pubkey)[12:])
//   ENS resolves twin.ethtwin.eth → twin.kms-key-id (= the Orbitport handle)
//   KMS signs a fresh nonce with that handle → recovers to addr ✓
//
// Anyone can run this — no secrets needed beyond what's already on chain.

import { z } from "zod"
import { hashMessage, recoverAddress, type Hex } from "viem"
import { jsonError } from "@/lib/api-guard"
import { kmsAccountForEns, kmsSignEIP191 } from "@/lib/kms"
import { readSubnameOwner, readTextRecordFast } from "@/lib/ens"
import { randomBytes } from "node:crypto"

export const runtime = "nodejs"
export const maxDuration = 30
export const dynamic = "force-dynamic"

const querySchema = z.object({
  ens: z.string().min(3),
})

export async function GET(req: Request) {
  const url = new URL(req.url)
  const parsed = querySchema.safeParse({ ens: url.searchParams.get("ens") ?? "" })
  if (!parsed.success) {
    return jsonError("Provide ?ens=<twin>", 400)
  }
  const ens = parsed.data.ens

  // Read both ENS records in parallel.
  const [kmsAccount, registryOwner, addrText, kmsKeyIdText, kmsPubKeyText] =
    await Promise.all([
      kmsAccountForEns(ens).catch(() => null),
      readSubnameOwner(ens).catch(() => null),
      readTextRecordFast(ens, "addr").catch(() => ""),
      readTextRecordFast(ens, "twin.kms-key-id").catch(() => ""),
      readTextRecordFast(ens, "twin.kms-public-key").catch(() => ""),
    ])

  if (!kmsAccount) {
    return jsonError(
      `${ens} has no twin.kms-key-id text record (or it's not resolvable). ` +
        `This twin wasn't minted via the KMS path.`,
      404,
    )
  }

  // Build a fresh, server-generated challenge so a stale signature can't
  // be replayed to fake the proof.
  const challenge = `ethtwin/kms-verify/v1\n${ens.toLowerCase()}\n${Date.now()}\n${randomBytes(16).toString("hex")}`

  // Live KMS roundtrip — this hits the real Orbitport API.
  const t0 = Date.now()
  let kmsSig: Hex
  try {
    kmsSig = await kmsSignEIP191(kmsAccount.keyId, challenge)
  } catch (err) {
    return jsonError(
      `KMS sign failed for keyId ${kmsAccount.keyId}: ${
        err instanceof Error ? err.message : String(err)
      }`,
      502,
    )
  }
  const kmsLatencyMs = Date.now() - t0

  // Recover signer locally + compare to the twin's on-chain addr.
  const recovered = await recoverAddress({
    hash: hashMessage(challenge),
    signature: kmsSig,
  })
  const expectedAddr = (kmsAccount.address ?? "").toLowerCase()
  const verified = recovered.toLowerCase() === expectedAddr

  return Response.json({
    ok: true,
    ens,
    verified,
    challenge,
    kmsKeyId: kmsAccount.keyId,
    kmsAddress: kmsAccount.address,
    kmsSig,
    kmsLatencyMs,
    recovered,
    onChain: {
      registryOwner,
      addrTextRecord: addrText,
      kmsKeyIdTextRecord: kmsKeyIdText,
      kmsPublicKeyTextRecord: kmsPubKeyText
        ? `${kmsPubKeyText.slice(0, 18)}…${kmsPubKeyText.slice(-6)}`
        : "",
    },
  })
}
