"use client"

import { useEffect, useState } from "react"

// Module-level cache so the same ens isn't re-fetched on every render across
// every component that mounts an avatar. Lives for the page session.
const cache = new Map<string, string | null>()
const inflight = new Map<string, Promise<string | null>>()

async function fetchAvatar(ens: string): Promise<string | null> {
  if (cache.has(ens)) return cache.get(ens) ?? null
  const existing = inflight.get(ens)
  if (existing) return existing
  const p = fetch(`/api/agent/${encodeURIComponent(ens)}`)
    .then((r) => r.json())
    .then((data: { ok?: boolean; avatar?: string | null }) =>
      data.ok ? (data.avatar ?? null) : null,
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

/**
 * Returns the on-chain `avatar` text record for an ENS name, or null while
 * loading / on miss. AvatarImage will fall back to the initial-letter circle
 * when this is null, so callers don't need to handle the loading state.
 */
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
    fetchAvatar(ens).then((v) => {
      if (!cancelled) setAvatar(v)
    })
    return () => {
      cancelled = true
    }
  }, [ens])
  return avatar
}
