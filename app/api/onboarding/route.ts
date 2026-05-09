import { getAddress, type Address, type Hash } from "viem"
import { sepolia } from "viem/chains"
import { z } from "zod"
import { encodeInteropAddress, ERC8004_REGISTRY, CHAIN_REFERENCE } from "@/lib/ensip25"
import { PARENT_DOMAIN, getDevWalletClient, sepoliaClient } from "@/lib/viem"
import { ENS_REGISTRY, readSubnameOwner } from "@/lib/ens"
import { ensRegistryAbi, ensResolverAbi } from "@/lib/abis"
import { buildDefaultProfileRecords } from "@/lib/twin-profile"
import { encodeFunctionData, keccak256, namehash, toBytes } from "viem"
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
  privyToken: z.string().nullable().optional(),
  username: ensLabelSchema,
  smartWalletAddress: ethereumAddressSchema,
  stealthMetaAddress: z.string().min(1, "stealthMetaAddress is required"),
  twinAgentId: z.string().min(1, "twinAgentId is required"),
  // Wallet-connected users get a TwinVault deployed before the ENS records
  // are written. Email-only Privy users (smartWalletAddress = dev wallet
  // fallback) skip this entirely — server detects + double-checks.
  useVault: z.boolean().optional(),
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
  const walletAddress = getAddress(body.smartWalletAddress) as Address
  const interop = encodeInteropAddress(
    ERC8004_REGISTRY.baseSepolia,
    CHAIN_REFERENCE.baseSepolia,
  )
  const ensipKey = `agent-registration[${interop}][${body.twinAgentId}]`

  try {
    log("start")
    const { account: devAccount } = getDevWalletClient()
    log("wallet ready")

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

    // Spending model: the agent pulls funds directly from the user's wallet
    // via ERC-20 `transferFrom`, which requires only a one-time
    // `approve(devWallet, X)` signed by the user. We DON'T deploy a custom
    // vault contract anymore — funds live in the user's wallet, the dev
    // wallet only ever spends what was explicitly approved, and the user
    // can revoke any time by approving zero. Simpler, no contract required.
    //
    // We just record `twin.owner` so the transfer route can find the user
    // wallet later; `addr` keeps pointing at the user wallet so anyone
    // sending tokens to the ENS lands directly in the user's account.
    const userIsDistinctFromDev =
      walletAddress.toLowerCase() !== devAccount.address.toLowerCase()
    const writesOwnerRecord =
      body.useVault !== false && userIsDistinctFromDev
    const ownerSkipReason = !userIsDistinctFromDev
      ? "user wallet equals dev wallet (likely email-only Privy with no smart wallet yet)"
      : body.useVault === false
        ? "client explicitly passed useVault=false"
        : null
    log(
      writesOwnerRecord
        ? `agent-spending path: writing twin.owner=${walletAddress}`
        : `agent-spending path OFF — ${ownerSkipReason}`,
    )
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
      "stealth-meta-address": body.stealthMetaAddress,
      [ensipKey]: "1",
      // Used by lib/transfers.ts to find the user wallet for the
      // approve/transferFrom path. addr stays pointing at the user wallet
      // so inbound tokens land where the user expects.
      ...(writesOwnerRecord ? { "twin.owner": walletAddress } : {}),
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

    return Response.json({
      ok: true,
      ensName,
      status: "pending",
      createTx,
      recordsTx,
      twinOwner: writesOwnerRecord ? walletAddress : null,
      ownerSkipReason,
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
