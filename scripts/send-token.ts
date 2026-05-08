// End-to-end multichain transfer test.
//   - Sends a tiny amount of ETH on Sepolia AND Base Sepolia
//   - Recipient is an ENS name (resolved on Sepolia)
//   - Proves: chain selection, ENS resolution, gas pre-flight, on-chain receipt
//
// Run: pnpm send:token            (defaults: 0.0001 ETH each chain → daniel.ethtwin.eth)
//      AMOUNT_ETH=0.0005 pnpm send:token
//      RECIPIENT=0x... TOKEN=USDC pnpm send:token
//
// CHAINS env (comma-separated): "sepolia,base-sepolia" (default), or just "sepolia", or "base-sepolia"

import { getAddress } from "viem"
import { parseRecipient, sendToken, getTokenBalance, type SupportedChain, type SupportedToken } from "../lib/transfers"
import { getDevWalletClient } from "../lib/viem"
import { sepolia } from "viem/chains"

const RECIPIENT = process.env.RECIPIENT ?? "daniel.ethtwin.eth"
const TOKEN = (process.env.TOKEN ?? "ETH") as SupportedToken
const AMOUNT = process.env.AMOUNT_ETH ?? process.env.AMOUNT ?? "0.0001"
const CHAINS_INPUT = (process.env.CHAINS ?? "sepolia,base-sepolia")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean) as SupportedChain[]

function logHeader(s: string) {
  console.log(`\n── ${s} ${"─".repeat(Math.max(0, 76 - s.length))}`)
}

function pretty(label: string, value: unknown) {
  console.log(`  ${label.padEnd(28)} ${typeof value === "string" ? value : JSON.stringify(value)}`)
}

async function main() {
  const { account } = getDevWalletClient(sepolia)

  logHeader("Setup")
  pretty("sender wallet", account.address)
  pretty("recipient input", RECIPIENT)
  pretty("token", TOKEN)
  pretty("amount", `${AMOUNT} ${TOKEN}`)
  pretty("chains", CHAINS_INPUT.join(", "))

  // Resolve once for clarity (sendToken does it again, but we want to print).
  const resolved = await parseRecipient(RECIPIENT)
  pretty("recipient address", `${resolved} ${resolved === getAddress(account.address) ? "(self)" : ""}`)

  const results: Array<{ chain: SupportedChain; ok: boolean; line: string; url?: string }> = []

  for (const chain of CHAINS_INPUT) {
    logHeader(`Chain: ${chain}`)

    // Pre-flight balance read
    try {
      const balance = await getTokenBalance({ chain, token: TOKEN, address: account.address })
      pretty("sender balance", `${balance.human} ${TOKEN}`)
    } catch (err) {
      console.log(`WARN  could not read balance: ${err instanceof Error ? err.message : err}`)
    }

    console.log(`PEND  broadcasting ${AMOUNT} ${TOKEN} on ${chain}...`)
    try {
      const result = await sendToken({ chain, token: TOKEN, to: RECIPIENT, amount: AMOUNT })
      pretty("tx hash", result.txHash)
      pretty("block", result.blockNumber.toString())
      pretty("explorer", result.blockExplorerUrl)
      results.push({
        chain,
        ok: true,
        line: `${AMOUNT} ${TOKEN} → ${result.to}`,
        url: result.blockExplorerUrl,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.log(`FAIL  ${msg}`)
      results.push({ chain, ok: false, line: msg })
    }
  }

  logHeader("Summary")
  for (const r of results) {
    const status = r.ok ? "OK  " : "FAIL"
    console.log(`  ${status}  [${r.chain}]  ${r.line}`)
    if (r.url) console.log(`        ${r.url}`)
  }
}

main().catch((err) => {
  console.error("FAIL", err instanceof Error ? err.message : err)
  process.exit(1)
})
