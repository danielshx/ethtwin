"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { motion } from "framer-motion"
import { Loader2, Mail, Search, Send, Users } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { addHistoryEntry } from "@/lib/history"
import { displayNameFromEns } from "@/lib/ens"
import { cn } from "@/lib/utils"
import { AgentProfileDialog } from "@/components/agent-profile"
import { EnsAvatar } from "@/components/ens-avatar"
import { BountyTrail } from "@/components/bounty-trail"

type AgentEntry = {
  ens: string
  addedAt: number
  avatar?: string | null
  description?: string | null
}
// Message shape returned by /api/messages — matches lib/messages.ts. The
// chat-as-ENS-subname architecture means a message's identity within its
// thread is `(chatEns, index)`, not a per-message ENS label.
type Message = {
  index: number
  chatEns: string
  from: string
  body: string
  at: number
  stealth?: boolean
  cosmicAttestation?: string
  /** SpaceComputer KMS signature verified against sender's ENS-published key. */
  kmsVerified?: boolean
  kmsSig?: string | null
}

type MessengerProps = {
  myEnsName: string
  getAuthToken: () => Promise<string | null>
  className?: string
}

// Two cadences:
//   - SLOW: steady-state polling once we know the chat exists on-chain.
//   - FAST: the first 60s after a send, while the records-multicall is mining.
//     The chat thread can take ~12-24s on Sepolia; without a fast cadence the
//     sender stares at an empty thread for a full SLOW interval.
const POLL_INTERVAL_SLOW_MS = 15_000
const POLL_INTERVAL_FAST_MS = 3_000
const FAST_POLL_DURATION_MS = 60_000

const SAVED_CHATS_KEY = (ens: string) => `ethtwin.savedChats.${ens.toLowerCase()}`

function loadSavedChats(myEnsName: string): string[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(SAVED_CHATS_KEY(myEnsName))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === "string")
  } catch {
    // ignore
  }
  return []
}

function persistSavedChats(myEnsName: string, list: string[]) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(SAVED_CHATS_KEY(myEnsName), JSON.stringify(list))
  } catch {
    // ignore
  }
}

export function Messenger({ myEnsName, getAuthToken, className }: MessengerProps) {
  const [agents, setAgents] = useState<AgentEntry[]>([])
  const [agentsLoading, setAgentsLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)
  const [manualInput, setManualInput] = useState("")
  // On-chain messages for the currently selected pair — read directly from
  // chat-subname `msg.<i>` records, no chats.list lookup needed.
  const [chainMessages, setChainMessages] = useState<Message[]>([])
  // Optimistic messages waiting for the on-chain version to land. Keyed by
  // a synthetic local id; we drop them once a matching message (same body +
  // sender + within ±60s) appears in chainMessages.
  const [pendingMessages, setPendingMessages] = useState<Message[]>([])
  const [threadLoading, setThreadLoading] = useState(false)
  const [composing, setComposing] = useState("")
  const [sending, setSending] = useState(false)
  const [profileEns, setProfileEns] = useState<string | null>(null)
  const [savedChats, setSavedChats] = useState<string[]>([])
  // Timestamp of the last send. Drives the fast-polling window.
  const [lastSendAt, setLastSendAt] = useState<number | null>(null)

  // Load saved chats from localStorage on mount / when ens changes.
  useEffect(() => {
    setSavedChats(loadSavedChats(myEnsName))
  }, [myEnsName])

  const saveChat = useCallback(
    (ens: string) => {
      const lower = ens.toLowerCase()
      if (lower === myEnsName.toLowerCase()) return
      setSavedChats((prev) => {
        if (prev.some((e) => e.toLowerCase() === lower)) return prev
        const next = [lower, ...prev]
        persistSavedChats(myEnsName, next)
        return next
      })
    },
    [myEnsName],
  )

  const removeChat = useCallback(
    (ens: string) => {
      const lower = ens.toLowerCase()
      setSavedChats((prev) => {
        const next = prev.filter((e) => e.toLowerCase() !== lower)
        persistSavedChats(myEnsName, next)
        return next
      })
    },
    [myEnsName],
  )

  const selectedAgent = useMemo(
    () => agents.find((a) => a.ens.toLowerCase() === selected?.toLowerCase()),
    [agents, selected],
  )

  // Combined thread = on-chain messages + any optimistic pending messages
  // not yet confirmed on-chain. Oldest → newest.
  const thread = useMemo<Message[]>(() => {
    if (!selected) return []
    return [...chainMessages, ...pendingMessages].sort((a, b) => a.at - b.at)
  }, [chainMessages, pendingMessages, selected])

  // Auto-scroll to newest. Radix `<ScrollArea>` renders a custom viewport
  // (an inner div with `data-radix-scroll-area-viewport`); plain
  // `scrollIntoView` on a sentinel doesn't bubble through it correctly.
  // We climb to the viewport from the sentinel and set scrollTop directly,
  // which works whether the viewport is overflow-auto or overflow-hidden.
  const threadEndRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!selected) return
    const sentinel = threadEndRef.current
    if (!sentinel) return
    // rAF lets layout settle (new bubble inserted) before we measure.
    const raf = requestAnimationFrame(() => {
      const viewport = sentinel.closest(
        "[data-radix-scroll-area-viewport]",
      ) as HTMLElement | null
      if (viewport) {
        viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" })
      } else {
        sentinel.scrollIntoView({ behavior: "smooth", block: "end" })
      }
    })
    return () => cancelAnimationFrame(raf)
  }, [thread.length, selected])

  // Load agent directory once on mount.
  const loadAgents = useCallback(async () => {
    setAgentsLoading(true)
    try {
      const res = await fetch("/api/agents")
      const data = (await res.json()) as { ok: boolean; agents?: AgentEntry[] }
      if (data.ok && data.agents) {
        const filtered = data.agents.filter(
          (a) => a.ens.toLowerCase() !== myEnsName.toLowerCase(),
        )
        setAgents(filtered)
      }
    } catch {
      // silent fail — directory is best-effort
    } finally {
      setAgentsLoading(false)
    }
  }, [myEnsName])

  useEffect(() => {
    loadAgents()
  }, [loadAgents])

  // WhatsApp-style contact persistence:
  // pull every chat-* subname from MY twin's `chats.list` text record,
  // derive the peer ENS for each, and seed savedChats on-chain. This means
  // every conversation you've ever had shows up in the sidebar even from a
  // fresh browser, because the source-of-truth lives on Sepolia ENS.
  const loadOnChainContacts = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/messages?for=${encodeURIComponent(myEnsName)}&limit=50`,
      )
      const data = (await res.json()) as {
        ok?: boolean
        messages?: Array<{ from: string }>
      }
      if (!data.ok || !Array.isArray(data.messages)) return
      // For every distinct counterparty we've messaged with, ensure it's in
      // savedChats. The inbox includes BOTH directions (our sends + theirs)
      // so we just need to pick the non-me side of each chat.
      const myLower = myEnsName.toLowerCase()
      const peers = new Set<string>()
      for (const m of data.messages) {
        const from = m.from?.toLowerCase()
        if (from && from !== myLower) peers.add(from)
      }
      if (peers.size === 0) return
      setSavedChats((prev) => {
        const set = new Set(prev.map((p) => p.toLowerCase()))
        let changed = false
        for (const peer of peers) {
          if (!set.has(peer)) {
            set.add(peer)
            changed = true
          }
        }
        if (!changed) return prev
        const next = Array.from(set)
        persistSavedChats(myEnsName, next)
        return next
      })
    } catch {
      // best-effort — sidebar still works without on-chain contact load
    }
  }, [myEnsName])

  useEffect(() => {
    loadOnChainContacts()
  }, [loadOnChainContacts])

  // Reload thread whenever the selected contact changes, then poll. Reads
  // the chat thread directly via the deterministic chat-subname for the
  // pair — skips `chats.list` so the *very first* message on a brand-new
  // chat is visible as soon as the multicall lands, without waiting for the
  // chats.list update on either twin.
  const loadThread = useCallback(async () => {
    if (!selected) return
    setThreadLoading(true)
    try {
      const res = await fetch(
        `/api/messages?between=${encodeURIComponent(myEnsName)}&and=${encodeURIComponent(selected)}`,
      )
      const data = (await res.json()) as { ok: boolean; messages?: Message[] }
      if (data.ok && Array.isArray(data.messages)) {
        // Only commit a non-empty result OR an empty result when we don't
        // already have on-chain messages. Prevents a brief 502 / racy read
        // from blanking the thread the user is staring at.
        if (data.messages.length > 0) {
          setChainMessages(data.messages)
        } else {
          setChainMessages((prev) => (prev.length === 0 ? [] : prev))
        }
      }
    } catch {
      // silent — keep last known state
    } finally {
      setThreadLoading(false)
    }
  }, [selected, myEnsName])

  // Drop any optimistic pending message that now appears in the on-chain
  // thread — match on (from, body) since timestamps differ slightly between
  // optimistic local time and the on-chain `at` field.
  useEffect(() => {
    if (pendingMessages.length === 0 || chainMessages.length === 0) return
    setPendingMessages((prev) =>
      prev.filter(
        (p) =>
          !chainMessages.some(
            (c) =>
              c.from.toLowerCase() === p.from.toLowerCase() &&
              c.body === p.body &&
              Math.abs(c.at - p.at) < 120,
          ),
      ),
    )
  }, [chainMessages, pendingMessages.length])

  useEffect(() => {
    if (!selected) return
    loadThread()
    // Use the fast cadence while a recent send is still propagating, then
    // fall back to the slow cadence. A tiny clock-driven re-eval makes this
    // self-healing if the user sends multiple messages.
    const interval =
      lastSendAt && Date.now() - lastSendAt < FAST_POLL_DURATION_MS
        ? POLL_INTERVAL_FAST_MS
        : POLL_INTERVAL_SLOW_MS
    const id = setInterval(loadThread, interval)
    return () => clearInterval(id)
  }, [selected, loadThread, lastSendAt])

  const selectAgent = useCallback(
    (ens: string) => {
      setSelected(ens)
      setChainMessages([])
      setPendingMessages([])
      saveChat(ens)
    },
    [saveChat],
  )

  function handleManualOpen() {
    const raw = manualInput.trim().toLowerCase()
    if (!raw) return
    const cleaned = raw.endsWith(".ethtwin.eth") ? raw : `${raw}.ethtwin.eth`
    if (cleaned === myEnsName.toLowerCase()) {
      toast.error("You can't message yourself.")
      return
    }
    selectAgent(cleaned)
    setManualInput("")
  }

  // Union of on-chain directory + locally saved chats (deduped, saved entries first).
  const allEntries = useMemo<AgentEntry[]>(() => {
    const byEns = new Map<string, AgentEntry>()
    // saved first so they take precedence in ordering
    for (const ens of savedChats) {
      byEns.set(ens.toLowerCase(), { ens, addedAt: 0 })
    }
    for (const a of agents) {
      const key = a.ens.toLowerCase()
      const existing = byEns.get(key)
      byEns.set(key, { ...a, ens: a.ens, addedAt: existing?.addedAt ?? a.addedAt })
    }
    return Array.from(byEns.values())
  }, [agents, savedChats])

  const filteredAgents = useMemo(() => {
    const q = manualInput.trim().toLowerCase()
    if (!q) return allEntries
    return allEntries.filter((a) => a.ens.toLowerCase().includes(q))
  }, [allEntries, manualInput])

  async function handleSend() {
    const body = composing.trim()
    if (!body || !selected || sending) return
    setSending(true)
    try {
      // Privy access token is best-effort — the KMS-onboarded flow doesn't
      // have one, and the server treats it as optional. Don't gate the send.
      const token = await getAuthToken().catch(() => null)
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          privyToken: token,
          fromEns: myEnsName,
          toEns: selected,
          body,
        }),
      })
      // Vercel function timeouts return plain text, not JSON — parse defensively.
      const ct = res.headers.get("content-type") ?? ""
      if (!ct.includes("application/json")) {
        const text = await res.text()
        toast.error(
          res.status === 504
            ? "Vercel timed out, but your message txs may still be on-chain — check the History tab in ~30s."
            : `Server error ${res.status}: ${text.slice(0, 120)}`,
        )
        return
      }
      const data = (await res.json()) as {
        ok: boolean
        error?: string
        message?: Message
        blockExplorerUrl?: string
      }
      if (!data.ok) {
        toast.error(data.error ?? "Send failed")
        addHistoryEntry({
          kind: "message",
          status: "failed",
          chain: "sepolia",
          summary: `Failed message → ${selected}`,
          description: body.slice(0, 80),
          errorMessage: data.error,
          syncTo: { ens: myEnsName, getAuthToken },
        })
        return
      }
      setComposing("")
      toast.success("Message broadcast — landing on-chain", {
        description: data.blockExplorerUrl,
      })
      addHistoryEntry({
        kind: "message",
        status: "success",
        chain: "sepolia",
        summary: `Message → ${selected}`,
        description: data.message?.body
          ? data.message.body.slice(0, 80) +
            (data.message.body.length > 80 ? "…" : "")
          : body.slice(0, 80),
        explorerUrl: data.blockExplorerUrl,
        syncTo: { ens: myEnsName, getAuthToken },
      })
      // Optimistic: keep the message visible until the polling read picks
      // up the confirmed on-chain version. The dedupe effect drops it once
      // a matching (from, body, ±120s) entry appears in chainMessages.
      if (data.message) {
        setPendingMessages((prev) => [...prev, data.message!])
      }
      // Trigger fast-polling for the next 60s.
      setLastSendAt(Date.now())
      // Don't await — the multicall may not be mined yet, the polling
      // cadence will catch it.
      loadThread()
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Send failed"
      toast.error(msg)
      addHistoryEntry({
        kind: "message",
        status: "failed",
        chain: "sepolia",
        summary: `Failed message → ${selected}`,
        description: body.slice(0, 80),
        errorMessage: msg,
        syncTo: { ens: myEnsName, getAuthToken },
      })
    } finally {
      setSending(false)
    }
  }

  return (
    <Card className={cn("grid h-[78dvh] grid-cols-[300px_1fr] overflow-hidden p-0", className)}>
      {/* Sidebar — on-chain directory, WhatsApp-style chat list */}
      <aside className="flex flex-col border-r border-border/60 bg-card/40">
        <div className="flex items-center gap-2 border-b border-border/60 px-4 py-4">
          <Users className="h-4 w-4 text-primary" />
          <span className="text-base font-semibold">Chats</span>
          <Badge variant="secondary" className="ml-auto font-mono text-[10px]">
            {allEntries.length}
          </Badge>
        </div>

        <div className="border-b border-border/60 px-3 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search or new chat"
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  handleManualOpen()
                }
              }}
              className="h-9 rounded-full border-border/60 bg-background/60 pl-8 pr-3 font-mono text-xs"
            />
          </div>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-1 p-2">
            {agentsLoading ? (
              <div className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Loading directory…
              </div>
            ) : allEntries.length === 0 ? (
              <div className="px-2 py-3 text-xs text-muted-foreground">
                No agents yet. Type a name above to start a chat — they'll be saved here.
              </div>
            ) : filteredAgents.length === 0 ? (
              <div className="px-2 py-3 text-xs text-muted-foreground">
                No matches. Press Enter to open{" "}
                <span className="font-mono text-foreground/80">
                  {manualInput.trim().toLowerCase().endsWith(".ethtwin.eth")
                    ? manualInput.trim().toLowerCase()
                    : `${manualInput.trim().toLowerCase()}.ethtwin.eth`}
                </span>
                .
              </div>
            ) : (
              filteredAgents.map((a) => {
                const { displayName } = displayNameFromEns(a.ens)
                const isSelected = selected === a.ens
                return (
                  <div
                    key={a.ens}
                    className={cn(
                      "group relative flex items-center gap-3 border-l-2 transition cursor-pointer",
                      isSelected
                        ? "border-l-primary bg-primary/10"
                        : "border-l-transparent hover:bg-secondary/40",
                    )}
                  >
                    <button
                      onClick={() => selectAgent(a.ens)}
                      className="flex flex-1 items-center gap-3 px-3 py-3 text-left min-w-0"
                    >
                      <EnsAvatar ens={a.ens} size={44} />
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5 leading-tight">
                        <span
                          className={cn(
                            "truncate text-base font-semibold",
                            isSelected ? "text-primary" : "text-foreground",
                          )}
                        >
                          {displayName}
                        </span>
                        <span className="truncate font-mono text-[10px] text-muted-foreground">
                          {a.ens}
                        </span>
                      </div>
                    </button>
                    <div className="mr-2 flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setProfileEns(a.ens)
                        }}
                        title="View profile"
                        className="px-1.5 py-1 text-[10px] text-muted-foreground hover:text-primary"
                      >
                        info
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          if (selected === a.ens) setSelected(null)
                          removeChat(a.ens)
                        }}
                        title="Remove from saved chats"
                        className="px-1.5 py-1 text-[12px] leading-none text-muted-foreground hover:text-destructive"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </ScrollArea>
      </aside>

      {/* Main — chat view */}
      <section className="flex flex-col bg-card/20">
        <header className="flex items-center gap-3 border-b border-border/60 bg-card/80 px-5 py-3.5">
          {selected ? (
            <>
              <button
                onClick={() => setProfileEns(selected)}
                className="flex items-center gap-3 rounded-md px-1 -mx-1 py-1 hover:bg-secondary/40"
                title="View profile"
              >
                <EnsAvatar ens={selected} size={40} />
                <div className="flex flex-col leading-tight">
                  <span className="text-base font-semibold">
                    {displayNameFromEns(selected).displayName}
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {selected}
                  </span>
                </div>
              </button>
              <BountyTrail
                tags={["ens", "kms"]}
                className="ml-auto"
                showLabel={false}
              />
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Pick a chat on the left to start.
              </span>
            </div>
          )}
        </header>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-2 p-5">
            {!selected ? (
              <EmptyState />
            ) : threadLoading && thread.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Reading on-chain inbox…
              </div>
            ) : thread.length === 0 ? (
              <div className="mx-auto max-w-xs rounded-lg bg-card/80 px-4 py-6 text-center text-sm text-muted-foreground">
                No messages yet. Say hi — every message lives as a text
                record on the shared ENS subname between you two,
                EIP-5564-encrypted so only the two of you can decrypt.
              </div>
            ) : (
              <>
                {renderThreadWithDateSeparators(thread, myEnsName)}
                {/* Sentinel for auto-scroll-to-newest. */}
                <div ref={threadEndRef} aria-hidden />
              </>
            )}
          </div>
        </ScrollArea>

        {selected ? (
          <form
            className="border-t border-border/60 bg-card/40 px-4 py-3"
            onSubmit={(e) => {
              e.preventDefault()
              handleSend()
            }}
          >
            <div className="flex items-center gap-2">
              <Input
                value={composing}
                onChange={(e) => setComposing(e.target.value)}
                placeholder={`Type a message to ${displayNameFromEns(selected).displayName}…`}
                disabled={sending}
                className="rounded-full border-border/70 bg-background/60 px-4 text-sm"
              />
              <Button
                type="submit"
                disabled={sending || !composing.trim()}
                className="rounded-full px-4"
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="mt-1.5 px-1 font-mono text-[10px] text-muted-foreground">
              Stored on-chain · text record on{" "}
              <span className="text-foreground/70">
                {(() => {
                  const a = myEnsName.split(".")[0]?.toLowerCase() ?? ""
                  const b = selected.split(".")[0]?.toLowerCase() ?? ""
                  const [lo, hi] = [a, b].sort()
                  return `chat-${lo}-${hi}.ethtwin.eth`
                })()}
              </span>{" "}
              · EIP-5564-encrypted · ~24s
            </p>
          </form>
        ) : null}
      </section>

      <AgentProfileDialog
        ens={profileEns}
        open={profileEns !== null}
        onOpenChange={(open) => !open && setProfileEns(null)}
      />
    </Card>
  )
}

function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex h-full min-h-[50dvh] flex-col items-center justify-center gap-3 text-center"
    >
      <span className="grid h-14 w-14 place-items-center rounded-full bg-primary/10">
        <Mail className="h-6 w-6 text-primary/70" />
      </span>
      <p className="text-base font-medium text-foreground/90">Pick a chat to begin</p>
      <p className="max-w-xs text-xs text-muted-foreground">
        Tap an agent on the left, or paste any{" "}
        <code className="font-mono text-[11px]">name.ethtwin.eth</code> to start a new conversation.
        Every message lives in ENS.
      </p>
    </motion.div>
  )
}

function dayKey(unixSec: number): string {
  const d = new Date(unixSec * 1000)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

function dayLabel(unixSec: number): string {
  const d = new Date(unixSec * 1000)
  const now = new Date()
  const today = dayKey(Math.floor(now.getTime() / 1000))
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const ydKey = dayKey(Math.floor(yesterday.getTime() / 1000))
  const k = dayKey(unixSec)
  if (k === today) return "Today"
  if (k === ydKey) return "Yesterday"
  // Same year → "Mar 12"; otherwise "Mar 12, 2025"
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString([], { month: "short", day: "numeric" })
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })
}

function renderThreadWithDateSeparators(thread: Message[], myEnsName: string) {
  const items: React.ReactNode[] = []
  let lastKey: string | null = null
  for (const m of thread) {
    const k = dayKey(m.at)
    if (k !== lastKey) {
      items.push(
        <div key={`sep-${k}`} className="flex justify-center py-1">
          <span className="rounded-full bg-card/95 px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground ring-1 ring-white/5">
            {dayLabel(m.at)}
          </span>
        </div>,
      )
      lastKey = k
    }
    items.push(
      <MessageBubble
        key={`${m.chatEns}-${m.index}`}
        message={m}
        mine={m.from.toLowerCase() === myEnsName.toLowerCase()}
      />,
    )
  }
  return items
}

function MessageBubble({ message, mine }: { message: Message; mine: boolean }) {
  const time = new Date(message.at * 1000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })
  return (
    <div className={cn("flex w-full", mine ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "group max-w-[78%] rounded-2xl px-3.5 py-2 text-sm shadow-sm",
          mine
            ? "rounded-br-sm bg-primary/85 text-primary-foreground"
            : "rounded-bl-sm bg-card/95 text-foreground/95 ring-1 ring-white/5",
        )}
      >
        <p className="whitespace-pre-wrap break-words leading-relaxed">{message.body}</p>
        <div
          className={cn(
            "mt-0.5 flex items-center justify-end gap-1.5 font-mono text-[9px]",
            mine ? "text-primary-foreground/70" : "text-muted-foreground",
          )}
        >
          {message.kmsVerified ? (
            <span
              title="SpaceComputer KMS signature verified against sender's ENS-published public key"
              className={cn(
                "rounded-full px-1.5 py-px text-[8px] uppercase tracking-wider",
                mine
                  ? "bg-primary-foreground/15 text-primary-foreground/85"
                  : "bg-purple-500/20 text-purple-300",
              )}
            >
              KMS ✓
            </span>
          ) : null}
          <span>{time}</span>
        </div>
      </div>
    </div>
  )
}
