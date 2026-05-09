"use client"

import { useEffect, useState } from "react"
import { ArrowRight, Loader2, ShieldAlert, ShieldCheck } from "lucide-react"
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
  /** Demo-only reviews show the Sourcify/risk UX but never execute a tx. */
  demoOnly?: boolean
  /**
   * Reverse-resolved ENS name for `to`. Callers should populate this via
   * `useEnsName(intent.to)` from `@/lib/use-ens-name` before opening the
   * modal — per CLAUDE.md: "Tx approvals show ENS reverse-resolved names,
   * never 0x...". `null` is fine; the modal falls back to a short 0x…
   */
  toEnsName?: string | null
  /** Reverse-resolved ENS name for the sender. See `toEnsName` above. */
  fromEnsName?: string | null
  sourceVerified?: boolean
  sourceProvider?: "local-abi" | "sourcify" | "none"
  sourceMatch?: "full" | "partial"
  sourceUrl?: string
  sourceWarning?: string
  riskLevel?: "low" | "medium" | "high" | "unknown"
  riskLabel?: string
  riskReasons?: string[]
  riskRecommendation?: string
  riskPatternIds?: string[]
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
  const [riskAcknowledged, setRiskAcknowledged] = useState(false)

  useEffect(() => {
    if (!open) {
      setSubmitting(false)
      setHash(null)
      setError(null)
      setRiskAcknowledged(false)
    }
  }, [open])

  useEffect(() => {
    setRiskAcknowledged(false)
  }, [intent])

  if (!intent) return null

  const requiresRiskAcknowledgement = intent.riskLevel === "high" && !intent.demoOnly
  const approveDisabled = submitting || !!hash || (requiresRiskAcknowledgement && !riskAcknowledged)

  const explorerBase =
    intent.chain === "mainnet"
      ? "https://etherscan.io/tx/"
      : intent.chain === "sepolia"
        ? "https://sepolia.etherscan.io/tx/"
        : "https://sepolia.basescan.org/tx/"

  async function handleApprove() {
    if (intent?.demoOnly) {
      onOpenChange(false)
      return
    }
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
      <DialogContent className="flex max-h-[92dvh] flex-col overflow-hidden sm:max-w-md">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            {intent.demoOnly ? "Risky approval demo" : "Approve transaction"}
          </DialogTitle>
          <DialogDescription>
            {intent.demoOnly
              ? "This is a safe demo review. No transaction will be sent."
              : "Your twin checks verified source, decodes the action, and flags wallet-risk patterns before you sign."}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1 text-sm">
          <SourcifySafetyFlow intent={intent} />

          {intent.demoOnly ? (
            <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-muted-foreground">
              Demo only: EthTwin is showing what it would catch before signing. This modal is intentionally non-executable.
            </p>
          ) : null}

          <p className="rounded-md bg-secondary/60 px-3 py-2.5 leading-relaxed whitespace-pre-line">
            {intent.plainEnglish}
          </p>

          <SourceVerification intent={intent} />
          <RiskAssessment intent={intent} />

          {requiresRiskAcknowledgement ? (
            <label className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-current"
                checked={riskAcknowledged}
                onChange={(e) => setRiskAcknowledged(e.target.checked)}
              />
              <span>
                I understand this is flagged as high risk. I still want to sign this transaction.
              </span>
            </label>
          ) : null}

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

        <Separator className="shrink-0" />

        <DialogFooter className="shrink-0 gap-2 sm:gap-2">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            {intent.demoOnly ? "Close" : "Reject"}
          </Button>
          <Button onClick={handleApprove} disabled={approveDisabled}>
            {submitting ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Signing
              </>
            ) : hash ? (
              "Done"
            ) : intent.demoOnly ? (
              "Close demo"
            ) : requiresRiskAcknowledgement && !riskAcknowledged ? (
              "Acknowledge risk first"
            ) : (
              "Sign & send"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SourcifySafetyFlow({ intent }: { intent: TxIntent }) {
  const hasCalldata = !!intent.data && intent.data !== "0x"
  const sourceLabel = !hasCalldata
    ? "No contract call"
    : intent.sourceProvider === "sourcify"
      ? intent.sourceMatch === "partial"
        ? "Partial Sourcify match"
        : "Sourcify verified"
      : intent.sourceVerified
        ? "Known ABI"
        : "Unverified source"
  const riskLabel = intent.riskLevel ? `${intent.riskLevel.toUpperCase()} risk` : "Risk pending"

  return (
    <div className="rounded-md border border-border/70 bg-card/60 px-3 py-2.5 text-xs">
      <div className="mb-2 flex items-center gap-2 text-foreground">
        <ShieldCheck className="h-4 w-4 text-primary" />
        <span className="font-medium">Sourcify Contract Intelligence</span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <FlowStep step="1" label="Inspect" value={sourceLabel} />
        <FlowStep step="2" label="Decode" value={hasCalldata ? "Plain English" : "Native send"} />
        <FlowStep step="3" label="Decide" value={riskLabel} />
      </div>
      <p className="mt-2 text-muted-foreground">
        Verification means inspectable source, not automatic safety. EthTwin adds wallet-risk rules before signing.
      </p>
    </div>
  )
}

function FlowStep({ step, label, value }: { step: string; label: string; value: string }) {
  return (
    <div className="rounded-md bg-secondary/60 px-2 py-2">
      <div className="mx-auto mb-1 flex h-5 w-5 items-center justify-center rounded-full bg-background font-mono text-[10px] text-muted-foreground">
        {step}
      </div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 line-clamp-2 text-[11px] font-medium text-foreground">{value}</div>
    </div>
  )
}

function SourceVerification({ intent }: { intent: TxIntent }) {
  const hasCalldata = !!intent.data && intent.data !== "0x"
  if (!hasCalldata) return null

  if (intent.sourceVerified) {
    const provider = intent.sourceProvider === "sourcify" ? "Sourcify" : "known ABI"
    const match = intent.sourceMatch === "partial" ? "partial match" : "verified source"
    return (
      <div className="rounded-md border border-primary/25 bg-primary/10 px-3 py-2.5 text-xs">
        <div className="flex items-center gap-2 text-primary">
          <ShieldCheck className="h-4 w-4" />
          <span className="font-medium">Contract checked · {provider}</span>
        </div>
        <p className="mt-1 text-muted-foreground">
          {match}. Sourcify makes the contract inspectable; EthTwin still runs a separate risk check.
        </p>
        {intent.sourceUrl ? (
          <a
            href={intent.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-flex items-center gap-1 font-mono text-primary underline-offset-2 hover:underline"
          >
            view source <ArrowRight className="h-3 w-3" />
          </a>
        ) : null}
      </div>
    )
  }

  return (
    <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs">
      <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
        <ShieldAlert className="h-4 w-4" />
        <span className="font-medium">Contract source not verified</span>
      </div>
      <p className="mt-1 text-muted-foreground">
        {intent.sourceWarning ??
          "Your twin could not verify this contract source. Review the calldata carefully before signing."}
      </p>
    </div>
  )
}

function RiskAssessment({ intent }: { intent: TxIntent }) {
  if (!intent.riskLevel || !intent.riskLabel) return null

  const tone =
    intent.riskLevel === "high"
      ? "border-destructive/40 bg-destructive/10 text-destructive"
      : intent.riskLevel === "medium"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
        : "border-primary/25 bg-primary/10 text-primary"

  return (
    <div className={`rounded-md border px-3 py-2.5 text-xs ${tone}`}>
      <div className="flex items-center gap-2">
        {intent.riskLevel === "high" ? (
          <ShieldAlert className="h-4 w-4" />
        ) : (
          <ShieldCheck className="h-4 w-4" />
        )}
        <span className="font-medium">
          Safety check · {intent.riskLevel.toUpperCase()} · {intent.riskLabel}
        </span>
      </div>
      {intent.riskReasons?.[0] ? (
        <p className="mt-1 text-muted-foreground">{intent.riskReasons[0]}</p>
      ) : null}
      {intent.riskRecommendation ? (
        <p className="mt-1 text-muted-foreground">
          Recommendation: {intent.riskRecommendation}
        </p>
      ) : null}
      {intent.riskPatternIds?.length ? (
        <p className="mt-1 font-mono text-[10px] text-muted-foreground">
          patterns: {intent.riskPatternIds.join(", ")}
        </p>
      ) : null}
    </div>
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
