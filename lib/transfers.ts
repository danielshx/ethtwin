// Multichain token transfers (Sepolia + Base Sepolia, native ETH + USDC).
// Sender = dev wallet. Recipient = ENS name (resolves on Sepolia ENS) or raw 0x address.
//
// Public surface:
//   sendToken({ chain, token, to, amount }) — main entry point
//   getTokenBalance({ chain, token, address })
//   parseRecipient(input) — resolves ENS to address
//
// Block explorer URLs are tied per-chain so the UI can show the right link.

import {
  formatEther,
  formatUnits,
  getAddress,
  isAddress,
  parseEther,
  parseUnits,
  type Address,
  type Hash,
} from "viem"
import { baseSepolia, sepolia } from "viem/chains"
import {
  baseSepoliaClient,
  getDevWalletClient,
  sepoliaClient,
} from "./viem"
import { resolveEnsAddress } from "./ens"

export type SupportedChain = "sepolia" | "base-sepolia"
export type SupportedToken = "ETH" | "USDC"

type ChainSpec = {
  chain: typeof sepolia | typeof baseSepolia
  client: typeof sepoliaClient | typeof baseSepoliaClient
  blockExplorer: string
  usdc: Address
}

const CHAINS: Record<SupportedChain, ChainSpec> = {
  sepolia: {
    chain: sepolia,
    client: sepoliaClient,
    blockExplorer: "https://sepolia.etherscan.io",
    usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
  },
  "base-sepolia": {
    chain: baseSepolia,
    client: baseSepoliaClient,
    blockExplorer: "https://sepolia.basescan.org",
    usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  },
}

const erc20Abi = [
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
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
] as const

// ── Recipient resolution ─────────────────────────────────────────────────────

/**
 * Resolve a user-supplied recipient (ENS like "alice.ethtwin.eth" or raw 0x...)
 * to a checksummed Address. ENS resolution uses Sepolia (where our subnames live).
 */
export async function parseRecipient(input: string): Promise<Address> {
  const trimmed = input.trim()
  if (isAddress(trimmed)) return getAddress(trimmed)
  if (!trimmed.includes(".")) {
    throw new Error(`"${trimmed}" is neither a 0x address nor an ENS name.`)
  }
  const resolved = await resolveEnsAddress(trimmed)
  if (!resolved) {
    throw new Error(`Could not resolve ENS name "${trimmed}" on Sepolia.`)
  }
  return getAddress(resolved)
}

// ── Balance reads ────────────────────────────────────────────────────────────

export async function getTokenBalance(args: {
  chain: SupportedChain
  token: SupportedToken
  address: Address
}): Promise<{ raw: bigint; decimals: number; human: string }> {
  const spec = CHAINS[args.chain]
  if (args.token === "ETH") {
    const raw = await spec.client.getBalance({ address: args.address })
    return { raw, decimals: 18, human: formatEther(raw) }
  }
  const raw = await spec.client.readContract({
    address: spec.usdc,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [args.address],
  })
  return { raw, decimals: 6, human: formatUnits(raw, 6) }
}

// ── Send ─────────────────────────────────────────────────────────────────────

export type SendTokenResult = {
  chain: SupportedChain
  token: SupportedToken
  from: Address
  to: Address
  recipientInput: string
  amount: bigint
  amountHuman: string
  txHash: Hash
  blockNumber: bigint
  blockExplorerUrl: string
}

export async function sendToken(args: {
  chain: SupportedChain
  token: SupportedToken
  to: string // ENS name or raw 0x...
  amount: string | number // human-readable
}): Promise<SendTokenResult> {
  const spec = CHAINS[args.chain]
  if (!spec) throw new Error(`Unsupported chain: ${args.chain}`)

  const recipient = await parseRecipient(args.to)
  const { wallet, account } = getDevWalletClient(spec.chain)

  // Pre-flight: confirm sender has enough of the requested asset + gas.
  const decimals = args.token === "ETH" ? 18 : 6
  const amount =
    args.token === "ETH"
      ? parseEther(String(args.amount))
      : parseUnits(String(args.amount), 6)

  const balance = await getTokenBalance({
    chain: args.chain,
    token: args.token,
    address: account.address,
  })
  if (balance.raw < amount) {
    throw new Error(
      `Insufficient ${args.token} on ${args.chain}: have ${balance.human}, need ${formatUnits(
        amount,
        decimals,
      )}`,
    )
  }
  // For ERC-20 transfers we also need ETH for gas.
  if (args.token !== "ETH") {
    const gasBalance = await spec.client.getBalance({ address: account.address })
    if (gasBalance === 0n) {
      throw new Error(
        `Sender has 0 ETH on ${args.chain} — no gas available for the ${args.token} transfer.`,
      )
    }
  }

  // Broadcast.
  let txHash: Hash
  if (args.token === "ETH") {
    txHash = await wallet.sendTransaction({
      account,
      chain: spec.chain,
      to: recipient,
      value: amount,
    })
  } else {
    txHash = await wallet.writeContract({
      account,
      chain: spec.chain,
      address: spec.usdc,
      abi: erc20Abi,
      functionName: "transfer",
      args: [recipient, amount],
    })
  }

  const receipt = await spec.client.waitForTransactionReceipt({ hash: txHash })
  if (receipt.status !== "success") {
    throw new Error(`Transfer reverted on-chain: tx ${txHash} (block ${receipt.blockNumber}).`)
  }

  return {
    chain: args.chain,
    token: args.token,
    from: account.address,
    to: recipient,
    recipientInput: args.to,
    amount,
    amountHuman: formatUnits(amount, decimals),
    txHash,
    blockNumber: receipt.blockNumber,
    blockExplorerUrl: `${spec.blockExplorer}/tx/${txHash}`,
  }
}
