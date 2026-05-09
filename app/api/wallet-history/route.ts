// Read the user's recent on-chain transactions for History tab via Etherscan v2.
// Etherscan's v2 unified API (https://api.etherscan.io/v2) handles every chain
// by `chainid` param. Without an API key the rate limit is very low; with one
// (free tier) it's 5/sec, 100k/day — plenty for demo.
//
// Per chain we ask for the 20 most recent txs (account.txlist) and decorate
// each with a parsed summary using lib/tx-decoder.
//
// GET /api/wallet-history?address=0x…&chains=sepolia,base-sepolia&limit=20

import { isAddress, getAddress, type Address, type Hex } from "viem"
import { jsonError } from "@/lib/api-guard"
import { decodeTx } from "@/lib/tx-decoder"
import { readAddrFast } from "@/lib/ens"

export const runtime = "nodejs"
export const maxDuration = 15

type ChainSpec = {
  chainId: number
  label: "sepolia" | "base-sepolia"
  explorer: (h: string) => string
}

const CHAINS: Record<string, ChainSpec> = {
  sepolia: {
    chainId: 11155111,
    label: "sepolia",
    explorer: (h) => `https://sepolia.etherscan.io/tx/${h}`,
  },
  "base-sepolia": {
    chainId: 84532,
    label: "base-sepolia",
    explorer: (h) => `https://sepolia.basescan.org/tx/${h}`,
  },
}

export type WalletHistoryEntry = {
  txHash: `0x${string}`
  chain: "sepolia" | "base-sepolia"
  from: Address
  to: Address | null
  value: string // wei as string
  at: number // unix seconds
  blockNumber: string
  status: "success" | "failed"
  summary: string
  contractName: string
  functionName: string
  explorerUrl: string
}

type EtherscanTx = {
  hash: string
  blockNumber: string
  timeStamp: string
  from: string
  to: string
  value: string
  input: string
  isError: string
  txreceipt_status?: string
}

async function fetchTxsForChain(
  spec: ChainSpec,
  address: Address,
  limit: number,
  apiKey?: string,
): Promise<WalletHistoryEntry[]> {
  const params = new URLSearchParams({
    chainid: String(spec.chainId),
    module: "account",
    action: "txlist",
    address,
    startblock: "0",
    endblock: "99999999",
    page: "1",
    offset: String(limit),
    sort: "desc",
  })
  if (apiKey) params.set("apikey", apiKey)

  const url = `https://api.etherscan.io/v2/api?${params.toString()}`
  const res = await fetch(url, { signal: AbortSignal.timeout(8_000) })
  if (!res.ok) return []
  const data = (await res.json()) as { status?: string; result?: EtherscanTx[] | string }
  // Etherscan returns status: "0" + result string ("No transactions found", "Max rate limit reached", etc.)
  if (data.status !== "1" || !Array.isArray(data.result)) return []

  return data.result.map((tx) => {
    const decoded = decodeTx({
      to: getAddress(tx.to || tx.from) as Address,
      data: (tx.input || "0x") as Hex,
      value: BigInt(tx.value || "0"),
    })
    return {
      txHash: tx.hash as `0x${string}`,
      chain: spec.label,
      from: getAddress(tx.from) as Address,
      to: tx.to ? (getAddress(tx.to) as Address) : null,
      value: tx.value,
      at: Number(tx.timeStamp),
      blockNumber: tx.blockNumber,
      status: tx.isError === "0" ? "success" : "failed",
      summary: decoded.summary,
      contractName: decoded.contractName,
      functionName: decoded.functionName,
      explorerUrl: spec.explorer(tx.hash),
    }
  })
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const address = url.searchParams.get("address")
  const ens = url.searchParams.get("ens")
  const chainsParam = url.searchParams.get("chains") ?? "sepolia,base-sepolia"
  const limitParam = url.searchParams.get("limit") ?? "50"

  // Resolve `ens=name.ethtwin.eth` to its on-chain `addr` text record so
  // the History tab is canonically the activity of the agent's ENS-bound
  // wallet, not whatever wallet happens to be connected in the browser.
  let checksummed: Address
  let resolvedFromEns: string | null = null
  if (ens) {
    const resolved = await readAddrFast(ens).catch(() => null)
    if (!resolved || !isAddress(resolved)) {
      return jsonError(`Could not resolve addr record for ${ens}`, 404)
    }
    checksummed = getAddress(resolved) as Address
    resolvedFromEns = ens
  } else if (address && isAddress(address)) {
    checksummed = getAddress(address) as Address
  } else {
    return jsonError("?address=<0x…> or ?ens=<name.ethtwin.eth> is required", 400)
  }

  const limit = Math.min(50, Math.max(1, Number(limitParam) || 50))

  const apiKey = process.env.ETHERSCAN_API_KEY?.trim() || undefined

  const chainKeys = chainsParam
    .split(",")
    .map((s) => s.trim())
    .filter((c) => CHAINS[c])

  try {
    const results = await Promise.all(
      chainKeys.map((c) => fetchTxsForChain(CHAINS[c]!, checksummed, limit, apiKey)),
    )
    const entries = results.flat().sort((a, b) => b.at - a.at)
    return Response.json({
      ok: true,
      address: checksummed,
      ens: resolvedFromEns,
      chains: chainKeys,
      entries,
      // Hint to the client UI that more transactions exist than we returned.
      apiKeyConfigured: !!apiKey,
    })
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Failed to fetch wallet history",
      502,
    )
  }
}
