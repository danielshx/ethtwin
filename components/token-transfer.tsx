"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import { ArrowUpRight, Coins, Loader2, Send, ShieldCheck, Users } from "lucide-react"
import { toast } from "sonner"
import {
  createPublicClient,
  encodeFunctionData,
  getAddress,
  http,
  isAddress,
  parseEther,
  parseUnits,
  type Address,
  type Hex,
} from "viem"
import { sepolia } from "viem/chains"
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets"
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
import { TxApprovalModal, type TxIntent } from "@/components/tx-approval-modal"
import { useEnsName } from "@/lib/use-ens-name"

type AgentEntry = {
  ens: string
  addedAt: number
  avatar?: string | null
  description?: string | null
}
type Chain = "sepolia" | "base-sepolia"
type Token = "ETH" | "USDC"

type RecentTransfer = {
  id: string
  chain: Chain
  token: Token
  to: string
  recipientInput: string
  amount: string
  txHash: string
  blockExplorerUrl: string
  at: number
}

type TokenTransferProps = {
  myEnsName: string
  getAuthToken: () => Promise<string | null>
  className?: string
}

const CHAINS: { id: Chain; label: string }[] = [
  { id: "sepolia", label: "Sepolia" },
  { id: "base-sepolia", label: "Base Sepolia" },
]

const TOKENS: { id: Token; label: string }[] = [
  { id: "ETH", label: "ETH" },
  { id: "USDC", label: "USDC" },
]

const RECENT_KEY = "ethtwin.transfers.recent.v1"
const MAX_RECENT = 10

// Demo safety caps mirror /api/transfer's hard caps. Bigger sends would
// require a code change — intentional to keep the demo wallet from draining.
const MAX_ETH_WEI = parseEther("0.01")
const MAX_USDC_RAW = parseUnits("1", 6)

// Base Sepolia USDC. Same address used in lib/transfers.ts + lib/payments.ts.
const USDC_BASE_SEPOLIA: Address = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"

// Minimal ERC-20 transfer ABI for client-side calldata encoding.
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

// Public Sepolia client for forward ENS resolution (`alice.ethtwin.eth` →
// `0x…`). Our subnames live on Sepolia per CLAUDE.md.
const sepoliaPublic = createPublicClient({
  chain: sepolia,
  transport: http(process.env.NEXT_PUBLIC_SEPOLIA_RPC ?? undefined),
})

async function resolveRecipient(input: string): Promise<Address> {
  const trimmed = input.trim()
  if (isAddress(trimmed)) return getAddress(trimmed)
  if (!trimmed.includes(".")) {
    throw new Error(`"${trimmed}" is neither a 0x address nor an ENS name.`)
  }
  const resolved = await sepoliaPublic.getEnsAddress({ name: trimmed })
  if (!resolved) {
    throw new Error(`Could not resolve ENS name "${trimmed}" on Sepolia.`)
  }
  return getAddress(resolved)
}

export function TokenTransfer({ myEnsName, getAuthToken, className }: TokenTransferProps) {
  const smart = useSmartWallets()
  const smartClient = smart.client
  const smartWalletAddress = smartClient?.account?.address ?? null

  const [agents, setAgents] = useState<AgentEntry[]>([])
  const [agentsLoading, setAgentsLoading] = useState(true)
  const [recipient, setRecipient] = useState("")
  const [chain, setChain] = useState<Chain>("base-sepolia")
  const [token, setToken] = useState<Token>("USDC")
  const [amount, setAmount] = useState("0.01")
  const [balance, setBalance] = useState<string | null>(null)
  const [balanceLoading, setBalanceLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [recent, setRecent] = useState<RecentTransfer[]>([])
  const [profileEns, setProfileEns] = useState<string | null>(null)

  // Tx approval modal state — populated when the user clicks Send and we
  // have a Privy smart wallet ready to sign client-side.
  const [pendingIntent, setPendingIntent] = useState<TxIntent | null>(null)
  const [pendingMeta, setPendingMeta] = useState<{
    chain: Chain
    token: Token
    recipientInput: string
    amount: string
    resolvedTo: Address
  } | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  // Reverse-resolve ENS names for the modal. Per CLAUDE.md: tx approvals
  // show ENS, never 0x… The hook returns null while loading / on miss; the
  // modal already falls back to a truncated 0x… in that case.
  const toEnsName = useEnsName(pendingMeta?.resolvedTo)
  const fromEnsName = useEnsName(smartWalletAddress)

  // Smart-wallet sign path is Base Sepolia only — that's the chain our
  // `SmartWalletsProvider` is configured for. Any other chain falls back
  // to the dev-wallet `/api/transfer` route, which is fine for the demo.
  const canUseSmartWallet = !!smartClient && chain === "base-sepolia"

  // Load agents + recent transfers on mount.
  const loadAgents = useCallback(async () => {
    setAgentsLoading(true)
    try {
      const res = await fetch("/api/agents")
      const data = (await res.json()) as { ok: boolean; agents?: AgentEntry[] }
      if (data.ok && data.agents) {
        setAgents(data.agents.filter((a) => a.ens.toLowerCase() !== myEnsName.toLowerCase()))
      }
    } catch {
      // best-effort
    } finally {
      setAgentsLoading(false)
    }
  }, [myEnsName])

  useEffect(() => {
    loadAgents()
    try {
      const raw = localStorage.getItem(RECENT_KEY)
      if (raw) setRecent(JSON.parse(raw) as RecentTransfer[])
    } catch {}
  }, [loadAgents])

  // Refresh the current agent's balance whenever chain/token changes.
  const loadBalance = useCallback(async () => {
    setBalanceLoading(true)
    try {
      const res = await fetch(
        `/api/transfer?chain=${encodeURIComponent(chain)}&token=${encodeURIComponent(
          token,
        )}&address=${encodeURIComponent(myEnsName)}`,
      )
      const data = (await res.json()) as { ok: boolean; balance?: string }
      setBalance(data.ok && data.balance ? data.balance : null)
    } catch {
      setBalance(null)
    } finally {
      setBalanceLoading(false)
    }
  }, [chain, token, myEnsName])

  useEffect(() => {
    loadBalance()
  }, [loadBalance])

  const canSend = useMemo(() => {
    return !sending && recipient.trim().length > 0 && Number(amount) > 0
  }, [sending, recipient, amount])

  function pickAgent(ens: string) {
    setRecipient(ens)
  }

  function pushRecent(t: RecentTransfer) {
    setRecent((prev) => {
      const next = [t, ...prev].slice(0, MAX_RECENT)
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(next))
      } catch {}
      return next
    })
  }

  async function handleSend() {
    if (!canSend) return

    const amt = String(amount)
    const token2send = token
    const chain2send = chain
    const recip = recipient.trim()

    // Cap-check up-front so we don't waste an ENS lookup on bad input.
    let requestedRaw: bigint
    try {
      requestedRaw =
        token2send === "ETH" ? parseEther(amt) : parseUnits(amt, 6)
    } catch {
      toast.error("Invalid amount.")
      return
    }
    const cap = token2send === "ETH" ? MAX_ETH_WEI : MAX_USDC_RAW
    if (requestedRaw > cap) {
      toast.error(
        `Demo cap exceeded: max ${
          token2send === "ETH" ? "0.01 ETH" : "1 USDC"
        } per transfer.`,
      )
      return
    }

    // Branch: if a Privy smart wallet exists and we're on Base Sepolia,
    // open the approval modal so the user signs client-side. Otherwise
    // fall back to the dev-wallet `/api/transfer` route.
    if (canUseSmartWallet) {
      setSending(true)
      try {
        const resolvedTo = await resolveRecipient(recip)
        const data: Hex =
          token2send === "USDC"
            ? encodeFunctionData({
                abi: ERC20_TRANSFER_ABI,
                functionName: "transfer",
                args: [resolvedTo, requestedRaw],
              })
            : "0x"
        const intent: TxIntent = {
          to: token2send === "USDC" ? USDC_BASE_SEPOLIA : resolvedTo,
          value: token2send === "ETH" ? `${amt} ETH` : `${amt} USDC`,
          data,
          chain: "base-sepolia",
          plainEnglish:
            token2send === "ETH"
              ? `Send ${amt} ETH on Base Sepolia to ${recip}.`
              : `Send ${amt} USDC on Base Sepolia to ${recip}.`,
        }
        setPendingMeta({
          chain: chain2send,
          token: token2send,
          recipientInput: recip,
          amount: amt,
          resolvedTo,
        })
        setPendingIntent(intent)
        setModalOpen(true)
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Could not prepare tx"
        toast.error(msg)
      } finally {
        setSending(false)
      }
      return
    }

    // ── Fallback: dev-wallet path via /api/transfer ─────────────────────
    setSending(true)
    try {
      const authToken = await getAuthToken()
      if (!authToken) {
        toast.error("Not authenticated. Sign in again.")
        return
      }
      const res = await fetch("/api/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          privyToken: authToken,
          chain: chain2send,
          token: token2send,
          to: recip,
          amount: amt,
          // Sender's twin ENS so the server can route through their vault
          // when one is bound to the ENS via `twin.vault`.
          fromEns: myEnsName,
        }),
      })
      // Vercel function timeouts return plain text. Parse defensively.
      const ct = res.headers.get("content-type") ?? ""
      if (!ct.includes("application/json")) {
        const text = await res.text()
        toast.error(
          res.status === 504
            ? "Vercel timed out, but the tx may still be on-chain — refresh balance in ~30s."
            : `Server error ${res.status}: ${text.slice(0, 120)}`,
        )
        return
      }
      const data = (await res.json()) as {
        ok: boolean
        error?: string
        txHash?: string
        blockExplorerUrl?: string
        to?: string
        amount?: string
      }
      if (!data.ok) {
        toast.error(data.error ?? "Transfer failed")
        addHistoryEntry({
          kind: "transfer",
          status: "failed",
          chain: chain2send,
          summary: `Failed: ${amt} ${token2send} → ${recip}`,
          errorMessage: data.error,
          syncTo: { ens: myEnsName, getAuthToken },
        })
        return
      }

      toast.success(`Sent ${data.amount} ${token2send} on ${chain2send}`, {
        description: data.blockExplorerUrl,
      })

      pushRecent({
        id: data.txHash ?? `${Date.now()}`,
        chain: chain2send,
        token: token2send,
        to: data.to ?? recip,
        recipientInput: recip,
        amount: data.amount ?? amt,
        txHash: data.txHash ?? "",
        blockExplorerUrl: data.blockExplorerUrl ?? "",
        at: Math.floor(Date.now() / 1000),
      })

      addHistoryEntry({
        kind: "transfer",
        status: "success",
        chain: chain2send,
        summary: `Sent ${data.amount} ${token2send} → ${recip}`,
        description: data.to ? `Resolved to ${data.to}` : undefined,
        txHash: data.txHash,
        explorerUrl: data.blockExplorerUrl,
        syncTo: { ens: myEnsName, getAuthToken },
      })

      // Refresh balance after send.
      loadBalance()
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Transfer failed"
      toast.error(msg)
      addHistoryEntry({
        kind: "transfer",
        status: "failed",
        chain,
        summary: `Failed: ${amount} ${token} → ${recipient.trim()}`,
        errorMessage: msg,
        syncTo: { ens: myEnsName, getAuthToken },
      })
    } finally {
      setSending(false)
    }
  }

  // Approve callback wired into TxApprovalModal. Calls Privy's
  // smart-wallet `sendTransaction` directly — the user signs in their
  // own embedded wallet, no dev wallet involved. Per CLAUDE.md, this is
  // the path that gives us a *real* user-signed tx for T1-15.
  async function handleSmartWalletApprove(
    intent: TxIntent,
  ): Promise<{ hash: `0x${string}` }> {
    if (!smartClient) {
      throw new Error("Smart wallet client unavailable.")
    }
    if (!pendingMeta) {
      throw new Error("Missing tx context.")
    }
    const meta = pendingMeta
    const value =
      meta.token === "ETH" ? parseEther(meta.amount) : 0n
    // The smart-wallet client is already pinned to Base Sepolia via
    // `SmartWalletsProvider` + `supportedChains` in `app/providers.tsx`,
    // so we omit `chain` here. (Passing it tripped a viem 2.47 vs 2.48
    // dual-version type clash — Privy bundles 2.47.) `Call` shape per
    // `SendUserOperationParameters` is `{ to, value, data }`.
    const hash = await smartClient.sendTransaction({
      to: intent.to as Address,
      value,
      data: (intent.data as Hex) ?? "0x",
    })
    const explorerUrl = `https://sepolia.basescan.org/tx/${hash}`
    pushRecent({
      id: hash,
      chain: meta.chain,
      token: meta.token,
      to: meta.resolvedTo,
      recipientInput: meta.recipientInput,
      amount: meta.amount,
      txHash: hash,
      blockExplorerUrl: explorerUrl,
      at: Math.floor(Date.now() / 1000),
    })
    addHistoryEntry({
      kind: "transfer",
      status: "success",
      chain: meta.chain,
      summary: `Sent ${meta.amount} ${meta.token} → ${meta.recipientInput}`,
      description: `Signed with ${myEnsName}'s smart wallet · ${meta.resolvedTo}`,
      txHash: hash,
      explorerUrl,
      syncTo: { ens: myEnsName, getAuthToken },
    })
    toast.success(`Sent ${meta.amount} ${meta.token} on Base Sepolia`, {
      description: explorerUrl,
    })
    // Refresh balance once the user closes the modal — but kick it off
    // immediately so the next "open" shows fresh numbers.
    loadBalance()
    return { hash }
  }

  return (
    <Card className={cn("grid h-[70dvh] grid-cols-[260px_1fr] overflow-hidden", className)}>
      {/* Sidebar — directory, identical pattern to messenger */}
      <aside className="flex flex-col border-r border-border/60 bg-card/50">
        <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Agents</span>
          <Badge variant="secondary" className="ml-auto font-mono text-[10px]">
            {agents.length}
          </Badge>
        </div>

        <div className="space-y-1 border-b border-border/60 px-3 py-3">
          <Input
            placeholder="alice.ethtwin.eth or 0x…"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            className="h-8 font-mono text-xs"
          />
          <p className="text-[10px] text-muted-foreground">
            Type any ENS name or 0x address.
          </p>
        </div>

        <ScrollArea className="flex-1">
          <div className="space-y-1 p-2">
            {agentsLoading ? (
              <div className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Loading directory…
              </div>
            ) : agents.length === 0 ? (
              <div className="px-2 py-3 text-xs text-muted-foreground">
                No agents yet.
              </div>
            ) : (
              agents.map((a) => {
                const { displayName, suffix } = displayNameFromEns(a.ens)
                const isSelected = recipient.trim().toLowerCase() === a.ens.toLowerCase()
                return (
                  <div
                    key={a.ens}
                    className={cn(
                      "group flex items-center gap-2.5 rounded-md transition",
                      isSelected ? "bg-primary/15" : "hover:bg-secondary/40",
                    )}
                  >
                    <button
                      onClick={() => pickAgent(a.ens)}
                      className="flex flex-1 items-center gap-2.5 px-2 py-2 text-left min-w-0"
                    >
                      <EnsAvatar ens={a.ens} size={36} />
                      <div className="flex min-w-0 flex-1 flex-col leading-tight">
                        <span
                          className={cn(
                            "truncate text-sm font-medium",
                            isSelected ? "text-primary" : "text-foreground",
                          )}
                        >
                          {displayName}
                        </span>
                        <span className="truncate font-mono text-[10px] text-muted-foreground">
                          {suffix ? `${a.ens.split(".")[0]}.${suffix}` : a.ens}
                        </span>
                      </div>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setProfileEns(a.ens)
                      }}
                      title="View profile"
                      className="px-2 py-2 text-[10px] text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:text-primary"
                    >
                      info
                    </button>
                  </div>
                )
              })
            )}
          </div>
        </ScrollArea>
      </aside>

      {/* Main — send form + recent history */}
      <section className="flex flex-col overflow-hidden">
        <header className="flex items-center gap-2 border-b border-border/60 px-5 py-3">
          <Coins className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Send tokens</span>
          <Badge variant="secondary" className="ml-auto font-mono text-[10px]">
            multichain · ENS-aware
          </Badge>
        </header>

        <div className="grid gap-5 overflow-y-auto p-5">
          {/* Recipient summary */}
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-md border border-border/60 bg-card/40 px-4 py-3"
          >
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Recipient
            </div>
            {recipient ? (
              <button
                onClick={() => recipient.includes(".") && setProfileEns(recipient)}
                className="mt-1 flex items-center gap-2 rounded-md px-1 -mx-1 py-1 text-left hover:bg-secondary/40"
                disabled={!recipient.includes(".")}
                title={recipient.includes(".") ? "View profile" : undefined}
              >
                <EnsAvatar ens={recipient} size={28} />
                <span className="font-mono text-sm">{recipient}</span>
              </button>
            ) : (
              <div className="mt-1 font-mono text-sm">
                <span className="text-muted-foreground">
                  pick an agent or paste an address
                </span>
              </div>
            )}
          </motion.div>

          {/* Chain toggle */}
          <div>
            <div className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">
              Chain
            </div>
            <div className="flex gap-2">
              {CHAINS.map((c) => (
                <Button
                  key={c.id}
                  variant={chain === c.id ? "default" : "outline"}
                  size="sm"
                  onClick={() => setChain(c.id)}
                  className="flex-1"
                >
                  {c.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Token toggle */}
          <div>
            <div className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">
              Token
            </div>
            <div className="flex gap-2">
              {TOKENS.map((t) => (
                <Button
                  key={t.id}
                  variant={token === t.id ? "default" : "outline"}
                  size="sm"
                  onClick={() => setToken(t.id)}
                  className="flex-1"
                >
                  {t.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Amount + balance */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Amount
              </div>
              <div className="font-mono text-[10px] text-muted-foreground">
                <span className="text-foreground/80">{myEnsName}</span> holds{" "}
                {balanceLoading ? (
                  <Loader2 className="ml-1 inline h-3 w-3 animate-spin" />
                ) : balance ? (
                  <span className="font-semibold text-foreground">
                    {balance} {token}
                  </span>
                ) : (
                  "—"
                )}
              </div>
            </div>
            <Input
              type="number"
              step="0.0001"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.01"
              className="font-mono text-sm"
              disabled={sending}
            />
            <p className="mt-1 font-mono text-[10px] text-muted-foreground">
              Demo cap: 0.01 ETH or 1 USDC per send.
            </p>
            {canUseSmartWallet ? (
              <p className="mt-1 flex items-center gap-1 font-mono text-[10px] text-primary/90">
                <ShieldCheck className="h-3 w-3" />
                You'll sign with your own smart wallet on Base Sepolia.
              </p>
            ) : null}
          </div>

          <Button
            onClick={handleSend}
            disabled={!canSend}
            size="lg"
            className="bg-gradient-to-r from-primary to-fuchsia-500 text-primary-foreground"
          >
            {sending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {canUseSmartWallet ? "Preparing…" : "Broadcasting…"}
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                {canUseSmartWallet ? "Review & sign" : "Send"} {amount} {token} on{" "}
                {chain === "sepolia" ? "Sepolia" : "Base Sepolia"}
              </>
            )}
          </Button>

          {/* Recent transfers */}
          {recent.length > 0 && (
            <div>
              <div className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                Recent transfers
              </div>
              <div className="space-y-2">
                {recent.map((r) => (
                  <a
                    key={r.id}
                    href={r.blockExplorerUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between rounded-md border border-border/60 bg-card/40 px-3 py-2 text-xs transition hover:border-primary/30 hover:bg-primary/5"
                  >
                    <div>
                      <div className="font-mono">
                        {r.amount} {r.token} → {r.recipientInput}
                      </div>
                      <div className="font-mono text-[10px] text-muted-foreground">
                        {r.chain} · {new Date(r.at * 1000).toLocaleTimeString()}
                      </div>
                    </div>
                    <ArrowUpRight className="h-3 w-3 text-muted-foreground" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <AgentProfileDialog
        ens={profileEns}
        open={profileEns !== null}
        onOpenChange={(open) => !open && setProfileEns(null)}
      />

      <TxApprovalModal
        intent={
          pendingIntent
            ? { ...pendingIntent, toEnsName, fromEnsName }
            : null
        }
        open={modalOpen}
        onOpenChange={(next) => {
          setModalOpen(next)
          if (!next) {
            // Clear once the dialog finishes its close animation. Keeps
            // ENS-resolution effects from firing again on stale state.
            setTimeout(() => {
              setPendingIntent(null)
              setPendingMeta(null)
            }, 200)
          }
        }}
        onApprove={handleSmartWalletApprove}
      />
    </Card>
  )
}
