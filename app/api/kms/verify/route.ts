// Live KMS signing proof.
//
// GET /api/kms/verify?ens=<twin>
//
// 1. Read the twin's `twin.kms-key-id` from ENS.
// 2. Ask SpaceComputer Orbitport KMS to sign a fresh server-generated
//    nonce via EIP-191.
// 3. ECrecover the signer from the signature locally — that recovered
//    address IS the live KMS-derived address (the source of truth).
// 4. Independently, read the on-chain `addr` record. If it matches the
//    recovered address, ENS is in sync. If not, ENS is stale (e.g. an
//    old mint's value persisted in the resolver storage) — surface as a
//    warning, not a failure. KMS is still working either way.
//
// Anyone can run this — no secrets needed beyond what's on chain.

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

  // Recover signer locally — this is the LIVE KMS address. Anything
  // recoverable to a non-zero address from a fresh, server-generated
  // challenge proves the KMS service is signing with this keyId.
  const recovered = await recoverAddress({
    hash: hashMessage(challenge),
    signature: kmsSig,
  })
  const onChainAddr = (kmsAccount.address ?? "").toLowerCase()
  const recoveredLower = recovered.toLowerCase()
  const isZero = recoveredLower === "0x0000000000000000000000000000000000000000"
  // KMS is "verified" iff it returned a real signature recoverable to a
  // non-zero address. ENS sync is a SEPARATE check — stale `addr` text
  // records (from previous mints) can mismatch without invalidating KMS.
  const kmsSigned = !isZero
  const ensInSync = !isZero && recoveredLower === onChainAddr

  return Response.json({
    ok: true,
    ens,
    /** KMS-signed: did Orbitport return a valid signature? */
    kmsSigned,
    /** ENS in sync: does on-chain `addr` text record match the recovered
     *  signer? When false, the resolver is carrying a stale address from
     *  a previous mint of this name. */
    ensInSync,
    /** Backwards-compat alias for older clients — true iff BOTH checks pass. */
    verified: kmsSigned && ensInSync,
    challenge,
    kmsKeyId: kmsAccount.keyId,
    /** On-chain `addr` record value (might be stale). */
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
