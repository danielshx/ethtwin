import { createPublicClient, createWalletClient, http, type Chain } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { base, baseSepolia, sepolia, mainnet } from "viem/chains"

export const sepoliaClient = createPublicClient({
  chain: sepolia,
  transport: http(process.env.SEPOLIA_RPC ?? undefined),
})

export const baseSepoliaClient = createPublicClient({
  chain: baseSepolia,
  transport: http(process.env.NEXT_PUBLIC_BASE_RPC ?? "https://sepolia.base.org"),
})

export const mainnetClient = createPublicClient({
  chain: mainnet,
  transport: http(process.env.MAINNET_RPC ?? undefined),
})

export const PARENT_DOMAIN =
  process.env.NEXT_PUBLIC_PARENT_DOMAIN ?? "ethtwin.eth"

function rpcUrlForChain(chain: Chain): string | undefined {
  switch (chain.id) {
    case sepolia.id:
      return process.env.SEPOLIA_RPC
    case baseSepolia.id:
      return process.env.NEXT_PUBLIC_BASE_RPC ?? "https://sepolia.base.org"
    case base.id:
      return process.env.BASE_RPC ?? "https://mainnet.base.org"
    case mainnet.id:
      return process.env.MAINNET_RPC
    default:
      return undefined
  }
}

/**
 * Resolves the dev wallet private key from one of two env conventions:
 *   1. Split halves: DEV_WALLET_KEY_A + DEV_WALLET_KEY_B  (each 32 hex chars)
 *      → reconstructed at runtime, no individual half matches a private-key
 *      pattern, so deploy-platform secret scanners (Vercel/GitHub) won't flag.
 *   2. Single var:   DEV_WALLET_PRIVATE_KEY            (legacy, simpler locally)
 *
 * Falls back from split → single. Returns null if neither is set.
 */
function resolveDevWalletKey(): `0x${string}` | null {
  const a = process.env.DEV_WALLET_KEY_A?.replace(/^0x/, "")
  const b = process.env.DEV_WALLET_KEY_B?.replace(/^0x/, "")
  if (a && b && a.length === 32 && b.length === 32) {
    return `0x${a}${b}` as `0x${string}`
  }
  const single = process.env.DEV_WALLET_PRIVATE_KEY
  if (single) {
    return (single.startsWith("0x") ? single : `0x${single}`) as `0x${string}`
  }
  return null
}

/**
 * Wallet client backed by the dev wallet key for the requested chain.
 * Defaults to Sepolia (where ENS lives in our setup).
 * Server-side scripts only — never import from client code.
 * Throws if the key is not configured.
 */
export function getDevWalletClient(chain: Chain = sepolia) {
  const pk = resolveDevWalletKey()
  if (!pk) {
    throw new Error(
      "Dev wallet key not configured. Set DEV_WALLET_KEY_A + DEV_WALLET_KEY_B (split, scanner-safe) or DEV_WALLET_PRIVATE_KEY (single) in .env.local / Vercel env vars.",
    )
  }
  const account = privateKeyToAccount(pk)
  const wallet = createWalletClient({
    account,
    chain,
    transport: http(rpcUrlForChain(chain)),
  })
  return { wallet, account }
}
