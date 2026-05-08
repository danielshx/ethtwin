"use client"

// Shared on-chain action history. localStorage-backed so it survives reloads
// and is visible across tabs (Send Tokens / Messenger / Onboarding all push here).
//
// Wire-up:
//   import { addHistoryEntry, useHistory } from "@/lib/history"
//   addHistoryEntry({ kind: "transfer", summary: "Sent 0.5 USDC", ... })
//
// Components that want to react to changes use the `useHistory` hook.

import { useEffect, useState } from "react"

export type HistoryKind = "transfer" | "message" | "mint" | "stealth-send" | "other"

export type HistoryEntry = {
  id: string
  at: number // unix seconds
  kind: HistoryKind
  summary: string
  description?: string
  txHash?: string
  explorerUrl?: string
  chain?: string
}

const STORAGE_KEY = "ethtwin.history.v1"
const MAX_ENTRIES = 100
const UPDATE_EVENT = "ethtwin:history-updated"

function isBrowser() {
  return typeof window !== "undefined"
}

export function getHistory(): HistoryEntry[] {
  if (!isBrowser()) return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed as HistoryEntry[]
  } catch {
    return []
  }
}

function writeHistory(entries: HistoryEntry[]) {
  if (!isBrowser()) return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
    window.dispatchEvent(new CustomEvent(UPDATE_EVENT))
  } catch {
    // out of quota — drop quietly
  }
}

export function addHistoryEntry(
  entry: Omit<HistoryEntry, "id" | "at">,
): HistoryEntry {
  const full: HistoryEntry = {
    id:
      entry.txHash ??
      `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: Math.floor(Date.now() / 1000),
    ...entry,
  }
  const current = getHistory()
  // De-dup by id (txHash usually) so re-mounts don't double-record.
  const filtered = current.filter((e) => e.id !== full.id)
  const next = [full, ...filtered].slice(0, MAX_ENTRIES)
  writeHistory(next)
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
 * Subscribe to the shared history. Returns a stable list that updates when
 * any component (or another tab via the storage event) writes a new entry.
 */
export function useHistory(): HistoryEntry[] {
  const [entries, setEntries] = useState<HistoryEntry[]>([])

  useEffect(() => {
    setEntries(getHistory())
    const refresh = () => setEntries(getHistory())
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) refresh()
    }
    window.addEventListener(UPDATE_EVENT, refresh as EventListener)
    window.addEventListener("storage", onStorage)
    return () => {
      window.removeEventListener(UPDATE_EVENT, refresh as EventListener)
      window.removeEventListener("storage", onStorage)
    }
  }, [])

  return entries
}
