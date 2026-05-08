import { getAddress, type Address } from "viem"
import { z } from "zod"
import { verifyAuthToken } from "@/lib/privy-server"
import { encodeInteropAddress, ERC8004_REGISTRY, CHAIN_REFERENCE } from "@/lib/ensip25"
import { PARENT_DOMAIN, getDevWalletClient, sepoliaClient } from "@/lib/viem"
import {
  createSubname,
  readResolver,
  readSubnameOwner,
  resolveEnsAddress,
  setAddressRecord,
  setTextRecord,
} from "@/lib/ens"
import { addAgentToDirectory } from "@/lib/agents"
import {
  ensLabelSchema,
  ethereumAddressSchema,
  jsonError,
  parseJsonBody,
  requireEnv,
  resolveAppUrl,
} from "@/lib/api-guard"

export const runtime = "nodejs"

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"

const onboardingBodySchema = z.object({
  privyToken: z.string().min(1, "Privy token is required"),
  username: ensLabelSchema,
  smartWalletAddress: ethereumAddressSchema,
  stealthMetaAddress: z.string().min(1, "stealthMetaAddress is required"),
  twinAgentId: z.string().min(1, "twinAgentId is required"),
})

async function waitForTx(hash: `0x${string}`) {
  return sepoliaClient.waitForTransactionReceipt({ hash })
}

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
    // The user's wallet appears in the `addr` record (forward resolution still
    // points at them). Hijacking check uses the existing addr record, since
    // the registry owner is always the dev wallet.
    const { account: devAccount } = getDevWalletClient()
    const existingOwner = await readSubnameOwner(ensName)
    const existingAddr = await resolveEnsAddress(ensName)

    if (existingOwner === ZERO_ADDRESS) {
      // Fresh subname — mint with dev wallet as registry owner.
      const createTx = await createSubname({
        parent: PARENT_DOMAIN,
        label: body.username,
        owner: devAccount.address,
        resolver: parentResolver,
      })
      await waitForTx(createTx)
    } else if (existingAddr && getAddress(existingAddr) !== walletAddress) {
      // Subname already taken by a different user (different addr record).
      return jsonError(
        `${ensName} is already taken by ${existingAddr}. Pick a different username.`,
        409,
      )
    }
    // else: fresh OR same user re-registering (existingAddr matches) — fall through.

    const addrTx = await setAddressRecord(ensName, walletAddress)
    await waitForTx(addrTx)

    const textRecords: Record<string, string> = {
      description: `${body.username}'s AI co-pilot`,
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

    for (const [key, value] of Object.entries(textRecords)) {
      const tx = await setTextRecord(ensName, key, value)
      await waitForTx(tx)
    }

    // Register agent in the on-chain directory (idempotent — skipped if already present).
    const directoryTx = await addAgentToDirectory(ensName)
    if (directoryTx) await waitForTx(directoryTx)
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Sepolia ENS onboarding failed",
      502,
    )
  }

  return Response.json({
    ok: true,
    ensName,
  })
}
