// scripts/x402-apify.ts
//
// LIVE x402 → Apify smoke test on **Base Mainnet**.
// Spends real USDC. Pre-flights everything before sending.
//
// Apify x402 reality check (verified May 2026):
//   • Settlement chain:  Base Mainnet (eip155:8453). Sepolia is NOT supported
//     by the production Apify x402 endpoint.
//   • Minimum charge:    $1.00 USDC per request.
//   • Endpoint pattern:  https://api.apify.com/v2/acts/{actor}/run-sync-get-dataset-items
//                        (replace `/` in the actor path with `~`).
//   • Header:            X-APIFY-PAYMENT-PROTOCOL: X402
//   • Only Pay-Per-Event Actors are x402-enabled.
//
// Required env (in .env.local):
//   X402_SENDER_KEY        — 0x... private key of the wallet that pays USDC.
//                            Falls back to DEV_WALLET_PRIVATE_KEY if unset.
//   APIFY_X402_ACTOR       — Actor path with `~` separator.
//                            Default: "apify~instagram-post-scraper"
//   APIFY_X402_ENDPOINT    — Optional URL template (use `{actor}`).
//                            Default: api.apify.com run-sync-get-dataset-items.
//   APIFY_X402_PAYLOAD     — Optional JSON string for the actor input.
//                            Default: a minimal probe payload tailored to
//                            the default actor.
//   BASE_RPC               — Optional Base Mainnet RPC URL. Default mainnet.base.org.
//
// Run:
//   pnpm test:x402-apify
//
// Aborts before spending any money if:
//   • X402_SENDER_KEY (and DEV_WALLET_PRIVATE_KEY) are both unset.
//   • Sender USDC balance on Base Mainnet < $1.10 (1 USDC charge + buffer).

import { createPublicClient, formatUnits, http, type Address } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { base } from "viem/chains"
import {
  callApifyX402,
  getX402SenderAddress,
  X402SenderKeyMissingError,
} from "../lib/x402-client"

const USDC_BASE_MAINNET: Address = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
const MIN_USDC_REQUIRED = 1_100_000n // $1.10 at 6 decimals (= $1.00 charge + small buffer)

const DEFAULT_ACTOR = "apify~instagram-post-scraper"
const DEFAULT_PAYLOAD = {
  username: ["natgeo"],
  resultsLimit: 1,
}

const erc20BalanceAbi = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const

function logHeader(s: string) {
  console.log(`\n── ${s} ${"─".repeat(Math.max(0, 76 - s.length))}`)
}

async function readUsdcBalance(address: Address): Promise<bigint> {
  const client = createPublicClient({
    chain: base,
    transport: http(process.env.BASE_RPC ?? "https://mainnet.base.org"),
  })
  return client.readContract({
    address: USDC_BASE_MAINNET,
    abi: erc20BalanceAbi,
    functionName: "balanceOf",
    args: [address],
  })
}

async function main() {
  logHeader("x402 → Apify (Base Mainnet)")
  console.log("This script spends real USDC on Base Mainnet. Aborts if any check fails.")

  // 1. Verify sender key.
  let senderAddr: Address
  try {
    senderAddr = getX402SenderAddress()
  } catch (err) {
    if (err instanceof X402SenderKeyMissingError) {
      console.log(`FAIL  ${err.message}`)
    } else {
      console.log(
        `FAIL  Could not derive sender address: ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
    }
    process.exit(1)
  }
  // Sanity-check: derive same address from raw env to surface bad keys clearly.
  const raw = process.env.X402_SENDER_KEY ?? process.env.DEV_WALLET_PRIVATE_KEY
  if (raw) {
    try {
      const verifyAddr = privateKeyToAccount(
        (raw.startsWith("0x") ? raw : `0x${raw}`) as `0x${string}`,
      ).address
      if (verifyAddr.toLowerCase() !== senderAddr.toLowerCase()) {
        console.log(
          `FAIL  Sender address mismatch (memo cache vs raw env). Run with a fresh process.`,
        )
        process.exit(1)
      }
    } catch (err) {
      console.log(
        `FAIL  X402_SENDER_KEY/DEV_WALLET_PRIVATE_KEY is not a valid private key: ${
          err instanceof Error ? err.message : err
        }`,
      )
      process.exit(1)
    }
  }
  console.log(`OK    sender address = ${senderAddr}`)

  // 2. Resolve actor + payload + endpoint.
  const actor = process.env.APIFY_X402_ACTOR ?? DEFAULT_ACTOR
  const endpointTpl =
    process.env.APIFY_X402_ENDPOINT ??
    `https://api.apify.com/v2/acts/{actor}/run-sync-get-dataset-items`
  console.log(`OK    actor    = ${actor}`)
  console.log(`OK    endpoint = ${endpointTpl.replace("{actor}", actor)}`)

  let payload: unknown = DEFAULT_PAYLOAD
  if (process.env.APIFY_X402_PAYLOAD) {
    try {
      payload = JSON.parse(process.env.APIFY_X402_PAYLOAD)
    } catch (err) {
      console.log(
        `FAIL  APIFY_X402_PAYLOAD is not valid JSON: ${
          err instanceof Error ? err.message : err
        }`,
      )
      process.exit(1)
    }
  }
  const payloadJson = JSON.stringify(payload)
  console.log(
    `OK    payload  = ${payloadJson.slice(0, 200)}${payloadJson.length > 200 ? "…" : ""}`,
  )

  // 3. Pre-flight USDC balance on Base Mainnet.
  logHeader("Pre-flight: USDC balance on Base Mainnet")
  let balance: bigint
  try {
    balance = await readUsdcBalance(senderAddr)
  } catch (err) {
    console.log(
      `FAIL  Could not read USDC balance: ${err instanceof Error ? err.message : err}`,
    )
    process.exit(1)
  }
  console.log(`      balance: ${formatUnits(balance, 6)} USDC`)
  console.log(`      required: ${formatUnits(MIN_USDC_REQUIRED, 6)} USDC (1.00 charge + buffer)`)
  if (balance < MIN_USDC_REQUIRED) {
    console.log(
      `FAIL  Insufficient USDC. Fund ${senderAddr} on Base Mainnet (Bridge: https://bridge.base.org/).`,
    )
    process.exit(1)
  }
  console.log("OK    balance check passed.")

  // 4. Live call.
  logHeader("Live x402 call")
  console.log("PEND  POSTing to Apify (this will spend ~$1 USDC)…")
  const start = Date.now()
  try {
    const { data, receipt } = await callApifyX402(actor, payload, { chain: "base" })
    const ms = Date.now() - start
    console.log(`OK    Apify returned in ${ms}ms`)
    if (receipt.txHash) {
      console.log(`OK    on-chain tx: ${receipt.txHash}`)
      console.log(`OK    payer:       ${receipt.payer ?? "(unknown)"}`)
      console.log(`OK    explorer:    ${receipt.explorerUrl ?? "(none)"}`)
    } else {
      console.log(
        `WARN  Apify accepted the payment but no X-PAYMENT-RESPONSE header was returned. ` +
          `The actor ran, but you'll need to check sender wallet history on basescan to find the settlement tx.`,
      )
      console.log(`      sender on basescan: https://basescan.org/address/${senderAddr}`)
    }
    const summary = JSON.stringify(data).slice(0, 400)
    console.log(
      `      result: ${summary}${JSON.stringify(data).length > 400 ? "…" : ""}`,
    )
  } catch (err) {
    console.log(`FAIL  ${err instanceof Error ? err.message : err}`)
    console.log("")
    console.log("Common causes:")
    console.log("  - Actor is not x402-enabled (only Pay-Per-Event Actors are)")
    console.log("  - Sender wallet has insufficient USDC on Base Mainnet")
    console.log("  - Actor payload shape rejected — check the actor's docs")
    console.log("  - Apify facilitator returned an unexpected error")
    process.exit(1)
  }
}

main().catch((err) => {
  console.error("FAIL", err instanceof Error ? err.stack ?? err.message : err)
  process.exit(1)
})
