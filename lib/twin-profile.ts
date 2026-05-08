// Default profile records for newly minted twins.
//
// avatar — generated via Pollinations.ai. The prompt is intentionally generic
// ("profile avatar of <label>...") so it works whether the label is a name
// ("daniel", "alice"), an animal ("tiger", "owl"), an object ("lighthouse"),
// or anything in between. The seed is a deterministic hash of the label so
// the same name always renders the same image.
//
// url — defaults to the public ethtwin.eth gateway. Override per-deploy via
// NEXT_PUBLIC_APP_URL.

const DEFAULT_BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://ethtwin.eth.limo"

function seedFromLabel(label: string): number {
  let h = 0
  for (let i = 0; i < label.length; i++) {
    h = (h * 31 + label.charCodeAt(i)) >>> 0
  }
  // Pollinations accepts a wide seed range; keep it small for short URLs.
  return h % 100_000
}

/**
 * Build a deterministic Pollinations.ai image URL for an ENS label.
 * Examples:
 *   buildAvatarUrl("daniel")     → portrait of a person named daniel
 *   buildAvatarUrl("tiger")      → tiger illustration
 *   buildAvatarUrl("lighthouse") → stylized lighthouse
 *
 * The prompt is generic enough that the model handles all three classes well.
 */
export function buildAvatarUrl(label: string): string {
  const cleaned = label.replace(/-/g, " ").trim()
  const prompt = `profile avatar of ${cleaned}, illustrated, vibrant pastel colors, centered composition, clean simple background, digital art portrait`
  const seed = seedFromLabel(label)
  // nologo=true strips the Pollinations watermark; enhance=true cleans up details
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=400&height=400&nologo=true&seed=${seed}`
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
 */
export function buildDefaultProfileRecords(label: string): Record<string, string> {
  return {
    avatar: buildAvatarUrl(label),
    description: defaultDescription(label),
    url: defaultUrl(),
  }
}
