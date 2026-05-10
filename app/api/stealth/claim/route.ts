// Stealth claim — sweep funds from a one-time stealth address to the
// recipient's twin wallet (its KMS-derived main address).
//
// POST /api/stealth/claim
//   { ens, stealthAddress, ephemeralPubKey, chain }
//
// Flow:
//   1. Derive recipient's spending+viewing PRIVATE keys via deriveTwinStealthKeys
//      (deterministic from dev master + recipient's ENS).
//   2. Use computeStealthKey(spendingPriv, viewingPriv, ephemeralPub) — that's
//      the EIP-5564 receiver-side derivation. Result is the actual private
//      key controlling the stealth address.
//   3. Read live USDC balance at the stealth address.
//   4. Read recipient's twin (= KMS-derived) address from kmsAccountForEns.
//   5. Stealth address needs ETH for gas before it can transfer. Dev wallet
//      sends a small gas top-up (~0.0005 ETH).
//   6. Sign + broadcast USDC.transfer(twinAddr, balance) from the stealth
//      address using the derived stealth private key.
//
// After both txs land, the recipient's twin wallet shows the swept balance.
// Demo caveat: dev wallet covers the gas top-up. A production deploy would
// use ERC-2771 / transferWithAuthorization (EIP-3009) so the recipient
// doesn't need ETH — but the simple two-tx path is enough for the demo.

import { z } from "zod"
import { privateKeyToAccount } from "viem/accounts"
import {
  encodeFunctionData,
  formatEther,
  formatUnits,
  parseEther,
  type Address,
  type Hash,
  type Hex,
} from "viem"
import { baseSepolia, sepolia } from "viem/chains"
import {
  baseSepoliaClient,
  getDevWalletClient,
  sepoliaClient,
} from "@/lib/viem"
import {
  USDC_BASE_SEPOLIA,
  USDC_SEPOLIA,
  USDC_DECIMALS,
} from "@/lib/payments"
import { kmsAccountForEns } from "@/lib/kms"
import { deriveStealthPrivateKey, deriveTwinStealthKeys } from "@/lib/stealth"
import { jsonError, parseJsonBody } from "@/lib/api-guard"

export const runtime = "nodejs"
export const maxDuration = 90

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

const claimSchema = z.object({
  ens: z.string().min(3),
  stealthAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  ephemeralPubKey: z.string().regex(/^0x[a-fA-F0-9]+$/),
  chain: z.enum(["sepolia", "base-sepolia"]).optional(),
})

const SPECS = {
  sepolia: {
    chain: sepolia,
    client: sepoliaClient,
    usdc: USDC_SEPOLIA,
    explorer: "https://sepolia.etherscan.io",
  },
  "base-sepolia": {
    chain: baseSepolia,
    client: baseSepoliaClient,
    usdc: USDC_BASE_SEPOLIA,
    explorer: "https://sepolia.basescan.org",
  },
} as const

const GAS_TOPUP_AMOUNT = parseEther("0.0005") // ~0.0005 ETH for one transfer at 5 gwei

export async function POST(req: Request) {
  const parsed = await parseJsonBody(req, claimSchema)
  if (!parsed.ok) return parsed.response
  const { ens, stealthAddress, ephemeralPubKey } = parsed.data
  const chainKey = parsed.data.chain ?? "base-sepolia"
  const spec = SPECS[chainKey]

  // 1. Derive the stealth private key.
  let twinKeys: ReturnType<typeof deriveTwinStealthKeys>
  try {
    twinKeys = deriveTwinStealthKeys(ens)
  } catch (err) {
    return jsonError(
      `Could not derive stealth keys for ${ens}: ${
        err instanceof Error ? err.message : String(err)
      }`,
      400,
    )
  }
  let stealthPrivateKey: Hex
  try {
    stealthPrivateKey = deriveStealthPrivateKey({
      ephemeralPublicKey: ephemeralPubKey as Hex,
      spendingPrivateKey: twinKeys.spendingPrivateKey,
      viewingPrivateKey: twinKeys.viewingPrivateKey,
    })
  } catch (err) {
    return jsonError(
      `EIP-5564 stealth-key derivation failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
      400,
    )
  }
  const stealthAccount = privateKeyToAccount(stealthPrivateKey)
  if (stealthAccount.address.toLowerCase() !== stealthAddress.toLowerCase()) {
    return jsonError(
      `Derived stealth address ${stealthAccount.address} doesn't match the ` +
        `claimed stealth address ${stealthAddress}. The ephemeral pubkey ` +
        `probably doesn't belong to this recipient.`,
      400,
    )
  }

  // 2. Resolve the recipient's twin wallet (the KMS-derived address — that's
  //    where the swept funds will land).
  const kms = await kmsAccountForEns(ens).catch(() => null)
  if (!kms) {
    return jsonError(
      `${ens} has no twin.kms-key-id text record — can't determine where to sweep.`,
      404,
    )
  }
  const twinAddr = kms.address as Address

  // 3. Read live USDC + ETH balances at the stealth address.
  const [stealthUsdc, stealthEth] = await Promise.all([
    spec.client.readContract({
      address: spec.usdc,
      abi: usdcAbi,
      functionName: "balanceOf",
      args: [stealthAddress as Address],
    }),
    spec.client.getBalance({ address: stealthAddress as Address }),
  ])
  if (stealthUsdc === 0n) {
    return jsonError(
      `Stealth address ${stealthAddress} has 0 USDC on ${chainKey} — nothing to claim.`,
      400,
    )
  }

  // 4. Top up the stealth address with gas if needed (dev wallet pays).
  const { account: devAccount } = getDevWalletClient(spec.chain)
  let topupTx: Hash | null = null
  if (stealthEth < GAS_TOPUP_AMOUNT) {
    const topup = await devAccount.signTransaction({
      chainId: spec.chain.id,
      type: "eip1559",
      to: stealthAddress as Address,
      value: GAS_TOPUP_AMOUNT,
      data: "0x",
      nonce: await spec.client.getTransactionCount({
        address: devAccount.address,
        blockTag: "pending",
      }),
      gas: 21_000n,
      maxFeePerGas: 5_000_000_000n,
      maxPriorityFeePerGas: 1_500_000_000n,
    })
    topupTx = await spec.client.sendRawTransaction({
      serializedTransaction: topup,
    })
    // Wait for the top-up so the stealth address has ETH when it broadcasts.
    const topupReceipt = await spec.client.waitForTransactionReceipt({
      hash: topupTx,
      timeout: 60_000,
      pollingInterval: 1_500,
    })
    if (topupReceipt.status !== "success") {
      return jsonError(
        `Gas top-up to stealth address reverted (block ${topupReceipt.blockNumber}). tx=${topupTx}`,
        502,
      )
    }
  }

  // 5. Sign + broadcast USDC.transfer from the stealth address to the twin's
  //    KMS-derived main address.
  const data = encodeFunctionData({
    abi: usdcAbi,
    functionName: "transfer",
    args: [twinAddr, stealthUsdc],
  })
  const stealthNonce = await spec.client.getTransactionCount({
    address: stealthAddress as Address,
    blockTag: "pending",
  })
  const sweepTxRaw = await stealthAccount.signTransaction({
    chainId: spec.chain.id,
    type: "eip1559",
    to: spec.usdc,
    data,
    nonce: stealthNonce,
    gas: 100_000n,
    maxFeePerGas: 5_000_000_000n,
    maxPriorityFeePerGas: 1_500_000_000n,
    value: 0n,
  })
  const sweepTx = await spec.client.sendRawTransaction({
    serializedTransaction: sweepTxRaw,
  })

  return Response.json({
    ok: true,
    ens,
    chain: chainKey,
    twinAddress: twinAddr,
    stealthAddress,
    sweptAmount: stealthUsdc.toString(),
    sweptAmountHuman: formatUnits(stealthUsdc, USDC_DECIMALS),
    topupTx,
    sweepTx,
    explorerUrl: `${spec.explorer}/tx/${sweepTx}`,
    topupExplorerUrl: topupTx ? `${spec.explorer}/tx/${topupTx}` : null,
    devEthSpent: topupTx ? formatEther(GAS_TOPUP_AMOUNT) : "0",
  })
}
