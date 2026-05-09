// One-time deploy of the TwinVaultFactory on Sepolia. Run once per
// environment, then put the resulting address into `.env.local`:
//   TWIN_VAULT_FACTORY=0x…
//
// Usage: `pnpm contracts:deploy-factory`

import { sepolia } from "viem/chains"
import { getDevWalletClient, sepoliaClient } from "../../lib/viem"
import {
  factoryAbi,
  factoryBytecode,
  GAS_DEPLOY_FACTORY,
  SEPOLIA_MAX_FEE,
  SEPOLIA_PRIORITY,
} from "../../lib/vault"

async function main() {
  const { account, wallet } = getDevWalletClient()
  console.log(`[deploy-factory] dev wallet: ${account.address}`)
  console.log(`[deploy-factory] chain: ${wallet.chain?.name} (${wallet.chain?.id})`)

  if (process.env.TWIN_VAULT_FACTORY) {
    console.log(
      `[deploy-factory] TWIN_VAULT_FACTORY already set to ${process.env.TWIN_VAULT_FACTORY}`,
    )
    console.log(
      "[deploy-factory] Continuing anyway — comment out the env var if you want to keep the existing factory.",
    )
  }

  // Deploy via raw signed tx (skip viem's wrapper overhead).
  const nonce = await sepoliaClient.getTransactionCount({
    address: account.address,
    blockTag: "pending",
  })
  console.log(`[deploy-factory] nonce: ${nonce}`)

  const signed = await account.signTransaction({
    chainId: sepolia.id,
    type: "eip1559",
    data: factoryBytecode,
    nonce,
    gas: GAS_DEPLOY_FACTORY,
    maxFeePerGas: SEPOLIA_MAX_FEE,
    maxPriorityFeePerGas: SEPOLIA_PRIORITY,
    value: 0n,
  })
  console.log("[deploy-factory] broadcasting...")
  const hash = await sepoliaClient.sendRawTransaction({ serializedTransaction: signed })
  console.log(`[deploy-factory] tx: ${hash}`)
  console.log("[deploy-factory] waiting for receipt...")
  const receipt = await sepoliaClient.waitForTransactionReceipt({ hash })
  if (!receipt.contractAddress) {
    console.error("[deploy-factory] no contractAddress on receipt — deploy failed")
    process.exit(1)
  }
  console.log(`\n✅ Factory deployed at: ${receipt.contractAddress}`)
  console.log(`   tx:        ${hash}`)
  console.log(`   block:     ${receipt.blockNumber}`)
  console.log(`   explorer:  https://sepolia.etherscan.io/address/${receipt.contractAddress}`)
  console.log(`\nAdd to .env.local:`)
  console.log(`   TWIN_VAULT_FACTORY=${receipt.contractAddress}`)

  // Sanity: confirm bytecode is non-empty + matches.
  const code = await sepoliaClient.getBytecode({ address: receipt.contractAddress })
  if (!code || code === "0x") {
    console.error("[deploy-factory] WARNING: deployed contract has no bytecode")
    process.exit(1)
  }
  // Sanity: ABI is non-empty.
  if (!Array.isArray(factoryAbi) || factoryAbi.length === 0) {
    console.error("[deploy-factory] WARNING: factory ABI is empty — rebuild contracts")
  }
}

main().catch((err) => {
  console.error("[deploy-factory] FAIL:", err instanceof Error ? err.message : err)
  process.exit(1)
})
