"use client"

// Block-Explorer-Tab — demo helper to prove "this transaction was real, on-chain"
// without alt-tabbing. Shows an inline iframe of the connected wallet's address
// on basescan-sepolia or sepolia-etherscan, with a styled-card fallback when
// the explorer refuses to be framed (most do — X-Frame-Options/CSP).
//
// Iframe blocking is detected two ways:
//   1. onError fires (rare; explorers usually 200 + frame-deny)
//   2. After a timeout the iframe never reports "load" → assume blocked
//
// Either way we flip into the fallback card with a big "Open in BaseScan ↗"
// CTA + the last 3 known tx hashes pulled from useHistory.

import { useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import { ExternalLink, Globe2, Layers } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { useHistory, type HistoryEntry } from "@/lib/history"
import { cn } from "@/lib/utils"

type Chain = "base-sepolia" | "sepolia"

type ExplorerProps = {
  ensName: string
  address?: string | null
  className?: string
}

const EXPLORERS: Record<Chain, { label: string; baseUrl: string; addressUrl: (a: string) => string; txUrl: (h: string) => string }> = {
  "base-sepolia": {
    label: "Base Sepolia",
    baseUrl: "https://sepolia.basescan.org",
    addressUrl: (a) => `https://sepolia.basescan.org/address/${a}`,
    txUrl: (h) => `https://sepolia.basescan.org/tx/${h}`,
  },
  sepolia: {
    label: "Sepolia",
    baseUrl: "https://sepolia.etherscan.io",
    addressUrl: (a) => `https://sepolia.etherscan.io/address/${a}`,
    txUrl: (h) => `https://sepolia.etherscan.io/tx/${h}`,
  },
}

export function Explorer({ ensName, address, className }: ExplorerProps) {
  const [chain, setChain] = useState<Chain>("base-sepolia")
  const [iframeLoaded, setIframeLoaded] = useState(false)
  const [iframeBlocked, setIframeBlocked] = useState(false)
  const history = useHistory({ ens: ensName })

  const explorer = EXPLORERS[chain]
  const target = address ? explorer.addressUrl(address) : explorer.baseUrl

  // Reset iframe state when chain or address changes.
  useEffect(() => {
    setIframeLoaded(false)
    setIframeBlocked(false)
    // BaseScan + Etherscan both send X-Frame-Options: SAMEORIGIN. The iframe
    // load event still fires on a blank/refused frame in some browsers, but
    // in practice the document body is empty. Treat "not loaded after 4s"
    // as blocked — the fallback card is the production demo path anyway.
    const timer = setTimeout(() => {
      setIframeBlocked((prev) => (iframeLoaded ? prev : true))
    }, 4000)
    return () => clearTimeout(timer)
  }, [chain, address, iframeLoaded])

  const recentTxs = useMemo<HistoryEntry[]>(() => {
    return history.filter((e) => e.txHash || e.explorerUrl).slice(0, 3)
  }, [history])

  return (
    <Card className={cn("flex flex-col gap-0 overflow-hidden p-0", className)}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-primary/20 text-primary">
            <Globe2 className="h-4 w-4" />
          </span>
          <div className="leading-tight">
            <div className="text-sm font-medium">Block Explorer</div>
            <div className="text-xs text-muted-foreground">
              {address ? (
                <span className="font-mono">{ensName}</span>
              ) : (
                "no wallet connected"
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-card/60 p-0.5 text-[11px]">
            {(Object.keys(EXPLORERS) as Chain[]).map((key) => (
              <button
                key={key}
                onClick={() => setChain(key)}
                className={cn(
                  "rounded-full px-2.5 py-1 transition",
                  chain === key
                    ? "bg-primary/20 text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {EXPLORERS[key].label}
              </button>
            ))}
          </div>
          <Badge variant="secondary" className="font-mono text-[10px]">
            <Layers className="mr-1 h-3 w-3" />
            on-chain proof
          </Badge>
        </div>
      </header>

      <div className="relative min-h-[60dvh]">
        {!iframeBlocked ? (
          <iframe
            key={`${chain}:${address ?? "none"}`}
            src={target}
            title={`${explorer.label} explorer`}
            className="absolute inset-0 h-full w-full bg-white"
            sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
            onLoad={() => setIframeLoaded(true)}
            onError={() => setIframeBlocked(true)}
          />
        ) : (
          <FallbackCard
            ensName={ensName}
            address={address}
            chain={chain}
            explorer={explorer}
            recentTxs={recentTxs}
          />
        )}
      </div>
    </Card>
  )
}

function FallbackCard({
  ensName,
  address,
  chain,
  explorer,
  recentTxs,
}: {
  ensName: string
  address?: string | null
  chain: Chain
  explorer: (typeof EXPLORERS)[Chain]
  recentTxs: HistoryEntry[]
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex h-full flex-col gap-5 px-6 py-6"
    >
      <div className="flex flex-col gap-2 rounded-lg border border-white/10 bg-card/60 p-5">
        <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
          {explorer.label}
        </div>
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-base text-primary">{ensName}</span>
          {address ? (
            <span className="font-mono text-[10px] text-muted-foreground">
              {short(address, 6)}
            </span>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          {chain === "base-sepolia"
            ? "All x402 payments + USDC stealth sends settle here."
            : "ENS subname mints + reverse-resolution tests live here."}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <a
            href={address ? explorer.addressUrl(address) : explorer.baseUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground shadow-xs transition hover:bg-primary/90"
          >
            Open in {explorer.label}
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
          {address ? (
            <a
              href={`${explorer.baseUrl}/address/${address}#tokentxns`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-xs text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
            >
              token transfers
              <ExternalLink className="h-3 w-3" />
            </a>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Recent transactions
        </div>
        {recentTxs.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No on-chain activity yet — kick off a stealth send or token transfer
            to populate this list.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {recentTxs.map((tx) => (
              <li
                key={tx.id}
                className="flex items-center justify-between gap-2 rounded-md border border-white/10 bg-card/40 px-3 py-2 text-xs"
              >
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="truncate text-foreground">{tx.summary}</div>
                  {tx.txHash ? (
                    <div className="font-mono text-[10px] text-muted-foreground">
                      {short(tx.txHash, 10)}
                    </div>
                  ) : null}
                </div>
                {tx.explorerUrl || tx.txHash ? (
                  <a
                    href={tx.explorerUrl ?? explorer.txUrl(tx.txHash!)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    open <ExternalLink className="h-3 w-3" />
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </motion.div>
  )
}

function short(value: string, head = 8): string {
  if (!value) return ""
  if (value.length <= head * 2 + 3) return value
  return `${value.slice(0, head)}…${value.slice(-4)}`
}
