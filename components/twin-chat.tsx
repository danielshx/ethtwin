"use client"

import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import { useMemo, useRef, useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  ArrowUpRight,
  Check,
  Coins,
  Lock,
  Mail,
  Send,
  Sparkles,
  Trash2,
  Wand2,
  Zap,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { AgentProfileDialog } from "@/components/agent-profile"
import { EnsAvatar } from "@/components/ens-avatar"
import { X402Flow } from "@/components/x402-flow"
import { ReceiptPostcard } from "@/components/receipt-postcard"
import { useDemoMode } from "@/lib/use-demo-mode"
import { displayNameFromEns } from "@/lib/ens"
import { cn } from "@/lib/utils"

type TwinChatProps = {
  ensName: string
  className?: string
  /** Required when editable so the dialog can sign the on-chain text-record
   *  update with the viewer's Privy session. */
  getAuthToken?: () => Promise<string | null>
}

// Reads the env var Next.js inlines at build time so the badge auto-adapts
// when the project switches networks (mainnet / sepolia / base-sepolia / etc.).
function chainLabel(): string {
  const network = process.env.NEXT_PUBLIC_ENS_NETWORK
  switch (network) {
    case "mainnet":
      return "Ethereum"
    case "sepolia":
      return "Sepolia"
    case "base":
      return "Base"
    case "base-sepolia":
      return "Base Sepolia"
  }
  // Fall back to chain ID if ENS network env var isn't set.
  const chainId = process.env.NEXT_PUBLIC_CHAIN_ID
  switch (chainId) {
    case "1":
      return "Ethereum"
    case "11155111":
      return "Sepolia"
    case "8453":
      return "Base"
    case "84532":
      return "Base Sepolia"
  }
  return network ?? "the chain"
}

// localStorage key for twin chat history. Keyed per-ENS so signing in as a
// different twin starts a clean conversation.
const CHAT_HISTORY_KEY = (ens: string) => `ethtwin.twinchat.${ens.toLowerCase()}`
const CHAT_HISTORY_VERSION = 1
const CHAT_HISTORY_LIMIT = 200 // hard cap so localStorage doesn't bloat indefinitely

type StoredChat = {
  v: number
  messages: unknown[]
}

function loadChatHistory(ens: string): unknown[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(CHAT_HISTORY_KEY(ens))
    if (!raw) return []
    const parsed = JSON.parse(raw) as StoredChat
    if (parsed.v !== CHAT_HISTORY_VERSION || !Array.isArray(parsed.messages)) {
      return []
    }
    return parsed.messages
  } catch {
    return []
  }
}

function saveChatHistory(ens: string, messages: unknown[]) {
  if (typeof window === "undefined") return
  try {
    const trimmed = messages.slice(-CHAT_HISTORY_LIMIT)
    window.localStorage.setItem(
      CHAT_HISTORY_KEY(ens),
      JSON.stringify({ v: CHAT_HISTORY_VERSION, messages: trimmed }),
    )
  } catch {
    // out of quota — drop quietly
  }
}

function clearChatHistory(ens: string) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.removeItem(CHAT_HISTORY_KEY(ens))
  } catch {
    // ignore
  }
}

export function TwinChat({ ensName, className, getAuthToken }: TwinChatProps) {
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/twin",
        body: { ensName },
      }),
    [ensName],
  )

  const { messages, sendMessage, status, stop, setMessages } = useChat({
    transport,
  })

  const [input, setInput] = useState("")
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const isStreaming = status === "submitted" || status === "streaming"
  const [profileOpen, setProfileOpen] = useState(false)
  const hydratedRef = useRef(false)

  // Hydrate persisted messages on mount (or when the user switches twins).
  useEffect(() => {
    hydratedRef.current = false
    const persisted = loadChatHistory(ensName)
    if (persisted.length > 0) {
      // The stored messages were taken straight from useChat — they conform
      // to UIMessage. Cast through unknown to satisfy the strict generic.
      setMessages(persisted as Parameters<typeof setMessages>[0])
    } else {
      setMessages([])
    }
    hydratedRef.current = true
  }, [ensName, setMessages])

  // Persist after each change (skip the very first render so we don't write
  // an empty array before hydration finishes).
  useEffect(() => {
    if (!hydratedRef.current) return
    saveChatHistory(ensName, messages)
  }, [messages, ensName])

  useEffect(() => {
    const node = scrollRef.current
    if (!node) return
    node.scrollTo({ top: node.scrollHeight, behavior: "smooth" })
  }, [messages])

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const text = input.trim()
    if (!text || isStreaming) return
    sendMessage({ text })
    setInput("")
  }

  function handleClear() {
    if (!confirm("Clear this conversation? The agent loses everything you've talked about.")) return
    clearChatHistory(ensName)
    setMessages([])
  }

  return (
    <Card className={cn("flex flex-col gap-0 overflow-hidden p-0", className)}>
      <header className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <button
          onClick={() => setProfileOpen(true)}
          className="flex items-center gap-2.5 rounded-md px-1 -mx-1 py-1 text-left hover:bg-secondary/40"
          title="View profile"
        >
          <EnsAvatar ens={ensName} size={36} />
          <div className="leading-tight">
            <div className="text-sm font-medium">
              {displayNameFromEns(ensName).displayName}
            </div>
            <div className="font-mono text-[10px] text-muted-foreground">
              {ensName}
            </div>
          </div>
        </button>
        <div className="flex items-center gap-1.5">
          <Badge variant="secondary" className="font-mono text-[10px]">
            <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
            live on {chainLabel()}
          </Badge>
          {messages.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClear}
              title="Clear conversation history"
              className="h-7 px-2 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </div>
      </header>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-5"
      >
        {messages.length === 0 ? (
          <EmptyState onPick={(text) => sendMessage({ text })} />
        ) : (
          <ul className="flex flex-col gap-4">
            <AnimatePresence initial={false}>
              {messages.map((m) => (
                <motion.li
                  key={m.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <MessageBubble message={m} fromEns={ensName} />
                </motion.li>
              ))}
            </AnimatePresence>
            {isStreaming && (
              <li className="flex items-center gap-2 text-xs text-muted-foreground">
                <ThinkingDots />
                <span>twin is thinking…</span>
              </li>
            )}
          </ul>
        )}
      </div>

      <form
        onSubmit={onSubmit}
        className="flex items-center gap-2 border-t border-border/60 px-3 py-3"
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`Ask ${ensName} anything…`}
          disabled={isStreaming}
          className="flex-1"
        />
        {isStreaming ? (
          <Button type="button" variant="secondary" onClick={stop}>
            Stop
          </Button>
        ) : (
          <Button type="submit" disabled={!input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        )}
      </form>

      <AgentProfileDialog
        ens={profileOpen ? ensName : null}
        open={profileOpen}
        onOpenChange={setProfileOpen}
        editable={!!getAuthToken}
        getAuthToken={getAuthToken}
      />
    </Card>
  )
}

type ChatMessage = ReturnType<typeof useChat>["messages"][number]

function MessageBubble({
  message,
  fromEns,
}: {
  message: ChatMessage
  fromEns: string
}) {
  const isUser = message.role === "user"
  return (
    <div className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-secondary text-secondary-foreground",
        )}
      >
        {message.parts.map((part, i) => (
          <MessagePart key={i} part={part} fromEns={fromEns} />
        ))}
      </div>
    </div>
  )
}

type MessagePartType = ChatMessage["parts"][number]

function MessagePart({
  part,
  fromEns,
}: {
  part: MessagePartType
  fromEns: string
}) {
  if (part.type === "text") {
    return <p className="whitespace-pre-wrap leading-relaxed">{part.text}</p>
  }
  if (part.type.startsWith("tool-")) {
    const toolName = part.type.replace(/^tool-/, "")
    const state = "state" in part ? (part.state as string) : "input-streaming"
    const output =
      "output" in part && state === "output-available"
        ? (part.output as ToolOutput)
        : null
    // While `hireAgent` is mid-flight we don't have an output yet, but we
    // already know the target ENS from the streamed input. Pull it so the
    // x402 flow animation can render *during* the call, not just after.
    const inFlightInput =
      toolName === "hireAgent" && "input" in part
        ? (part.input as { agentEnsName?: string } | undefined)
        : undefined
    const hireTargetEns =
      output?.agentEnsName ?? inFlightInput?.agentEnsName ?? null
    const showHireFlow =
      toolName === "hireAgent" &&
      hireTargetEns &&
      (state === "input-available" ||
        state === "input-streaming" ||
        state === "output-available")
    const flowState: "active" | "done" =
      state === "output-available" && output?.ok ? "done" : "active"
    return (
      <div className="my-2 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 bg-secondary/60 px-2.5 py-1.5 text-xs">
          <Wand2 className="h-3.5 w-3.5 text-primary" />
          <span className="font-mono text-primary/90">{toolName}</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">{labelForState(state)}</span>
          {output ? <AgentBadges output={output} toolName={toolName} /> : null}
        </div>
        {showHireFlow ? (
          <X402Flow
            fromEns={fromEns}
            toEns={hireTargetEns!}
            verified={output?.verified}
            state={flowState}
          />
        ) : null}
        {output ? <AgentDetail output={output} toolName={toolName} /> : null}
      </div>
    )
  }
  return null
}

type ToolOutput = {
  ok?: boolean
  verified?: boolean
  agentEnsName?: string
  endpoint?: string
  status?: number
  answer?: string
  error?: string
  agents?: Array<{
    ens: string
    endpoint?: string
    persona?: string
    ensip25Verified?: boolean
  }>
  // sendMessage
  fromEns?: string
  toEns?: string
  messageEns?: string
  txHash?: string
  blockExplorerUrl?: string
  // sendStealthUsdc / sendToken
  stealthAddress?: string
  cosmicSeeded?: boolean
  amount?: string
  // sendToken-specific
  chain?: string
  token?: string
  recipientInput?: string
  to?: string
  // sendStealthUsdc-specific
  recipientEnsName?: string
  // requestDataViaX402
  payer?: string
}

function AgentBadges({
  output,
  toolName,
}: {
  output: ToolOutput
  toolName: string
}) {
  if (toolName === "hireAgent") {
    return (
      <>
        {output.agentEnsName ? (
          <span className="font-mono text-[10px] text-primary/80">
            {output.agentEnsName}
          </span>
        ) : null}
        {output.verified ? (
          <span className="inline-flex items-center gap-1 rounded-sm bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
            <ShieldCheck className="h-3 w-3" />
            ENSIP-25 verified
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-sm bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
            <ShieldAlert className="h-3 w-3" />
            unverified
          </span>
        )}
      </>
    )
  }
  if (toolName === "findAgents" && output.agents) {
    const verifiedCount = output.agents.filter((a) => a.ensip25Verified).length
    return (
      <span className="text-[10px] text-muted-foreground">
        {output.agents.length} agent{output.agents.length === 1 ? "" : "s"} ·{" "}
        <span className="text-emerald-300">{verifiedCount} verified</span>
      </span>
    )
  }
  if (toolName === "sendMessage" && output.toEns) {
    return (
      <span className="font-mono text-[10px] text-primary/80">
        → {output.toEns}
      </span>
    )
  }
  if (toolName === "sendToken" && output.amount && (output.recipientInput || output.to)) {
    return (
      <span className="font-mono text-[10px] text-primary/80">
        {output.amount} → {output.recipientInput ?? output.to}
      </span>
    )
  }
  if (toolName === "sendStealthUsdc" && output.amount) {
    return (
      <span className="font-mono text-[10px] text-primary/80">
        {output.amount} → {output.recipientEnsName ?? "stealth"}
      </span>
    )
  }
  return null
}

function AgentDetail({
  output,
  toolName,
}: {
  output: ToolOutput
  toolName: string
}) {
  // Postcard renderer: in demo mode, sends become large jargon-free cards.
  // Anything else falls through to the existing dev/explorer UI.
  const demoMode = useDemoMode()
  if (
    demoMode &&
    output.ok &&
    output.amount &&
    (toolName === "sendStealthUsdc" || toolName === "sendToken")
  ) {
    return (
      <div className="ml-1 mt-2">
        <ReceiptPostcard
          amount={output.amount}
          recipientEnsName={output.recipientEnsName ?? output.toEns ?? output.recipientInput}
          fromEnsName={output.fromEns}
          txHash={output.txHash}
          explorerUrl={output.blockExplorerUrl}
          stealthAddress={output.stealthAddress}
          cosmicSeeded={output.cosmicSeeded}
          privateBadge={toolName === "sendStealthUsdc"}
        />
      </div>
    )
  }
  if (toolName === "findAgents" && output.agents?.length) {
    return (
      <ul className="ml-5 space-y-1.5 text-[11px] text-muted-foreground">
        {output.agents.map((a) => (
          <AgentRow key={a.ens} ens={a.ens} verified={a.ensip25Verified} persona={a.persona} />
        ))}
      </ul>
    )
  }
  if (toolName === "hireAgent" && output.ok && output.answer) {
    const agentEns = output.agentEnsName ?? null
    return (
      <div className="ml-5 rounded-md border border-emerald-500/20 bg-emerald-500/5 px-2.5 py-1.5 text-[11px] text-emerald-100/90">
        <div className="flex items-center gap-2">
          {agentEns ? <EnsAvatar ens={agentEns} size={20} /> : null}
          <span className="font-mono text-[10px] text-emerald-300/80">
            {agentEns ? `${displayNameFromEns(agentEns).displayName} replied` : "agent replied"}
          </span>
        </div>
        <p className="mt-1 whitespace-pre-wrap leading-relaxed">{output.answer}</p>
      </div>
    )
  }
  if (toolName === "sendMessage" && output.ok && output.blockExplorerUrl) {
    return (
      <ExplorerReceipt
        kind="message"
        title="Message landed on-chain"
        subtitle={
          output.toEns ? `to ${displayNameFromEns(output.toEns).displayName}` : undefined
        }
        chain="sepolia"
        explorerUrl={output.blockExplorerUrl}
        txHash={output.txHash}
      />
    )
  }
  if (toolName === "sendToken" && output.ok && output.blockExplorerUrl) {
    const recipient = output.recipientInput ?? output.to ?? "recipient"
    const recipName =
      typeof recipient === "string" && recipient.includes(".")
        ? displayNameFromEns(recipient).displayName
        : shortAddrInline(String(recipient))
    return (
      <ExplorerReceipt
        kind="token"
        title={`Sent ${output.amount ?? "tokens"}`}
        subtitle={`to ${recipName}`}
        chain={output.chain}
        explorerUrl={output.blockExplorerUrl}
        txHash={output.txHash}
      />
    )
  }
  if (toolName === "sendStealthUsdc" && output.ok && output.blockExplorerUrl) {
    return (
      <ExplorerReceipt
        kind="stealth"
        title={`Sent ${output.amount ?? "USDC"} privately`}
        subtitle={
          output.recipientEnsName
            ? `to ${displayNameFromEns(output.recipientEnsName).displayName}`
            : undefined
        }
        chain={output.chain ?? "base-sepolia"}
        explorerUrl={output.blockExplorerUrl}
        txHash={output.txHash}
        extraDetail={
          output.stealthAddress
            ? `stealth ${shortAddrInline(output.stealthAddress)}`
            : undefined
        }
      />
    )
  }
  if (toolName === "requestDataViaX402" && output.ok && output.blockExplorerUrl) {
    return (
      <ExplorerReceipt
        kind="x402"
        title="x402 micropayment settled"
        subtitle={output.chain ? `on ${output.chain}` : undefined}
        chain={output.chain}
        explorerUrl={output.blockExplorerUrl}
        txHash={output.txHash}
      />
    )
  }
  if (toolName === "hireAgent" && output.ok === false && output.error) {
    return (
      <div className="ml-5 rounded-md border border-amber-500/20 bg-amber-500/5 px-2.5 py-1.5 text-[11px] text-amber-200/90">
        {output.error}
      </div>
    )
  }
  if (output.ok === false && output.error) {
    return (
      <div className="ml-5 rounded-md border border-amber-500/20 bg-amber-500/5 px-2.5 py-1.5 text-[11px] text-amber-200/90">
        {output.error}
      </div>
    )
  }
  // Generic catch-all: any tool result that exposes a tx hash + explorer URL
  // gets a clean receipt — protects against forgetting a future tool.
  if (output.ok && output.blockExplorerUrl) {
    return (
      <ExplorerReceipt
        kind="generic"
        title={`${toolName} confirmed`}
        explorerUrl={output.blockExplorerUrl}
        txHash={output.txHash}
      />
    )
  }
  return null
}

function shortAddrInline(a: string): string {
  if (!a || a.length < 12) return a
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}

type ReceiptKind = "token" | "stealth" | "message" | "x402" | "generic"

const RECEIPT_THEME: Record<
  ReceiptKind,
  { icon: typeof Coins; iconClass: string; ringClass: string; gradientClass: string }
> = {
  token: {
    icon: Coins,
    iconClass: "text-emerald-300",
    ringClass: "ring-emerald-400/20",
    gradientClass: "from-emerald-500/10 via-emerald-500/5 to-transparent",
  },
  stealth: {
    icon: Lock,
    iconClass: "text-fuchsia-300",
    ringClass: "ring-fuchsia-400/20",
    gradientClass: "from-fuchsia-500/10 via-fuchsia-500/5 to-transparent",
  },
  message: {
    icon: Mail,
    iconClass: "text-sky-300",
    ringClass: "ring-sky-400/20",
    gradientClass: "from-sky-500/10 via-sky-500/5 to-transparent",
  },
  x402: {
    icon: Zap,
    iconClass: "text-amber-300",
    ringClass: "ring-amber-400/20",
    gradientClass: "from-amber-500/10 via-amber-500/5 to-transparent",
  },
  generic: {
    icon: Sparkles,
    iconClass: "text-primary",
    ringClass: "ring-primary/20",
    gradientClass: "from-primary/10 via-primary/5 to-transparent",
  },
}

function ExplorerReceipt({
  kind,
  title,
  subtitle,
  chain,
  explorerUrl,
  txHash,
  extraDetail,
}: {
  kind: ReceiptKind
  title: string
  subtitle?: string
  chain?: string
  explorerUrl: string
  txHash?: string
  extraDetail?: string
}) {
  const theme = RECEIPT_THEME[kind]
  const Icon = theme.icon
  return (
    <motion.div
      initial={{ opacity: 0, y: 6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 320, damping: 26 }}
      className={cn(
        "ml-5 mt-2 overflow-hidden rounded-xl bg-gradient-to-br ring-1",
        theme.gradientClass,
        theme.ringClass,
      )}
    >
      <div className="flex items-start gap-3 px-3.5 py-3">
        <span
          className={cn(
            "relative grid h-9 w-9 shrink-0 place-items-center rounded-full bg-background/70 ring-1",
            theme.ringClass,
          )}
        >
          <Icon className={cn("h-4 w-4", theme.iconClass)} />
          <span className="absolute -bottom-0.5 -right-0.5 grid h-4 w-4 place-items-center rounded-full bg-emerald-400 text-emerald-950 ring-2 ring-background/80">
            <Check className="h-2.5 w-2.5" strokeWidth={3} />
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold text-foreground/95">
              {title}
            </p>
            {chain ? (
              <Badge
                variant="secondary"
                className="font-mono text-[9px] uppercase tracking-wider"
              >
                {chain}
              </Badge>
            ) : null}
          </div>
          {subtitle ? (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {subtitle}
            </p>
          ) : null}
          {extraDetail ? (
            <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
              {extraDetail}
            </p>
          ) : null}
          {txHash ? (
            <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground/80">
              tx · {shortAddrInline(txHash)}
            </p>
          ) : null}
        </div>
        <a
          href={explorerUrl}
          target="_blank"
          rel="noreferrer"
          className={cn(
            "inline-flex shrink-0 items-center gap-1 self-center rounded-full px-3 py-1.5 text-[11px] font-medium transition",
            "bg-background/70 text-foreground/90 ring-1 ring-white/10 hover:bg-primary/20 hover:text-primary hover:ring-primary/30",
          )}
        >
          Explorer <ArrowUpRight className="h-3 w-3" />
        </a>
      </div>
    </motion.div>
  )
}

function labelForState(state: string) {
  switch (state) {
    case "input-streaming":
      return "preparing"
    case "input-available":
      return "executing"
    case "output-available":
      return "done"
    case "output-error":
      return "failed"
    default:
      return state
  }
}

function AgentRow({
  ens,
  verified,
  persona,
}: {
  ens: string
  verified?: boolean
  persona?: string
}) {
  return (
    <li className="flex items-center gap-2">
      <EnsAvatar ens={ens} size={20} />
      <span className="font-mono text-primary/80">
        {displayNameFromEns(ens).displayName}
      </span>
      {verified ? (
        <ShieldCheck className="h-3 w-3 text-emerald-400" />
      ) : (
        <ShieldAlert className="h-3 w-3 text-amber-400" />
      )}
      {persona ? (
        <span className="truncate text-muted-foreground/80">— {persona}</span>
      ) : null}
    </li>
  )
}

function ThinkingDots() {
  return (
    <span className="inline-flex gap-1">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-primary"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{
            duration: 1.1,
            repeat: Infinity,
            delay: i * 0.18,
            ease: "easeInOut",
          }}
        />
      ))}
    </span>
  )
}

const PROMPTS: Array<{ icon: string; text: string; subtitle: string }> = [
  { icon: "💸", text: "Send 5 dollars to alice", subtitle: "Pay anyone by name" },
  { icon: "🔍", text: "Who else is here?", subtitle: "Browse other twins" },
  { icon: "📬", text: "Any new messages?", subtitle: "Check your inbox" },
  { icon: "👤", text: "Show me my profile", subtitle: "What people see about you" },
]

function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 py-10 text-center">
      <motion.span
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-primary to-amber-400 text-primary-foreground shadow-lg shadow-primary/20"
      >
        <Sparkles className="h-6 w-6" />
      </motion.span>
      <div className="space-y-1">
        <p className="text-base font-semibold tracking-tight">Your twin is ready.</p>
        <p className="text-sm text-muted-foreground">
          Tap a suggestion or ask anything in plain English.
        </p>
      </div>
      <motion.div
        initial="hidden"
        animate="show"
        variants={{
          show: { transition: { staggerChildren: 0.06 } },
          hidden: {},
        }}
        className="grid w-full max-w-md grid-cols-2 gap-2"
      >
        {PROMPTS.map((p) => (
          <motion.button
            key={p.text}
            type="button"
            onClick={() => onPick(p.text)}
            variants={{
              hidden: { opacity: 0, y: 6 },
              show: { opacity: 1, y: 0 },
            }}
            whileHover={{ y: -2 }}
            transition={{ duration: 0.2 }}
            className="group flex items-start gap-2.5 rounded-2xl border border-border/60 bg-card px-3 py-2.5 text-left text-xs shadow-sm transition hover:border-primary/40 hover:shadow-md"
          >
            <span className="text-lg leading-none">{p.icon}</span>
            <span className="flex flex-col">
              <span className="font-medium text-foreground">{p.text}</span>
              <span className="text-[10px] text-muted-foreground">{p.subtitle}</span>
            </span>
          </motion.button>
        ))}
      </motion.div>
    </div>
  )
}
