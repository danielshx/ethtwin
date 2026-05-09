"use client"

// Polls the user's twin for new on-chain activity (incoming messages,
// inbound/outbound transfers) and surfaces them as live notifications.
//
// Two sources:
//   - /api/messages?for=<myEns>          → ENS-stored inbox
//   - /api/wallet-history?ens=<myEns>    → wallet on-chain activity (Alchemy)
//
// Per-ENS localStorage tracks which notification ids have already been seen
// so we only toast genuinely new items. The first load is silently primed
// so the user doesn't get a wall of toasts the second they sign in.

import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

export type NotificationKind = "message" | "transfer-in" | "transfer-out" | "other"

export type Notification = {
  id: string
  kind: NotificationKind
  /** Short headline shown in the notification list (one line). */
  title: string
  /** Optional secondary line — message body, tx hash, etc. */
  body?: string
  /** Counterparty ENS / address shown next to the avatar in the row. */
  from?: string
  at: number
  txHash?: string
  explorerUrl?: string
}

const POLL_MS = 30_000
const MAX_KEPT = 50
const SEEN_KEY = (ens: string) => `ethtwin.notifications.seen.${ens.toLowerCase()}`
const STORE_KEY = (ens: string) => `ethtwin.notifications.feed.${ens.toLowerCase()}`

function loadSeen(ens: string): Set<string> {
  if (typeof window === "undefined") return new Set()
  try {
    const raw = window.localStorage.getItem(SEEN_KEY(ens))
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return new Set(parsed.filter((x): x is string => typeof x === "string"))
  } catch {
    // ignore
  }
  return new Set()
}

function saveSeen(ens: string, ids: Set<string>) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(SEEN_KEY(ens), JSON.stringify([...ids]))
  } catch {
    // ignore
  }
}

function loadFeed(ens: string): Notification[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(STORE_KEY(ens))
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (Array.isArray(parsed)) return parsed as Notification[]
  } catch {
    // ignore
  }
  return []
}

function saveFeed(ens: string, items: Notification[]) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(STORE_KEY(ens), JSON.stringify(items.slice(0, MAX_KEPT)))
  } catch {
    // ignore
  }
}

type ApiMessage = { label?: string; from: string; body: string; at: number }
type ApiWalletTx = {
  txHash: `0x${string}`
  chain: string
  from: string
  to: string | null
  at: number
  summary: string
  explorerUrl: string
}

export function useNotifications(
  ensName: string | null,
  walletAddress: string | null,
) {
  const [items, setItems] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const seenRef = useRef<Set<string>>(new Set())
  const initializedRef = useRef(false)

  useEffect(() => {
    if (!ensName) {
      seenRef.current = new Set()
      initializedRef.current = false
      setItems([])
      setUnreadCount(0)
      return
    }
    seenRef.current = loadSeen(ensName)
    setItems(loadFeed(ensName))
  }, [ensName])

  const refresh = useCallback(async () => {
    if (!ensName) return
    const isInitial = !initializedRef.current
    const newItems: Notification[] = []
    try {
      const [msgRes, txRes] = await Promise.all([
        fetch(`/api/messages?for=${encodeURIComponent(ensName)}&limit=10`)
          .then((r) => r.json())
          .catch(() => ({ ok: false })),
        walletAddress
          ? fetch(`/api/wallet-history?ens=${encodeURIComponent(ensName)}&limit=20`)
              .then((r) => r.json())
              .catch(() => ({ ok: false }))
          : Promise.resolve({ ok: false }),
      ])

      // Inbox messages
      if (msgRes?.ok && Array.isArray(msgRes.messages)) {
        for (const m of msgRes.messages as ApiMessage[]) {
          const id = `msg:${m.label ?? `${m.from}-${m.at}`}`
          if (seenRef.current.has(id)) continue
          newItems.push({
            id,
            kind: "message",
            title: `New message from ${m.from}`,
            body: m.body,
            from: m.from,
            at: m.at,
          })
          seenRef.current.add(id)
        }
      }

      // Wallet on-chain activity
      if (txRes?.ok && Array.isArray(txRes.entries)) {
        const myLower = (walletAddress ?? "").toLowerCase()
        for (const t of txRes.entries as ApiWalletTx[]) {
          const id = `tx:${t.chain}:${t.txHash}`
          if (seenRef.current.has(id)) continue
          const isOutgoing = t.from?.toLowerCase() === myLower
          newItems.push({
            id,
            kind: isOutgoing ? "transfer-out" : "transfer-in",
            title: t.summary,
            from: isOutgoing ? (t.to ?? "") : t.from,
            at: t.at,
            txHash: t.txHash,
            explorerUrl: t.explorerUrl,
          })
          seenRef.current.add(id)
        }
      }
    } catch {
      // best-effort
    }

    if (newItems.length > 0) {
      saveSeen(ensName, seenRef.current)
      // Newest first.
      newItems.sort((a, b) => b.at - a.at)
      setItems((prev) => {
        const merged = [...newItems, ...prev].slice(0, MAX_KEPT)
        saveFeed(ensName, merged)
        return merged
      })
      // Suppress the initial flush so signing in doesn't bury the user in toasts.
      if (!isInitial) {
        setUnreadCount((c) => c + newItems.length)
        for (const n of newItems) {
          toast(n.title, n.body ? { description: n.body } : undefined)
        }
      }
    }
    initializedRef.current = true
  }, [ensName, walletAddress])

  useEffect(() => {
    if (!ensName) return
    refresh()
    const id = setInterval(refresh, POLL_MS)
    return () => clearInterval(id)
  }, [refresh, ensName])

  const markAllRead = useCallback(() => setUnreadCount(0), [])
  const clearFeed = useCallback(() => {
    if (!ensName) return
    saveFeed(ensName, [])
    setItems([])
    setUnreadCount(0)
  }, [ensName])

  return { items, unreadCount, refresh, markAllRead, clearFeed }
}
