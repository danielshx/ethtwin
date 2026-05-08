// Twin sends USDC to an ENS recipient — via a one-time stealth address.
// End-to-end demo of the privacy-by-default payment flow.
//
//   sender wallet  : DEV_WALLET_PRIVATE_KEY
//   chain          : Base Sepolia
//   recipient ENS  : RECIPIENT_ENS env var (default: daniel.ethtwin.eth)
//   amount         : AMOUNT_USDC env var (default: 0.01 USDC = 10000 base units)
//
// Prereqs:
//   1. Recipient ENS has a stealth-meta-address text record (run pnpm ens:stealth-provision first)
//   2. Sender wallet has USDC on Base Sepolia + ETH for gas
//
// Run: pnpm send:stealth-usdc

import { formatUnits, getAddress, type Address } from "viem"
import { baseSepolia } from "viem/chains"
import { baseSepoliaClient, getDevWalletClient } from "../lib/viem"
import {
  USDC_BASE_SEPOLIA,
  USDC_DECIMALS,
  getUsdcBalanceBaseSepolia,
  sendStealthUSDC,
} from "../lib/payments"

const RECIPIENT_ENS = process.env.RECIPIENT_ENS ?? "daniel.ethtwin.eth"
const AMOUNT_USDC = process.env.AMOUNT_USDC ?? "0.01"

function logHeader(s: string) {
  console.log(`\n── ${s} ${"─".repeat(Math.max(0, 76 - s.length))}`)
}

function pretty(label: string, value: unknown) {
  console.log(`  ${label.padEnd(28)} ${typeof value === "string" ? value : JSON.stringify(value)}`)
}

async function main() {
  const { account } = getDevWalletClient(baseSepolia)

  logHeader("Setup")
  pretty("sender wallet", account.address)
  pretty("recipient ENS", RECIPIENT_ENS)
  pretty("amount", `${AMOUNT_USDC} USDC`)
  pretty("chain", `Base Sepolia (${baseSepolia.id})`)
  pretty("USDC asset", USDC_BASE_SEPOLIA)

  // Pre-flight balances
  logHeader("Pre-flight")
  const [senderEth, senderUsdc] = await Promise.all([
    baseSepoliaClient.getBalance({ address: account.address }),
    getUsdcBalanceBaseSepolia(account.address),
  ])
  pretty("sender ETH (gas)", `${formatUnits(senderEth, 18)} ETH`)
  pretty("sender USDC", `${formatUnits(senderUsdc, USDC_DECIMALS)} USDC`)
  if (senderEth === 0n) {
    console.log("FAIL  Sender has 0 ETH on Base Sepolia — no gas for the tx.")
    process.exit(1)
  }

  // Send
  logHeader("Send")
  console.log(`PEND  resolving ${RECIPIENT_ENS}, deriving stealth address, broadcasting tx...`)
  const result = await sendStealthUSDC({
    recipientEnsName: RECIPIENT_ENS,
    amountUsdc: AMOUNT_USDC,
  })

  pretty("recipient ENS", result.recipient.ens)
  pretty("ENS → wallet (cosmetic)", result.recipient.resolvedAddress ?? "(no addr record)")
  pretty("→ stealth address", result.stealth.stealthAddress)
  pretty("ephemeral pubkey", result.stealth.ephemeralPublicKey)
  pretty("view tag", result.stealth.viewTag)
  pretty("cosmic seeded", result.stealth.cosmicSeeded)
  pretty("amount sent", `${result.amountHuman} USDC`)
  pretty("tx hash", result.txHash)
  pretty("block", result.blockNumber.toString())

  // Verify funds arrived. Retry briefly because the public Base Sepolia RPC
  // sometimes lags behind the tx receipt (eventual consistency on `balanceOf`).
  logHeader("Verify on-chain")
  const stealthAddr = getAddress(result.stealth.stealthAddress)
  let stealthBalance = 0n
  let attempt = 0
  for (; attempt < 5; attempt++) {
    stealthBalance = await getUsdcBalanceBaseSepolia(stealthAddr)
    if (stealthBalance >= result.amount) break
    await new Promise((r) => setTimeout(r, 1500))
  }
  pretty("stealth USDC balance", `${formatUnits(stealthBalance, USDC_DECIMALS)} USDC`)
  pretty("verify attempts", attempt + 1)
  if (stealthBalance >= result.amount) {
    console.log(`OK    stealth address received the payment`)
  } else {
    console.log(
      `WARN  stealth address holds ${formatUnits(stealthBalance, USDC_DECIMALS)} USDC ` +
        `(expected ≥ ${result.amountHuman}) — likely RPC lag; tx already mined per receipt.`,
    )
  }

  console.log(`\nBlock explorer:\n  ${result.blockExplorerUrl}`)
  console.log(
    `\nFor recipient to claim:\n  ` +
      `pass ephemeralPublicKey + viewTag to recipient → recipient runs deriveStealthPrivateKey()\n  ` +
      `→ recipient now controls a wallet at ${result.stealth.stealthAddress}\n  ` +
      `→ recipient can sweep the ${result.amountHuman} USDC anywhere.`,
  )
}

main().catch((err) => {
  console.error("FAIL", err instanceof Error ? err.message : err)
  process.exit(1)
})
