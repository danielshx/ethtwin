// Default profile records for newly minted twins.
//
// avatar — generated via DiceBear (avataaars style). DiceBear renders a unique
// cartoon profile picture deterministically from any seed string, in <50ms.
// Previously we used Pollinations.ai but it generates on-demand (5–15s) and
// frequently times out, causing every twin to fall back to a letter initial.
//
// url — points at the live deployment so anyone resolving the twin's ENS
// `url` text record gets dropped at the actual app. Override per-deploy via
// NEXT_PUBLIC_APP_URL.

// Live deployment URL. eth.limo (the public ENS-to-HTTPS gateway) only
// resolves *mainnet* ENS records, but our twins live on Sepolia ENS — using
// `ethtwin.eth.limo` would dead-end. Point at the Vercel app instead.
const DEFAULT_BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://ethtwin-woad.vercel.app"

/**
 * Build a deterministic DiceBear avatar URL for an ENS label.
 * Same label → same picture, every time, anywhere.
 *   buildAvatarUrl("daniel")     → cartoon-person seeded by "daniel"
 *   buildAvatarUrl("cato")       → cartoon-person seeded by "cato"
 *   buildAvatarUrl("lighthouse") → cartoon-person seeded by "lighthouse"
 */
export function buildAvatarUrl(label: string): string {
  const seed = label.toLowerCase().trim() || "twin"
  return `https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent(seed)}&backgroundType=gradientLinear&backgroundColor=b4a7ff,d9b3ff,a78bfa,c4a8ff`
}

/**
 * DiceBear is so reliable we use it as both the *primary* avatar source AND
 * as a graceful fallback when an arbitrary user-supplied avatar URL (e.g.
 * a stale Pollinations link saved to an ENS text record) fails to load.
 */
export function buildAvatarFallbackUrl(label: string): string {
  return buildAvatarUrl(label)
}

/**
 * Default `description` text record for a freshly minted twin.
 */
export function defaultDescription(label: string): string {
  return `${label}'s AI twin — lives in ENS, transacts on-chain, talks to other twins.`
}

/**
 * Default `url` text record for a freshly minted twin.
 */
export function defaultUrl(): string {
  return DEFAULT_BASE_URL
}

/**
 * Build the full default profile record set for a new twin. The onboarding
 * route merges this with twin-specific records (persona, capabilities, etc.).
 *
 * `avatar` is set deterministically from the label so every freshly minted
 * twin shows up with a unique cartoon profile picture in the messenger /
 * directory immediately — exactly the way each chat row has a face in
 * WhatsApp. The user can override this anytime via the profile editor.
 */
export function buildDefaultProfileRecords(label: string): Record<string, string> {
  return {
    avatar: buildAvatarUrl(label),
    description: defaultDescription(label),
    url: defaultUrl(),
  }
}
