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
import { keccak256, hexToBytes } from "viem"
import { readAddrFast, readTextRecordFast } from "@/lib/ens"
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
  /** Optional: sender's ENS, resolved client-side from the announcement
   *  caller. Echoed back in the receipt so callers have a human-readable
   *  audit trail. The claim itself doesn't trust this value — the actual
   *  funds movement is purely cryptographic. */
  senderEns: z.string().min(3).optional(),
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
  const { ens, stealthAddress, ephemeralPubKey, senderEns } = parsed.data
  const chainKey = parsed.data.chain ?? "base-sepolia"
  const spec = SPECS[chainKey]

  // Outer try/catch wraps every step that calls into RPC / signing — without
  // it, a thrown rejection (e.g. waitForTransactionReceipt timeout, RPC
  // bouncing the raw tx, signing-account failure) bubbles up to Next's
  // default 500 handler and returns an EMPTY body. The client's res.json()
  // then chokes with "Unexpected end of JSON input". Returning jsonError
  // here means every failure mode reaches the user as a readable message.
  try {
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

    // 2. Resolve the recipient's twin wallet — that's where the swept funds
    //    will land. Source priority:
    //      a. on-chain `addr` text record (the canonical sweep destination)
    //      b. derived from `twin.kms-public-key` text record if `addr` is missing
    //         (keccak256(pubKey || pubKey-y).slice(-20) — standard EVM derivation)
    //
    //    The claim itself doesn't need `twin.kms-key-id` — the stealth sweep is
    //    signed by the locally-derived stealth private key, NOT by KMS. We only
    //    need a destination address.
    let twinAddr: Address | null = await readAddrFast(ens).catch(() => null)
    if (!twinAddr) {
      // Fallback: derive address from the published KMS public key.
      const pubKey = await readTextRecordFast(ens, "twin.kms-public-key").catch(
        () => "",
      )
      if (pubKey && /^0x04[0-9a-fA-F]{128}$/.test(pubKey)) {
        // Drop the 0x04 SEC1 prefix → 64 bytes of (x,y), then keccak256, last 20.
        const xy = hexToBytes(("0x" + pubKey.slice(4)) as `0x${string}`)
        const hash = keccak256(xy)
        twinAddr = ("0x" + hash.slice(-40)) as Address
      }
    }
    if (!twinAddr) {
      return jsonError(
        `${ens} has no on-chain destination — neither an \`addr\` text record nor a ` +
          `\`twin.kms-public-key\` is set. The twin may have been deleted; re-mint ` +
          `it before claiming, or pass a recipient address explicitly.`,
        404,
      )
    }

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
    //    Wait timeout is 40s (vs Vercel's 60s Hobby ceiling) so the function
    //    has headroom to broadcast the sweep + return JSON before being
    //    killed.
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
      try {
        const topupReceipt = await spec.client.waitForTransactionReceipt({
          hash: topupTx,
          timeout: 40_000,
          pollingInterval: 1_500,
        })
        if (topupReceipt.status !== "success") {
          return jsonError(
            `Gas top-up to stealth address reverted (block ${topupReceipt.blockNumber}). tx=${topupTx}`,
            502,
          )
        }
      } catch (err) {
        return jsonError(
          `Gas top-up tx ${topupTx} didn't confirm within 40s on ${chainKey}. ` +
            `It may still land — try claiming again in ~30s. Underlying: ${
              err instanceof Error ? err.message : String(err)
            }`,
          504,
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
      senderEns: senderEns ?? null,
      sweptAmount: stealthUsdc.toString(),
      sweptAmountHuman: formatUnits(stealthUsdc, USDC_DECIMALS),
      topupTx,
      sweepTx,
      explorerUrl: `${spec.explorer}/tx/${sweepTx}`,
      topupExplorerUrl: topupTx ? `${spec.explorer}/tx/${topupTx}` : null,
      devEthSpent: topupTx ? formatEther(GAS_TOPUP_AMOUNT) : "0",
    })
  } catch (err) {
    return jsonError(
      `Stealth claim failed: ${err instanceof Error ? err.message : String(err)}`,
      500,
    )
  }
}
