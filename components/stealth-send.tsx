"use client"

// Stealth USDC send — the private-payments flow.
//
// Phases:
//   idle      → user picks recipient + amount + chain
//   reviewing → Sourcify safety review modal opens
//   sending   → /api/stealth/send (USDC.transfer to one-time stealth addr +
//                ERC-5564 Announcement)
//   done      → block-explorer links + stealth address + receipt

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
import { AgentProfileDialog } from "@/components/agent-profile"
import { EnsAvatar } from "@/components/ens-avatar"
import { BountyTrail } from "@/components/bounty-trail"
import { FundTwin } from "@/components/fund-twin"
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

type StealthChain = "sepolia" | "base-sepolia"

type StealthInboxItem = {
  chain: StealthChain
  stealthAddress: `0x${string}`
  ephemeralPublicKey: `0x${string}`
  token: `0x${string}` | null
  amount: string | null
  amountHuman: string | null
  balanceRaw: string
  balanceHuman: string
  blockNumber: string
  txHash: `0x${string}`
  caller: `0x${string}`
  /** Sender's ENS name when the caller maps to a known twin's addr; null otherwise. */
  senderEns: string | null
  explorerUrl: string
}

type ClaimResult = {
  ok: boolean
  error?: string
  twinAddress?: `0x${string}`
  sweptAmountHuman?: string
  sweepTx?: `0x${string}`
  topupTx?: `0x${string}` | null
  explorerUrl?: string
  topupExplorerUrl?: string | null
}

type TwinWalletState = {
  address: `0x${string}` | null
  ethHuman: string
  usdcHuman: string
  loading: boolean
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
  chain: StealthChain
  txHash: `0x${string}`
  /** ERC-5564 announcer tx hash — null if announcer isn't on this chain. */
  announceTxHash: `0x${string}` | null
  announced: boolean
  blockNumber: string
  blockExplorerUrl: string
  announceExplorerUrl: string | null
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
  const [chain, setChain] = useState<StealthChain>("base-sepolia")
  const [phase, setPhase] = useState<Phase>("idle")
  const [sample, setSample] = useState<CosmicSample | null>(null)
  const [result, setResult] = useState<SendResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [profileEns, setProfileEns] = useState<string | null>(null)
  const [pendingIntent, setPendingIntent] = useState<TxIntent | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [inboxLoading, setInboxLoading] = useState(false)
  const [inbox, setInbox] = useState<StealthInboxItem[]>([])
  // Twin's KMS-derived address (the funding target for FundTwin).
  const [twinAddress, setTwinAddress] = useState<`0x${string}` | null>(null)
  const [twinWallet, setTwinWallet] = useState<TwinWalletState>({
    address: null,
    ethHuman: "—",
    usdcHuman: "—",
    loading: false,
  })

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

  // Resolve our twin's on-chain `addr` record — that's the KMS-derived
  // address users top up via FundTwin. One read per mount.
  useEffect(() => {
    let cancelled = false
    fetch(`/api/agent/${encodeURIComponent(myEnsName)}`)
      .then((r) => r.json())
      .then((data: { ok?: boolean; addr?: string | null }) => {
        if (cancelled) return
        if (data.ok && data.addr) setTwinAddress(data.addr as `0x${string}`)
      })
      .catch(() => {
        // best-effort
      })
    return () => {
      cancelled = true
    }
  }, [myEnsName])

  // Live balance read at the twin's KMS-derived address — that's the
  // user's actual on-chain wallet. Without surfacing this, swept stealth
  // funds appear nowhere visible to the recipient.
  const loadTwinWallet = useCallback(async () => {
    if (!twinAddress) return
    setTwinWallet((prev) => ({ ...prev, loading: true }))
    try {
      const res = await fetch(
        `/api/transfer?chain=${encodeURIComponent(chain)}&token=USDC&address=${encodeURIComponent(twinAddress)}`,
      )
      const data = (await res.json()) as { ok?: boolean; balance?: string }
      const usdc = data.ok && data.balance ? data.balance : "—"
      const ethRes = await fetch(
        `/api/transfer?chain=${encodeURIComponent(chain)}&token=ETH&address=${encodeURIComponent(twinAddress)}`,
      )
      const ethData = (await ethRes.json()) as { ok?: boolean; balance?: string }
      const eth = ethData.ok && ethData.balance ? ethData.balance : "—"
      setTwinWallet({
        address: twinAddress,
        ethHuman: eth,
        usdcHuman: usdc,
        loading: false,
      })
    } catch {
      setTwinWallet((prev) => ({ ...prev, loading: false }))
    }
  }, [twinAddress, chain])

  useEffect(() => {
    loadTwinWallet()
  }, [loadTwinWallet])

  // Stealth inbox: scan the ERC-5564 Announcer for inbound payments
  // addressed to this twin and surface them so the receiver actually has
  // a UX surface that says "you got paid". Without this, stealth's privacy
  // property hides the payment from the recipient too.
  const loadInbox = useCallback(async () => {
    setInboxLoading(true)
    try {
      const res = await fetch(
        `/api/stealth/inbox?ens=${encodeURIComponent(myEnsName)}&chain=${chain}`,
      )
      const data = (await res.json()) as {
        ok: boolean
        matches?: StealthInboxItem[]
      }
      if (data.ok && data.matches) {
        setInbox(data.matches)
      }
    } catch {
      // best-effort — empty inbox surface is acceptable on transient RPC errors
    } finally {
      setInboxLoading(false)
    }
  }, [myEnsName, chain])

  useEffect(() => {
    loadInbox()
  }, [loadInbox])

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
    setSample(null)

    // 1. Sourcify contract-intelligence review before the actual stealth tx.
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
          chain,
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
        description: `${data.amountHuman} USDC to one-time stealth address ${data.stealthAddress}.`,
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
          <span className="grid h-7 w-7 place-items-center rounded-full bg-primary/15 text-primary">
            <Lock className="h-4 w-4" />
          </span>
          <div className="leading-tight">
            <div className="text-sm font-medium">Stealth Send</div>
            <div className="text-xs text-muted-foreground">
              EIP-5564 · Sourcify-reviewed · KMS-signed · Base Sepolia
            </div>
          </div>
        </div>
        <Badge variant="secondary" className="font-mono text-[10px]">
          <ShieldCheck className="mr-1 h-3 w-3 text-emerald-600" />
          private by default
        </Badge>
      </header>

      {/* Top half — SEND. Two-column: hero + send form. */}
      <div className="grid gap-6 p-6 md:grid-cols-[240px_1fr]">
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-border/60 bg-card/40 p-5 text-center">
          <div className="grid h-16 w-16 place-items-center rounded-full bg-primary/10 text-primary">
            <Lock className="h-8 w-8" />
          </div>
          <div>
            <div className="text-sm font-semibold text-foreground/90">
              Stealth send
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              EIP-5564 one-time address derived from the recipient&apos;s
              ENS-published meta-key. Signed by your twin&apos;s SpaceComputer
              KMS key when funded; otherwise relayed by the dev wallet.
            </p>
          </div>
          <PhaseLabel phase={phase} />
        </div>

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
              <ScrollArea className="-mx-2 max-h-28 rounded-md">
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

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label className="text-xs uppercase tracking-wider text-muted-foreground">
                Chain
              </label>
              <div className="flex gap-2">
                {(["base-sepolia", "sepolia"] as const).map((c) => (
                  <Button
                    key={c}
                    type="button"
                    variant={chain === c ? "default" : "outline"}
                    size="sm"
                    onClick={() => setChain(c)}
                    disabled={phase === "fetching" || phase === "reviewing" || phase === "sending"}
                    className="flex-1"
                  >
                    {c === "sepolia" ? "Sepolia" : "Base Sepolia"}
                  </Button>
                ))}
              </div>
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
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Sourcify contract review → USDC.transfer(stealthAddr) → ERC-5564
            Announcement on the canonical announcer.
          </p>

          {error ? (
            <div className="rounded-md border border-amber-500/40 bg-amber-50 px-3 py-2 text-xs text-amber-700">
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
              {phase === "reviewing" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> opening Sourcify review…
                </>
              ) : phase === "sending" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> broadcasting…
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

      {/* Bottom half — RECEIVE. Wallet, fund, inbox. Visually separated
       *  with a divider so the send + receive paths read as two distinct
       *  flows instead of one giant scroll. */}
      <div className="border-t border-border/60 bg-card/30">
        <div className="flex items-center justify-between px-6 pt-4">
          <h3 className="text-sm font-semibold text-foreground/90">
            Receive
          </h3>
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            wallet · fund · inbox
          </span>
        </div>
        <div className="grid gap-3 p-6 md:grid-cols-2">
          <TwinWalletCard
            myEnsName={myEnsName}
            chain={chain}
            wallet={twinWallet}
            onRefresh={loadTwinWallet}
          />
          <FundTwin twinAddress={twinAddress} defaultChain={chain} />
          <div className="md:col-span-2">
            <StealthInboxCard
              myEnsName={myEnsName}
              chain={chain}
              items={inbox}
              loading={inboxLoading}
              onRefresh={() => {
                loadInbox()
                loadTwinWallet()
              }}
            />
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

function PhaseLabel({ phase }: { phase: Phase; cosmicSeeded?: boolean }) {
  const text = (() => {
    switch (phase) {
      case "idle":
        return "Pick a twin and an amount."
      case "fetching":
        return "Resolving recipient meta-key…"
      case "revealed":
        return "Stealth target locked in."
      case "reviewing":
        return "Sourcify is reviewing the contract call…"
      case "sending":
        return "Deriving stealth address & broadcasting…"
      case "done":
        return "Sent privately."
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

function TwinWalletCard({
  myEnsName,
  chain,
  wallet,
  onRefresh,
}: {
  myEnsName: string
  chain: StealthChain
  wallet: TwinWalletState
  onRefresh: () => void
}) {
  const ensAppUrl = `https://sepolia.app.ens.domains/${myEnsName}`
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border/70 bg-card/80 p-3 text-xs shadow-sm">
      <div className="flex items-center justify-between">
        <span className="font-medium text-foreground">
          Twin wallet
        </span>
        <button
          type="button"
          onClick={onRefresh}
          disabled={wallet.loading}
          className="font-mono text-[10px] text-primary hover:underline disabled:opacity-50"
        >
          {wallet.loading ? "reading…" : "refresh"}
        </button>
      </div>
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        KMS-derived address bound to{" "}
        <span className="font-mono text-foreground/85">{myEnsName}</span>&apos;s{" "}
        <code className="font-mono text-foreground/80">addr</code> record.
        Claimed stealth funds land here.
      </p>
      <div className="grid gap-1 rounded-md bg-secondary/40 p-2 font-mono text-[11px]">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">USDC</span>
          <span className="text-foreground">
            {wallet.usdcHuman === "—" ? "—" : `${wallet.usdcHuman}`}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">ETH</span>
          <span className="text-foreground">
            {wallet.ethHuman === "—" ? "—" : `${wallet.ethHuman}`}
          </span>
        </div>
        {wallet.address ? (
          <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-1">
            <span className="text-muted-foreground">addr</span>
            <button
              type="button"
              title="Copy address"
              onClick={() => {
                navigator.clipboard.writeText(wallet.address ?? "").catch(() => {})
                toast.success("Address copied")
              }}
              className="truncate text-foreground hover:underline"
            >
              {short(wallet.address)}
            </button>
          </div>
        ) : null}
      </div>
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-muted-foreground">
          {chain === "sepolia" ? "Sepolia" : "Base Sepolia"}
        </span>
        <a
          href={ensAppUrl}
          target="_blank"
          rel="noreferrer"
          className="text-primary hover:underline"
        >
          ENS records ↗
        </a>
      </div>
    </div>
  )
}

function StealthInboxCard({
  myEnsName,
  chain,
  items,
  loading,
  onRefresh,
}: {
  myEnsName: string
  chain: StealthChain
  items: StealthInboxItem[]
  loading: boolean
  onRefresh: () => void
}) {
  const [claiming, setClaiming] = useState<string | null>(null)
  const [claimed, setClaimed] = useState<Record<string, ClaimResult>>({})

  async function claim(item: StealthInboxItem) {
    setClaiming(item.stealthAddress)
    try {
      const res = await fetch("/api/stealth/claim", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ens: myEnsName,
          stealthAddress: item.stealthAddress,
          ephemeralPubKey: item.ephemeralPublicKey,
          chain: item.chain,
          // Pass the resolved sender ENS so the claim receipt records who
          // actually sent the funds (not just the caller address).
          ...(item.senderEns ? { senderEns: item.senderEns } : {}),
        }),
      })
      const data = (await res.json()) as ClaimResult
      setClaimed((prev) => ({ ...prev, [item.stealthAddress]: data }))
      if (data.ok && data.sweptAmountHuman) {
        const fromLabel = item.senderEns ? ` from ${item.senderEns}` : ""
        toast.success(
          `Claimed ${data.sweptAmountHuman} USDC${fromLabel} → your twin wallet`,
          { description: data.explorerUrl },
        )
        onRefresh()
      } else if (data.error) {
        toast.error(data.error)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Claim failed"
      toast.error(msg)
      setClaimed((prev) => ({
        ...prev,
        [item.stealthAddress]: { ok: false, error: msg },
      }))
    } finally {
      setClaiming(null)
    }
  }

  const totalUnclaimedRaw = items
    .filter((it) => !claimed[it.stealthAddress]?.ok)
    .reduce((acc, it) => acc + BigInt(it.balanceRaw), 0n)
  const totalUnclaimed = formatUsdc(totalUnclaimedRaw)

  return (
    <div className="space-y-2 rounded-lg border border-border/70 bg-card/80 px-3 py-2.5 text-xs shadow-sm">
      <div className="flex items-center justify-between">
        <span className="font-medium text-foreground">
          Stealth inbox
        </span>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="font-mono text-[10px] text-primary hover:underline disabled:opacity-50"
        >
          {loading ? "scanning…" : "refresh"}
        </button>
      </div>
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        Server scans the ERC-5564 Announcer on{" "}
        {chain === "sepolia" ? "Sepolia" : "Base Sepolia"} and re-derives each
        stealth address with your viewing key. Click <strong>Claim</strong> to
        sweep funds from a one-time address into your twin&apos;s main wallet.
      </p>
      {items.length > 0 ? (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 font-mono text-[11px] text-emerald-700">
          unclaimed total: {totalUnclaimed} USDC
        </div>
      ) : null}
      {items.length === 0 ? (
        <p className="font-mono text-[10px] text-muted-foreground">
          {loading ? "scanning announcer logs…" : "no inbound stealth payments yet."}
        </p>
      ) : (
        <ul className="grid gap-1.5">
          {items.map((it) => {
            const claimRes = claimed[it.stealthAddress]
            const isClaiming = claiming === it.stealthAddress
            const isClaimed = claimRes?.ok === true
            return (
              <li
                key={it.txHash}
                className="rounded-md border border-border/60 bg-background px-2.5 py-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] font-semibold text-emerald-700">
                    {it.amountHuman ?? "?"} USDC
                  </span>
                  <div className="flex items-center gap-2">
                    <a
                      href={it.explorerUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-[10px] text-primary hover:underline"
                    >
                      view ↗
                    </a>
                    <Button
                      type="button"
                      size="sm"
                      variant={isClaimed ? "outline" : "default"}
                      disabled={isClaiming || isClaimed || BigInt(it.balanceRaw) === 0n}
                      onClick={() => claim(it)}
                      className="h-6 text-[10px]"
                    >
                      {isClaiming ? (
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      ) : null}
                      {isClaimed
                        ? "✓ claimed"
                        : isClaiming
                          ? "claiming…"
                          : BigInt(it.balanceRaw) === 0n
                            ? "spent"
                            : "Claim"}
                    </Button>
                  </div>
                </div>
                <div className="mt-0.5 grid gap-0.5 font-mono text-[10px] text-muted-foreground">
                  <span>at · {short(it.stealthAddress)}</span>
                  <span>balance now · {it.balanceHuman} USDC</span>
                  <span>
                    from ·{" "}
                    {it.senderEns ? (
                      <a
                        href={`https://sepolia.app.ens.domains/${it.senderEns}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline"
                        title={it.caller}
                      >
                        {it.senderEns} ↗
                      </a>
                    ) : (
                      short(it.caller)
                    )}
                  </span>
                  {claimRes?.ok && claimRes.sweepTx ? (
                    <a
                      href={claimRes.explorerUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-emerald-700 hover:underline"
                    >
                      sweep tx · {short(claimRes.sweepTx)} ↗
                    </a>
                  ) : claimRes?.error ? (
                    <span className="text-red-700">claim error · {claimRes.error}</span>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function formatUsdc(raw: bigint): string {
  const div = 1_000_000n
  const whole = raw / div
  const frac = raw % div
  if (frac === 0n) return whole.toString()
  const fracStr = frac.toString().padStart(6, "0").replace(/0+$/, "")
  return fracStr.length ? `${whole}.${fracStr}` : whole.toString()
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
      className="space-y-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2.5 text-xs shadow-sm"
    >
      <div className="flex items-center justify-between">
        <span className="font-medium text-emerald-700">
          ✓ {result.amountHuman} USDC sent privately on{" "}
          {result.chain === "sepolia" ? "Sepolia" : "Base Sepolia"}
        </span>
        <a
          href={result.blockExplorerUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-primary hover:underline"
        >
          {result.chain === "sepolia" ? "etherscan" : "basescan"}{" "}
          <ExternalLink className="h-3 w-3" />
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
        <a
          href={`https://sepolia.app.ens.domains/${result.recipientEnsName}`}
          target="_blank"
          rel="noreferrer"
          className="text-primary hover:underline"
          title="Recipient's stealth-meta-address text record lives here"
        >
          {result.recipientEnsName} on ENS app ↗
        </a>
        <span>stealth addr · {short(result.stealthAddress)}</span>
        <span>view tag · {result.viewTag}</span>
        {result.announceTxHash ? (
          <a
            href={result.announceExplorerUrl ?? "#"}
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:underline"
            title="ERC-5564 Announcement event — recipient can scan to find this payment"
          >
            erc-5564 announce · {short(result.announceTxHash)} ↗
          </a>
        ) : (
          <span className="text-amber-700">
            ⚠ ERC-5564 Announcer not on this chain — recipient needs the API
            response to find the payment
          </span>
        )}
        {result.mocked ? (
          <span className="text-amber-700">⚠ stealth SDK fell back to mock</span>
        ) : null}
      </div>
      <BountyTrail
        tags={["ens", "stealth", "kms", "sourcify"]}
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
