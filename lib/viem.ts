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
 * Wallet client backed by DEV_WALLET_PRIVATE_KEY for the requested chain.
 * Defaults to Sepolia (where ENS lives in our setup).
 * Server-side scripts only — never import from client code.
 * Throws if the key is not configured.
 */
export function getDevWalletClient(chain: Chain = sepolia) {
  const pk = process.env.DEV_WALLET_PRIVATE_KEY
  if (!pk) {
    throw new Error(
      "DEV_WALLET_PRIVATE_KEY is not set. Add it to .env.local (use a hackathon-only wallet).",
    )
  }
  const normalized = pk.startsWith("0x") ? pk : `0x${pk}`
  const account = privateKeyToAccount(normalized as `0x${string}`)
  const wallet = createWalletClient({
    account,
    chain,
    transport: http(rpcUrlForChain(chain)),
  })
  return { wallet, account }
}
