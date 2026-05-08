import { createPublicClient, createWalletClient, http } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { baseSepolia, sepolia, mainnet } from "viem/chains"

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
  process.env.NEXT_PUBLIC_PARENT_DOMAIN ?? "twinpilot.eth"

/**
 * Sepolia wallet client backed by DEV_WALLET_PRIVATE_KEY.
 * Server-side scripts only — never import from client code.
 * Throws if the key is not configured.
 */
export function getDevWalletClient() {
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
    chain: sepolia,
    transport: http(process.env.SEPOLIA_RPC ?? undefined),
  })
  return { wallet, account }
}
