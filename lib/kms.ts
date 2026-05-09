// SpaceComputer Orbitport KMS wrapper.
//
// Replaces the local dev-wallet / Privy embedded wallet as the signing
// authority for per-twin EVM ops. Each twin has its own ETHEREUM scheme
// key in KMS (ECC_SECG_P256K1, the EVM curve); we never see the private
// key — we send signing intents over JSON-RPC and get back signatures.
//
// The wrapper exposes:
//   * `createTwinKey(label)` — mints a new ETHEREUM key in KMS, returns
//     `{ keyId, address, publicKey }`.
//   * `kmsAccount({ keyId, address })` — returns a viem-compatible
//     `LocalAccount` whose signTransaction / signMessage / signTypedData
//     all forward to KMS. Plug it into any viem `WalletClient` and the
//     existing tx-broadcast pipeline (raw signed RLP via
//     `sendRawTransaction`) keeps working unchanged.
//   * `kmsSignEIP191(keyId, message)` — for SIWE-style auth challenges.
//
// All KMS calls use the OAuth2 client-credentials flow handled by the
// SDK; the singleton caches access tokens automatically.

import { OrbitportSDK } from "@spacecomputer-io/orbitport-sdk-ts"
import {
  hashMessage,
  hashTypedData,
  hexToBytes,
  keccak256,
  serializeTransaction,
  toBytes,
  toHex,
  type Address,
  type Hex,
  type LocalAccount,
  type Signature,
  type TransactionSerializable,
} from "viem"
import { toAccount } from "viem/accounts"

let _sdk: OrbitportSDK | null = null

function sdk(): OrbitportSDK {
  if (_sdk) return _sdk
  const clientId = process.env.ORBITPORT_CLIENT_ID
  const clientSecret = process.env.ORBITPORT_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error(
      "ORBITPORT_CLIENT_ID / ORBITPORT_CLIENT_SECRET not set. KMS-backed operations require credentials.",
    )
  }
  _sdk = new OrbitportSDK({ config: { clientId, clientSecret } })
  return _sdk
}

export function isKmsConfigured(): boolean {
  return !!(process.env.ORBITPORT_CLIENT_ID && process.env.ORBITPORT_CLIENT_SECRET)
}

// ─────────────────────────────────────────────────────────────────────────────
// Key creation
// ─────────────────────────────────────────────────────────────────────────────

export type CreatedKey = {
  /** Stable handle — pass to subsequent sign() calls. Persist on chain
   *  via a `twin.kms-key-id` text record. */
  keyId: string
  /** EVM address derived from the pubkey. Goes into the ENS `addr` record. */
  address: Address
  /** Uncompressed secp256k1 pubkey, 65 bytes (0x04 prefix). */
  publicKey: Hex
}

/**
 * Mint a new ETHEREUM scheme key in KMS for a twin.
 * The alias must be unique across the project; we prefix with `twin-` to
 * keep the namespace clean from any other apps using the same KMS account.
 */
export async function createTwinKey(label: string): Promise<CreatedKey> {
  // Aliases are limited to a charset by the gateway; sanitize defensively.
  const safeLabel = label.toLowerCase().replace(/[^a-z0-9-]/g, "-")
  const alias = `twin-${safeLabel}-${Date.now()}`
  const res = await sdk().kms.createKey({
    alias,
    keySpec: "ECC_SECG_P256K1",
    keyUsage: "SIGN_VERIFY",
    scheme: "ETHEREUM",
    description: `EthTwin key for ${label}`,
    // SDK 0.2.1 omits Tags when empty; gateway rejects without it.
    tags: [],
  })
  const meta = res.data.KeyMetadata
  if (!meta.Address || !meta.PublicKey) {
    throw new Error(
      "KMS returned ETHEREUM key without Address/PublicKey — gateway misconfigured?",
    )
  }
  return {
    keyId: meta.KeyId,
    address: meta.Address as Address,
    publicKey: meta.PublicKey as Hex,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Low-level signing primitives
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sign a 32-byte digest. KMS returns a 65-byte ETH-style signature
 * (r || s || v) where v is the recovery byte (typically 0/1 or 27/28).
 * Returns a properly typed `Signature` object viem can re-serialize.
 */
export async function kmsSignDigest(
  keyId: string,
  digest: Hex,
): Promise<Signature> {
  const digestBytes = hexToBytes(digest)
  if (digestBytes.length !== 32) {
    throw new Error(`KMS digest must be 32 bytes, got ${digestBytes.length}`)
  }
  const res = await sdk().kms.sign({
    keyId,
    message: digestBytes,
    signingAlgorithm: "ETHEREUM_SECP256K1",
    messageType: "DIGEST",
  })
  return parseEthSig(res.data.Signature)
}

/**
 * EIP-191 personal-sign. Use for SIWE-style auth challenges.
 * Returns the full 65-byte hex signature (r || s || v_27_or_28).
 */
export async function kmsSignEIP191(
  keyId: string,
  message: string | Uint8Array,
): Promise<Hex> {
  const res = await sdk().kms.sign({
    keyId,
    message,
    signingAlgorithm: "ETHEREUM_SECP256K1",
    messageType: "EIP191",
  })
  return res.data.Signature as Hex
}

// Parse a 65-byte ETH-style signature (r || s || v) into viem's typed shape.
// KMS returns v as a single byte; viem's `Signature` wants `v` as bigint
// and `yParity` as 0 | 1 (the canonical recovery bit).
function parseEthSig(hex: string): Signature {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex
  if (clean.length !== 130) {
    throw new Error(`KMS signature wrong length: ${clean.length} hex chars (expected 130)`)
  }
  const r = ("0x" + clean.slice(0, 64)) as Hex
  const s = ("0x" + clean.slice(64, 128)) as Hex
  const vByte = parseInt(clean.slice(128, 130), 16)
  // KMS may return v as 0/1 or 27/28; normalize.
  const yParity = (vByte >= 27 ? vByte - 27 : vByte) as 0 | 1
  return {
    r,
    s,
    v: BigInt(27 + yParity),
    yParity,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// viem-compatible Account adapter
// ─────────────────────────────────────────────────────────────────────────────

export type KmsAccountInput = {
  keyId: string
  address: Address
}

/**
 * Returns a viem `LocalAccount` whose signing methods all proxy through KMS.
 * Drops in anywhere the existing dev-wallet account was used:
 *
 *   const account = kmsAccount({ keyId, address })
 *   const signed = await account.signTransaction({ chainId, ... })
 *   await client.sendRawTransaction({ serializedTransaction: signed })
 *
 * Uses viem's `toAccount` helper so the discriminator types and overloads
 * (signMessage with raw bytes, signTypedData with typed-data domain, etc.)
 * are correctly inferred.
 */
export function kmsAccount({ keyId, address }: KmsAccountInput): LocalAccount {
  return toAccount({
    address,
    // signMessage handles `string` and `{ raw }` via hashMessage.
    async signMessage({ message }) {
      const digest = hashMessage(message)
      const signature = await kmsSignDigest(keyId, digest)
      return concatSig(signature)
    },
    // signTransaction:
    //   - we receive the partial tx + a serializer
    //   - serialize unsigned, hash, ask KMS to sign, re-serialize with sig.
    async signTransaction(transaction, args) {
      const serializer = args?.serializer ?? serializeTransaction
      // The serializer signature in toAccount's types is MaybePromise<Hex>
      // because it can be user-supplied; await keeps both sync + async paths
      // working without casting.
      const unsignedSerialized = await serializer(
        transaction as TransactionSerializable,
      )
      const digest = keccak256(unsignedSerialized)
      const signature = await kmsSignDigest(keyId, digest)
      return await serializer(transaction as TransactionSerializable, signature)
    },
    // signTypedData hashes via EIP-712 digest then asks KMS for the sig.
    async signTypedData(typedData) {
      const digest = hashTypedData(typedData)
      const signature = await kmsSignDigest(keyId, digest)
      return concatSig(signature)
    },
  }) as LocalAccount
}

function concatSig(sig: Signature): Hex {
  const r = sig.r.startsWith("0x") ? sig.r.slice(2) : sig.r
  const s = sig.s.startsWith("0x") ? sig.s.slice(2) : sig.s
  // v as one byte (27 or 28).
  const vNum = Number(sig.v ?? (sig.yParity === 0 ? 27n : 28n))
  return ("0x" + r + s + vNum.toString(16).padStart(2, "0")) as Hex
}

// ─────────────────────────────────────────────────────────────────────────────
// ENS → KMS resolution
// ─────────────────────────────────────────────────────────────────────────────

import { readAddrFast, readTextRecordFast } from "./ens"

/**
 * Look up the KMS-managed signing identity for a twin from its ENS records.
 * Reads `twin.kms-key-id` (text record) + the `addr` record in parallel.
 * Returns null if the twin isn't KMS-backed (legacy / external-wallet twins
 * keep working through other code paths).
 */
export async function kmsAccountForEns(
  ens: string,
): Promise<{ keyId: string; address: Address } | null> {
  const [keyIdRaw, addr] = await Promise.all([
    readTextRecordFast(ens, "twin.kms-key-id").catch(() => ""),
    readAddrFast(ens).catch(() => null),
  ])
  if (!keyIdRaw || !addr) return null
  return { keyId: keyIdRaw, address: addr }
}

// ─────────────────────────────────────────────────────────────────────────────
// EIP-191 verification helper (used server-side to verify SIWE-style sessions)
// ─────────────────────────────────────────────────────────────────────────────

export { hashMessage, toBytes, toHex }
