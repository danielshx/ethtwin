"use client"

// ContrastCard — visual side-by-side that demonstrates the gap between
// "old crypto" (Metamask-style hex blob, gas estimates, Confirm) and
// EthTwin's Maria-Mode card ("Send 100 dollars to Tom"). Used in
// the pitch slide deck and as a marketing block on the landing page.
//
// Animates on viewport entry: the techy column fades in first, then the
// human column slides up from below — judges literally feel the shift.

import { motion } from "framer-motion"
import { ArrowRight, Check, AlertTriangle } from "lucide-react"

type ContrastCardProps = {
  className?: string
}

export function ContrastCard({ className = "" }: ContrastCardProps) {
  return (
    <div className={`grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-center ${className}`}>
      <OldCryptoCard />
      <ArrowDivider />
      <NewCryptoCard />
    </div>
  )
}

function OldCryptoCard() {
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="relative overflow-hidden rounded-3xl border border-zinc-700/40 bg-[oklch(0.18_0.02_270)] p-5 text-zinc-100 shadow-xl"
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-400">
          Confirm transaction
        </span>
        <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] text-amber-300">
          ⚠ blind sign
        </span>
      </div>
      <div className="space-y-2.5 font-mono text-[11px] leading-relaxed">
        <Row label="To" value="0xa9059cbb…0fE2C8" mono />
        <Row label="Value" value="0 ETH" mono />
        <Row label="Data" value="0xa9059cbb000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa96045…" mono truncate />
        <Row label="Estimated gas" value="0.000437 ETH ($1.21)" mono />
        <Row label="Network" value="Base Mainnet · 8453" mono />
        <Row label="Nonce" value="42" mono />
      </div>
      <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px] text-amber-100">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
        <span>You&apos;re about to sign data you cannot read. Continue?</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          disabled
          className="cursor-not-allowed rounded-lg border border-zinc-600 bg-zinc-800 py-2 text-xs text-zinc-300"
        >
          Reject
        </button>
        <button
          disabled
          className="cursor-not-allowed rounded-lg bg-amber-600 py-2 text-xs font-medium text-zinc-950"
        >
          Confirm
        </button>
      </div>
    </motion.div>
  )
}

function NewCryptoCard() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.55, delay: 0.25, ease: "easeOut" }}
      className="relative overflow-hidden rounded-3xl border border-border/60 bg-card p-5 shadow-xl"
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          Sending
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
          <Check className="h-3 w-3" strokeWidth={3} />
          Private
        </span>
      </div>
      <div className="flex items-center gap-4">
        <div
          className="h-16 w-16 shrink-0 rounded-full ring-2 ring-primary/40"
          style={{
            background:
              "conic-gradient(from 220deg, oklch(0.78 0.14 30), oklch(0.85 0.1 145), oklch(0.78 0.14 30))",
          }}
          aria-hidden
        />
        <div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-semibold tracking-tight">100</span>
            <span className="text-base text-muted-foreground">dollars</span>
          </div>
          <div className="text-sm text-muted-foreground">
            to <span className="font-medium text-foreground">Tom</span>
          </div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button className="rounded-2xl border border-border bg-secondary py-2.5 text-sm font-medium text-secondary-foreground">
          Cancel
        </button>
        <button className="rounded-2xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20">
          Confirm with Face ID
        </button>
      </div>
    </motion.div>
  )
}

function Row({
  label,
  value,
  mono,
  truncate,
}: {
  label: string
  value: string
  mono?: boolean
  truncate?: boolean
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="w-24 shrink-0 text-zinc-500">{label}</span>
      <span
        className={[
          "min-w-0 flex-1 text-zinc-200",
          mono ? "font-mono" : "",
          truncate ? "truncate" : "",
        ].join(" ")}
      >
        {value}
      </span>
    </div>
  )
}

function ArrowDivider() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.6 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.4, delay: 0.5, ease: "easeOut" }}
      className="grid place-items-center justify-self-center"
    >
      <div className="grid h-12 w-12 place-items-center rounded-full bg-primary/15 text-primary shadow-lg shadow-primary/15">
        <ArrowRight className="h-5 w-5" />
      </div>
      <span className="mt-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        EthTwin
      </span>
    </motion.div>
  )
}
