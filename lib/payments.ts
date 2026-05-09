// Stealth USDC payments — the demo-defining flow.
//
//   sender     : the dev wallet (DEV_WALLET_PRIVATE_KEY)
//   recipient  : an ENS name with a `stealth-meta-address` text record
//   chain      : "base-sepolia" (default) or "sepolia"
//
// Flow:
//   1. Resolve recipient ENS → wallet address (cosmetic, for UI)
//   2. Read recipient's stealth-meta-address from ENS text record
//   3. Generate a one-time stealth address (ScopeLift SDK)
//   4. USDC.transfer(stealthAddress, amount) on the chosen chain
//   5. Emit ERC-5564 Announcement on the canonical announcer so the
//      recipient (or anyone scanning the chain with their viewing key)
//      can find the inbound payment without off-chain coordination.
//   6. Return tx + stealth artifacts for the demo UI.
//
// The two on-chain calls (transfer + announce) are sent as TWO sequential
// txs by the same dev wallet — no atomic multicall exists for arbitrary
// targets without changing msg.sender, and the ERC-5564 Announcer requires
// `caller` to be the actual sender (it indexes msg.sender into the event).

import {
  encodeFunctionData,
  formatUnits,
  parseUnits,
  type Address,
  type Chain,
  type Hash,
  type Hex,
} from "viem"
import { baseSepolia, sepolia } from "viem/chains"
import {
  baseSepoliaClient,
  getDevWalletClient,
  sepoliaClient,
} from "./viem"
import { resolveEnsAddress, readTextRecordFast } from "./ens"
import {
  deriveTwinStealthKeys,
  generatePrivateAddress,
  type StealthResult,
} from "./stealth"
import { erc5564AnnouncerAbi } from "./abis"

export type StealthChain = "sepolia" | "base-sepolia"

export const USDC_DECIMALS = 6

// USDC on each chain (Circle's official deployment, 6 decimals).
export const USDC_BASE_SEPOLIA: Address = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
export const USDC_SEPOLIA: Address = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238"

// ERC-5564 canonical announcer — same address on every EVM chain via
// deterministic deployment. Verified deployed on mainnet, Sepolia, Base
// Sepolia, etc. We runtime-check the bytecode before calling.
export const ERC5564_ANNOUNCER: Address = "0x55649E01B5Df198D18D95b5cc5051630cfD45564"

// EIP-5564 scheme ID for SECP256k1 (= the ScopeLift SDK's SCHEME_ID_1).
const SCHEME_ID = 1n

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

type ChainSpec = {
  id: StealthChain
  chain: Chain
  client: typeof sepoliaClient | typeof baseSepoliaClient
  usdc: Address
  blockExplorer: string
}

const CHAINS: Record<StealthChain, ChainSpec> = {
  sepolia: {
    id: "sepolia",
    chain: sepolia,
    client: sepoliaClient,
    usdc: USDC_SEPOLIA,
    blockExplorer: "https://sepolia.etherscan.io",
  },
  "base-sepolia": {
    id: "base-sepolia",
    chain: baseSepolia,
    client: baseSepoliaClient,
    usdc: USDC_BASE_SEPOLIA,
    blockExplorer: "https://sepolia.basescan.org",
  },
}

export type StealthPaymentResult = {
  recipient: { ens: string; resolvedAddress: Address | null }
  stealth: StealthResult
  chain: StealthChain
  /** USDC.transfer tx hash. */
  txHash: Hash
  /** ERC-5564 Announcer tx hash — null when announcer isn't deployed on
   *  this chain (we fall through gracefully so the transfer still lands). */
  announceTxHash: Hash | null
  /** Whether announcer.announce() was invoked successfully. */
  announced: boolean
  blockNumber: bigint
  blockExplorerUrl: string
  /** Block-explorer link for the announcement, when emitted. */
  announceExplorerUrl: string | null
  amount: bigint
  amountHuman: string
}

/** USDC balance for the dev wallet (or any address) on the requested chain. */
export async function getUsdcBalance(
  addr: Address,
  chain: StealthChain = "base-sepolia",
): Promise<bigint> {
  const spec = CHAINS[chain]
  return spec.client.readContract({
    address: spec.usdc,
    abi: usdcAbi,
    functionName: "balanceOf",
    args: [addr],
  })
}

/** Backwards-compat alias used by older code paths. */
export const getUsdcBalanceBaseSepolia = (addr: Address) =>
  getUsdcBalance(addr, "base-sepolia")

/**
 * Build the EIP-5564 metadata payload for an ERC-20 stealth transfer.
 * Spec layout:
 *   byte 0:        view tag (= last byte of recipient's view-shared secret)
 *   bytes 1-4:     ERC-20 transfer selector (0xa9059cbb)
 *   bytes 5-24:    token contract address (20 bytes)
 *   bytes 25-56:   amount (uint256, big-endian, 32 bytes)
 *
 * Total = 57 bytes. Lets stealth scanners pre-filter via the view tag and
 * decode the inbound amount + token without an extra eth_call.
 */
function buildErc20StealthMetadata(
  viewTag: Hex,
  token: Address,
  amount: bigint,
): Hex {
  const tagByte = (viewTag.startsWith("0x") ? viewTag.slice(2) : viewTag).slice(-2)
  if (tagByte.length !== 2) {
    throw new Error(`view tag must be 1 byte, got ${tagByte.length / 2}`)
  }
  const selector = "a9059cbb"
  const tokenHex = token.toLowerCase().replace(/^0x/, "").padStart(40, "0")
  const amountHex = amount.toString(16).padStart(64, "0")
  return ("0x" + tagByte + selector + tokenHex + amountHex) as Hex
}

/**
 * Send `amountUsdc` of USDC on the chosen chain to a one-time stealth
 * address derived from the recipient's ENS-published meta-key, then emit
 * the ERC-5564 Announcement so the recipient can scan and find it.
 */
export async function sendStealthUSDC(args: {
  recipientEnsName: string
  amountUsdc: number | string
  chain?: StealthChain
}): Promise<StealthPaymentResult> {
  const { recipientEnsName, amountUsdc } = args
  const chainKey: StealthChain = args.chain ?? "base-sepolia"
  const spec = CHAINS[chainKey]

  // 1. Cosmetic: forward-resolve the ENS to the user's wallet (not where funds go).
  const resolvedAddress = await resolveEnsAddress(recipientEnsName)

  // 2. Read recipient's stealth meta-address URI from ENS text record (fast
  // direct-resolver path), with deterministic-derivation fallback so old
  // twins still receive stealth payments without a re-mint.
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

  // 4. USDC.transfer(stealthAddress, amount) on the chosen chain.
  const amount = parseUnits(String(amountUsdc), USDC_DECIMALS)
  const { account } = getDevWalletClient(spec.chain)

  // Pre-flight: don't broadcast a tx that will revert on insufficient balance.
  const senderBalance = await getUsdcBalance(account.address, chainKey)
  if (senderBalance < amount) {
    throw new Error(
      `Sender ${account.address} has ${formatUnits(senderBalance, USDC_DECIMALS)} USDC on ${chainKey} ` +
        `(contract ${spec.usdc}), needs ${formatUnits(amount, USDC_DECIMALS)}. ` +
        `Fund the dev wallet on ${chainKey} with USDC before retrying.`,
    )
  }

  // Bypass viem's wrapper: sign locally, broadcast raw, sequence two txs by
  // nonce so the announcement always lands after (and not before) the transfer.
  let nonce = await spec.client.getTransactionCount({
    address: account.address,
    blockTag: "pending",
  })
  const transferData = encodeFunctionData({
    abi: usdcAbi,
    functionName: "transfer",
    args: [stealth.stealthAddress, amount],
  })
  const signedTransfer = await account.signTransaction({
    chainId: spec.chain.id,
    type: "eip1559",
    to: spec.usdc,
    data: transferData,
    nonce,
    gas: 100_000n,
    maxFeePerGas: 5_000_000_000n,
    maxPriorityFeePerGas: 1_500_000_000n,
    value: 0n,
  })
  const txHash = await spec.client.sendRawTransaction({
    serializedTransaction: signedTransfer,
  })
  nonce += 1

  // 5. ERC-5564 Announcement — broadcasts ephemeralPubKey + viewTag on-chain
  // so the recipient can derive the same stealth address and find the
  // payment by scanning Announcer logs. Without this, the stealth send is
  // visible only to whoever has our /api/stealth/send response.
  let announceTxHash: Hash | null = null
  let announced = false
  try {
    const code = await spec.client.getCode({ address: ERC5564_ANNOUNCER })
    if (!code || code === "0x") {
      console.warn(
        `[payments] ERC-5564 Announcer not deployed on ${chainKey} at ${ERC5564_ANNOUNCER}; ` +
          `skipping announce(). Recipient will need our API response to discover this payment.`,
      )
    } else {
      const metadata = buildErc20StealthMetadata(
        stealth.viewTag,
        spec.usdc,
        amount,
      )
      const announceData = encodeFunctionData({
        abi: erc5564AnnouncerAbi,
        functionName: "announce",
        args: [SCHEME_ID, stealth.stealthAddress, stealth.ephemeralPublicKey, metadata],
      })
      const signedAnnounce = await account.signTransaction({
        chainId: spec.chain.id,
        type: "eip1559",
        to: ERC5564_ANNOUNCER,
        data: announceData,
        nonce,
        gas: 120_000n,
        maxFeePerGas: 5_000_000_000n,
        maxPriorityFeePerGas: 1_500_000_000n,
        value: 0n,
      })
      announceTxHash = await spec.client.sendRawTransaction({
        serializedTransaction: signedAnnounce,
      })
      announced = true
    }
  } catch (err) {
    // Don't fail the whole send — the transfer already landed and the
    // recipient still has our off-chain response with the stealth artifacts.
    console.warn(
      `[payments] ERC-5564 announce() failed on ${chainKey}:`,
      err instanceof Error ? err.message : err,
    )
  }

  return {
    recipient: { ens: recipientEnsName, resolvedAddress: resolvedAddress ?? null },
    stealth,
    chain: chainKey,
    txHash,
    announceTxHash,
    announced,
    blockNumber: 0n,
    blockExplorerUrl: `${spec.blockExplorer}/tx/${txHash}`,
    announceExplorerUrl: announceTxHash
      ? `${spec.blockExplorer}/tx/${announceTxHash}`
      : null,
    amount,
    amountHuman: formatUnits(amount, USDC_DECIMALS),
  }
}
