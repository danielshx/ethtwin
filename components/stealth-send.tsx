"use client"

// Stealth USDC send — the demo hero moment.
//
// Flow timeline (visualized via CosmicOrb phases):
//   idle      → user pickt recipient + amount
//   fetching  → /api/cosmic-seed (orb spinning, particles)
//   revealed  → cTRNG seed + attestation visible + Sourcify review prompt
//   sending   → /api/stealth/send (USDC.transfer to one-time stealth addr)
//   done      → block-explorer link, derived stealth address shown
//
// We split the flow into TWO API calls (seed first, then send) so the orb
// animation has something real to display *before* the slow on-chain tx.
// Yes, the backend re-fetches a seed inside sendStealthUSDC — that's fine for
// the demo; the user-facing seed is the one they see animate.

import { useCallback, useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import { encodeFunctionData, parseUnits, type Address, type Hex } from "viem"
import { ExternalLink, Lock, Loader2, ShieldCheck, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { CosmicOrb } from "@/components/cosmic-orb"
import { AgentProfileDialog } from "@/components/agent-profile"
import { EnsAvatar } from "@/components/ens-avatar"
import { BountyTrail } from "@/components/bounty-trail"
import { TxApprovalModal, type TxIntent } from "@/components/tx-approval-modal"
import { describeTx } from "@/lib/tx-decoder"
import { addHistoryEntry } from "@/lib/history"
import { cn } from "@/lib/utils"

type AgentEntry = {
  ens: string
  addedAt: number
  avatar?: string | null
  description?: string | null
}

type CosmicSample = {
  bytes: `0x${string}`
  attestation: string
  fetchedAt: number
}

type SendResult = {
  recipientEnsName: string
  stealthAddress: `0x${string}`
  ephemeralPublicKey: `0x${string}`
  viewTag: `0x${string}`
  cosmicSeeded: boolean
  attestation: string
  mocked: boolean
  amountHuman: string
  txHash: `0x${string}`
  blockNumber: string
  blockExplorerUrl: string
}

type StealthSendProps = {
  myEnsName: string
  getAuthToken: () => Promise<string | null>
  className?: string
}

type Phase = "idle" | "fetching" | "revealed" | "reviewing" | "sending" | "done"

const BASE_SEPOLIA_CHAIN_ID = 84532
const USDC_BASE_SEPOLIA: Address = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
// Deterministic preview-only address used for Sourcify calldata decoding before
// the backend derives the real one-time stealth address. The modal copy makes
// clear that the final address is generated server-side after approval.
const STEALTH_PREVIEW_ADDRESS: Address = "0x1111111111111111111111111111111111111111"

const ERC20_TRANSFER_ABI = [
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const

export function StealthSend({ myEnsName, getAuthToken, className }: StealthSendProps) {
  const [agents, setAgents] = useState<AgentEntry[]>([])
  const [agentsLoading, setAgentsLoading] = useState(true)
  const [recipient, setRecipient] = useState("")
  const [amount, setAmount] = useState("0.05")
  const [phase, setPhase] = useState<Phase>("idle")
  const [sample, setSample] = useState<CosmicSample | null>(null)
  const [result, setResult] = useState<SendResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [profileEns, setProfileEns] = useState<string | null>(null)
  const [pendingIntent, setPendingIntent] = useState<TxIntent | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  // Load agent directory once.
  const loadAgents = useCallback(async () => {
    setAgentsLoading(true)
    try {
      const res = await fetch("/api/agents")
      const data = (await res.json()) as { ok: boolean; agents?: AgentEntry[] }
      if (data.ok && data.agents) {
        setAgents(
          data.agents.filter(
            (a) => a.ens.toLowerCase() !== myEnsName.toLowerCase(),
          ),
        )
      }
    } catch {
      // best-effort
    } finally {
      setAgentsLoading(false)
    }
  }, [myEnsName])

  useEffect(() => {
    loadAgents()
  }, [loadAgents])

  const canSend = useMemo(() => {
    if (phase === "fetching" || phase === "reviewing" || phase === "sending") return false
    return recipient.trim().length > 0 && Number(amount) > 0
  }, [phase, recipient, amount])

  function pickAgent(ens: string) {
    setRecipient(ens)
  }

  function reset() {
    setPhase("idle")
    setSample(null)
    setResult(null)
    setError(null)
    setPendingIntent(null)
    setModalOpen(false)
  }

  async function buildSourcifyReviewIntent(): Promise<TxIntent> {
    const amountRaw = parseUnits(String(amount), 6)
    const data = encodeFunctionData({
      abi: ERC20_TRANSFER_ABI,
      functionName: "transfer",
      args: [STEALTH_PREVIEW_ADDRESS, amountRaw],
    })
    const decoded = await describeTx({
      to: USDC_BASE_SEPOLIA,
      data: data as Hex,
      chainId: BASE_SEPOLIA_CHAIN_ID,
    })

    return {
      to: USDC_BASE_SEPOLIA,
      value: `${amount} USDC`,
      data: data as Hex,
      chain: "base-sepolia",
      plainEnglish:
        `Private send preview: EthTwin will send ${amount} USDC to a one-time stealth address derived for ${recipient.trim()}.\n\n` +
        `The exact stealth address is generated after approval so the receiver relationship stays private. Sourcify still checks the public contract interaction: USDC.transfer(...).\n\n` +
        decoded.english,
      sourceVerified: decoded.verification.sourceVerified,
      sourceProvider: decoded.verification.sourceProvider,
      sourceMatch: decoded.verification.match,
      sourceUrl: decoded.verification.sourceUrl,
      sourceWarning: decoded.verification.warning,
      riskLevel: decoded.risk.level,
      riskLabel: decoded.risk.label,
      riskReasons: decoded.risk.reasons,
      riskRecommendation: decoded.risk.recommendation,
      riskPatternIds: decoded.risk.patternIds,
    }
  }

  async function handleSend() {
    if (!canSend) return
    setError(null)
    setResult(null)

    // 1. Cosmic seed — purely visual, but fetched live.
    setPhase("fetching")
    let seed: CosmicSample | null = null
    try {
      const res = await fetch("/api/cosmic-seed")
      if (!res.ok) throw new Error(`cosmic-seed HTTP ${res.status}`)
      seed = (await res.json()) as CosmicSample
    } catch (err) {
      setError(err instanceof Error ? err.message : "cosmic seed failed")
      setPhase("idle")
      return
    }

    // Hold the orb in fetching for ~1.4s so the animation reads.
    await new Promise((r) => setTimeout(r, 1400))
    setSample(seed)
    setPhase("revealed")
    await new Promise((r) => setTimeout(r, 700))

    // 2. Sourcify contract-intelligence review before the actual stealth tx.
    setPhase("reviewing")
    try {
      const intent = await buildSourcifyReviewIntent()
      setPendingIntent(intent)
      setModalOpen(true)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not prepare Sourcify review"
      setError(msg)
      toast.error(msg)
      setPhase("idle")
    }
  }

  async function executeStealthSend(): Promise<{ hash: `0x${string}` }> {
    // 3. Actual on-chain stealth send.
    setPhase("sending")
    try {
      // Privy is optional — KMS-onboarded twins have no Privy session. Best-effort
      // fetch the token; the API verifies it only when present.
      const authToken = await getAuthToken().catch(() => null)
      const res = await fetch("/api/stealth/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          privyToken: authToken,
          recipientEnsName: recipient.trim(),
          amountUsdc: amount,
        }),
      })
      const data = (await res.json()) as { ok: boolean; error?: string } & SendResult
      if (!data.ok) {
        setError(data.error ?? "stealth send failed")
        toast.error(data.error ?? "stealth send failed")
        addHistoryEntry({
          kind: "stealth-send",
          status: "failed",
          chain: "base-sepolia",
          summary: `Stealth USDC → ${recipient}`,
          description: `${amount} USDC to a one-time address derived from ${recipient}'s meta-key.`,
          errorMessage: data.error,
          syncTo: { ens: myEnsName, getAuthToken },
        })
        setPhase("idle")
        throw new Error(data.error ?? "stealth send failed")
      }
      setResult(data)
      setPhase("done")
      toast.success(`Sent ${data.amountHuman} USDC to ${data.recipientEnsName} privately`)
      addHistoryEntry({
        kind: "stealth-send",
        status: "success",
        chain: "base-sepolia",
        summary: `Stealth USDC → ${data.recipientEnsName}`,
        description: `${data.amountHuman} USDC to one-time stealth address ${data.stealthAddress}.${
          data.cosmicSeeded ? " Seeded from cTRNG attestation." : ""
        }`,
        txHash: data.txHash,
        explorerUrl: data.blockExplorerUrl,
        syncTo: { ens: myEnsName, getAuthToken },
      })
      return { hash: data.txHash }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      toast.error(msg)
      setPhase("idle")
      throw err
    }
  }

  return (
    <Card className={cn("flex flex-col gap-0 overflow-hidden p-0", className)}>
      <header className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-primary/20 text-primary">
            <Lock className="h-4 w-4" />
          </span>
          <div className="leading-tight">
            <div className="text-sm font-medium">Stealth Send</div>
            <div className="text-xs text-muted-foreground">
              EIP-5564 · Sourcify-reviewed · cosmic-seeded · Base Sepolia
            </div>
          </div>
        </div>
        <Badge variant="secondary" className="font-mono text-[10px]">
          <ShieldCheck className="mr-1 h-3 w-3 text-emerald-300" />
          private by default
        </Badge>
      </header>

      <div className="grid gap-6 p-6 md:grid-cols-[260px_1fr]">
        {/* Hero column: cosmic orb */}
        <div className="flex flex-col items-center justify-center gap-3">
          <CosmicOrb
            phase={phase === "reviewing" || phase === "sending" || phase === "done" ? "revealed" : phase === "idle" ? "idle" : phase}
            sample={sample}
            size={220}
          />
          <PhaseLabel phase={phase} cosmicSeeded={result?.cosmicSeeded} />
        </div>

        {/* Form column */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-xs uppercase tracking-wider text-muted-foreground">
              Recipient
            </label>
            <Input
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="alice.ethtwin.eth"
              disabled={phase === "fetching" || phase === "reviewing" || phase === "sending"}
              className="font-mono"
            />
            {agents.length > 0 ? (
              <ScrollArea className="-mx-2 max-h-32 rounded-md">
                <div className="flex flex-wrap gap-1.5 px-2">
                  {agents.map((a) => (
                    <button
                      key={a.ens}
                      onClick={() => pickAgent(a.ens)}
                      className={cn(
                        "group inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/80 px-2 py-1 text-xs transition hover:bg-secondary/60",
                        recipient === a.ens && "border-primary/40 bg-primary/10",
                      )}
                    >
                      <EnsAvatar ens={a.ens} size={18} />
                      <span className="font-mono">{a.ens}</span>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            ) : agentsLoading ? (
              <div className="text-[11px] text-muted-foreground">
                loading agent directory…
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs uppercase tracking-wider text-muted-foreground">
              Amount (USDC, max 1)
            </label>
            <Input
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={phase === "fetching" || phase === "reviewing" || phase === "sending"}
              className="font-mono"
            />
            <p className="text-[11px] text-muted-foreground">
              Flow: cTRNG seed → Sourcify contract review → private stealth transfer.
            </p>
          </div>

          {error ? (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">
              {error}
            </div>
          ) : null}

          {result ? (
            <ResultCard
              result={result}
              onProfileClick={() => setProfileEns(result.recipientEnsName)}
            />
          ) : null}

          <div className="flex items-center gap-2 pt-1">
            <Button
              onClick={handleSend}
              disabled={!canSend}
              className="flex-1"
            >
              {phase === "fetching" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> requesting cosmic seed…
                </>
              ) : phase === "reviewing" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> opening Sourcify review…
                </>
              ) : phase === "sending" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> broadcasting on Base Sepolia…
                </>
              ) : phase === "done" ? (
                <>
                  <Sparkles className="h-4 w-4" /> send another
                </>
              ) : (
                <>
                  <Lock className="h-4 w-4" /> review & send privately
                </>
              )}
            </Button>
            {phase === "done" || error ? (
              <Button variant="ghost" onClick={reset}>
                reset
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <AgentProfileDialog
        ens={profileEns}
        open={profileEns !== null}
        onOpenChange={(open) => !open && setProfileEns(null)}
      />
      <TxApprovalModal
        intent={pendingIntent}
        open={modalOpen}
        onOpenChange={(next) => {
          setModalOpen(next)
          if (!next && phase === "reviewing") {
            setPhase("revealed")
          }
          if (!next) {
            setTimeout(() => setPendingIntent(null), 200)
          }
        }}
        onApprove={executeStealthSend}
      />
    </Card>
  )
}

function PhaseLabel({
  phase,
  cosmicSeeded,
}: {
  phase: Phase
  cosmicSeeded?: boolean
}) {
  const text = (() => {
    switch (phase) {
      case "idle":
        return "Pick a twin and an amount."
      case "fetching":
        return "Pulling cTRNG entropy from Orbitport…"
      case "revealed":
        return "Cosmic seed locked in."
      case "reviewing":
        return "Sourcify is reviewing the contract call…"
      case "sending":
        return "Deriving stealth address & broadcasting…"
      case "done":
        return cosmicSeeded
          ? "Sent. Seeded by the cosmos. ✨"
          : "Sent. (seed fell back to local entropy)"
    }
  })()
  return (
    <motion.span
      key={phase}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="text-center text-[11px] uppercase tracking-[0.18em] text-muted-foreground"
    >
      {text}
    </motion.span>
  )
}

function ResultCard({
  result,
  onProfileClick,
}: {
  result: SendResult
  onProfileClick: () => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-2 rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5 text-xs"
    >
      <div className="flex items-center justify-between">
        <span className="font-medium text-emerald-300">
          ✓ {result.amountHuman} USDC sent privately
        </span>
        <a
          href={result.blockExplorerUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-primary hover:underline"
        >
          basescan <ExternalLink className="h-3 w-3" />
        </a>
      </div>
      <div className="grid gap-1 font-mono text-[10px] text-muted-foreground">
        <button
          onClick={onProfileClick}
          className="text-left hover:underline"
          title="View recipient profile"
        >
          recipient · {result.recipientEnsName}
        </button>
        <span>stealth addr · {short(result.stealthAddress)}</span>
        <span>view tag · {result.viewTag}</span>
        {result.cosmicSeeded ? (
          <span>attestation · {short(result.attestation, 6)}</span>
        ) : null}
        {result.mocked ? (
          <span className="text-amber-300">⚠ stealth SDK fell back to mock</span>
        ) : null}
      </div>
      <BountyTrail
        tags={
          result.cosmicSeeded
            ? ["ens", "stealth", "ctrng", "kms", "sourcify"]
            : ["ens", "stealth", "kms", "sourcify"]
        }
        className="pt-1"
      />
    </motion.div>
  )
}

function short(value: string, head = 8): string {
  if (!value) return ""
  if (value.length <= head * 2 + 3) return value
  return `${value.slice(0, head)}…${value.slice(-4)}`
}
