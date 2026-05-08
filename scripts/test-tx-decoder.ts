// Decodes the actual transactions we sent in the previous step (ENS provisioning + greeting),
// plus a synthetic ETH transfer + USDC transfer for coverage.

import { sepoliaClient } from "../lib/viem"
import { decodeTx, describeTx } from "../lib/tx-decoder"
import type { Address, Hex } from "viem"
import { getAddress } from "viem"

const REAL_TXS: { label: string; hash: `0x${string}` }[] = [
  { label: "createSubname (daniel.ethtwin.eth)", hash: "0xdce00e61e4a25f99280c8c8016b21109a2c137ace96f1292c898ba4ca7e868ec" },
  { label: "setAddr daniel.ethtwin.eth → wallet", hash: "0xbc57c3ebd641001056bc4dab7bca657c7708bc46020fe02625ddee20146d8c2e" },
  { label: "setText greeting", hash: "0x321bae50472f5338b2a6484cf14e52de23596a28f717aa797d8fde7715088aef" },
]

function logHeader(s: string) {
  console.log(`\n── ${s} ${"─".repeat(Math.max(0, 76 - s.length))}`)
}

async function decodeReal(label: string, hash: `0x${string}`) {
  logHeader(label)
  const tx = await sepoliaClient.getTransaction({ hash })
  const { decoded, english } = await describeTx({
    to: tx.to as Address,
    data: tx.input as Hex,
    value: tx.value,
    chainId: tx.chainId,
  })
  console.log(`  contract:      ${decoded.contractName}`)
  console.log(`  function:      ${decoded.functionName}`)
  console.log(`  selector:      ${decoded.selector} (matched=${decoded.matched})`)
  for (const a of decoded.args) console.log(`    ${a.name} (${a.type}) = ${formatVal(a.value)}`)
  console.log(`  english:       ${english}`)
}

function decodeSynthetic(
  label: string,
  to: Address,
  data: Hex,
  value: bigint = 0n,
) {
  logHeader(label)
  const decoded = decodeTx({ to, data, value })
  console.log(`  contract:      ${decoded.contractName}`)
  console.log(`  function:      ${decoded.functionName}`)
  console.log(`  selector:      ${decoded.selector} (matched=${decoded.matched})`)
  for (const a of decoded.args) console.log(`    ${a.name} (${a.type}) = ${formatVal(a.value)}`)
  console.log(`  english:       ${decoded.summary}`)
}

function formatVal(v: unknown): string {
  if (typeof v === "bigint") return v.toString()
  return JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x))
}

async function main() {
  // Real on-chain txs we just sent.
  for (const t of REAL_TXS) {
    try {
      await decodeReal(t.label, t.hash)
    } catch (err) {
      console.log(`FAIL  ${t.label}:`, err instanceof Error ? err.message : err)
    }
  }

  // Synthetic ETH transfer (no calldata).
  decodeSynthetic(
    "synthetic: pure ETH transfer",
    getAddress("0x4E09c220BD556396Bc255A4DD24F858Bafeba6f5"),
    "0x" as Hex,
    1500000000000000000n,
  )

  // Synthetic USDC.transfer on Base Sepolia (recognized by KNOWN_CONTRACTS).
  // selector: a9059cbb (transfer); args: to=0x4E09…a6f5, amount=1_000_000 (1 USDC, 6 decimals).
  decodeSynthetic(
    "synthetic: USDC.transfer (Base Sepolia)",
    getAddress("0x036CbD53842c5426634e7929541eC2318f3dCF7e"),
    ("0xa9059cbb000000000000000000000000" +
      "4E09c220BD556396Bc255A4DD24F858Bafeba6f5".toLowerCase() +
      "00000000000000000000000000000000000000000000000000000000000F4240") as Hex,
  )

  // Synthetic unknown selector — should hit the "(Calldata not recognized.)" path.
  decodeSynthetic(
    "synthetic: unrecognized selector",
    getAddress("0x4E09c220BD556396Bc255A4DD24F858Bafeba6f5"),
    "0xdeadbeef" as Hex,
  )
}

main().catch((err) => {
  console.error("FAIL", err instanceof Error ? err.message : err)
  process.exit(1)
})
