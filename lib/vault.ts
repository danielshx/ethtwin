// Server-side helpers for the per-user TwinVault smart contract.
//
// Architecture recap:
//   * Each wallet-onboarded user gets their own `TwinVault` deployed via
//     `TwinVaultFactory.deploy(userWallet, devWallet)`.
//   * Email-only Privy users skip the vault entirely — their flows stay on
//     the dev wallet path (lib/transfers.ts → /api/transfer).
//   * The agent (dev wallet) calls `vault.spend(token, to, amount)` to make
//     transfers on the user's behalf, with on-chain per-tx + per-period caps.
//   * The user is the contract `owner`: they alone can withdraw, change
//     limits, rotate the agent, or transfer ownership.
//
// All on-chain reads here use the fast direct-RPC path; all writes use raw
// signed txs broadcast via `sendRawTransaction` to avoid viem's wrapper
// overhead that's been timing out on Vercel.

import {
  encodeFunctionData,
  decodeEventLog,
  type Address,
  type Hash,
  type Hex,
} from "viem"
import { sepolia } from "viem/chains"
import { getDevWalletClient, sepoliaClient } from "./viem"
import vaultArtifact from "@/contracts/artifacts/TwinVault.json"
import factoryArtifact from "@/contracts/artifacts/TwinVaultFactory.json"

export const vaultAbi = vaultArtifact.abi
export const factoryAbi = factoryArtifact.abi
export const vaultBytecode = vaultArtifact.bytecode as Hex
export const factoryBytecode = factoryArtifact.bytecode as Hex

// Default limits the agent gets at vault deploy time. The user can change
// these via `vault.setLimits(...)` from their own wallet at any time.
//   ETH: 0.01 per tx, 0.1 per 24h
//   USDC: 1 per tx, 10 per 24h
const ZERO: Address = "0x0000000000000000000000000000000000000000"
const ETH_TOKEN: Address = ZERO
// USDC contract addresses on the chains we support. Same list as transfers.ts.
const USDC_BY_CHAIN: Record<"sepolia" | "base-sepolia", Address> = {
  sepolia: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
  "base-sepolia": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
}

const ONE_DAY = 86_400
const DEFAULT_LIMITS = {
  eth: {
    perTxCap: 10_000_000_000_000_000n, // 0.01 ETH (1e16 wei)
    perPeriodCap: 100_000_000_000_000_000n, // 0.1 ETH (1e17 wei)
    period: BigInt(ONE_DAY),
  },
  usdc: {
    perTxCap: 1_000_000n, // 1 USDC (6 decimals)
    perPeriodCap: 10_000_000n, // 10 USDC
    period: BigInt(ONE_DAY),
  },
}

// Conservative gas budgets — Sepolia is permissive but we want to skip
// `eth_estimateGas` to avoid the same Vercel timeouts the rest of the app
// already side-stepped. These were tuned with a margin against actual usage.
const GAS_DEPLOY_VAULT = 1_500_000n
const GAS_DEPLOY_FACTORY = 700_000n
const GAS_VAULT_OP = 300_000n // setLimits, setAgent, withdraw, spend
const SEPOLIA_MAX_FEE = 5_000_000_000n // 5 gwei
const SEPOLIA_PRIORITY = 1_500_000_000n // 1.5 gwei

function vaultEnv(): { factoryAddress: Address | null } {
  const raw = process.env.TWIN_VAULT_FACTORY?.trim()
  if (raw && raw.startsWith("0x") && raw.length === 42) {
    return { factoryAddress: raw as Address }
  }
  return { factoryAddress: null }
}

/**
 * Address of the deployed factory on Sepolia. Set
 * `TWIN_VAULT_FACTORY=0x…` in `.env.local` after running
 * `pnpm contracts:deploy-factory`.
 */
export function getFactoryAddress(): Address {
  const { factoryAddress } = vaultEnv()
  if (!factoryAddress) {
    throw new Error(
      "TWIN_VAULT_FACTORY env var not set. Deploy the factory with `pnpm contracts:deploy-factory` and add the address to .env.local.",
    )
  }
  return factoryAddress
}

export function isVaultEnabled(): boolean {
  return vaultEnv().factoryAddress !== null
}

// ─────────────────────────────────────────────────────────────────────────────
// Deploy
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Deploy a new vault for `userWallet`, with the dev wallet as agent.
 * Reads back the deployed address from the factory's `VaultDeployed` event.
 */
export async function deployVaultForUser(
  userWallet: Address,
): Promise<{ vault: Address; deployTx: Hash }> {
  const { account } = getDevWalletClient()
  const factory = getFactoryAddress()

  const data = encodeFunctionData({
    abi: factoryAbi,
    functionName: "deploy",
    args: [userWallet, account.address],
  })
  const nonce = await sepoliaClient.getTransactionCount({
    address: account.address,
    blockTag: "pending",
  })
  const signed = await account.signTransaction({
    chainId: sepolia.id,
    type: "eip1559",
    to: factory,
    data,
    nonce,
    gas: GAS_DEPLOY_VAULT,
    maxFeePerGas: SEPOLIA_MAX_FEE,
    maxPriorityFeePerGas: SEPOLIA_PRIORITY,
    value: 0n,
  })
  const deployTx = await sepoliaClient.sendRawTransaction({
    serializedTransaction: signed,
  })
  const receipt = await sepoliaClient.waitForTransactionReceipt({
    hash: deployTx,
  })
  // Parse the VaultDeployed event off the receipt.
  let vault: Address | null = null
  for (const log of receipt.logs) {
    try {
      const parsed = decodeEventLog({
        abi: factoryAbi,
        data: log.data,
        topics: log.topics,
      })
      if (parsed.eventName === "VaultDeployed") {
        const args = parsed.args as { vault?: Address; owner?: Address }
        if (args.vault) {
          vault = args.vault
          break
        }
      }
    } catch {
      // not our event — skip
    }
  }
  if (!vault) {
    throw new Error("VaultDeployed event not found in factory deploy receipt")
  }
  return { vault, deployTx }
}

/**
 * Apply our default per-tx / per-period limits to a freshly deployed vault.
 * Called once at onboarding by the dev wallet — wait, this actually has to
 * be called by the *owner* (the user). Since we can't do that server-side,
 * we expose it as a client-side action: see `setVaultLimitsClient` in
 * lib/vault-client.ts (TBD), called when the user signs the first time.
 *
 * We still expose this here for tests + scripts.
 */
export async function setVaultLimitsAsOwner(
  vault: Address,
  ownerKey: Hex,
  token: Address,
  perTxCap: bigint,
  perPeriodCap: bigint,
  periodSeconds: bigint,
): Promise<Hash> {
  // This path is for tests / scripts only; in production the user's own
  // wallet signs setLimits via lib/vault-client.ts.
  void vault
  void ownerKey
  void token
  void perTxCap
  void perPeriodCap
  void periodSeconds
  throw new Error(
    "setVaultLimitsAsOwner is intentionally not implemented server-side — owner ops must be signed by the user's wallet on the client.",
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Spend (agent op — server-side dev wallet signs)
// ─────────────────────────────────────────────────────────────────────────────

/** Spend ETH or an ERC-20 from the vault, signed by the dev-wallet agent. */
export async function spendFromVault(
  vault: Address,
  token: Address,
  to: Address,
  amount: bigint,
): Promise<{ txHash: Hash; blockExplorerUrl: string }> {
  const { account } = getDevWalletClient()
  const data = encodeFunctionData({
    abi: vaultAbi,
    functionName: "spend",
    args: [token, to, amount],
  })
  const nonce = await sepoliaClient.getTransactionCount({
    address: account.address,
    blockTag: "pending",
  })
  const signed = await account.signTransaction({
    chainId: sepolia.id,
    type: "eip1559",
    to: vault,
    data,
    nonce,
    gas: GAS_VAULT_OP,
    maxFeePerGas: SEPOLIA_MAX_FEE,
    maxPriorityFeePerGas: SEPOLIA_PRIORITY,
    value: 0n,
  })
  const txHash = await sepoliaClient.sendRawTransaction({
    serializedTransaction: signed,
  })
  return {
    txHash,
    blockExplorerUrl: `https://sepolia.etherscan.io/tx/${txHash}`,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Reads
// ─────────────────────────────────────────────────────────────────────────────

export async function readVaultOwner(vault: Address): Promise<Address> {
  return sepoliaClient.readContract({
    address: vault,
    abi: vaultAbi,
    functionName: "owner",
  }) as Promise<Address>
}

export async function readVaultAgent(vault: Address): Promise<Address> {
  return sepoliaClient.readContract({
    address: vault,
    abi: vaultAbi,
    functionName: "agent",
  }) as Promise<Address>
}

export async function readSpendableNow(
  vault: Address,
  token: Address,
): Promise<bigint> {
  return sepoliaClient.readContract({
    address: vault,
    abi: vaultAbi,
    functionName: "spendableNow",
    args: [token],
  }) as Promise<bigint>
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants exposed for the rest of the codebase
// ─────────────────────────────────────────────────────────────────────────────

export const VAULT_TOKEN_ETH = ETH_TOKEN
export const USDC_ADDR_BY_CHAIN = USDC_BY_CHAIN
export { DEFAULT_LIMITS }
export {
  GAS_DEPLOY_VAULT,
  GAS_DEPLOY_FACTORY,
  GAS_VAULT_OP,
  SEPOLIA_MAX_FEE,
  SEPOLIA_PRIORITY,
}
