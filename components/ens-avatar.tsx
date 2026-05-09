"use client"

// Single source of truth for displaying any twin's avatar by ENS name.
//
// Pipeline:
//   1. Look up the on-chain `avatar` text record via /api/agent/[ens]
//      (the route that's verified working — same path the profile dialog uses).
//   2. If empty / on-chain miss → use DiceBear seeded by the ENS label so
//      every twin still has a unique cartoon face (this is also the same URL
//      that gets written to ENS by default at onboarding, so the picture is
//      identical whether the record is set or not).
//   3. If even DiceBear fails to load → letter-initial circle.
//
// Callers just pass `ens`. No fetching, no fallback chains, no src wrangling.

import { useEffect, useState } from "react"
import { buildAvatarUrl } from "@/lib/twin-profile"
import { cn } from "@/lib/utils"

// Module-level cache so a single ens isn't re-fetched per row in long lists.
const cache = new Map<string, string | null>()
const inflight = new Map<string, Promise<string | null>>()

async function fetchEnsAvatar(ens: string): Promise<string | null> {
  if (cache.has(ens)) return cache.get(ens) ?? null
  const existing = inflight.get(ens)
  if (existing) return existing
  const p = fetch(`/api/agent/${encodeURIComponent(ens)}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((data: { ok?: boolean; avatar?: string | null } | null) =>
      data && data.ok ? (data.avatar ?? null) : null,
    )
    .catch(() => null)
    .then((avatar) => {
      cache.set(ens, avatar)
      inflight.delete(ens)
      return avatar
    })
  inflight.set(ens, p)
  return p
}

export function useEnsAvatar(ens: string | null | undefined): string | null {
  const [avatar, setAvatar] = useState<string | null>(
    ens ? (cache.get(ens) ?? null) : null,
  )
  useEffect(() => {
    if (!ens) {
      setAvatar(null)
      return
    }
    let cancelled = false
    fetchEnsAvatar(ens).then((v) => {
      if (!cancelled) setAvatar(v)
    })
    return () => {
      cancelled = true
    }
  }, [ens])
  return avatar
}

type EnsAvatarProps = {
  ens: string
  size?: number
  className?: string
}

export function EnsAvatar({ ens, size = 32, className }: EnsAvatarProps) {
  const onChainAvatar = useEnsAvatar(ens)
  const label = ens.split(".")[0] ?? ens
  const dicebearUrl = buildAvatarUrl(label)
  // Source priority: on-chain ENS → DiceBear (deterministic per label) → letter.
  // We track which one we're rendering so onError can step down without losing
  // the on-chain attempt entirely on the first paint.
  const candidate = onChainAvatar ?? dicebearUrl
  const [errored, setErrored] = useState(false)
  // Reset error state when the source URL changes (e.g. user edited their
  // avatar on-chain and the cache flipped to a new URL).
  useEffect(() => {
    setErrored(false)
  }, [candidate])

  const initial = label.charAt(0).toUpperCase()

  if (errored) {
    return (
      <span
        className={cn(
          "inline-grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary/40 to-fuchsia-500/40 font-mono text-xs font-semibold text-primary-foreground",
          className,
        )}
        style={{ width: size, height: size }}
        aria-label={`${ens} avatar`}
      >
        {initial}
      </span>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={candidate}
      alt={`${ens} avatar`}
      width={size}
      height={size}
      onError={() => setErrored(true)}
      className={cn("shrink-0 rounded-full bg-card object-cover", className)}
      style={{ width: size, height: size }}
    />
  )
}
