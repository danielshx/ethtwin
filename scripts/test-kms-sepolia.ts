// End-to-end Sepolia smoke test for the KMS-backed viem account.
//
//   pnpm test:kms-sepolia
//
// First run: mints a fresh ETHEREUM key in KMS, prints the address, caches
// it in `.kms-smoke-key.json`, and exits if the address has zero ETH.
//
// Second + later runs: reuses the cached KeyId/address (so the address is
// stable across runs), re-checks the balance, and once funded broadcasts a
// real 0-value self-send signed via the KMS adapter — proving the full
// viem-flavoured Sepolia roundtrip.
//
// Reset by deleting `.kms-smoke-key.json`.

import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { sepolia } from "viem/chains"
import { createPublicClient, http, parseEther, type Address } from "viem"
import { createTwinKey, kmsAccount } from "../lib/kms"

const CACHE_PATH = ".kms-smoke-key.json"

type Cached = { keyId: string; address: Address }

function loadCache(): Cached | null {
  if (!existsSync(CACHE_PATH)) return null
  try {
    const raw = JSON.parse(readFileSync(CACHE_PATH, "utf8"))
    if (typeof raw.keyId === "string" && typeof raw.address === "string") {
      return { keyId: raw.keyId, address: raw.address as Address }
    }
  } catch {
    // ignore
  }
  return null
}
function saveCache(c: Cached) {
  writeFileSync(CACHE_PATH, JSON.stringify(c, null, 2))
}

async function main() {
  let cached = loadCache()
  if (cached) {
    console.log(`[kms-sepolia] reusing cached key from ${CACHE_PATH}`)
  } else {
    console.log("[kms-sepolia] minting fresh ETHEREUM key…")
    const key = await createTwinKey("sepolia-smoke")
    cached = { keyId: key.keyId, address: key.address }
    saveCache(cached)
    console.log("  KeyId  :", key.keyId)
    console.log("  Address:", key.address)
    console.log(
      `\n⚠️  This is a brand-new address. Fund it with a tiny bit of Sepolia ETH:` +
        `\n      https://sepoliafaucet.com  →  paste ${key.address}` +
        `\n   then run \`pnpm test:kms-sepolia\` again — the cached key is reused so the address won't change.\n`,
    )
  }
  const key = cached

  const client = createPublicClient({
    chain: sepolia,
    transport: http(
      process.env.SEPOLIA_RPC ??
        "https://eth-sepolia.g.alchemy.com/v2/VnDHq7fsAyloEY3w9oQGK",
    ),
  })

  const balance = await client.getBalance({ address: key.address })
  console.log("Current balance:", balance, "wei")
  if (balance < 100_000_000_000_000n) {
    console.log(
      "Balance below ~0.0001 ETH — fund the address and re-run. Exiting cleanly.",
    )
    return
  }

  const account = kmsAccount({ keyId: key.keyId, address: key.address })

  const nonce = await client.getTransactionCount({
    address: key.address,
    blockTag: "pending",
  })
  console.log("nonce:", nonce)

  // Build a self-send 0-value EIP-1559 tx.
  const tx = {
    chainId: sepolia.id,
    type: "eip1559" as const,
    to: key.address,
    value: parseEther("0"),
    data: "0x" as const,
    nonce,
    gas: 21_000n,
    maxFeePerGas: 5_000_000_000n,
    maxPriorityFeePerGas: 1_500_000_000n,
  }

  console.log("[kms-sepolia] signing via KMS…")
  const signed = await account.signTransaction(tx)
  console.log("  signed length:", signed.length, "chars")

  console.log("[kms-sepolia] broadcasting…")
  const txHash = await client.sendRawTransaction({ serializedTransaction: signed })
  console.log("  tx:", txHash)
  console.log("  explorer:", `https://sepolia.etherscan.io/tx/${txHash}`)

  console.log("[kms-sepolia] waiting for receipt…")
  const receipt = await client.waitForTransactionReceipt({ hash: txHash })
  console.log("  status :", receipt.status)
  console.log("  block  :", receipt.blockNumber.toString())
  console.log("  gasUsed:", receipt.gasUsed.toString())
  if (receipt.status === "success") {
    console.log("\n✅ KMS-signed Sepolia tx landed. KMS adapter works end-to-end.")
  } else {
    console.error("\n❌ Tx mined but reverted.")
    process.exit(1)
  }
}

main().catch((err) => {
  console.error("\n❌ KMS Sepolia smoke test failed:")
  console.error(err)
  process.exit(1)
})
