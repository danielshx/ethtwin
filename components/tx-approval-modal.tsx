"use client"

import { useEffect, useState } from "react"
import { ArrowRight, Loader2, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export type TxIntent = {
  to: `0x${string}` | string
  value?: string
  valueUsd?: string
  data?: `0x${string}` | string
  chain?: "base-sepolia" | "sepolia" | "mainnet"
  plainEnglish: string
  /**
   * Reverse-resolved ENS name for `to`. Callers should populate this via
   * `useEnsName(intent.to)` from `@/lib/use-ens-name` before opening the
   * modal — per CLAUDE.md: "Tx approvals show ENS reverse-resolved names,
   * never 0x...". `null` is fine; the modal falls back to a short 0x…
   */
  toEnsName?: string | null
  /** Reverse-resolved ENS name for the sender. See `toEnsName` above. */
  fromEnsName?: string | null
}

type TxApprovalModalProps = {
  intent: TxIntent | null
  open: boolean
  onOpenChange: (next: boolean) => void
  onApprove: (intent: TxIntent) => Promise<{ hash: `0x${string}` | string } | void> | void
}

export function TxApprovalModal({
  intent,
  open,
  onOpenChange,
  onApprove,
}: TxApprovalModalProps) {
  const [submitting, setSubmitting] = useState(false)
  const [hash, setHash] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setSubmitting(false)
      setHash(null)
      setError(null)
    }
  }, [open])

  if (!intent) return null

  const explorerBase =
    intent.chain === "mainnet"
      ? "https://etherscan.io/tx/"
      : intent.chain === "sepolia"
        ? "https://sepolia.etherscan.io/tx/"
        : "https://sepolia.basescan.org/tx/"

  async function handleApprove() {
    setSubmitting(true)
    setError(null)
    try {
      const result = await onApprove(intent!)
      if (result && "hash" in result && result.hash) {
        setHash(result.hash)
      } else {
        onOpenChange(false)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "transaction failed")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Approve transaction
          </DialogTitle>
          <DialogDescription>
            Your twin will only sign after you confirm.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <p className="rounded-md bg-secondary/60 px-3 py-2.5 leading-relaxed">
            {intent.plainEnglish}
          </p>

          <div className="space-y-2">
            <Row label="From" value={intent.fromEnsName ?? "Your twin"} mono={!intent.fromEnsName} />
            <Row
              label="To"
              value={intent.toEnsName ?? shortAddr(intent.to)}
              mono={!intent.toEnsName}
            />
            {intent.value && (
              <Row
                label="Amount"
                value={
                  intent.valueUsd
                    ? `${intent.value} (${intent.valueUsd})`
                    : intent.value
                }
              />
            )}
            <Row label="Network" value={chainLabel(intent.chain)} />
          </div>

          {intent.data && intent.data !== "0x" && (
            <details className="group rounded-md border border-border/60 bg-secondary/60 px-3 py-2 text-xs">
              <summary className="cursor-pointer select-none font-mono text-muted-foreground group-open:text-foreground">
                raw calldata
              </summary>
              <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] text-muted-foreground">
                {intent.data}
              </pre>
            </details>
          )}

          {error && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          )}

          {hash && (
            <div className="space-y-2 rounded-md border border-primary/30 bg-primary/10 px-3 py-2.5 text-xs">
              <div className="flex items-center gap-2 text-primary">
                <ShieldCheck className="h-4 w-4" />
                <span className="font-medium">Sent on-chain</span>
              </div>
              <a
                className="inline-flex items-center gap-1 font-mono text-primary underline-offset-2 hover:underline"
                href={`${explorerBase}${hash}`}
                target="_blank"
                rel="noreferrer"
              >
                {short(hash, 10)} <ArrowRight className="h-3 w-3" />
              </a>
            </div>
          )}
        </div>

        <Separator />

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Reject
          </Button>
          <Button onClick={handleApprove} disabled={submitting || !!hash}>
            {submitting ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Signing
              </>
            ) : hash ? (
              "Done"
            ) : (
              "Sign & send"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Row({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span
        className={
          mono ? "font-mono text-xs text-foreground" : "text-sm text-foreground"
        }
      >
        {value}
      </span>
    </div>
  )
}

function shortAddr(addr: string) {
  if (!addr) return ""
  if (addr.length < 14) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function short(value: string, head = 8) {
  if (!value) return ""
  if (value.length <= head * 2 + 3) return value
  return `${value.slice(0, head)}…${value.slice(-4)}`
}

function chainLabel(chain: TxIntent["chain"]) {
  switch (chain) {
    case "mainnet":
      return "Ethereum"
    case "sepolia":
      return "Sepolia"
    case "base-sepolia":
    default:
      return "Base Sepolia"
  }
}
