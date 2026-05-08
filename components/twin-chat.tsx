"use client"

import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import { useMemo, useRef, useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Send, Sparkles, Wand2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { AgentProfileDialog, AvatarImage } from "@/components/agent-profile"
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
                  <MessageBubble message={m} />
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

function MessageBubble({ message }: { message: ChatMessage }) {
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
          <MessagePart key={i} part={part} />
        ))}
      </div>
    </div>
  )
}

type MessagePartType = ChatMessage["parts"][number]

function MessagePart({ part }: { part: MessagePartType }) {
  if (part.type === "text") {
    return <p className="whitespace-pre-wrap leading-relaxed">{part.text}</p>
  }
  if (part.type.startsWith("tool-")) {
    const toolName = part.type.replace(/^tool-/, "")
    const state = "state" in part ? (part.state as string) : "input-streaming"
    return (
      <div className="my-2 flex items-center gap-2 rounded-md border border-white/10 bg-black/30 px-2.5 py-1.5 text-xs">
        <Wand2 className="h-3.5 w-3.5 text-primary" />
        <span className="font-mono text-primary/90">{toolName}</span>
        <span className="text-muted-foreground">·</span>
        <span className="text-muted-foreground">{labelForState(state)}</span>
      </div>
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
