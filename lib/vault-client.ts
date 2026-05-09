"use client"

// Client-side TwinVault helpers. These are the "owner ops" — calls the
// USER's wallet must sign personally (Privy / MetaMask via wagmi or directly
// the embedded smart wallet client). Server-side spend / agent ops live in
// `lib/vault.ts`.
//
// All addresses returned are checksummed.

import {
  encodeFunctionData,
  parseEther,
  parseUnits,
  type Address,
  type Hex,
  type WalletClient,
} from "viem"
import vaultArtifact from "@/contracts/artifacts/TwinVault.json"

export const vaultAbi = vaultArtifact.abi

export const VAULT_ETH_TOKEN: Address = "0x0000000000000000000000000000000000000000"

/**
 * Configure ETH and USDC spend limits on a freshly deployed vault. The
 * user's wallet client signs each tx — we encode + return the call data so
 * the caller can pump it through Privy's smart wallet, an EOA, etc.
 */
export function encodeSetLimits(args: {
  token: Address
  perTxCap: bigint
  perPeriodCap: bigint
  periodSeconds: bigint
}): Hex {
  return encodeFunctionData({
    abi: vaultAbi,
    functionName: "setLimits",
    args: [args.token, args.perTxCap, args.perPeriodCap, args.periodSeconds],
  })
}

export function encodeWithdraw(args: {
  token: Address
  to: Address
  amount: bigint
}): Hex {
  return encodeFunctionData({
    abi: vaultAbi,
    functionName: "withdraw",
    args: [args.token, args.to, args.amount],
  })
}

export function encodeRotateAgent(newAgent: Address): Hex {
  return encodeFunctionData({
    abi: vaultAbi,
    functionName: "setAgent",
    args: [newAgent],
  })
}

export function encodeTransferOwnership(newOwner: Address): Hex {
  return encodeFunctionData({
    abi: vaultAbi,
    functionName: "transferOwnership",
    args: [newOwner],
  })
}

/**
 * Generic helper: write an owner-signed tx to the vault.
 * `walletClient` is whatever viem `WalletClient` the user has connected
 * (Privy embedded smart wallet, injected EOA, etc.). The function only
 * encodes the call — the wallet decides chain + gas.
 */
export async function sendVaultTx(
  walletClient: WalletClient,
  vault: Address,
  data: Hex,
  value: bigint = 0n,
): Promise<Hex> {
  const account = walletClient.account
  if (!account) throw new Error("Wallet client has no connected account")
  if (!walletClient.chain) throw new Error("Wallet client has no chain")
  return walletClient.sendTransaction({
    account,
    chain: walletClient.chain,
    to: vault,
    data,
    value,
  })
}

/** Deposit native ETH into the vault — just send ETH to the vault address. */
export async function depositEth(
  walletClient: WalletClient,
  vault: Address,
  amountEth: string,
): Promise<Hex> {
  const account = walletClient.account
  if (!account) throw new Error("Wallet client has no connected account")
  if (!walletClient.chain) throw new Error("Wallet client has no chain")
  return walletClient.sendTransaction({
    account,
    chain: walletClient.chain,
    to: vault,
    value: parseEther(amountEth),
  })
}

/**
 * Deposit USDC: call the USDC contract's `transfer(vault, amount)` from the
 * user's wallet. No vault-side approval needed — vault accepts pulled and
 * pushed tokens identically.
 */
export async function depositUsdc(
  walletClient: WalletClient,
  vault: Address,
  usdcContract: Address,
  amountUsdc: string,
): Promise<Hex> {
  const account = walletClient.account
  if (!account) throw new Error("Wallet client has no connected account")
  if (!walletClient.chain) throw new Error("Wallet client has no chain")
  const erc20TransferAbi = [
    {
      name: "transfer",
      type: "function",
      stateMutability: "nonpayable",
      inputs: [
        { name: "to", type: "address" },
        { name: "amount", type: "uint256" },
      ],
      outputs: [{ name: "", type: "bool" }],
    },
  ] as const
  const data = encodeFunctionData({
    abi: erc20TransferAbi,
    functionName: "transfer",
    args: [vault, parseUnits(amountUsdc, 6)],
  })
  return walletClient.sendTransaction({
    account,
    chain: walletClient.chain,
    to: usdcContract,
    data,
  })
}
