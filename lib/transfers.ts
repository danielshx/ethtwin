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
  encodeFunctionData,
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
import { readAddrFast, resolveEnsAddress } from "./ens"
import { kmsAccount, kmsAccountForEns } from "./kms"

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

const DECIMAL_AMOUNT_RE = /^(?:\d+)(?:\.\d+)?$/

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
  // Fast path for our own ethtwin.eth tree — direct resolver call (200ms).
  // Fall back to the slow Universal Resolver path for any other ENS name.
  const resolved = trimmed.endsWith(".ethtwin.eth")
    ? await readAddrFast(trimmed)
    : await resolveEnsAddress(trimmed)
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
  /** True when the tx was signed by a SpaceComputer KMS-managed key bound
   *  to the sender's twin (ENS → twin.kms-key-id). False for the legacy
   *  dev-wallet path. */
  viaKms: boolean
}

export async function sendToken(args: {
  chain: SupportedChain
  token: SupportedToken
  to: string // ENS name or raw 0x...
  amount: string | number // human-readable
  /** Sender's twin ENS. When set + the twin has a `twin.kms-key-id` text
   *  record, the tx is signed by KMS — funds come out of the twin's
   *  satellite-attested address, not the dev wallet. */
  fromEns?: string
}): Promise<SendTokenResult> {
  const spec = CHAINS[args.chain]
  if (!spec) throw new Error(`Unsupported chain: ${args.chain}`)

  const amountText = String(args.amount).trim()
  if (!DECIMAL_AMOUNT_RE.test(amountText)) {
    throw new Error(
      `Invalid amount "${amountText}". Please use a decimal number like 1 or 0.5.`,
    )
  }

  const recipient = await parseRecipient(args.to)

  // Pick the signing identity: if the sender twin has a KMS key, use a
  // KMS-backed viem account; otherwise fall back to the dev wallet (legacy /
  // testing). Both expose the same `signTransaction` surface so the rest of
  // the function is identical regardless of the path.
  let account: ReturnType<typeof getDevWalletClient>["account"] | ReturnType<typeof kmsAccount>
  let viaKms = false
  if (args.fromEns) {
    const kms = await kmsAccountForEns(args.fromEns).catch(() => null)
    if (kms) {
      account = kmsAccount(kms)
      viaKms = true
      console.log(
        `[transfers] KMS-signing tx — ENS=${args.fromEns} key=${kms.keyId} from=${kms.address}`,
      )
    } else {
      console.log(
        `[transfers] no twin.kms-key-id on ${args.fromEns} — falling back to dev wallet`,
      )
      account = getDevWalletClient(spec.chain).account
    }
  } else {
    account = getDevWalletClient(spec.chain).account
  }

  // Pre-flight: confirm sender has enough of the requested asset + gas.
  const decimals = args.token === "ETH" ? 18 : 6
  const amount =
    args.token === "ETH" ? parseEther(amountText) : parseUnits(amountText, 6)

  const balance = await getTokenBalance({
    chain: args.chain,
    token: args.token,
    address: account.address,
  })
  // Use a chain-agnostic faucet pointer in the error so a freshly-minted
  // KMS twin's owner knows exactly what to do — funding is the single most
  // common reason a brand-new twin can't send.
  const faucetHint =
    args.chain === "sepolia"
      ? "https://sepoliafaucet.com or https://www.alchemy.com/faucets/ethereum-sepolia"
      : "https://www.alchemy.com/faucets/base-sepolia"
  if (balance.raw < amount) {
    throw new Error(
      `Sender ${account.address} has ${balance.human} ${args.token} on ${args.chain}, needs ${formatUnits(
        amount,
        decimals,
      )}. ${
        viaKms
          ? `This twin's KMS-managed wallet has no balance yet — fund the address from a faucet (${faucetHint}) and retry.`
          : ""
      }`,
    )
  }
  // For ERC-20 transfers we also need ETH for gas.
  if (args.token !== "ETH") {
    const gasBalance = await spec.client.getBalance({ address: account.address })
    if (gasBalance === 0n) {
      throw new Error(
        `Sender ${account.address} has 0 ETH on ${args.chain} — no gas to broadcast the ${args.token} transfer. ${
          viaKms
            ? `Send a small amount of Sepolia ETH to that address (faucet: ${faucetHint}) so the KMS-signed tx has gas.`
            : ""
        }`,
      )
    }
  }

  // Bypass viem's wrapper: fetch nonce + sign locally + send raw bytes. Avoids
  // any hidden RPC roundtrips inside wallet.sendTransaction that hang on Vercel.
  const nonce = await spec.client.getTransactionCount({
    address: account.address,
    blockTag: "pending",
  })

  const txCommon = {
    chainId: spec.chain.id,
    type: "eip1559" as const,
    nonce,
    // Generous fixed pricing so we don't need eth_feeHistory on Vercel.
    maxFeePerGas: 5_000_000_000n,
    maxPriorityFeePerGas: 1_500_000_000n,
  }

  let txHash: Hash
  if (args.token === "ETH") {
    const signed = await account.signTransaction({
      ...txCommon,
      to: recipient,
      value: amount,
      gas: 21_000n,
      data: "0x" as const,
    })
    txHash = await spec.client.sendRawTransaction({ serializedTransaction: signed })
  } else {
    const data = encodeFunctionData({
      abi: erc20Abi,
      functionName: "transfer",
      args: [recipient, amount],
    })
    const signed = await account.signTransaction({
      ...txCommon,
      to: spec.usdc,
      data,
      gas: 100_000n,
      value: 0n,
    })
    txHash = await spec.client.sendRawTransaction({ serializedTransaction: signed })
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
    blockNumber: 0n, // not waited for; UI can fetch explorer for confirmation
    blockExplorerUrl: `${spec.blockExplorer}/tx/${txHash}`,
    viaKms,
  }
}
