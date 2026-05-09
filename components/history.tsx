"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { ArrowUpRight, Coins, History as HistoryIcon, Loader2, MessageSquare, RefreshCw, Sparkles, ThumbsDown, ThumbsUp, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { clearHistory, useHistory, type HistoryEntry, type HistoryKind } from "@/lib/history"
import { BountyTrail, type BountyTag } from "@/components/bounty-trail"

// Mapping of action → which bounty integrations participated. Used by the
// history Row to surface a "powered by" trail under each entry, matching
// the per-action chips on the live UI surfaces.
const KIND_BOUNTY_TAGS: Record<HistoryKind, BountyTag[]> = {
  mint: ["ens", "ensip25", "kms", "ctrng", "stealth"],
  message: ["ens", "ctrng", "kms"],
  "stealth-send": ["ens", "stealth", "ctrng", "kms"],
  transfer: ["ens", "kms"],
  other: [],
}
import { cn } from "@/lib/utils"

type FilterKind = HistoryKind | "all"
type FeedbackRating = "up" | "down"

type FeedbackSummary = {
  actionId?: string
  targetEns?: string
  up: number
  down: number
  total: number
  score: number
}

type FeedbackState = {
  rating?: FeedbackRating
  summary?: FeedbackSummary
  loading?: boolean
  error?: string
}

type WalletTx = {
  txHash: `0x${string}`
  chain: "sepolia" | "base-sepolia"
  from: string
  to: string | null
  value: string
  at: number
  blockNumber: string
  status: "success" | "failed"
  summary: string
  contractName: string
  functionName: string
  explorerUrl: string
}

const FILTERS: { id: FilterKind; label: string }[] = [
  { id: "all", label: "All" },
  { id: "transfer", label: "Transfers" },
  { id: "stealth-send", label: "Stealth" },
  { id: "message", label: "Messages" },
  { id: "mint", label: "Mints" },
]

const KIND_ICON: Record<HistoryKind, typeof Coins> = {
  transfer: Coins,
  "stealth-send": Sparkles,
  message: MessageSquare,
  mint: Sparkles,
  other: HistoryIcon,
}

const KIND_COLOR: Record<HistoryKind, string> = {
  transfer: "text-emerald-400",
  "stealth-send": "text-fuchsia-400",
  message: "text-sky-400",
  mint: "text-amber-400",
  other: "text-muted-foreground",
}

type HistoryProps = {
  className?: string
  ensName?: string | null
  /** When set, the History tab also pulls the wallet's on-chain txs from
   *  Etherscan (Sepolia + Base Sepolia) and merges them into the list. */
  walletAddress?: string | null
  /** Legacy prop kept for compatibility; feedback now authenticates via session cookie. */
  getAuthToken?: () => Promise<string | null>
}

function walletTxToHistoryEntry(tx: WalletTx): HistoryEntry {
  // Server already returns a clean directional summary ("Sent 0.5 USDC to 0xab…cd"
  // / "Received 0.01 ETH from 0x12…34" / "Minted ENS subname" / etc.) so we
  // just classify it into a kind for filter chips and render verbatim.
  const fn = tx.functionName.toLowerCase()
  const kind: HistoryKind =
    fn === "transfer" || fn === "transferfrom"
      ? "transfer"
      : fn === "setsubnoderecord" || fn === "setname"
      ? "mint"
      : fn === "multicall" || fn === "settext"
      ? "message"
      : "other"
  return {
    id: `chain:${tx.chain}:${tx.txHash}`,
    at: tx.at,
    kind,
    status: tx.status,
    summary: tx.summary,
    description: tx.contractName,
    txHash: tx.txHash,
    explorerUrl: tx.explorerUrl,
    chain: tx.chain,
  }
}

function actionSnapshot(entry: HistoryEntry) {
  return {
    kind: entry.kind,
    status: entry.status,
    summary: entry.summary,
    ...(entry.description !== undefined && { description: entry.description }),
    ...(entry.txHash !== undefined && { txHash: entry.txHash }),
    ...(entry.explorerUrl !== undefined && { explorerUrl: entry.explorerUrl }),
    ...(entry.chain !== undefined && { chain: entry.chain }),
    ...(entry.errorMessage !== undefined && { errorMessage: entry.errorMessage }),
  }
}

export function History({ className, ensName, walletAddress }: HistoryProps) {
  const localEntries = useHistory({ ens: ensName })
  const [walletTxs, setWalletTxs] = useState<WalletTx[]>([])
  const [walletLoading, setWalletLoading] = useState(false)
  const [resolvedAddress, setResolvedAddress] = useState<string | null>(walletAddress ?? null)
  const [filter, setFilter] = useState<FilterKind>("all")
  const [feedbackByAction, setFeedbackByAction] = useState<Record<string, FeedbackState>>({})

  // Prefer the ENS-bound `addr` record over the browser's connected wallet —
  // History is meant to show the agent's full on-chain activity, which is
  // tied to the address registered under their ENS subdomain.
  const loadWalletHistory = useCallback(async () => {
    if (!ensName && !walletAddress) {
      setWalletTxs([])
      return
    }
    setWalletLoading(true)
    try {
      const params = new URLSearchParams({
        chains: "sepolia,base-sepolia",
        limit: "50",
      })
      if (ensName) params.set("ens", ensName)
      else if (walletAddress) params.set("address", walletAddress)
      const res = await fetch(`/api/wallet-history?${params.toString()}`)
      const data = (await res.json()) as {
        ok: boolean
        address?: string
        entries?: WalletTx[]
      }
      if (data.ok) {
        if (data.entries) setWalletTxs(data.entries)
        if (data.address) setResolvedAddress(data.address)
      }
    } catch {
      // best-effort — if Etherscan is rate-limited we just show local + server entries
    } finally {
      setWalletLoading(false)
    }
  }, [ensName, walletAddress])

  useEffect(() => {
    loadWalletHistory()
  }, [loadWalletHistory])

  const entries = useMemo<HistoryEntry[]>(() => {
    // Merge: app-internal entries (server + local) + wallet on-chain entries.
    // Dedupe by txHash so we don't show the same tx twice when our app
    // recorded a send that's also visible on-chain.
    const seenTxHashes = new Set(
      localEntries.map((e) => e.txHash?.toLowerCase()).filter(Boolean) as string[],
    )
    const walletEntries = walletTxs
      .filter((tx) => !seenTxHashes.has(tx.txHash.toLowerCase()))
      .map((tx) => walletTxToHistoryEntry(tx))
    return [...localEntries, ...walletEntries].sort((a, b) => b.at - a.at)
  }, [localEntries, walletTxs])

  const filtered = useMemo(() => {
    if (filter === "all") return entries
    return entries.filter((e) => e.kind === filter)
  }, [entries, filter])

  const counts = useMemo(() => {
    const m: Partial<Record<FilterKind, number>> = { all: entries.length }
    for (const e of entries) m[e.kind] = (m[e.kind] ?? 0) + 1
    return m
  }, [entries])

  useEffect(() => {
    let cancelled = false
    const ids = entries.map((e) => e.id).slice(0, 25)
    if (!ids.length) {
      setFeedbackByAction({})
      return
    }
    async function loadFeedback() {
      const pairs = await Promise.all(
        ids.map(async (id) => {
          try {
            const res = await fetch(`/api/feedback?actionId=${encodeURIComponent(id)}`)
            const data = (await res.json()) as {
              ok?: boolean
              feedback?: Array<{ reviewerEns: string; rating: FeedbackRating }>
              summary?: FeedbackSummary
            }
            const own = ensName
              ? data.feedback?.find(
                  (f) => f.reviewerEns.toLowerCase() === ensName.toLowerCase(),
                )
              : undefined
            return [
              id,
              {
                rating: own?.rating,
                summary: data.summary,
              } satisfies FeedbackState,
            ] as const
          } catch {
            return [id, {} satisfies FeedbackState] as const
          }
        }),
      )
      if (!cancelled) setFeedbackByAction(Object.fromEntries(pairs))
    }
    void loadFeedback()
    return () => {
      cancelled = true
    }
  }, [entries, ensName])

  const submitFeedback = useCallback(
    async (entry: HistoryEntry, rating: FeedbackRating) => {
      if (!ensName) return
      setFeedbackByAction((prev) => ({
        ...prev,
        [entry.id]: { ...prev[entry.id], loading: true, error: undefined },
      }))
      try {
        const res = await fetch("/api/feedback", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reviewerEns: ensName,
            actionId: entry.id,
            rating,
            targetEns: entry.description?.endsWith(".eth") ? entry.description : undefined,
            action: actionSnapshot(entry),
          }),
        })
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean
          error?: string
          summary?: FeedbackSummary
        }
        if (!res.ok || !data.ok) {
          throw new Error(data.error ?? `feedback failed (${res.status})`)
        }
        setFeedbackByAction((prev) => ({
          ...prev,
          [entry.id]: {
            rating,
            summary: data.summary,
            loading: false,
          },
        }))
      } catch (err) {
        setFeedbackByAction((prev) => ({
          ...prev,
          [entry.id]: {
            ...prev[entry.id],
            loading: false,
            error: err instanceof Error ? err.message : String(err),
          },
        }))
      }
    },
    [ensName],
  )

  return (
    <Card className={cn("flex h-[70dvh] flex-col overflow-hidden", className)}>
      <header className="flex items-center gap-2 border-b border-border/60 px-5 py-3">
        <HistoryIcon className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">History</span>
        {resolvedAddress && (
          <span className="hidden font-mono text-[10px] text-muted-foreground sm:inline">
            · {resolvedAddress.slice(0, 6)}…{resolvedAddress.slice(-4)}
          </span>
        )}
        <Badge variant="secondary" className="ml-auto font-mono text-[10px]">
          {entries.length} entries
        </Badge>
        {(ensName || walletAddress) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={loadWalletHistory}
            disabled={walletLoading}
            title="Refresh full on-chain history of this twin's ENS-bound wallet"
            className="h-7 px-2 text-muted-foreground hover:text-primary"
          >
            {walletLoading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
          </Button>
        )}
        {entries.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (confirm("Clear all history?")) clearHistory()
            }}
            className="h-7 px-2 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        )}
      </header>

      {/* Filter chips */}
      <div className="flex items-center gap-1.5 border-b border-border/60 px-5 py-3">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              "rounded-full px-3 py-1 font-mono text-[10px] transition",
              filter === f.id
                ? "bg-primary/20 text-primary"
                : "bg-secondary/40 text-muted-foreground hover:bg-secondary/60",
            )}
          >
            {f.label}
            {counts[f.id] !== undefined && counts[f.id]! > 0 && (
              <span className="ml-1 opacity-60">{counts[f.id]}</span>
            )}
          </button>
        ))}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {filtered.length === 0 ? (
          <EmptyState filter={filter} />
        ) : (
          <ol className="divide-y divide-border/40">
            {filtered.map((e) => (
              <Row
                key={e.id}
                entry={e}
                feedback={feedbackByAction[e.id]}
                feedbackEnabled={!!ensName}
                onFeedback={(rating) => submitFeedback(e, rating)}
              />
            ))}
          </ol>
        )}
      </ScrollArea>
    </Card>
  )
}

function Row({
  entry,
  feedback,
  feedbackEnabled,
  onFeedback,
}: {
  entry: HistoryEntry
  feedback?: FeedbackState
  feedbackEnabled: boolean
  onFeedback: (rating: FeedbackRating) => void
}) {
  const Icon = KIND_ICON[entry.kind]
  const colorClass = KIND_COLOR[entry.kind]
  const date = new Date(entry.at * 1000)
  const ts = date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
  const failed = entry.status === "failed"
  return (
    <li className={cn("px-5 py-3", failed && "bg-destructive/5")}>
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full",
            failed ? "bg-destructive/20 text-destructive" : "bg-secondary/40",
            !failed && colorClass,
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "text-sm font-medium",
                failed && "text-destructive",
              )}
            >
              {entry.summary}
            </span>
            {failed && (
              <Badge
                variant="secondary"
                className="bg-destructive/20 font-mono text-[10px] text-destructive"
              >
                failed
              </Badge>
            )}
            {entry.chain && (
              <Badge variant="secondary" className="font-mono text-[10px]">
                {entry.chain}
              </Badge>
            )}
          </div>
          {entry.description && (
            <p className="mt-0.5 break-words font-mono text-[11px] text-muted-foreground">
              {entry.description}
            </p>
          )}
          {entry.errorMessage && (
            <p className="mt-0.5 break-words font-mono text-[11px] text-destructive/80">
              {entry.errorMessage}
            </p>
          )}
          {!failed && KIND_BOUNTY_TAGS[entry.kind].length > 0 ? (
            <BountyTrail
              tags={KIND_BOUNTY_TAGS[entry.kind]}
              className="mt-1.5"
              showLabel={false}
            />
          ) : null}
          <div className="mt-1 flex flex-wrap items-center gap-3 font-mono text-[10px] text-muted-foreground">
            <span>{ts}</span>
            {entry.explorerUrl && (
              <a
                href={entry.explorerUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-primary/80 hover:text-primary"
              >
                Explorer <ArrowUpRight className="h-3 w-3" />
              </a>
            )}
            {feedbackEnabled ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/60 px-1.5 py-0.5">
                <span className="mr-0.5 text-muted-foreground/80">Review</span>
                <button
                  type="button"
                  disabled={feedback?.loading}
                  onClick={() => onFeedback("up")}
                  className={cn(
                    "grid h-5 w-5 place-items-center rounded-full transition hover:bg-emerald-500/15 hover:text-emerald-300 disabled:opacity-50",
                    feedback?.rating === "up" && "bg-emerald-500/15 text-emerald-300",
                  )}
                  title="Good decision"
                >
                  <ThumbsUp className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  disabled={feedback?.loading}
                  onClick={() => onFeedback("down")}
                  className={cn(
                    "grid h-5 w-5 place-items-center rounded-full transition hover:bg-amber-500/15 hover:text-amber-300 disabled:opacity-50",
                    feedback?.rating === "down" && "bg-amber-500/15 text-amber-300",
                  )}
                  title="Bad decision"
                >
                  <ThumbsDown className="h-3 w-3" />
                </button>
                {feedback?.summary && feedback.summary.total > 0 ? (
                  <span className="ml-1 text-muted-foreground/80">
                    {feedback.summary.score > 0 ? "+" : ""}{feedback.summary.score}
                  </span>
                ) : null}
              </span>
            ) : null}
          </div>
          {feedback?.error ? (
            <p className="mt-1 font-mono text-[10px] text-amber-300/80">
              {feedback.error}
            </p>
          ) : null}
        </div>
      </div>
    </li>
  )
}

function EmptyState({ filter }: { filter: FilterKind }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-16 text-center text-sm text-muted-foreground">
      <HistoryIcon className="h-6 w-6 opacity-40" />
      <p>
        {filter === "all"
          ? "Nothing here yet — send a token, message, or mint a twin to see it appear."
          : "No entries match this filter."}
      </p>
    </div>
  )
}
