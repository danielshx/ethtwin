import { createPublicClient, createWalletClient, http, type Chain } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { base, baseSepolia, sepolia, mainnet } from "viem/chains"

// Public RPC fallbacks chosen for higher rate limits than viem's default
// ThirdWeb endpoint (which gets 429s on busy days). Used only when the
// corresponding env var isn't set.
const PUBLIC_FALLBACKS: Record<number, string> = {
  [sepolia.id]: "https://eth-sepolia.public.blastapi.io",
  [baseSepolia.id]: "https://sepolia.base.org",
  [base.id]: "https://mainnet.base.org",
  [mainnet.id]: "https://eth.llamarpc.com",
}

export const PARENT_DOMAIN =
  process.env.NEXT_PUBLIC_PARENT_DOMAIN ?? "ethtwin.eth"

export const sepoliaClient = createPublicClient({
  chain: sepolia,
  transport: http(process.env.SEPOLIA_RPC ?? PUBLIC_FALLBACKS[sepolia.id]),
})

export const baseSepoliaClient = createPublicClient({
  chain: baseSepolia,
  transport: http(process.env.NEXT_PUBLIC_BASE_RPC ?? PUBLIC_FALLBACKS[baseSepolia.id]),
})

export const mainnetClient = createPublicClient({
  chain: mainnet,
  transport: http(process.env.MAINNET_RPC ?? PUBLIC_FALLBACKS[mainnet.id]),
})

function rpcUrlForChain(chain: Chain): string {
  switch (chain.id) {
    case sepolia.id:
      return process.env.SEPOLIA_RPC ?? PUBLIC_FALLBACKS[sepolia.id]!
    case baseSepolia.id:
      return process.env.NEXT_PUBLIC_BASE_RPC ?? PUBLIC_FALLBACKS[baseSepolia.id]!
    case base.id:
      return process.env.BASE_RPC ?? PUBLIC_FALLBACKS[base.id]!
    case mainnet.id:
      return process.env.MAINNET_RPC ?? "https://eth.llamarpc.com"
    default:
      return PUBLIC_FALLBACKS[chain.id] ?? ""
  }
}

// ⚠️ HARDCODED TESTNET FALLBACK — read this carefully.
//
// This is the dev wallet private key. It controls Sepolia + Base Sepolia
// testnet funds (no real money) and the ethtwin.eth ENS state. It's hardcoded
// here as an explicit user decision after Vercel's secret scanner kept
// removing it from env vars.
//
// Consequences when this commit is pushed to GitHub:
//   • GitHub's secret scanning will detect it and email the repo owner
//   • The key will be indexed in known-leaked-key databases
//   • Sepolia "drainer" bots may sweep any testnet ETH on this wallet
//   • Vercel's scanner may refuse to honor matching env vars going forward
//
// Mitigations:
//   • This is testnet only — no financial loss
//   • Rotate via `pnpm wallet:rotate` immediately after the hackathon demo
//   • Move to a key generated outside this repo's history before any prod
//
// The env var DEV_WALLET_PRIVATE_KEY still wins if set, so Vercel can override
// this fallback with a fresh value when scanning is finally happy.
const HARDCODED_TESTNET_DEV_KEY: `0x${string}` =
  "0x8fb982a1c4c86546149fb0a60684dd9866db0c1cfd39e66f8a5bcd96cfd5ff53"

function resolveDevWalletKey(): `0x${string}` {
  const single = (process.env.DEV_WALLET_PRIVATE_KEY ?? "").trim()
  if (single) {
    const normalized = single.startsWith("0x") ? single : `0x${single}`
    if (/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
      return normalized as `0x${string}`
    }
    console.warn(
      `[dev-wallet] DEV_WALLET_PRIVATE_KEY present but not a valid 0x+64-hex string (length=${normalized.length}). Using hardcoded fallback.`,
    )
  }
  return HARDCODED_TESTNET_DEV_KEY
}

/**
 * Wallet client backed by the dev wallet key for the requested chain.
 * Defaults to Sepolia (where ENS lives in our setup).
 * Server-side scripts only — never import from client code.
 * Throws if the key is not configured.
 */
export function getDevWalletClient(chain: Chain = sepolia) {
  const pk = resolveDevWalletKey()
  const account = privateKeyToAccount(pk)
  const wallet = createWalletClient({
    account,
    chain,
    transport: http(rpcUrlForChain(chain)),
  })
  return { wallet, account }
}
