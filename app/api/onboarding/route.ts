import { getAddress, type Address, type Hash } from "viem"
import { z } from "zod"
import { verifyAuthToken } from "@/lib/privy-server"
import { encodeInteropAddress, ERC8004_REGISTRY, CHAIN_REFERENCE } from "@/lib/ensip25"
import { PARENT_DOMAIN, getDevWalletClient, sepoliaClient } from "@/lib/viem"
import {
  ENS_REGISTRY,
  readResolver,
  readSubnameOwner,
  resolveEnsAddress,
<<<<<<< HEAD
  setRecordsMulticall,
=======
>>>>>>> refs/remotes/origin/main
} from "@/lib/ens"
import { ensRegistryAbi, ensResolverAbi } from "@/lib/abis"
import { readAgentDirectory } from "@/lib/agents"
import { buildDefaultProfileRecords } from "@/lib/twin-profile"
import { encodeFunctionData, keccak256, namehash, toBytes } from "viem"
import {
  ensLabelSchema,
  ethereumAddressSchema,
  jsonError,
  parseJsonBody,
  requireEnv,
  resolveAppUrl,
} from "@/lib/api-guard"

export const runtime = "nodejs"
<<<<<<< HEAD
export const maxDuration = 60
=======
// Fire-and-forget: broadcast both txs back-to-back with manual nonces and
// fixed gas (skipping per-tx simulation). Server returns within ~3 s; the
// frontend polls until the new twin is fully on-chain. Fits Vercel Hobby.
export const maxDuration = 30
>>>>>>> refs/remotes/origin/main

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"

// Conservative gas budgets — both fit comfortably for the operations we do.
const CREATE_SUBNAME_GAS = 200_000n
const RESOLVER_MULTICALL_GAS = 1_500_000n

const onboardingBodySchema = z.object({
  privyToken: z.string().min(1, "Privy token is required"),
  username: ensLabelSchema,
  smartWalletAddress: ethereumAddressSchema,
  stealthMetaAddress: z.string().min(1, "stealthMetaAddress is required"),
  twinAgentId: z.string().min(1, "twinAgentId is required"),
})

export async function POST(req: Request) {
  const appUrl = resolveAppUrl()
  if (!appUrl.ok) return appUrl.response

  const devWallet = requireEnv("DEV_WALLET_PRIVATE_KEY")
  if (!devWallet.ok) return devWallet.response

  const parsed = await parseJsonBody(req, onboardingBodySchema)
  if (!parsed.ok) return parsed.response
  const body = parsed.data

  try {
    await verifyAuthToken(body.privyToken)
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Privy token verification failed",
      401,
    )
  }

  const ensName = `${body.username}.${PARENT_DOMAIN}`
  const walletAddress = getAddress(body.smartWalletAddress) as Address

  const interop = encodeInteropAddress(
    ERC8004_REGISTRY.baseSepolia,
    CHAIN_REFERENCE.baseSepolia,
  )
  const ensipKey = `agent-registration[${interop}][${body.twinAgentId}]`

  try {
    const parentResolver = await readResolver(PARENT_DOMAIN)
    if (parentResolver === ZERO_ADDRESS) {
      return jsonError(
        `Parent ENS name ${PARENT_DOMAIN} has no resolver set on Sepolia`,
        500,
      )
    }

    // Architecture: dev wallet retains registry ownership of every subname so
    // it can write records + create message sub-subnames on the user's behalf.
    // The user's wallet appears in the `addr` record. Hijacking check uses
    // the existing addr record.
    const { wallet, account: devAccount } = getDevWalletClient()
    const existingOwner = await readSubnameOwner(ensName)
    const existingAddr = await resolveEnsAddress(ensName)

    const needsCreate = existingOwner === ZERO_ADDRESS
    if (
      !needsCreate &&
      existingAddr &&
      getAddress(existingAddr) !== walletAddress
    ) {
      // Already owned by a different user.
      return jsonError(
        `${ensName} is already taken by ${existingAddr}. Pick a different username.`,
        409,
      )
    }
<<<<<<< HEAD
    // else: fresh OR same user re-registering (existingAddr matches) — fall through.

=======

    // ── Build the resolver multicall payload (addr + all text records + directory append) ──
>>>>>>> refs/remotes/origin/main
    const profile = buildDefaultProfileRecords(body.username)
    const textRecords: Record<string, string> = {
      ...profile,
      "twin.persona": JSON.stringify({
        tone: "concise, friendly, slightly dry",
        style: "plain English",
      }),
      "twin.capabilities": JSON.stringify([
        "transact",
        "research",
        "stealth_send",
      ]),
      "twin.endpoint": `${appUrl.value}/api/twin`,
      "twin.version": "0.1.0",
      "stealth-meta-address": body.stealthMetaAddress,
      [ensipKey]: "1",
    }

<<<<<<< HEAD
    // Batch addr + all text records into a single resolver multicall tx,
    // collapsing ~9 sequential Sepolia txs down to one.
    const recordsTx = await setRecordsMulticall(ensName, {
      addr: walletAddress,
      texts: textRecords,
    })
    await waitForTx(recordsTx)
=======
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

    const currentDirectory = await readAgentDirectory()
    const alreadyListed = currentDirectory.some(
      (e) => e.ens.toLowerCase() === ensName.toLowerCase(),
    )
    if (!alreadyListed) {
      const nextDirectory = [
        ...currentDirectory,
        { ens: ensName, addedAt: Math.floor(Date.now() / 1000) },
      ].slice(-100)
      const parentNode = namehash(PARENT_DOMAIN)
      calls.push(
        encodeFunctionData({
          abi: ensResolverAbi,
          functionName: "setText",
          args: [parentNode, "agents.directory", JSON.stringify(nextDirectory)],
        }),
      )
    }
>>>>>>> refs/remotes/origin/main

    // ── Broadcast back-to-back with sequential nonces, no waits ──
    // Fetching nonce once and assigning manually means viem doesn't need to
    // re-fetch. Passing `gas` lets viem skip the eth_estimateGas simulation
    // (which would revert for the multicall since the subname doesn't exist
    // in the current state if we're creating it).
    const startingNonce = await sepoliaClient.getTransactionCount({
      address: devAccount.address,
      blockTag: "pending",
    })

    let createTx: Hash | null = null
    let recordsNonce = startingNonce

    if (needsCreate) {
      const labelHash = keccak256(toBytes(body.username))
      const parentNode = namehash(PARENT_DOMAIN)
      createTx = await wallet.writeContract({
        account: devAccount,
        chain: wallet.chain,
        address: ENS_REGISTRY,
        abi: ensRegistryAbi,
        functionName: "setSubnodeRecord",
        args: [parentNode, labelHash, devAccount.address, parentResolver, 0n],
        nonce: startingNonce,
        gas: CREATE_SUBNAME_GAS,
      })
      recordsNonce = startingNonce + 1
    }

    const recordsTx = await wallet.writeContract({
      account: devAccount,
      chain: wallet.chain,
      address: parentResolver,
      abi: ensResolverAbi,
      functionName: "multicall",
      args: [calls],
      nonce: recordsNonce,
      gas: RESOLVER_MULTICALL_GAS,
    })

    return Response.json({
      ok: true,
      ensName,
      status: "pending",
      createTx,
      recordsTx,
      // Frontend can poll /api/check-username?u=<username> until ownerAddr === walletAddress.
      pollUrl: `/api/check-username?u=${encodeURIComponent(body.username)}`,
    })
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Sepolia ENS onboarding failed",
      502,
    )
  }
}
