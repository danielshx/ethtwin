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

  // Sanity: confirm bytecode is non-empty. viem 2.x uses `getCode`; the
  // older `getBytecode` alias is gone, which is why this used to false-alarm.
  try {
    const code = await sepoliaClient.getCode({ address: receipt.contractAddress })
    if (!code || code === "0x") {
      console.warn("[deploy-factory] note: deployed bytecode read returned empty")
    }
  } catch (err) {
    console.warn(
      "[deploy-factory] sanity-check getCode failed (non-fatal):",
      err instanceof Error ? err.message : err,
    )
  }
  if (!Array.isArray(factoryAbi) || factoryAbi.length === 0) {
    console.warn("[deploy-factory] note: factory ABI looks empty — rebuild contracts")
  }
}

main().catch((err) => {
  console.error("[deploy-factory] FAIL:", err instanceof Error ? err.message : err)
  process.exit(1)
})
