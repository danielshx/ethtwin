"use client"

// Client-side ENS reverse-resolution hook for tx-approval-modal callers.
//
// Per CLAUDE.md: "Tx approvals show ENS reverse-resolved names, never 0x...".
// This hook is the canonical way to populate `toEnsName` / `fromEnsName`
// on `<TxApprovalModal />`. Resolves against Sepolia (where our subnames
// live — `*.ethtwin.eth`).
//
// Usage:
//   const toEns   = useEnsName(intent?.to)
//   const fromEns = useEnsName(intent?.from)
//   <TxApprovalModal
//     intent={{ ...intent, toEnsName: toEns, fromEnsName: fromEns }}
//     ... />
//
// Returns `null` while loading or when no name is set on-chain. The modal
// already falls back to a truncated 0x… in that case, so passing `null`
// is safe.

import { useEffect, useState } from "react"
import { createPublicClient, http } from "viem"
import { sepolia } from "viem/chains"

// One client per module; reused across all hook instances.
const ensClient = createPublicClient({
  chain: sepolia,
  transport: http(process.env.NEXT_PUBLIC_SEPOLIA_RPC ?? undefined),
})

// In-memory cache so we never re-hit the RPC for the same address within
// the page's lifetime. Reverse records change rarely, the demo runs for
// minutes — this is fine.
const cache = new Map<string, string | null>()
const inflight = new Map<string, Promise<string | null>>()

function isAddress(value: string | null | undefined): value is `0x${string}` {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value)
}

async function resolveOnce(address: `0x${string}`): Promise<string | null> {
  const key = address.toLowerCase()
  if (cache.has(key)) return cache.get(key)!
  const existing = inflight.get(key)
  if (existing) return existing
  const promise = ensClient
    .getEnsName({ address })
    .then((name) => {
      cache.set(key, name ?? null)
      return name ?? null
    })
    .catch(() => {
      cache.set(key, null)
      return null
    })
    .finally(() => {
      inflight.delete(key)
    })
  inflight.set(key, promise)
  return promise
}

/**
 * Reverse-resolves an EVM address to its ENS name on Sepolia.
 * Returns `null` while loading, on error, or when no name is set.
 * Safe to call with `undefined` / non-address strings — returns `null`.
 */
export function useEnsName(
  address: string | null | undefined,
): string | null {
  const [name, setName] = useState<string | null>(() => {
    if (!isAddress(address)) return null
    return cache.get(address.toLowerCase()) ?? null
  })

  useEffect(() => {
    if (!isAddress(address)) {
      setName(null)
      return
    }
    let cancelled = false
    const cached = cache.get(address.toLowerCase())
    if (cached !== undefined) {
      setName(cached)
      return
    }
    setName(null)
    resolveOnce(address).then((resolved) => {
      if (!cancelled) setName(resolved)
    })
    return () => {
      cancelled = true
    }
  }, [address])

  return name
}

/**
 * Convenience: resolve `from` and `to` at once. Useful right before
 * opening `<TxApprovalModal />`.
 */
export function useEnsNamesForTx(
  from: string | null | undefined,
  to: string | null | undefined,
): { fromEnsName: string | null; toEnsName: string | null } {
  return {
    fromEnsName: useEnsName(from),
    toEnsName: useEnsName(to),
  }
}
