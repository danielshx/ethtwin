// Read the user's recent on-chain transactions for the History tab.
//
// Two backends:
//  1. PRIMARY — Alchemy `alchemy_getAssetTransfers` over the same RPC key
//     hardcoded in lib/viem.ts. Works without any extra env config and is
//     much more reliable than Etherscan without an API key.
//  2. FALLBACK — Etherscan v2 unified API (account.txlist). Used when Alchemy
//     returns nothing for a chain (e.g. Base Sepolia if the Alchemy app
//     isn't configured for it).
//
// GET /api/wallet-history?address=0x…&chains=sepolia,base-sepolia&limit=50
// GET /api/wallet-history?ens=alice.ethtwin.eth&chains=sepolia,base-sepolia

import { isAddress, getAddress, type Address, type Hex } from "viem"
import { jsonError } from "@/lib/api-guard"
import { decodeTx } from "@/lib/tx-decoder"
import { readAddrFast } from "@/lib/ens"

export const runtime = "nodejs"
export const maxDuration = 15

type ChainSpec = {
  chainId: number
  label: "sepolia" | "base-sepolia"
  alchemyUrl: string | null
  explorer: (h: string) => string
}

// Same Alchemy key embedded in lib/viem.ts. Free tier — fine for the demo.
const ALCHEMY_KEY = "VnDHq7fsAyloEY3w9oQGK"

const CHAINS: Record<string, ChainSpec> = {
  sepolia: {
    chainId: 11155111,
    label: "sepolia",
    alchemyUrl: `https://eth-sepolia.g.alchemy.com/v2/${ALCHEMY_KEY}`,
    explorer: (h) => `https://sepolia.etherscan.io/tx/${h}`,
  },
  "base-sepolia": {
    chainId: 84532,
    label: "base-sepolia",
    alchemyUrl: `https://base-sepolia.g.alchemy.com/v2/${ALCHEMY_KEY}`,
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

async function fetchTxsEtherscan(
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

type AlchemyTransfer = {
  hash: string
  from: string
  to: string | null
  value: number | null
  asset: string | null
  category: string
  blockNum: string
  rawContract?: { address?: string | null; value?: string | null; decimal?: string | null }
  metadata?: { blockTimestamp?: string }
}

async function alchemyCall(
  url: string,
  body: object,
): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, ...body }),
    signal: AbortSignal.timeout(8_000),
  })
  if (!res.ok) return null
  return res.json()
}

async function fetchTxsAlchemy(
  spec: ChainSpec,
  address: Address,
  limit: number,
): Promise<WalletHistoryEntry[]> {
  if (!spec.alchemyUrl) return []
  const max = `0x${Math.min(1000, limit).toString(16)}`
  const baseParams = {
    fromBlock: "0x0",
    toBlock: "latest",
    category: ["external", "erc20", "erc721", "erc1155"],
    withMetadata: true,
    excludeZeroValue: false,
    maxCount: max,
    order: "desc",
  }

  // Fetch outgoing AND incoming in parallel.
  const [outgoingResp, incomingResp] = await Promise.all([
    alchemyCall(spec.alchemyUrl, {
      method: "alchemy_getAssetTransfers",
      params: [{ ...baseParams, fromAddress: address }],
    }),
    alchemyCall(spec.alchemyUrl, {
      method: "alchemy_getAssetTransfers",
      params: [{ ...baseParams, toAddress: address }],
    }),
  ])

  type AlchemyResp = { result?: { transfers?: AlchemyTransfer[] } }
  const outgoing = (outgoingResp as AlchemyResp | null)?.result?.transfers ?? []
  const incoming = (incomingResp as AlchemyResp | null)?.result?.transfers ?? []
  // Dedupe by hash — Alchemy returns one row per transfer, so a single tx
  // with multiple ERC20 logs may appear multiple times. Keep the first.
  const seen = new Set<string>()
  const all = [...outgoing, ...incoming].filter((t) => {
    if (!t.hash) return false
    const key = `${t.hash}-${t.category}-${t.rawContract?.address ?? ""}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  return all
    .map((t): WalletHistoryEntry | null => {
      const tsStr = t.metadata?.blockTimestamp
      const at = tsStr ? Math.floor(new Date(tsStr).getTime() / 1000) : 0
      const isErc20 = t.category === "erc20" || t.category === "erc721" || t.category === "erc1155"
      const valueStr = (() => {
        if (isErc20 && t.rawContract?.value) return BigInt(t.rawContract.value).toString()
        if (typeof t.value === "number") return BigInt(Math.floor(t.value * 1e18)).toString()
        return "0"
      })()
      let summary: string
      if (isErc20) {
        const symbol = t.asset ?? "tokens"
        const amount = typeof t.value === "number" ? t.value : 0
        summary = `${amount} ${symbol}`
      } else {
        const eth = typeof t.value === "number" ? t.value : 0
        summary = `${eth} ETH`
      }
      let from: Address
      let to: Address | null
      try {
        from = getAddress(t.from) as Address
        to = t.to ? (getAddress(t.to) as Address) : null
      } catch {
        return null
      }
      return {
        txHash: t.hash as `0x${string}`,
        chain: spec.label,
        from,
        to,
        value: valueStr,
        at,
        blockNumber: t.blockNum,
        status: "success",
        summary,
        contractName: t.rawContract?.address
          ? `${t.rawContract.address.slice(0, 6)}…${t.rawContract.address.slice(-4)}`
          : t.category,
        functionName: t.category,
        explorerUrl: spec.explorer(t.hash),
      }
    })
    .filter((e): e is WalletHistoryEntry => e !== null)
    .slice(0, limit)
}

async function fetchTxsForChain(
  spec: ChainSpec,
  address: Address,
  limit: number,
  apiKey?: string,
): Promise<WalletHistoryEntry[]> {
  // Try Alchemy first (works without env config). If it returns nothing,
  // fall back to Etherscan — Etherscan covers a few cases Alchemy misses
  // (contract self-deploys, some failed txs) and works as a true fallback.
  const alchemy = await fetchTxsAlchemy(spec, address, limit).catch(() => [])
  if (alchemy.length > 0) return alchemy
  return fetchTxsEtherscan(spec, address, limit, apiKey).catch(() => [])
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
