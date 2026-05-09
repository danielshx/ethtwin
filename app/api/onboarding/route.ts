import { getAddress, type Address, type Hash } from "viem"
import { sepolia } from "viem/chains"
import { z } from "zod"
import { encodeInteropAddress, ERC8004_REGISTRY, CHAIN_REFERENCE } from "@/lib/ensip25"
import { PARENT_DOMAIN, getDevWalletClient, sepoliaClient } from "@/lib/viem"
import { ENS_REGISTRY, readSubnameOwner } from "@/lib/ens"
import { ensRegistryAbi, ensResolverAbi } from "@/lib/abis"
import { buildDefaultProfileRecords } from "@/lib/twin-profile"
import { encodeFunctionData, keccak256, namehash, toBytes } from "viem"
import { createTwinKey, isKmsConfigured } from "@/lib/kms"
import { setSessionCookie } from "@/lib/session"
import { deriveTwinStealthKeys } from "@/lib/stealth"
import {
  LOGIN_HASH_TEXT_KEY,
  generateRecoveryCode,
  hashRecoveryCode,
} from "@/lib/recovery"
import {
  ensLabelSchema,
  ethereumAddressSchema,
  jsonError,
  parseJsonBody,
  resolveAppUrl,
} from "@/lib/api-guard"

export const runtime = "nodejs"
export const maxDuration = 30

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"
// The Sepolia public resolver currently bound to ethtwin.eth. Hardcoded so
// onboarding doesn't need a pre-flight RPC read to discover it.
const PARENT_RESOLVER: Address = "0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5"

// Conservative gas budgets.
const CREATE_SUBNAME_GAS = 200_000n
const RESOLVER_MULTICALL_GAS = 1_500_000n
// Explicit Sepolia gas pricing — generous so it always lands; skipping this
// would force viem to call eth_feeHistory on every send.
const SEPOLIA_MAX_FEE_PER_GAS = 5_000_000_000n // 5 gwei
const SEPOLIA_MAX_PRIORITY_FEE_PER_GAS = 1_500_000_000n // 1.5 gwei

const onboardingBodySchema = z.object({
  // Privy was the previous auth provider; the body field is retained for
  // backwards-compat with old clients but is ignored — the route is now
  // session-cookie based and signs everything via SpaceComputer KMS.
  privyToken: z.string().nullable().optional(),
  username: ensLabelSchema,
  // Now optional: when omitted (or set to the dev fallback) we mint a fresh
  // KMS-managed Ethereum key and use ITS address as the twin's wallet.
  smartWalletAddress: ethereumAddressSchema.optional(),
  // Now derived server-side from the twin ENS + master secret. Field is
  // accepted for backwards-compat but ignored — see deriveTwinStealthKeys
  // in lib/stealth.ts.
  stealthMetaAddress: z.string().min(1).optional(),
  twinAgentId: z.string().min(1, "twinAgentId is required"),
  // Explicit opt-out for the rare case the caller wants to bind a specific
  // wallet (e.g. an external EOA they already control). Default behaviour
  // when KMS is configured is "always KMS".
  useKms: z.boolean().optional(),
})

export async function POST(req: Request) {
  const t0 = Date.now()
  const log = (label: string) =>
    console.log(`[onboarding] +${Date.now() - t0}ms ${label}`)

  const appUrl = resolveAppUrl()
  if (!appUrl.ok) return appUrl.response

  const parsed = await parseJsonBody(req, onboardingBodySchema)
  if (!parsed.ok) return parsed.response
  const body = parsed.data

  const ensName = `${body.username}.${PARENT_DOMAIN}`
  const interop = encodeInteropAddress(
    ERC8004_REGISTRY.baseSepolia,
    CHAIN_REFERENCE.baseSepolia,
  )
  const ensipKey = `agent-registration[${interop}][${body.twinAgentId}]`

  try {
    log("start")
    const { account: devAccount } = getDevWalletClient()
    log("wallet ready")

    // ── KMS integration ──────────────────────────────────────────────────
    // Default behaviour: when SpaceComputer KMS credentials are configured
    // (ORBITPORT_CLIENT_ID + ORBITPORT_CLIENT_SECRET) and the client didn't
    // pass a specific wallet, mint a per-twin ETHEREUM key in KMS and use
    // its derived EVM address as the twin's identity on-chain. This is the
    // post-Privy-replacement path: the twin's wallet is satellite-attested,
    // not held by Privy or by the user's MetaMask. The KMS KeyId is also
    // published as a `twin.kms-key-id` text record so any reader can resolve
    // ENS → KMS key → cryptographic provenance.
    let kmsKeyId: string | null = null
    let kmsPublicKey: string | null = null
    let walletAddress: Address
    const wantsKms =
      body.useKms !== false &&
      isKmsConfigured() &&
      // If the client passed a wallet that isn't the dev fallback, respect it.
      (!body.smartWalletAddress ||
        body.smartWalletAddress.toLowerCase() ===
          devAccount.address.toLowerCase())

    if (wantsKms) {
      log("creating KMS-managed ETHEREUM key…")
      const kms = await createTwinKey(body.username)
      kmsKeyId = kms.keyId
      kmsPublicKey = kms.publicKey
      walletAddress = kms.address
      log(`KMS key ${kmsKeyId} → ${walletAddress}`)
    } else if (body.smartWalletAddress) {
      // External wallet path (legacy / testing) — caller controls the address.
      walletAddress = getAddress(body.smartWalletAddress) as Address
      log(`using caller-supplied wallet ${walletAddress}`)
    } else {
      return jsonError(
        "No wallet path available: KMS is not configured and no smartWalletAddress was supplied.",
        400,
      )
    }

    // Only two reads: existing-owner check (to know if we need to create) and
    // current pending nonce (so we can sequence two txs without re-fetching).
    const [existingOwner, startingNonce] = await Promise.all([
      readSubnameOwner(ensName),
      sepoliaClient.getTransactionCount({
        address: devAccount.address,
        blockTag: "pending",
      }),
    ])
    log(`reads done — owner=${existingOwner} nonce=${startingNonce}`)

    const needsCreate = existingOwner === ZERO_ADDRESS

    // Recovery code — the per-twin secret the user needs to log back in
    // from a new browser. Plaintext is returned to the client (and only
    // shown once); the HMAC is published as `twin.login-hash` so any
    // caller can verify a supplied code without trusting the server.
    const recoveryCode = generateRecoveryCode()
    const loginHash = hashRecoveryCode(recoveryCode)

    // Stealth meta-address is derived deterministically from the twin's
    // ENS + dev master secret. Random per-mint keys would be lost the
    // moment the page reloads (no client-side persistence) — derived
    // keys let the recipient (or anyone with the master) re-scan inbound
    // payments later. See lib/stealth.ts for the full caveat.
    const stealthKeys = deriveTwinStealthKeys(ensName)

    // Build the multicall payload — addr + every text record on the new node.
    // Skip the agents.directory append for now to avoid an extra RPC read on
    // the hot path; a separate /api/agents/refresh can sync the directory later.
    const profile = buildDefaultProfileRecords(body.username)
    const textRecords: Record<string, string> = {
      ...profile,
      "twin.persona": JSON.stringify({
        tone: "concise, friendly, slightly dry",
        style: "plain English",
      }),
      "twin.capabilities": JSON.stringify(["transact", "research", "stealth_send"]),
      "twin.endpoint": `${appUrl.value}/api/twin`,
      "twin.version": "0.1.0",
      "stealth-meta-address": stealthKeys.stealthMetaAddressURI,
      [ensipKey]: "1",
      // KMS provenance — the ENS↔SpaceComputer-KMS bridge.
      //   twin.kms-key-id      → opaque handle for SDK calls
      //   twin.kms-public-key  → uncompressed secp256k1 public key, lets ANY
      //                          reader resolve the ENS, verify that
      //                          keccak256(pubkey)[12:] == addr, and
      //                          authenticate signatures (e.g. the per-message
      //                          KMS sigs in lib/messages.ts) without trusting
      //                          our backend.
      ...(kmsKeyId ? { "twin.kms-key-id": kmsKeyId } : {}),
      ...(kmsPublicKey ? { "twin.kms-public-key": kmsPublicKey } : {}),
      // Login hash — owners-only proof for /api/session POST.
      [LOGIN_HASH_TEXT_KEY]: loginHash,
    }
    const ensNode = namehash(ensName)
    const calls: `0x${string}`[] = [
      encodeFunctionData({
        abi: ensResolverAbi,
        functionName: "setAddr",
        args: [ensNode, walletAddress],
      }),
      ...Object.entries(textRecords).map(([key, value]) =>
        encodeFunctionData({
          abi: ensResolverAbi,
          functionName: "setText",
          args: [ensNode, key, value],
        }),
      ),
    ]
    log(`built ${calls.length} resolver calls`)

    // Bypass viem's wrapper — sign locally, send raw. This avoids any of
    // wallet.sendTransaction's internal RPC calls (chain validation, fee
    // discovery, simulation) which were the suspected hang on Vercel.
    let createTx: Hash | null = null
    let recordsNonce = startingNonce

    if (needsCreate) {
      const labelHash = keccak256(toBytes(body.username))
      const parentNode = namehash(PARENT_DOMAIN)
      const createData = encodeFunctionData({
        abi: ensRegistryAbi,
        functionName: "setSubnodeRecord",
        args: [parentNode, labelHash, devAccount.address, PARENT_RESOLVER, 0n],
      })
      log("createTx signing…")
      const signedCreate = await devAccount.signTransaction({
        chainId: sepolia.id,
        type: "eip1559",
        to: ENS_REGISTRY,
        data: createData,
        nonce: startingNonce,
        gas: CREATE_SUBNAME_GAS,
        maxFeePerGas: SEPOLIA_MAX_FEE_PER_GAS,
        maxPriorityFeePerGas: SEPOLIA_MAX_PRIORITY_FEE_PER_GAS,
        value: 0n,
      })
      log("createTx broadcasting raw…")
      createTx = await sepoliaClient.sendRawTransaction({
        serializedTransaction: signedCreate,
      })
      log(`createTx broadcast: ${createTx}`)
      recordsNonce = startingNonce + 1
    }

    const recordsData = encodeFunctionData({
      abi: ensResolverAbi,
      functionName: "multicall",
      args: [calls],
    })
    log(`recordsTx signing (${calls.length} sub-calls)…`)
    const signedRecords = await devAccount.signTransaction({
      chainId: sepolia.id,
      type: "eip1559",
      to: PARENT_RESOLVER,
      data: recordsData,
      nonce: recordsNonce,
      gas: RESOLVER_MULTICALL_GAS,
      maxFeePerGas: SEPOLIA_MAX_FEE_PER_GAS,
      maxPriorityFeePerGas: SEPOLIA_MAX_PRIORITY_FEE_PER_GAS,
      value: 0n,
    })
    log("recordsTx broadcasting raw…")
    const recordsTx = await sepoliaClient.sendRawTransaction({
      serializedTransaction: signedRecords,
    })
    log(`recordsTx broadcast: ${recordsTx}`)

    // Issue a session cookie so the new twin is logged in immediately —
    // replaces Privy's "you have an embedded wallet, you're authenticated"
    // signal with our KMS-only equivalent.
    await setSessionCookie({ ens: ensName, kmsKeyId })

    return Response.json({
      ok: true,
      ensName,
      status: "pending",
      createTx,
      recordsTx,
      walletAddress,
      kmsKeyId,
      // Uncompressed secp256k1 public key (65 bytes, 0x04 prefix). This is
      // the cryptographic artifact that proves the address was derived from
      // a real KMS key — anyone can hash it and confirm it matches the
      // on-chain `addr` record. Surface it in the UI as the "true" KMS key.
      kmsPublicKey,
      // Plaintext recovery code — the client must persist this and surface
      // it to the user. Required to log back in from a different browser.
      recoveryCode,
      pollUrl: `/api/check-username?u=${encodeURIComponent(body.username)}`,
    })
  } catch (error) {
    console.error("[onboarding] failed:", error)
    return jsonError(
      error instanceof Error ? error.message : "Sepolia ENS onboarding failed",
      502,
    )
  }
}
