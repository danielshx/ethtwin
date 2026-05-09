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
// Tracks incoming-message ids we've already triggered an autonomous reply for.
// Prevents the user's twin from re-replying to the same message on every poll
// and prevents tight auto-reply loops (peer's auto-reply also triggers ours).
const REPLIED_KEY = (ens: string) =>
  `ethtwin.notifications.autoReplied.${ens.toLowerCase()}`
// Don't auto-reply to messages older than this on first load — otherwise
// signing in after several missed messages would generate a burst of replies.
const AUTO_REPLY_FRESHNESS_S = 600 // 10 minutes
// Cooldown per peer ENS so a fast back-and-forth can't degenerate into a loop.
const AUTO_REPLY_PEER_COOLDOWN_MS = 60_000

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

function loadReplied(ens: string): Set<string> {
  if (typeof window === "undefined") return new Set()
  try {
    const raw = window.localStorage.getItem(REPLIED_KEY(ens))
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return new Set(parsed.filter((x): x is string => typeof x === "string"))
  } catch {
    // ignore
  }
  return new Set()
}

function saveReplied(ens: string, ids: Set<string>) {
  if (typeof window === "undefined") return
  try {
    // Cap to last ~200 ids — long enough to dedupe within a poll cycle but
    // bounded so localStorage doesn't grow forever.
    const trimmed = Array.from(ids).slice(-200)
    window.localStorage.setItem(REPLIED_KEY(ens), JSON.stringify(trimmed))
  } catch {
    // ignore
  }
}

type ApiMessage = {
  // New chat-subname architecture: a message is identified by its chat ENS
  // + its index within that chat's `msg.<i>` records. `label` was the
  // per-message subname under the old layout — kept here for backwards
  // compat with any in-flight messages from before the migration.
  chatEns?: string
  index?: number
  label?: string
  from: string
  body: string
  at: number
}
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
  const repliedRef = useRef<Set<string>>(new Set())
  const peerCooldownRef = useRef<Map<string, number>>(new Map())
  const initializedRef = useRef(false)

  useEffect(() => {
    if (!ensName) {
      seenRef.current = new Set()
      repliedRef.current = new Set()
      peerCooldownRef.current = new Map()
      initializedRef.current = false
      setItems([])
      setUnreadCount(0)
      return
    }
    seenRef.current = loadSeen(ensName)
    repliedRef.current = loadReplied(ensName)
    setItems(loadFeed(ensName))
  }, [ensName])

  // Fire an autonomous reply via /api/twin/auto-reply. Used when the user's
  // twin receives a message from a peer agent — the twin responds in the user's
  // persona without the user having to type anything.
  const triggerAutoReply = useCallback(
    async (myEns: string, peerEns: string, body: string) => {
      try {
        await fetch("/api/twin/auto-reply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fromEns: myEns,
            toEns: peerEns,
            incomingBody: body,
          }),
        })
      } catch {
        // best-effort — if the auto-reply fails the user can still reply manually
      }
    },
    [],
  )

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
        const nowSec = Math.floor(Date.now() / 1000)
        const myEnsLower = ensName.toLowerCase()
        for (const m of msgRes.messages as ApiMessage[]) {
          // Skip our own outgoing messages — the chat-subname inbox returns
          // BOTH directions of every conversation (it's the sender's own
          // chats.list pointing at the same chat record), and surfacing
          // self-sent items as "New message from <me>" is jarring noise.
          if (m.from.toLowerCase() === myEnsLower) continue

          // Stable per-message id: prefer the new (chatEns, index) coordinate
          // when present; fall back to the legacy label or the (from, at)
          // pair so notifications still de-dupe across the migration.
          const id = `msg:${
            m.chatEns && typeof m.index === "number"
              ? `${m.chatEns}#${m.index}`
              : m.label ?? `${m.from}-${m.at}`
          }`
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

          // Autonomous reply: if the message is recent, from a known
          // *.ethtwin.eth peer, hasn't been replied to yet, and the per-peer
          // cooldown is clear, kick the user's twin to answer in their persona.
          const peerLower = m.from.toLowerCase()
          const isPeerAgent = peerLower.endsWith(".ethtwin.eth")
          const isFresh = nowSec - m.at <= AUTO_REPLY_FRESHNESS_S
          const alreadyReplied = repliedRef.current.has(id)
          const lastReplyAt = peerCooldownRef.current.get(peerLower) ?? 0
          const cooldownClear = Date.now() - lastReplyAt >= AUTO_REPLY_PEER_COOLDOWN_MS
          if (
            isPeerAgent &&
            isFresh &&
            !alreadyReplied &&
            cooldownClear &&
            peerLower !== ensName.toLowerCase()
          ) {
            repliedRef.current.add(id)
            peerCooldownRef.current.set(peerLower, Date.now())
            saveReplied(ensName, repliedRef.current)
            // Fire-and-forget — the reply will land on chain within ~25s and
            // surface as its own notification on the next poll cycle.
            void triggerAutoReply(ensName, m.from, m.body)
          }
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
  }, [ensName, walletAddress, triggerAutoReply])

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
