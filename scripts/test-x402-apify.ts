// End-to-end x402 → Apify test.
// Preflight first, then a live paid call.
//
// Required env (in .env.local):
//   X402_SENDER_KEY      — 0x... private key of the wallet that pays USDC
//   APIFY_ACTOR          — e.g. "apify~rag-web-browser" or "<user>~<actor>" of an x402-enabled actor
//   APIFY_PAYLOAD_JSON   — (optional) JSON string POSTed as the actor input. Defaults to a minimal probe.
//   APIFY_X402_ENDPOINT  — (optional) URL template; defaults to api.apify.com run-sync-get-dataset-items
//
// Run: pnpm test:x402

import { erc20Abi as decoderErc20Abi } from "../lib/abis"
import { callApifyX402 } from "../lib/x402-client"
import { createPublicClient, formatUnits, getAddress, http, type Address } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { base, baseSepolia } from "viem/chains"

const USDC = {
  baseSepolia: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as Address,
  base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address,
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

async function preflight() {
  logHeader("Preflight")

  // 1. env (fall back to DEV_WALLET_PRIVATE_KEY so we don't duplicate the secret)
  const senderKey = process.env.X402_SENDER_KEY ?? process.env.DEV_WALLET_PRIVATE_KEY
  const actor = process.env.APIFY_ACTOR
  const endpointTpl = process.env.APIFY_X402_ENDPOINT
  const missing: string[] = []
  if (!senderKey) missing.push("X402_SENDER_KEY (or DEV_WALLET_PRIVATE_KEY)")
  if (!actor) missing.push("APIFY_ACTOR")
  if (missing.length) {
    console.log(`FAIL  Missing env: ${missing.join(", ")}`)
    return null
  }
  console.log(`OK    APIFY_ACTOR=${actor}`)
  if (endpointTpl) console.log(`OK    APIFY_X402_ENDPOINT (override)=${endpointTpl}`)
  else console.log(`OK    APIFY_X402_ENDPOINT (default)=https://api.apify.com/v2/acts/{actor}/run-sync-get-dataset-items`)

  // 2. derive sender address
  const normalized = senderKey!.startsWith("0x") ? senderKey! : `0x${senderKey!}`
  let senderAddr: Address
  try {
    senderAddr = privateKeyToAccount(normalized as `0x${string}`).address
  } catch (err) {
    console.log(`FAIL  X402_SENDER_KEY is not a valid private key: ${err instanceof Error ? err.message : err}`)
    return null
  }
  console.log(`OK    sender address = ${senderAddr}`)

  // 3. USDC balances on Base Sepolia + Base Mainnet
  const baseSepoliaClient = createPublicClient({
    chain: baseSepolia,
    transport: http(process.env.NEXT_PUBLIC_BASE_RPC ?? "https://sepolia.base.org"),
  })
  const baseClient = createPublicClient({
    chain: base,
    transport: http(process.env.BASE_RPC ?? "https://mainnet.base.org"),
  })

  const [balSepolia, balMainnet] = await Promise.all([
    baseSepoliaClient.readContract({
      address: USDC.baseSepolia,
      abi: erc20BalanceAbi,
      functionName: "balanceOf",
      args: [senderAddr],
    }).catch(() => 0n),
    baseClient.readContract({
      address: USDC.base,
      abi: erc20BalanceAbi,
      functionName: "balanceOf",
      args: [senderAddr],
    }).catch(() => 0n),
  ])

  console.log(`      Base Sepolia USDC: ${formatUnits(balSepolia, 6)} USDC`)
  console.log(`      Base Mainnet USDC: ${formatUnits(balMainnet, 6)} USDC`)

  const minRequired = 1_000_000n // $1 USDC at 6 decimals
  if (balSepolia < minRequired && balMainnet < minRequired) {
    console.log(
      `WARN  Sender has < 1 USDC on both Base chains. Apify x402 minimum is $1/request — call will likely fail.`,
    )
  } else {
    console.log(`OK    Sender has enough USDC for at least one Apify x402 call.`)
  }

  return { senderAddr, actor: actor!, balSepolia, balMainnet }
}

async function liveCall(actor: string) {
  logHeader("Live x402 → Apify call")

  let payload: unknown = { startUrls: [{ url: "https://example.com" }], maxRequestsPerCrawl: 1 }
  if (process.env.APIFY_PAYLOAD_JSON) {
    try {
      payload = JSON.parse(process.env.APIFY_PAYLOAD_JSON)
    } catch (err) {
      console.log(`FAIL  APIFY_PAYLOAD_JSON is not valid JSON: ${err instanceof Error ? err.message : err}`)
      return
    }
  }
  console.log(`      payload: ${JSON.stringify(payload).slice(0, 200)}${JSON.stringify(payload).length > 200 ? "…" : ""}`)
  console.log(`PEND  POSTing to Apify…`)

  const start = Date.now()
  try {
    const { data, receipt } = await callApifyX402(actor, payload)
    const ms = Date.now() - start
    console.log(`OK    Apify returned in ${ms}ms`)
    const summary = JSON.stringify(data).slice(0, 400)
    console.log(`      result: ${summary}${JSON.stringify(data).length > 400 ? "…" : ""}`)
    if (receipt.txHash) {
      console.log(`      tx hash: ${receipt.txHash}`)
      console.log(`      chain:   ${receipt.chain ?? receipt.network ?? "?"}`)
      if (receipt.explorerUrl) console.log(`      explorer: ${receipt.explorerUrl}`)
    } else {
      console.log(`      (no X-PAYMENT-RESPONSE header — facilitator did not return a tx hash)`)
    }
    console.log(`\nIf you see this line, x402 paid the 402 challenge and the actor ran.`)
  } catch (err) {
    console.log(`FAIL  ${err instanceof Error ? err.message : err}`)
    console.log("")
    console.log("Common causes:")
    console.log("  - Actor is not x402-enabled (only Pay-Per-Event Actors are)")
    console.log("  - Sender wallet has < 1 USDC on the chain Apify accepts")
    console.log("  - X402_SENDER_KEY signer is not registered for the chain Apify is asking for")
    console.log("  - Apify endpoint expects a different payload shape — check actor docs")
  }
}

async function main() {
  // touch decoderErc20Abi so the import is intentional (kept for future selector-aware diag)
  void decoderErc20Abi
  const preflightResult = await preflight()
  if (!preflightResult) {
    console.log("\nAborting before live call. Fix the issues above and re-run.")
    process.exit(1)
  }
  await liveCall(preflightResult.actor)
}

main().catch((err) => {
  console.error("FAIL", err instanceof Error ? err.message : err)
  process.exit(1)
})
