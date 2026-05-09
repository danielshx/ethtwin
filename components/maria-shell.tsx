"use client"

// MariaShell — simplified one-view shell used when demo mode is on.
// Strips the 6-tab dev UI down to a single Voice surface, adds quick-tap
// "send to a friend" cards (so Maria has a path that doesn't require
// voice), and shows a privacy / friend-count gamification pill.

import { useEffect, useMemo, useRef, useState } from "react"
import { motion } from "framer-motion"
import {
  MessageCircle,
  Send,
  ShieldCheck,
  Sparkles,
  Wand2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { TwinChat } from "@/components/twin-chat"
import { VoiceTwin } from "@/components/voice-twin"
import { TwinAvatar } from "@/components/twin-avatar"
import { useNotifications } from "@/lib/use-notifications"
import { useTwinSound } from "@/lib/use-twin-sound"
import { useEnsAvatar } from "@/lib/use-ens-avatar"

type MariaShellProps = {
  ensName: string
  walletAddress?: string | null
  getAuthToken: () => Promise<string | null>
}

const PARENT = process.env.NEXT_PUBLIC_PARENT_DOMAIN ?? "ethtwin.eth"

// Demo-friendly contacts (the live Maria flow assumes Tom is seeded —
// `pnpm twins:seed-demo`). Falls back gracefully if a label has no twin.
const DEMO_CONTACTS = ["tom", "daniel", "alice"]

const QUICK_AMOUNTS = [5, 25, 100]

export function MariaShell({
  ensName,
  walletAddress,
  getAuthToken,
}: MariaShellProps) {
  const [mode, setMode] = useState<"voice" | "chat">("voice")
  const friendlyName = ensName.split(".")[0]
  const { items } = useNotifications(ensName, walletAddress ?? null)
  const sound = useTwinSound()
  const lastSeen = useRef(items.length)
  const [seedPrompt, setSeedPrompt] = useState<string | null>(null)
  const [stats, setStats] = useState({ sends: 0, level: 1 })

  useEffect(() => {
    try {
      const raw = localStorage.getItem("ethtwin.maria.stats")
      if (raw) setStats(JSON.parse(raw))
    } catch {}
  }, [])

  useEffect(() => {
    if (items.length > lastSeen.current) {
      sound.play("receive", 0.5)
      // Gamification: count incoming acks too (Tom's "thanks oma" lands here).
      setStats((s) => {
        const next = { ...s, sends: s.sends + 1, level: Math.floor((s.sends + 1) / 3) + 1 }
        try {
          localStorage.setItem("ethtwin.maria.stats", JSON.stringify(next))
        } catch {}
        return next
      })
    }
    lastSeen.current = items.length
  }, [items.length, sound])

  // Push a quick-send phrase into either Voice (via prompt suggestion) or
  // Chat (sends immediately). Uses a one-shot key the chat reads via prop.
  function quickSend(label: string, amount: number) {
    const phrase = `Send ${amount} dollars to ${label}`
    setSeedPrompt(phrase)
    setMode("chat")
  }

  return (
    <div className="flex w-full max-w-3xl flex-col items-center gap-6">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col items-center gap-3 text-center"
      >
        <TwinAvatar ensName={ensName} size={112} />
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Hi {friendlyName}.
        </h2>
        <p className="max-w-md text-base text-muted-foreground">
          Tap and tell me what you want to do. I&apos;ll handle the rest.
        </p>
        <GamificationStrip sends={stats.sends} level={stats.level} />
      </motion.div>

      <QuickSendStrip onSend={quickSend} />

      {mode === "voice" ? (
        <VoiceTwin
          ensName={ensName}
          getAuthToken={getAuthToken}
          onSwitchToChat={() => setMode("chat")}
          className="w-full border-border/60 bg-card shadow-sm"
        />
      ) : (
        <TwinChat
          ensName={ensName}
          getAuthToken={getAuthToken}
          seedPrompt={seedPrompt}
          onSeedConsumed={() => setSeedPrompt(null)}
          className="h-[60dvh] w-full border-border/60 bg-card shadow-sm"
        />
      )}

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {mode === "voice" ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setMode("chat")}
            className="gap-2 rounded-full"
          >
            <MessageCircle className="h-4 w-4" />
            Use typing instead
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setMode("voice")}
            className="gap-2 rounded-full"
          >
            <Wand2 className="h-4 w-4" />
            Talk to me instead
          </Button>
        )}
      </div>
    </div>
  )
}

function GamificationStrip({ sends, level }: { sends: number; level: number }) {
  const levelTitle = useMemo(() => {
    if (level >= 5) return "Crypto Pro"
    if (level >= 3) return "Twin Believer"
    if (level >= 2) return "Comfy User"
    return "Just Started"
  }, [level])
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15, duration: 0.4 }}
      className="mt-1 flex flex-wrap items-center justify-center gap-2 text-xs"
    >
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1.5 font-medium text-emerald-700 dark:text-emerald-300">
        <ShieldCheck className="h-3.5 w-3.5" />
        100% private
      </span>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 font-medium text-primary">
        <Sparkles className="h-3.5 w-3.5" />
        Level {level} · {levelTitle}
      </span>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary/80 px-3 py-1.5 text-muted-foreground">
        {sends} {sends === 1 ? "transaction" : "transactions"}
      </span>
    </motion.div>
  )
}

function QuickSendStrip({
  onSend,
}: {
  onSend: (label: string, amount: number) => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2, duration: 0.4 }}
      className="w-full"
    >
      <div className="mb-2 flex items-center justify-between px-1 text-xs uppercase tracking-[0.16em] text-muted-foreground">
        <span>Send to a friend</span>
        <span className="text-[10px] normal-case tracking-normal opacity-70">
          tap a face
        </span>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {DEMO_CONTACTS.map((label, idx) => (
          <ContactCard
            key={label}
            label={label}
            amount={QUICK_AMOUNTS[idx % QUICK_AMOUNTS.length]}
            onSend={onSend}
          />
        ))}
      </div>
    </motion.div>
  )
}

function ContactCard({
  label,
  amount,
  onSend,
}: {
  label: string
  amount: number
  onSend: (label: string, amount: number) => void
}) {
  const ens = `${label}.${PARENT}`
  const avatar = useEnsAvatar(ens)
  const friendly = label.charAt(0).toUpperCase() + label.slice(1)
  return (
    <motion.button
      type="button"
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 280, damping: 20 }}
      onClick={() => onSend(label, amount)}
      className="group flex flex-col items-center gap-2 rounded-3xl border border-border/60 bg-card px-3 py-4 text-center shadow-sm transition hover:border-primary/40 hover:shadow-md"
    >
      <div className="relative h-16 w-16 overflow-hidden rounded-full bg-secondary/60 ring-2 ring-primary/20 group-hover:ring-primary/40">
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatar} alt={friendly} className="h-full w-full object-cover" />
        ) : (
          <div
            className="h-full w-full"
            style={{
              background:
                "conic-gradient(from 200deg, oklch(0.78 0.14 30), oklch(0.85 0.1 145), oklch(0.78 0.14 30))",
            }}
          />
        )}
      </div>
      <div>
        <div className="text-sm font-semibold text-foreground">{friendly}</div>
        <div className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
          <Send className="h-3 w-3" />${amount}
        </div>
      </div>
    </motion.button>
  )
}
