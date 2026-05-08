"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import { Loader2, Mail, Send, Users } from "lucide-react"
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
type Message = {
  label: string
  ens: string
  from: string
  body: string
  at: number
}

type MessengerProps = {
  myEnsName: string
  getAuthToken: () => Promise<string | null>
  className?: string
}

const POLL_INTERVAL_MS = 15_000

export function Messenger({ myEnsName, getAuthToken, className }: MessengerProps) {
  const [agents, setAgents] = useState<AgentEntry[]>([])
  const [agentsLoading, setAgentsLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)
  const [manualInput, setManualInput] = useState("")
  const [myInbox, setMyInbox] = useState<Message[]>([])
  const [theirInbox, setTheirInbox] = useState<Message[]>([])
  const [threadLoading, setThreadLoading] = useState(false)
  const [composing, setComposing] = useState("")
  const [sending, setSending] = useState(false)
  const [profileEns, setProfileEns] = useState<string | null>(null)

  const selectedAgent = useMemo(
    () => agents.find((a) => a.ens.toLowerCase() === selected?.toLowerCase()),
    [agents, selected],
  )

  // Combined thread between me and selected agent, sorted oldest → newest.
  const thread = useMemo<Message[]>(() => {
    if (!selected) return []
    const fromThemToMe = myInbox.filter(
      (m) => m.from.toLowerCase() === selected.toLowerCase(),
    )
    const fromMeToThem = theirInbox.filter(
      (m) => m.from.toLowerCase() === myEnsName.toLowerCase(),
    )
    return [...fromThemToMe, ...fromMeToThem].sort((a, b) => a.at - b.at)
  }, [myInbox, theirInbox, selected, myEnsName])

  // Load agent directory once on mount.
  const loadAgents = useCallback(async () => {
    setAgentsLoading(true)
    try {
      const res = await fetch("/api/agents")
      const data = (await res.json()) as { ok: boolean; agents?: AgentEntry[] }
      if (data.ok && data.agents) {
        const filtered = data.agents.filter(
          (a) => a.ens.toLowerCase() !== myEnsName.toLowerCase(),
        )
        setAgents(filtered)
      }
    } catch {
      // silent fail — directory is best-effort
    } finally {
      setAgentsLoading(false)
    }
  }, [myEnsName])

  useEffect(() => {
    loadAgents()
  }, [loadAgents])

  // Reload thread whenever the selected contact changes, then poll.
  const loadThread = useCallback(async () => {
    if (!selected) return
    setThreadLoading(true)
    try {
      const [mine, theirs] = await Promise.all([
        fetch(`/api/messages?for=${encodeURIComponent(myEnsName)}`).then((r) => r.json()),
        fetch(`/api/messages?for=${encodeURIComponent(selected)}`).then((r) => r.json()),
      ])
      if (mine.ok) setMyInbox(mine.messages as Message[])
      if (theirs.ok) setTheirInbox(theirs.messages as Message[])
    } catch {
      // silent — keep last known state
    } finally {
      setThreadLoading(false)
    }
  }, [selected, myEnsName])

  useEffect(() => {
    if (!selected) return
    loadThread()
    const id = setInterval(loadThread, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [selected, loadThread])

  function selectAgent(ens: string) {
    setSelected(ens)
    setMyInbox([])
    setTheirInbox([])
  }

  function handleManualOpen() {
    const cleaned = manualInput.trim().toLowerCase()
    if (!cleaned) return
    if (!cleaned.endsWith(".ethtwin.eth")) {
      toast.error("Recipient must end with .ethtwin.eth")
      return
    }
    if (cleaned === myEnsName.toLowerCase()) {
      toast.error("You can't message yourself.")
      return
    }
    selectAgent(cleaned)
    setManualInput("")
  }

  async function handleSend() {
    const body = composing.trim()
    if (!body || !selected || sending) return
    setSending(true)
    try {
      const token = await getAuthToken()
      if (!token) {
        toast.error("Not authenticated. Sign in again.")
        return
      }
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          privyToken: token,
          fromEns: myEnsName,
          toEns: selected,
          body,
        }),
      })
      // Vercel function timeouts return plain text, not JSON — parse defensively.
      const ct = res.headers.get("content-type") ?? ""
      if (!ct.includes("application/json")) {
        const text = await res.text()
        toast.error(
          res.status === 504
            ? "Vercel timed out, but your message txs may still be on-chain — check the History tab in ~30s."
            : `Server error ${res.status}: ${text.slice(0, 120)}`,
        )
        return
      }
      const data = (await res.json()) as {
        ok: boolean
        error?: string
        message?: Message
        blockExplorerUrl?: string
      }
      if (!data.ok) {
        toast.error(data.error ?? "Send failed")
        addHistoryEntry({
          kind: "message",
          status: "failed",
          chain: "sepolia",
          summary: `Failed message → ${selected}`,
          description: body.slice(0, 80),
          errorMessage: data.error,
          syncTo: { ens: myEnsName, getAuthToken },
        })
        return
      }
      setComposing("")
      toast.success("Message landed on-chain", {
        description: data.blockExplorerUrl,
      })
      addHistoryEntry({
        kind: "message",
        status: "success",
        chain: "sepolia",
        summary: `Message → ${selected}`,
        description: data.message?.body
          ? data.message.body.slice(0, 80) +
            (data.message.body.length > 80 ? "…" : "")
          : body.slice(0, 80),
        explorerUrl: data.blockExplorerUrl,
        syncTo: { ens: myEnsName, getAuthToken },
      })
      // Optimistic append + refresh.
      if (data.message) {
        setTheirInbox((prev) => [data.message!, ...prev])
      }
      loadThread()
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Send failed"
      toast.error(msg)
      addHistoryEntry({
        kind: "message",
        status: "failed",
        chain: "sepolia",
        summary: `Failed message → ${selected}`,
        description: body.slice(0, 80),
        errorMessage: msg,
        syncTo: { ens: myEnsName, getAuthToken },
      })
    } finally {
      setSending(false)
    }
  }

  return (
    <Card className={cn("grid h-[70dvh] grid-cols-[260px_1fr] overflow-hidden", className)}>
      {/* Sidebar — on-chain directory */}
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
            placeholder="alice.ethtwin.eth"
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                handleManualOpen()
              }
            }}
            className="h-8 font-mono text-xs"
          />
          <Button
            variant="secondary"
            size="sm"
            className="w-full"
            onClick={handleManualOpen}
            disabled={!manualInput.trim()}
          >
            Open chat
          </Button>
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
                No agents yet. Once others onboard, they appear here.
              </div>
            ) : (
              agents.map((a) => (
                <div
                  key={a.ens}
                  className={cn(
                    "group flex items-center gap-2 rounded-md transition",
                    selected === a.ens
                      ? "bg-primary/15"
                      : "hover:bg-white/5",
                  )}
                >
                  <button
                    onClick={() => selectAgent(a.ens)}
                    className="flex flex-1 items-center gap-2 px-2 py-2 text-left"
                  >
                    <AvatarImage src={a.avatar ?? null} ens={a.ens} size={28} />
                    <span
                      className={cn(
                        "truncate font-mono text-xs",
                        selected === a.ens ? "text-primary" : "text-muted-foreground",
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

      {/* Main — chat view */}
      <section className="flex flex-col">
        <header className="flex items-center gap-2 border-b border-white/10 px-5 py-3">
          {!selected && <Mail className="h-4 w-4 text-muted-foreground" />}
          {selected ? (
            <>
              <button
                onClick={() => setProfileEns(selected)}
                className="flex items-center gap-2 rounded-md px-1 -mx-1 py-1 hover:bg-white/5"
                title="View profile"
              >
                <AvatarImage src={selectedAgent?.avatar ?? null} ens={selected} size={28} />
                <span className="font-mono text-sm">{selected}</span>
              </button>
              <Badge variant="secondary" className="ml-auto font-mono text-[10px]">
                ENS-native messages
              </Badge>
            </>
          ) : (
            <span className="text-sm text-muted-foreground">
              Pick an agent on the left to start chatting.
            </span>
          )}
        </header>

        <ScrollArea className="flex-1">
          <div className="space-y-3 p-5">
            {!selected ? (
              <EmptyState />
            ) : threadLoading && thread.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Reading on-chain inbox…
              </div>
            ) : thread.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No messages yet. Send the first one — it lands as a sub-subname under
                <code className="ml-1 font-mono text-xs">{selected}</code>.
              </div>
            ) : (
              thread.map((m) => (
                <MessageBubble key={m.label} message={m} mine={m.from.toLowerCase() === myEnsName.toLowerCase()} />
              ))
            )}
          </div>
        </ScrollArea>

        {selected ? (
          <form
            className="border-t border-white/10 px-5 py-4"
            onSubmit={(e) => {
              e.preventDefault()
              handleSend()
            }}
          >
            <div className="flex gap-2">
              <Input
                value={composing}
                onChange={(e) => setComposing(e.target.value)}
                placeholder={`Message ${selected}…`}
                disabled={sending}
                className="font-mono text-sm"
              />
              <Button type="submit" disabled={sending || !composing.trim()}>
                {sending ? (
                  <>
                    <Loader2 className="mr-2 h-3 w-3 animate-spin" /> Mining…
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-3 w-3" /> Send
                  </>
                )}
              </Button>
            </div>
            <p className="mt-2 font-mono text-[10px] text-muted-foreground">
              Each message creates msg-&lt;ts&gt;.{selected} on-chain (~24s on Sepolia).
            </p>
          </form>
        ) : null}
      </section>

      <AgentProfileDialog
        ens={profileEns}
        open={profileEns !== null}
        onOpenChange={(open) => !open && setProfileEns(null)}
      />
    </Card>
  )
}

function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground"
    >
      <Mail className="h-6 w-6 opacity-40" />
      <p>Select an agent on the left, or type an ENS name to start a chat.</p>
      <p className="text-[10px]">
        Every message lives in ENS as a sub-subname of the recipient.
      </p>
    </motion.div>
  )
}

function MessageBubble({ message, mine }: { message: Message; mine: boolean }) {
  return (
    <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[75%] rounded-lg px-3 py-2 text-sm",
          mine ? "bg-primary/20 text-primary-foreground/90" : "bg-white/5 text-foreground/90",
        )}
      >
        <p className="whitespace-pre-wrap break-words">{message.body}</p>
        <p className="mt-1 font-mono text-[10px] text-muted-foreground">
          {mine ? "you" : message.from} · {new Date(message.at * 1000).toLocaleTimeString()}
        </p>
      </div>
    </div>
  )
}
