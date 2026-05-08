"use client"

import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import { useMemo, useRef, useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Send, Sparkles, Wand2, ShieldCheck, ShieldAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { AgentProfileDialog, AvatarImage } from "@/components/agent-profile"
import { X402Flow } from "@/components/x402-flow"
import { buildAvatarUrl } from "@/lib/twin-profile"
import { cn } from "@/lib/utils"

type TwinChatProps = {
  ensName: string
  className?: string
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

export function TwinChat({ ensName, className }: TwinChatProps) {
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/twin",
        body: { ensName },
      }),
    [ensName],
  )

  const { messages, sendMessage, status, stop } = useChat({
    transport,
  })

  const [input, setInput] = useState("")
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const isStreaming = status === "submitted" || status === "streaming"
  const [profileOpen, setProfileOpen] = useState(false)
  const avatarUrl = useMemo(() => {
    const label = ensName.split(".")[0] ?? ensName
    return buildAvatarUrl(label)
  }, [ensName])

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

  return (
    <Card className={cn("flex flex-col gap-0 overflow-hidden p-0", className)}>
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <button
          onClick={() => setProfileOpen(true)}
          className="flex items-center gap-2 rounded-md px-1 -mx-1 py-1 text-left hover:bg-white/5"
          title="View profile"
        >
          <AvatarImage src={avatarUrl} ens={ensName} size={32} />
          <div className="leading-tight">
            <div className="text-sm font-medium">{ensName}</div>
            <div className="text-xs text-muted-foreground">your AI twin</div>
          </div>
        </button>
        <Badge variant="secondary" className="font-mono text-[10px]">
          <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
          live on {chainLabel()}
        </Badge>
      </header>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-5"
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
        className="flex items-center gap-2 border-t border-white/10 px-3 py-3"
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
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-white/10 bg-black/30 px-2.5 py-1.5 text-xs">
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
  amount?: string
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
  return null
}

function AgentDetail({
  output,
  toolName,
}: {
  output: ToolOutput
  toolName: string
}) {
  if (toolName === "findAgents" && output.agents?.length) {
    return (
      <ul className="ml-5 space-y-1 text-[11px] text-muted-foreground">
        {output.agents.map((a) => (
          <li key={a.ens} className="flex items-center gap-1.5">
            {a.ensip25Verified ? (
              <ShieldCheck className="h-3 w-3 text-emerald-400" />
            ) : (
              <ShieldAlert className="h-3 w-3 text-amber-400" />
            )}
            <span className="font-mono text-primary/80">{a.ens}</span>
            {a.persona ? (
              <span className="truncate text-muted-foreground/80">
                — {a.persona}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    )
  }
  if (toolName === "hireAgent" && output.ok && output.answer) {
    return (
      <div className="ml-5 rounded-md border border-emerald-500/20 bg-emerald-500/5 px-2.5 py-1.5 text-[11px] text-emerald-100/90">
        <span className="font-mono text-[10px] text-emerald-300/80">
          {output.agentEnsName ?? "agent"} replied
        </span>
        <p className="mt-1 whitespace-pre-wrap leading-relaxed">{output.answer}</p>
      </div>
    )
  }
  if (toolName === "hireAgent" && output.ok === false && output.error) {
    return (
      <div className="ml-5 text-[11px] text-amber-300/80">
        {output.error}
      </div>
    )
  }
  if (toolName === "sendMessage" && output.ok && output.blockExplorerUrl) {
    return (
      <div className="ml-5 text-[11px] text-muted-foreground">
        Message minted as <span className="font-mono text-primary/80">{output.messageEns ?? "subname"}</span>{" "}
        ·{" "}
        <a
          href={output.blockExplorerUrl}
          target="_blank"
          rel="noreferrer"
          className="text-primary hover:underline"
        >
          on-chain ↗
        </a>
      </div>
    )
  }
  if (toolName === "sendMessage" && output.ok === false && output.error) {
    return (
      <div className="ml-5 text-[11px] text-amber-300/80">{output.error}</div>
    )
  }
  return null
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

const PROMPTS = [
  "Show me what you know about my wallet",
  "Send 5 USDC to vitalik.eth privately",
  "Hire analyst.ethtwin.eth to summarise this address",
  "Decode the last transaction I signed",
]

function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 py-10 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-primary/15 text-primary">
        <Sparkles className="h-5 w-5" />
      </span>
      <div className="space-y-1">
        <p className="text-sm font-medium">Your twin is online.</p>
        <p className="text-xs text-muted-foreground">
          Try one of these — or ask anything in plain English.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {PROMPTS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPick(p)}
            className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/80 transition hover:border-primary/40 hover:bg-primary/10 hover:text-white"
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  )
}
