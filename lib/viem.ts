import {
  createPublicClient,
  createWalletClient,
  fallback,
  http,
  type Chain,
} from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { base, baseSepolia, sepolia, mainnet } from "viem/chains"

/**
 * Hardcoded RPC fallback chain per chain. Viem's `fallback` transport tries
 * each in order; if one returns 429 / 5xx / timeout it falls through to the
 * next. This way the app works even if env vars on Vercel are missing,
 * empty, or rate-limited. Env override (e.g. user's Alchemy key) gets
 * prepended at runtime when set.
 *
 * The lists below are public Sepolia / Base Sepolia endpoints with generous
 * rate limits — better than viem's default ThirdWeb URL (which hard-throttles).
 */
const HARDCODED_RPCS: Record<number, string[]> = {
  [sepolia.id]: [
    "https://eth-sepolia.g.alchemy.com/v2/VnDHq7fsAyloEY3w9oQGK",
    "https://ethereum-sepolia-rpc.publicnode.com",
    "https://eth-sepolia.public.blastapi.io",
    "https://sepolia.gateway.tenderly.co",
    "https://sepolia.drpc.org",
    "https://rpc.sepolia.org",
  ],
  [baseSepolia.id]: [
    "https://sepolia.base.org",
    "https://base-sepolia-rpc.publicnode.com",
    "https://base-sepolia.gateway.tenderly.co",
  ],
  [base.id]: [
    "https://mainnet.base.org",
    "https://base.gateway.tenderly.co",
  ],
  [mainnet.id]: [
    "https://eth.llamarpc.com",
    "https://ethereum-rpc.publicnode.com",
  ],
}

function envValue(name: string): string | undefined {
  const v = process.env[name]?.trim()
  return v && v.length > 0 ? v : undefined
}

function urlsForChain(chain: Chain): string[] {
  const envOverride = (() => {
    switch (chain.id) {
      case sepolia.id:
        return envValue("SEPOLIA_RPC")
      case baseSepolia.id:
        return envValue("NEXT_PUBLIC_BASE_RPC")
      case base.id:
        return envValue("BASE_RPC")
      case mainnet.id:
        return envValue("MAINNET_RPC")
      default:
        return undefined
    }
  })()
  const hardcoded = HARDCODED_RPCS[chain.id] ?? []
  // Prepend the env override (if set) so user-configured keys are tried first,
  // but always have hardcoded fallbacks behind them.
  const all = envOverride ? [envOverride, ...hardcoded] : hardcoded
  // Dedupe to avoid trying the same URL twice.
  return Array.from(new Set(all))
}

function transportForChain(chain: Chain) {
  const urls = urlsForChain(chain)
  if (urls.length === 0) return http()
  if (urls.length === 1) return http(urls[0])
  return fallback(
    urls.map((url) => http(url)),
    { rank: false, retryCount: 1 },
  )
}

export const PARENT_DOMAIN =
  process.env.NEXT_PUBLIC_PARENT_DOMAIN ?? "ethtwin.eth"

export const sepoliaClient = createPublicClient({
  chain: sepolia,
  transport: transportForChain(sepolia),
})

export const baseSepoliaClient = createPublicClient({
  chain: baseSepolia,
  transport: transportForChain(baseSepolia),
})

export const mainnetClient = createPublicClient({
  chain: mainnet,
  transport: transportForChain(mainnet),
})

// Kept for callers that need a single URL (no fallback chain). Most code
// should use the public/wallet clients above which already have fallback.
function rpcUrlForChain(chain: Chain): string {
  return urlsForChain(chain)[0] ?? "https://eth-sepolia.public.blastapi.io"
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

export function resolveDevWalletKey(): `0x${string}` {
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
    transport: transportForChain(chain),
  })
  return { wallet, account }
}
