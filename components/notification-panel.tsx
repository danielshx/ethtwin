"use client"

// Always-visible activity panel pinned to the bottom-right.
//
// Polls the user's twin for incoming messages + on-chain activity (see
// useNotifications) and keeps the freshest events in view at all times so
// the user never has to switch to the History tab to know "did anything
// happen?". A bell badge counts unread items since the last open.

import { useEffect, useRef, useState } from "react"
import { useTwinSound } from "@/lib/use-twin-sound"
import { motion, AnimatePresence } from "framer-motion"
import {
  ArrowDownLeft,
  ArrowUpRight,
  Bell,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  MessageSquare,
  Sparkles,
  Trash2,
} from "lucide-react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useNotifications, type Notification } from "@/lib/use-notifications"
import { displayNameFromEns } from "@/lib/ens"
import { EnsAvatar } from "@/components/ens-avatar"
import { cn } from "@/lib/utils"

type Props = {
  ensName: string | null
  walletAddress: string | null
  className?: string
}

const ICON_BY_KIND: Record<Notification["kind"], typeof Bell> = {
  message: MessageSquare,
  "transfer-in": ArrowDownLeft,
  "transfer-out": ArrowUpRight,
  other: Sparkles,
}
const COLOR_BY_KIND: Record<Notification["kind"], string> = {
  message: "text-sky-700",
  "transfer-in": "text-emerald-700",
  "transfer-out": "text-amber-700",
  other: "text-muted-foreground",
}

export function NotificationPanel({ ensName, walletAddress, className }: Props) {
  const { items, unreadCount, markAllRead, clearFeed } = useNotifications(
    ensName,
    walletAddress,
  )
  // Open by default — the feature only earns its real estate when it's visible.
  const [open, setOpen] = useState(true)
  const sound = useTwinSound()
  const lastSeenCount = useRef(items.length)

  // Marking-as-read on open keeps the badge from re-popping every render.
  useEffect(() => {
    if (open) markAllRead()
  }, [open, items.length, markAllRead])

  // Play a soft ding whenever new items land (Tom's reply, incoming tx).
  useEffect(() => {
    if (items.length > lastSeenCount.current) {
      sound.play("receive", 0.45)
    }
    lastSeenCount.current = items.length
  }, [items.length, sound])

  if (!ensName) return null

  return (
    <Card
      className={cn(
        "fixed bottom-4 right-4 z-50 w-[22rem] overflow-hidden border-border/60 bg-card/95 p-0 shadow-2xl backdrop-blur",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between border-b border-border/60 bg-card/80 px-3 py-2 hover:bg-secondary/40"
      >
        <span className="flex items-center gap-2">
          <span className="relative">
            <Bell className="h-4 w-4 text-primary" />
            {unreadCount > 0 && !open ? (
              <motion.span
                layoutId="notif-dot"
                className="absolute -right-1 -top-1 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-medium text-white"
              >
                {unreadCount > 9 ? "9+" : unreadCount}
              </motion.span>
            ) : null}
          </span>
          <span className="text-xs font-medium">Live activity</span>
          <Badge variant="secondary" className="font-mono text-[10px]">
            {items.length}
          </Badge>
        </span>
        <span className="flex items-center gap-1.5">
          {items.length > 0 && open ? (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation()
                clearFeed()
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  e.stopPropagation()
                  clearFeed()
                }
              }}
              title="Clear feed"
              className="rounded-md px-1 py-0.5 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3 w-3" />
            </span>
          ) : null}
          {open ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="panel"
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            transition={{ duration: 0.18 }}
          >
            <ScrollArea className="max-h-[24rem]">
              {items.length === 0 ? (
                <div className="px-4 py-8 text-center text-xs text-muted-foreground">
                  Nothing yet — incoming messages, transfers and other on-chain
                  activity will pop in here in real time.
                </div>
              ) : (
                <ul className="divide-y divide-border/40">
                  <AnimatePresence initial={false}>
                    {items.map((n) => (
                      <motion.li
                        key={n.id}
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.18 }}
                      >
                        <NotificationRow n={n} />
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              )}
            </ScrollArea>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </Card>
  )
}

function NotificationRow({ n }: { n: Notification }) {
  const Icon = ICON_BY_KIND[n.kind]
  const colorClass = COLOR_BY_KIND[n.kind]
  const counterpartyEns =
    n.from && n.from.includes(".") ? n.from : null
  const ts = new Date(n.at * 1000)
  const time = ts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })

  return (
    <div className="flex items-start gap-2.5 px-3 py-2.5">
      {counterpartyEns ? (
        <EnsAvatar ens={counterpartyEns} size={28} className="mt-0.5" />
      ) : (
        <span
          className={cn(
            "mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-secondary/40",
            colorClass,
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <Icon className={cn("h-3 w-3", colorClass)} />
          <p className="truncate text-xs font-medium">
            {counterpartyEns
              ? n.kind === "message"
                ? `${displayNameFromEns(counterpartyEns).displayName}`
                : n.title
              : n.title}
          </p>
        </div>
        {n.kind === "message" && n.body ? (
          <p className="mt-0.5 line-clamp-2 break-words text-xs text-foreground/80">
            {n.body}
          </p>
        ) : null}
        <div className="mt-1 flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
          <span>{time}</span>
          {n.explorerUrl ? (
            <a
              href={n.explorerUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-0.5 text-primary/80 hover:text-primary"
            >
              tx <ExternalLink className="h-2.5 w-2.5" />
            </a>
          ) : null}
        </div>
      </div>
    </div>
  )
}
