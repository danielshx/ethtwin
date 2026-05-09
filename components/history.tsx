"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { ArrowUpRight, Coins, History as HistoryIcon, Loader2, MessageSquare, RefreshCw, Sparkles, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { clearHistory, useHistory, type HistoryEntry, type HistoryKind } from "@/lib/history"
import { cn } from "@/lib/utils"

type FilterKind = HistoryKind | "all"

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
}

function walletTxToHistoryEntry(tx: WalletTx, myAddress: string | null): HistoryEntry {
  const isOutgoing =
    myAddress != null && tx.from.toLowerCase() === myAddress.toLowerCase()
  // Best-effort kind classification — the decoder gives us function names.
  const fn = tx.functionName.toLowerCase()
  const kind: HistoryKind =
    fn === "transfer" || fn === "transferfrom"
      ? "transfer"
      : fn.startsWith("setsubnoderecord") || fn.startsWith("setname")
      ? "mint"
      : fn.startsWith("settext")
      ? "message"
      : "other"
  return {
    id: `chain:${tx.chain}:${tx.txHash}`,
    at: tx.at,
    kind,
    status: tx.status,
    summary: isOutgoing
      ? tx.summary
      : tx.summary.replace(/^Send|^Transfer|^Call/, "Received"),
    description: isOutgoing
      ? `from your wallet · ${tx.contractName}`
      : `to your wallet · ${tx.contractName}`,
    txHash: tx.txHash,
    explorerUrl: tx.explorerUrl,
    chain: tx.chain,
  }
}

export function History({ className, ensName, walletAddress }: HistoryProps) {
  const localEntries = useHistory({ ens: ensName })
  const [walletTxs, setWalletTxs] = useState<WalletTx[]>([])
  const [walletLoading, setWalletLoading] = useState(false)
  const [filter, setFilter] = useState<FilterKind>("all")

  const loadWalletHistory = useCallback(async () => {
    if (!walletAddress) {
      setWalletTxs([])
      return
    }
    setWalletLoading(true)
    try {
      const res = await fetch(
        `/api/wallet-history?address=${encodeURIComponent(walletAddress)}&chains=sepolia,base-sepolia&limit=20`,
      )
      const data = (await res.json()) as { ok: boolean; entries?: WalletTx[] }
      if (data.ok && data.entries) setWalletTxs(data.entries)
    } catch {
      // best-effort — if Etherscan is rate-limited we just show local + server entries
    } finally {
      setWalletLoading(false)
    }
  }, [walletAddress])

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
      .map((tx) => walletTxToHistoryEntry(tx, walletAddress ?? null))
    return [...localEntries, ...walletEntries].sort((a, b) => b.at - a.at)
  }, [localEntries, walletTxs, walletAddress])

  const filtered = useMemo(() => {
    if (filter === "all") return entries
    return entries.filter((e) => e.kind === filter)
  }, [entries, filter])

  const counts = useMemo(() => {
    const m: Partial<Record<FilterKind, number>> = { all: entries.length }
    for (const e of entries) m[e.kind] = (m[e.kind] ?? 0) + 1
    return m
  }, [entries])

  return (
    <Card className={cn("flex h-[70dvh] flex-col overflow-hidden", className)}>
      <header className="flex items-center gap-2 border-b border-white/10 px-5 py-3">
        <HistoryIcon className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">History</span>
        <Badge variant="secondary" className="ml-auto font-mono text-[10px]">
          {entries.length} entries
        </Badge>
        {walletAddress && (
          <Button
            variant="ghost"
            size="sm"
            onClick={loadWalletHistory}
            disabled={walletLoading}
            title="Refresh on-chain wallet history"
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
      <div className="flex items-center gap-1.5 border-b border-white/10 px-5 py-3">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              "rounded-full px-3 py-1 font-mono text-[10px] transition",
              filter === f.id
                ? "bg-primary/20 text-primary"
                : "bg-white/5 text-muted-foreground hover:bg-white/10",
            )}
          >
            {f.label}
            {counts[f.id] !== undefined && counts[f.id]! > 0 && (
              <span className="ml-1 opacity-60">{counts[f.id]}</span>
            )}
          </button>
        ))}
      </div>

      <ScrollArea className="flex-1">
        {filtered.length === 0 ? (
          <EmptyState filter={filter} />
        ) : (
          <ol className="divide-y divide-white/5">
            {filtered.map((e) => (
              <Row key={e.id} entry={e} />
            ))}
          </ol>
        )}
      </ScrollArea>
    </Card>
  )
}

function Row({ entry }: { entry: HistoryEntry }) {
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
            failed ? "bg-destructive/20 text-destructive" : "bg-white/5",
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
          <div className="mt-1 flex items-center gap-3 font-mono text-[10px] text-muted-foreground">
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
          </div>
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
