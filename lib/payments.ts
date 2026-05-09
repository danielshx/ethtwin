// Stealth USDC payments — the demo-defining flow.
//
//   sender     : the dev wallet (DEV_WALLET_PRIVATE_KEY)
//   recipient  : an ENS name with a `stealth-meta-address` text record
//   chain      : Base Sepolia (where the dev wallet holds USDC)
//
// Flow:
//   1. Resolve recipient ENS → wallet address (cosmetic, for UI)
//   2. Read recipient's stealth-meta-address from ENS text record
//   3. Generate a one-time stealth address (ScopeLift SDK, optionally cosmic-seeded)
//   4. USDC.transfer(stealthAddress, amount) on Base Sepolia
//   5. Wait for the receipt and return everything the demo needs to render.

import {
  formatUnits,
  parseUnits,
  type Address,
  type Hash,
} from "viem"
import { baseSepolia } from "viem/chains"
import { baseSepoliaClient, getDevWalletClient } from "./viem"
import { resolveEnsAddress, readTextRecordFast } from "./ens"
import {
  deriveTwinStealthKeys,
  generatePrivateAddress,
  type StealthResult,
} from "./stealth"

// USDC on Base Sepolia (Circle, 6 decimals).
export const USDC_BASE_SEPOLIA: Address = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
export const USDC_DECIMALS = 6

const usdcAbi = [
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
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const

export type StealthPaymentResult = {
  recipient: { ens: string; resolvedAddress: Address | null }
  stealth: StealthResult
  txHash: Hash
  blockNumber: bigint
  blockExplorerUrl: string
  amount: bigint
  amountHuman: string
}

/** Read the dev wallet's USDC balance on Base Sepolia. */
export async function getUsdcBalanceBaseSepolia(addr: Address): Promise<bigint> {
  return baseSepoliaClient.readContract({
    address: USDC_BASE_SEPOLIA,
    abi: usdcAbi,
    functionName: "balanceOf",
    args: [addr],
  })
}

/**
 * Send `amountUsdc` (human-readable, e.g. 0.1) of USDC on Base Sepolia
 * to a one-time stealth address derived from the recipient's ENS-published meta-key.
 */
export async function sendStealthUSDC(args: {
  recipientEnsName: string
  amountUsdc: number | string
}): Promise<StealthPaymentResult> {
  const { recipientEnsName, amountUsdc } = args

  // 1. Cosmetic: forward-resolve the ENS to the user's wallet (not where funds go).
  const resolvedAddress = await resolveEnsAddress(recipientEnsName)

  // 2. Read recipient's stealth meta-address URI from ENS text record.
  // Use the fast direct-resolver path (bypasses CCIP-Read / Universal
  // Resolver, which fails silently on our setup). If the recipient was
  // minted before the deterministic deriveTwinStealthKeys integration,
  // the on-chain text record is either empty or contains the old garbage
  // cosmic-attestation hash; fall back to server-side derivation so old
  // twins still receive stealth payments. Both routes produce the SAME
  // meta-address per twin (HMAC of dev master + twin ENS).
  const onChainMeta = await readTextRecordFast(
    recipientEnsName,
    "stealth-meta-address",
  ).catch(() => "")
  const isValidMetaURI =
    typeof onChainMeta === "string" &&
    /^st:eth:0x[0-9a-fA-F]{132}$/.test(onChainMeta)
  let metaURI: string
  if (isValidMetaURI) {
    metaURI = onChainMeta
  } else {
    try {
      metaURI = deriveTwinStealthKeys(recipientEnsName).stealthMetaAddressURI
    } catch (err) {
      throw new Error(
        `${recipientEnsName} has no stealth-meta-address text record and we ` +
          `couldn't derive one. Make sure the ENS name lives under the parent ` +
          `domain (.ethtwin.eth) and re-mint the twin if it's old.\n` +
          `cause: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  // 3. Generate a one-time stealth address for this payment.
  const stealth = await generatePrivateAddress(metaURI)
  if (stealth.mocked) {
    throw new Error(
      `Stealth SDK fell back to mock — refusing to send real USDC to a fake address. ` +
        `Investigate the SDK warning above before retrying.`,
    )
  }

  // 4. USDC.transfer(stealthAddress, amount) on Base Sepolia.
  const amount = parseUnits(String(amountUsdc), USDC_DECIMALS)
  const { wallet, account } = getDevWalletClient(baseSepolia)

  // Pre-flight: don't broadcast a tx that will revert on insufficient balance.
  const senderBalance = await getUsdcBalanceBaseSepolia(account.address)
  if (senderBalance < amount) {
    throw new Error(
      `Sender ${account.address} has ${formatUnits(senderBalance, USDC_DECIMALS)} USDC on Base Sepolia, ` +
        `needs ${formatUnits(amount, USDC_DECIMALS)}.`,
    )
  }

  // Fire-and-forget broadcast — fits Vercel timeouts. UI can poll the stealth
  // address's balance to confirm landing.
  const data = (await import("viem")).encodeFunctionData({
    abi: usdcAbi,
    functionName: "transfer",
    args: [stealth.stealthAddress, amount],
  })
  const txHash = await wallet.sendTransaction({
    account,
    chain: baseSepolia,
    to: USDC_BASE_SEPOLIA,
    data,
  })

  return {
    recipient: { ens: recipientEnsName, resolvedAddress: resolvedAddress ?? null },
    stealth,
    txHash,
    blockNumber: 0n, // not waited for
    blockExplorerUrl: `https://sepolia.basescan.org/tx/${txHash}`,
    amount,
    amountHuman: formatUnits(amount, USDC_DECIMALS),
  }
}
