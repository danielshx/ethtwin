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
import { readAddrFast, readTextRecordFast, resolveEnsAddress } from "./ens"

// Fragments only used by the approve/transferFrom path. Kept inline to avoid
// dragging the full vault scaffold into this file's import surface.
const erc20AllowanceAbi = [
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const
const erc20TransferFromAbi = [
  {
    name: "transferFrom",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const

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
  /** True when the send routed through a TwinVault (user funds), false when
   *  it used the dev-wallet path (legacy / email-only). */
  viaVault: boolean
}

export async function sendToken(args: {
  chain: SupportedChain
  token: SupportedToken
  to: string // ENS name or raw 0x...
  amount: string | number // human-readable
  /** If provided, the function checks the sender's `twin.vault` text record
   *  and (when present + on Sepolia) routes the spend through the vault.
   *  Email-only / legacy twins without a vault skip this and use the
   *  dev-wallet path as before. */
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
  const { account } = getDevWalletClient(spec.chain)

  // Pre-flight: confirm sender has enough of the requested asset + gas.
  const decimals = args.token === "ETH" ? 18 : 6
  const amount =
    args.token === "ETH" ? parseEther(amountText) : parseUnits(amountText, 6)

  // ── Approve / transferFrom path ─────────────────────────────────────────
  // The user signs `USDC.approve(devWallet, amount)` ONCE with their own
  // wallet. After that, every chat-driven send moves funds straight from
  // their wallet via `USDC.transferFrom(user, recipient, amount)` — no
  // per-tx signature, no custom contract in the path. The allowance IS the
  // spending cap; the user can revoke any time by signing approve(_, 0).
  //
  // Only USDC is supported because native ETH has no allowance primitive.
  // ETH sends keep falling through to the dev-wallet path below.
  if (
    args.fromEns &&
    args.token === "USDC" &&
    args.chain === "sepolia" // Sepolia USDC; could extend to base-sepolia trivially
  ) {
    let ownerAddress: Address | null = null
    try {
      const raw = await readTextRecordFast(args.fromEns, "twin.owner")
      if (raw && raw.startsWith("0x") && raw.length === 42 && isAddress(raw)) {
        ownerAddress = getAddress(raw) as Address
      }
    } catch {
      // proceed to fallback
    }
    if (!ownerAddress) {
      console.log(
        `[transfers] allowance path OFF — no twin.owner record on ${args.fromEns}`,
      )
    } else {
      // Read the on-chain allowance the user has granted to the dev wallet.
      const allowance = (await spec.client.readContract({
        address: spec.usdc,
        abi: erc20AllowanceAbi,
        functionName: "allowance",
        args: [ownerAddress, account.address],
      })) as bigint
      if (allowance < amount) {
        console.log(
          `[transfers] allowance path OFF — ${ownerAddress} approved ${formatUnits(
            allowance,
            6,
          )} USDC but send needs ${formatUnits(amount, 6)}`,
        )
      } else {
        // Sanity: user's wallet must actually hold the USDC.
        const userBalance = await spec.client.readContract({
          address: spec.usdc,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [ownerAddress],
        })
        if ((userBalance as bigint) < amount) {
          throw new Error(
            `Sender wallet ${ownerAddress.slice(0, 6)}…${ownerAddress.slice(-4)} has only ${formatUnits(
              userBalance as bigint,
              6,
            )} USDC, needs ${formatUnits(amount, 6)}.`,
          )
        }
        console.log(
          `[transfers] allowance path ON — pulling ${formatUnits(amount, 6)} USDC from ${ownerAddress} to ${recipient} via transferFrom`,
        )
        const data = encodeFunctionData({
          abi: erc20TransferFromAbi,
          functionName: "transferFrom",
          args: [ownerAddress, recipient, amount],
        })
        const nonce = await spec.client.getTransactionCount({
          address: account.address,
          blockTag: "pending",
        })
        const signed = await account.signTransaction({
          chainId: spec.chain.id,
          type: "eip1559",
          to: spec.usdc,
          data,
          nonce,
          gas: 120_000n,
          maxFeePerGas: 5_000_000_000n,
          maxPriorityFeePerGas: 1_500_000_000n,
          value: 0n,
        })
        const txHash = await spec.client.sendRawTransaction({
          serializedTransaction: signed,
        })
        // Wait for the receipt and fail loudly on revert. Without this we'd
        // happily report `ok: true` with a tx hash even if the on-chain
        // transferFrom reverted (insufficient allowance, balance, etc.) —
        // the user sees a green receipt but no funds moved. Sepolia mines
        // in ~12-24s, well inside our route's maxDuration.
        const receipt = await spec.client.waitForTransactionReceipt({
          hash: txHash,
        })
        if (receipt.status !== "success") {
          console.warn(
            `[transfers] transferFrom REVERTED — tx=${txHash}, gasUsed=${receipt.gasUsed.toString()}`,
          )
          throw new Error(
            `transferFrom reverted on chain. Most likely the allowance dropped (a previous send used it up) or the user wallet ran out of USDC. tx=${txHash}`,
          )
        }
        console.log(
          `[transfers] allowance path SUCCESS — tx=${txHash}, gasUsed=${receipt.gasUsed.toString()}`,
        )
        return {
          chain: args.chain,
          token: args.token,
          from: ownerAddress,
          to: recipient,
          recipientInput: args.to,
          amount,
          amountHuman: formatUnits(amount, 6),
          txHash,
          blockNumber: receipt.blockNumber,
          blockExplorerUrl: `${spec.blockExplorer}/tx/${txHash}`,
          viaVault: true, // reusing the flag — UI-wise: "from user wallet"
        }
      }
    }
  }
  // ── End allowance path; below is the legacy dev-wallet path ────────────

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
    viaVault: false,
  }
}
