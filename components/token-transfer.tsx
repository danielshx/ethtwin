"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import { ArrowUpRight, Coins, Loader2, Send, Users } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { addHistoryEntry } from "@/lib/history"
import { cn } from "@/lib/utils"
import { AgentProfileDialog, AvatarImage } from "@/components/agent-profile"

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

export function TokenTransfer({ myEnsName, getAuthToken, className }: TokenTransferProps) {
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
    setSending(true)
    try {
      const token2send = token
      const chain2send = chain
      const recip = recipient.trim()
      const amt = String(amount)

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

  return (
    <Card className={cn("grid h-[70dvh] grid-cols-[260px_1fr] overflow-hidden", className)}>
      {/* Sidebar — directory, identical pattern to messenger */}
      <aside className="flex flex-col border-r border-white/10 bg-card/50">
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Agents</span>
          <Badge variant="secondary" className="ml-auto font-mono text-[10px]">
            {agents.length}
          </Badge>
        </div>

        <div className="space-y-1 border-b border-white/10 px-3 py-3">
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
              agents.map((a) => (
                <div
                  key={a.ens}
                  className={cn(
                    "group flex items-center gap-2 rounded-md transition",
                    recipient.trim().toLowerCase() === a.ens.toLowerCase()
                      ? "bg-primary/15"
                      : "hover:bg-white/5",
                  )}
                >
                  <button
                    onClick={() => pickAgent(a.ens)}
                    className="flex flex-1 items-center gap-2 px-2 py-2 text-left"
                  >
                    <AvatarImage src={a.avatar ?? null} ens={a.ens} size={28} />
                    <span
                      className={cn(
                        "truncate font-mono text-xs",
                        recipient.trim().toLowerCase() === a.ens.toLowerCase()
                          ? "text-primary"
                          : "text-muted-foreground",
                      )}
                    >
                      {a.ens}
                    </span>
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
              ))
            )}
          </div>
        </ScrollArea>
      </aside>

      {/* Main — send form + recent history */}
      <section className="flex flex-col overflow-hidden">
        <header className="flex items-center gap-2 border-b border-white/10 px-5 py-3">
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
            className="rounded-md border border-white/10 bg-card/40 px-4 py-3"
          >
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Recipient
            </div>
            {recipient ? (
              <button
                onClick={() => recipient.includes(".") && setProfileEns(recipient)}
                className="mt-1 flex items-center gap-2 rounded-md px-1 -mx-1 py-1 text-left hover:bg-white/5"
                disabled={!recipient.includes(".")}
                title={recipient.includes(".") ? "View profile" : undefined}
              >
                <AvatarImage
                  src={
                    agents.find((a) => a.ens.toLowerCase() === recipient.toLowerCase())
                      ?.avatar ?? null
                  }
                  ens={recipient}
                  size={28}
                />
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
                Broadcasting…
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Send {amount} {token} on {chain === "sepolia" ? "Sepolia" : "Base Sepolia"}
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
                    className="flex items-center justify-between rounded-md border border-white/10 bg-card/40 px-3 py-2 text-xs transition hover:border-primary/30 hover:bg-primary/5"
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
    </Card>
  )
}
