// Wrapper around @x402/fetch v2 (x402-foundation), NOT the older x402-fetch v1
// (Coinbase). The two packages share names but ship incompatible client APIs:
//
//   • v2 (this lib):   `x402Client`     + `ExactEvmScheme`     (CAIP-2 namespaces)
//   • v1 (deprecated): `x402-fetch`/`x402` clients with chain slugs
//
// We register schemes for BOTH Base Sepolia (eip155:84532) and Base Mainnet
// (eip155:8453). Apify's production x402 endpoint settles on **Base Mainnet**
// (verified May 2026 — $1 USDC minimum) so the live demo path requires a
// funded mainnet wallet. The analyst self-call (`/api/agents/analyst`)
// stays on Base Sepolia for risk-free dev.
//
// Public surface:
//   paidFetch({ chain? })          → fetch-compatible function with auto-pay
//   paidFetchWithReceipt(url, init)→ same call, but also returns parsed
//                                    SettleResponse (tx hash, chain, payer)
//   callApifyX402(actor, body)     → typed Apify wrapper (mainnet by default)

import { wrapFetchWithPayment, x402Client } from "@x402/fetch"
import { ExactEvmScheme } from "@x402/evm"

// Inlined: @x402/core/http exports decodePaymentResponseHeader which decodes
// base64(JSON) of the SettleResponse. We replicate it here because the
// package's subpath types don't resolve under TS's bundler resolution.
type SettleResponseShape = {
  success?: boolean
  transaction?: string
  network?: string
  payer?: string
}
function decodePaymentResponseHeader(raw: string): SettleResponseShape {
  try {
    const decoded =
      typeof atob === "function"
        ? atob(raw)
        : Buffer.from(raw, "base64").toString("utf8")
    return JSON.parse(decoded) as SettleResponseShape
  } catch {
    return {}
  }
}
import { ExactEvmSchemeV1 } from "@x402/evm/v1"
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts"

export type X402Chain = "base-sepolia" | "base"

const V2_NAMESPACES: Record<X402Chain, `eip155:${string}`> = {
  "base-sepolia": "eip155:84532",
  base: "eip155:8453",
}

const V1_NAMESPACES: Record<X402Chain, string> = {
  "base-sepolia": "base-sepolia",
  base: "base",
}

const EXPLORERS: Record<X402Chain, { txUrl: (h: string) => string; label: string }> = {
  "base-sepolia": {
    txUrl: (h) => `https://sepolia.basescan.org/tx/${h}`,
    label: "Base Sepolia",
  },
  base: {
    txUrl: (h) => `https://basescan.org/tx/${h}`,
    label: "Base Mainnet",
  },
}

export class X402SenderKeyMissingError extends Error {
  constructor() {
    super(
      "X402_SENDER_KEY (or DEV_WALLET_PRIVATE_KEY) is not set — cannot make paid x402 requests. " +
        "Add a funded private key to .env.local before running the live x402 demo.",
    )
    this.name = "X402SenderKeyMissingError"
  }
}

function resolveSigner(): PrivateKeyAccount {
  // Prefer X402_SENDER_KEY; fall back to DEV_WALLET_PRIVATE_KEY so the
  // hackathon dev wallet can sign x402 challenges without duplicating the secret.
  const raw = process.env.X402_SENDER_KEY ?? process.env.DEV_WALLET_PRIVATE_KEY
  if (!raw) {
    throw new X402SenderKeyMissingError()
  }
  const senderKey = (raw.startsWith("0x") ? raw : `0x${raw}`) as `0x${string}`
  return privateKeyToAccount(senderKey)
}

const cachedFetches = new Map<X402Chain | "all", typeof fetch>()
let cachedSigner: PrivateKeyAccount | null = null

/**
 * Returns a fetch-compatible function that auto-pays HTTP 402 challenges.
 *
 * @param opts.chain - Restrict the client to a single chain. If omitted, both
 *   Base Sepolia and Base Mainnet schemes are registered (recommended — the
 *   wrapper will pick whichever the server requests). Pass `"base"` to make
 *   it explicit for the Apify mainnet demo, or `"base-sepolia"` for dev.
 */
export function paidFetch(opts: { chain?: X402Chain } = {}): typeof fetch {
  const cacheKey: X402Chain | "all" = opts.chain ?? "all"
  const existing = cachedFetches.get(cacheKey)
  if (existing) return existing

  const signer = (cachedSigner ??= resolveSigner())
  const client = new x402Client()
  const chains: X402Chain[] = opts.chain ? [opts.chain] : ["base-sepolia", "base"]

  for (const c of chains) {
    // v2 — CAIP-2 EIP-155 namespaces (modern wire format).
    client.register(V2_NAMESPACES[c], new ExactEvmScheme(signer as never))
    // v1 — chain slugs. Some facilitators (incl. older Apify deployments)
    // still negotiate v1, so we register both.
    client.registerV1(V1_NAMESPACES[c], new ExactEvmSchemeV1(signer as never))
  }
  const wrapped = wrapFetchWithPayment(fetch, client) as typeof fetch
  cachedFetches.set(cacheKey, wrapped)
  return wrapped
}

/** Reset memoization. Useful for tests + after rotating env vars. */
export function resetPaidFetchCache(): void {
  cachedFetches.clear()
  cachedSigner = null
}

/** Get the address that will pay for x402 challenges. Throws if no key configured. */
export function getX402SenderAddress(): `0x${string}` {
  const signer = (cachedSigner ??= resolveSigner())
  return signer.address
}

export type X402Receipt = {
  txHash?: `0x${string}`
  chain?: X402Chain
  network?: string // raw CAIP-2 / slug from the facilitator
  payer?: string
  success?: boolean
  explorerUrl?: string
}

function networkToChain(network: string | undefined): X402Chain | undefined {
  if (!network) return undefined
  if (network === "eip155:8453" || network === "base") return "base"
  if (network === "eip155:84532" || network === "base-sepolia") return "base-sepolia"
  return undefined
}

/** Parse the X-PAYMENT-RESPONSE header into a typed receipt. */
export function parseX402Receipt(headers: Headers): X402Receipt {
  const raw = headers.get("x-payment-response")
  if (!raw) return {}
  try {
    const settle = decodePaymentResponseHeader(raw)
    const chain = networkToChain(settle.network)
    const txHash =
      typeof settle.transaction === "string" && settle.transaction.startsWith("0x")
        ? (settle.transaction as `0x${string}`)
        : undefined
    return {
      txHash,
      chain,
      network: settle.network,
      payer: settle.payer,
      success: settle.success,
      explorerUrl: chain && txHash ? EXPLORERS[chain].txUrl(txHash) : undefined,
    }
  } catch {
    return {}
  }
}

/**
 * Fetch + auto-pay + parsed receipt in one call. Returns both the original
 * Response and a structured receipt with the on-chain tx hash + explorer URL.
 */
export async function paidFetchWithReceipt(
  input: RequestInfo | URL,
  init?: RequestInit,
  opts: { chain?: X402Chain } = {},
): Promise<{ response: Response; receipt: X402Receipt }> {
  const f = paidFetch(opts)
  const response = await f(input, init)
  const receipt = parseX402Receipt(response.headers)
  return { response, receipt }
}

export type ApifyX402Result = {
  data: unknown
  receipt: X402Receipt
}

/**
 * Call an Apify Pay-Per-Event Actor via x402. Defaults to Base Mainnet because
 * Apify's production x402 endpoint settles on mainnet (verified May 2026).
 *
 * @param actorPath - e.g. `"apify~instagram-post-scraper"` (use `~` not `/`).
 * @param body - Actor input payload (JSON-serialisable).
 * @param opts.endpoint - Override URL template (use `{actor}` placeholder).
 *                        Defaults to `APIFY_X402_ENDPOINT` env or
 *                        `https://api.apify.com/v2/acts/{actor}/run-sync-get-dataset-items`.
 * @param opts.chain - Defaults to `"base"` (Apify mainnet). Pass `"base-sepolia"`
 *                     only if you've verified the actor accepts testnet USDC.
 */
export async function callApifyX402(
  actorPath: string,
  body: unknown,
  opts: { endpoint?: string; chain?: X402Chain } = {},
): Promise<ApifyX402Result> {
  const tpl =
    opts.endpoint ??
    process.env.APIFY_X402_ENDPOINT ??
    `https://api.apify.com/v2/acts/{actor}/run-sync-get-dataset-items`
  const endpoint = tpl.replace("{actor}", actorPath)
  const chain: X402Chain = opts.chain ?? "base"

  const { response, receipt } = await paidFetchWithReceipt(
    endpoint,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-APIFY-PAYMENT-PROTOCOL": "X402",
      },
      body: JSON.stringify(body),
    },
    { chain },
  )

  if (!response.ok) {
    const text = await response.text().catch(() => "")
    throw new Error(`Apify x402 failed: ${response.status} ${text}`)
  }
  const data = (await response.json()) as unknown
  return { data, receipt }
}
