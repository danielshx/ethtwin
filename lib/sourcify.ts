import { getAddress, type Abi, type Address } from "viem"

const SOURCIFY_REPOSITORY_BASE = "https://repo.sourcify.dev/contracts"
const FETCH_TIMEOUT_MS = 4_000
const DEMO_CHAIN_IDS = [1, 11155111, 84532] as const

type SourcifyMatch = "full_match" | "partial_match"

type SourcifyMetadata = {
  output?: {
    abi?: Abi
  }
  settings?: {
    compilationTarget?: Record<string, string>
  }
  sources?: Record<string, unknown>
}

export type SourcifyVerification = {
  address: Address
  chainId: number
  verified: boolean
  match?: "full" | "partial"
  abi?: Abi
  contractName?: string
  metadataUrl?: string
  sourceUrl?: string
  error?: string
}

/**
 * Fetch verified contract metadata from Sourcify's public repository.
 *
 * This intentionally uses the static repo endpoint instead of adding an SDK:
 * - no new dependency during the hackathon
 * - deterministic URL that is easy to show judges
 * - safe failure mode when Sourcify is unavailable
 *
 * When no chainId is provided, we try the chains used in the demo so callers
 * that only have a raw tx payload still get a useful anti-blind-signing check.
 */
export async function getSourcifyVerification(args: {
  chainId?: number
  address: Address | string
}): Promise<SourcifyVerification> {
  const address = getAddress(args.address)
  const chainIds = args.chainId ? [args.chainId] : [...DEMO_CHAIN_IDS]

  let lastError = "Contract source was not found in Sourcify full_match or partial_match."
  for (const chainId of chainIds) {
    const result = await getSourcifyVerificationForChain({ chainId, address })
    if (result.verified) return result
    if (result.error) lastError = result.error
  }

  return {
    address,
    chainId: args.chainId ?? DEMO_CHAIN_IDS[0],
    verified: false,
    error: lastError,
  }
}

async function getSourcifyVerificationForChain(args: {
  chainId: number
  address: Address
}): Promise<SourcifyVerification> {
  const { chainId, address } = args

  for (const match of ["full_match", "partial_match"] as const) {
    const metadataUrl = `${SOURCIFY_REPOSITORY_BASE}/${match}/${chainId}/${address}/metadata.json`
    const metadata = await fetchSourcifyMetadata(metadataUrl)
    if (!metadata) continue

    const abi = metadata.output?.abi
    if (!abi || !Array.isArray(abi)) {
      return {
        address,
        chainId,
        verified: true,
        match: match === "full_match" ? "full" : "partial",
        metadataUrl,
        sourceUrl: sourceUrl(chainId, address, match),
        error: "Sourcify metadata did not include an ABI.",
      }
    }

    return {
      address,
      chainId,
      verified: true,
      match: match === "full_match" ? "full" : "partial",
      abi,
      contractName: contractNameFromMetadata(metadata),
      metadataUrl,
      sourceUrl: sourceUrl(chainId, address, match),
    }
  }

  return {
    address,
    chainId,
    verified: false,
    error: "Contract source was not found in Sourcify full_match or partial_match.",
  }
}

async function fetchSourcifyMetadata(url: string): Promise<SourcifyMetadata | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json" },
      cache: "force-cache",
    })
    if (!res.ok) return null
    return (await res.json()) as SourcifyMetadata
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function contractNameFromMetadata(metadata: SourcifyMetadata): string | undefined {
  const targets = metadata.settings?.compilationTarget
  if (targets) {
    const first = Object.values(targets).find((value) => typeof value === "string" && value.length > 0)
    if (first) return first
  }
  return undefined
}

function sourceUrl(chainId: number, address: Address, match: SourcifyMatch): string {
  return `${SOURCIFY_REPOSITORY_BASE}/${match}/${chainId}/${address}`
}
