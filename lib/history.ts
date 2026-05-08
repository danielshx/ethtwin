"use client"

// Client-side history facade. Hybrid storage:
//   - localStorage for instant UI updates + offline cache
//   - Server-side (lib/history-server.ts via /api/history) for cross-device + post-logout durability
//
// Adds:
//   addHistoryEntry({ ..., status, syncTo? })
//     • status defaults to "success" so existing call sites stay correct
//     • syncTo: { ens, getAuthToken } triggers a fire-and-forget POST to /api/history
//
// Reads:
//   useHistory({ ens })
//     • merges server entries (source of truth) with local cache
//     • dedup by id, server wins on conflict
//     • re-fetches when storage event fires or another component writes

import { useCallback, useEffect, useState } from "react"

export type HistoryKind = "transfer" | "message" | "mint" | "stealth-send" | "other"
export type HistoryStatus = "success" | "failed" | "pending"

export type HistoryEntry = {
  id: string
  at: number // unix seconds
  kind: HistoryKind
  status: HistoryStatus
  summary: string
  description?: string
  txHash?: string
  explorerUrl?: string
  chain?: string
  errorMessage?: string
}

export type SyncTarget = {
  ens: string
  getAuthToken: () => Promise<string | null>
}

const STORAGE_KEY = "ethtwin.history.v1"
const MAX_ENTRIES = 100
const UPDATE_EVENT = "ethtwin:history-updated"

function isBrowser() {
  return typeof window !== "undefined"
}

function getLocal(): HistoryEntry[] {
  if (!isBrowser()) return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    // Backfill `status` for entries written before this field existed.
    return (parsed as HistoryEntry[]).map((e) => ({ ...e, status: e.status ?? "success" }))
  } catch {
    return []
  }
}

function writeLocal(entries: HistoryEntry[]) {
  if (!isBrowser()) return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
    window.dispatchEvent(new CustomEvent(UPDATE_EVENT))
  } catch {
    // out of quota — drop quietly
  }
}

export function getHistory(): HistoryEntry[] {
  return getLocal()
}

async function postToServer(entry: HistoryEntry, target: SyncTarget) {
  try {
    const token = await target.getAuthToken()
    if (!token) return
    await fetch("/api/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        privyToken: token,
        ens: target.ens,
        id: entry.id,
        kind: entry.kind,
        status: entry.status,
        summary: entry.summary,
        ...(entry.description !== undefined && { description: entry.description }),
        ...(entry.txHash !== undefined && { txHash: entry.txHash }),
        ...(entry.explorerUrl !== undefined && { explorerUrl: entry.explorerUrl }),
        ...(entry.chain !== undefined && { chain: entry.chain }),
        ...(entry.errorMessage !== undefined && { errorMessage: entry.errorMessage }),
      }),
    })
    if (isBrowser()) {
      // Let any subscribed useHistory re-fetch from server after the POST lands.
      window.dispatchEvent(new CustomEvent(UPDATE_EVENT))
    }
  } catch {
    // Best-effort. Local copy still exists in localStorage.
  }
}

export function addHistoryEntry(
  entry: Omit<HistoryEntry, "id" | "at" | "status"> & {
    id?: string
    status?: HistoryStatus
    syncTo?: SyncTarget
  },
): HistoryEntry {
  const full: HistoryEntry = {
    id: entry.id ?? entry.txHash ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: Math.floor(Date.now() / 1000),
    kind: entry.kind,
    status: entry.status ?? "success",
    summary: entry.summary,
    ...(entry.description !== undefined && { description: entry.description }),
    ...(entry.txHash !== undefined && { txHash: entry.txHash }),
    ...(entry.explorerUrl !== undefined && { explorerUrl: entry.explorerUrl }),
    ...(entry.chain !== undefined && { chain: entry.chain }),
    ...(entry.errorMessage !== undefined && { errorMessage: entry.errorMessage }),
  }
  // 1. Optimistic local write (instant UI).
  const current = getLocal()
  const filtered = current.filter((e) => e.id !== full.id)
  const next = [full, ...filtered].slice(0, MAX_ENTRIES)
  writeLocal(next)

  // 2. Fire-and-forget server sync if a target is provided.
  if (entry.syncTo) {
    void postToServer(full, entry.syncTo)
  }
  return full
}

export function clearHistory() {
  if (!isBrowser()) return
  try {
    localStorage.removeItem(STORAGE_KEY)
    window.dispatchEvent(new CustomEvent(UPDATE_EVENT))
  } catch {
    // ignore
  }
}

/**
 * Hybrid hook: reads server (when an ens is provided) + local cache, merges,
 * de-dups by id (server wins). Refetches on storage / custom events.
 */
export function useHistory(opts: { ens?: string | null } = {}): HistoryEntry[] {
  const { ens } = opts
  const [local, setLocal] = useState<HistoryEntry[]>([])
  const [server, setServer] = useState<HistoryEntry[]>([])

  const refreshLocal = useCallback(() => setLocal(getLocal()), [])

  const refreshServer = useCallback(async () => {
    if (!ens) {
      setServer([])
      return
    }
    try {
      const res = await fetch(`/api/history?for=${encodeURIComponent(ens)}`)
      const data = (await res.json()) as { ok: boolean; entries?: HistoryEntry[] }
      if (data.ok && data.entries) setServer(data.entries)
    } catch {
      // keep last known
    }
  }, [ens])

  useEffect(() => {
    refreshLocal()
    refreshServer()
    const onCustom = () => {
      refreshLocal()
      refreshServer()
    }
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) refreshLocal()
    }
    window.addEventListener(UPDATE_EVENT, onCustom as EventListener)
    window.addEventListener("storage", onStorage)
    return () => {
      window.removeEventListener(UPDATE_EVENT, onCustom as EventListener)
      window.removeEventListener("storage", onStorage)
    }
  }, [refreshLocal, refreshServer])

  // Merge server (source of truth) + local (cache for entries server hasn't seen yet).
  // Dedup by id, server wins.
  const seen = new Set<string>()
  const merged: HistoryEntry[] = []
  for (const e of server) {
    if (!seen.has(e.id)) {
      merged.push(e)
      seen.add(e.id)
    }
  }
  for (const e of local) {
    if (!seen.has(e.id)) {
      merged.push(e)
      seen.add(e.id)
    }
  }
  merged.sort((a, b) => b.at - a.at)
  return merged
}
