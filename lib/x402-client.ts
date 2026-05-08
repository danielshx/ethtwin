// Wrapper around @x402/fetch (v2 from x402-foundation, NOT x402-fetch v1).
// Returns a fetch-compatible function that auto-pays HTTP 402 challenges.

import { wrapFetchWithPayment, x402Client } from "@x402/fetch"
import { ExactEvmScheme } from "@x402/evm"
import { privateKeyToAccount } from "viem/accounts"

// Base Sepolia (84532) primary; we also register Base Mainnet (8453) for
// real-Apify fallback when 'demo on testnet' is unavailable.
const CHAIN_NAMESPACES = ["eip155:84532", "eip155:8453"] as const

let cachedFetch: typeof fetch | null = null

export function paidFetch(): typeof fetch {
  if (cachedFetch) return cachedFetch
  const senderKey = process.env.X402_SENDER_KEY as `0x${string}` | undefined
  if (!senderKey) {
    throw new Error("X402_SENDER_KEY missing — cannot make paid x402 requests")
  }
  const signer = privateKeyToAccount(senderKey)
  const client = new x402Client()
  for (const ns of CHAIN_NAMESPACES) {
    // ExactEvmScheme accepts a viem signer; the type is loose so we cast.
    client.register(ns, new ExactEvmScheme(signer as never))
  }
  cachedFetch = wrapFetchWithPayment(fetch, client) as typeof fetch
  return cachedFetch
}

export async function callApifyX402(actorPath: string, body: unknown) {
  const endpoint =
    process.env.APIFY_X402_ENDPOINT?.replace("{actor}", actorPath) ??
    `https://api.apify.com/v2/acts/${actorPath}/run-sync-get-dataset-items`
  const f = paidFetch()
  const res = await f(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-APIFY-PAYMENT-PROTOCOL": "X402",
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(`Apify x402 failed: ${res.status} ${await res.text()}`)
  }
  return res.json()
}
