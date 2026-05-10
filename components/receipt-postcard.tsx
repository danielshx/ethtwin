"use client"

// ReceiptPostcard — large, jargon-free send receipt for Maria-Mode.
// Replaces the inline ExplorerReceipt pill when demo mode is active.
// Big recipient avatar, big amount in dollars, "just now" timestamp,
// and a tiny expand chevron that flips into the X-ray reveal — same
// shape, but the warm postcard peels back to expose the tech-layer
// (EIP-5564 stealth, ENS resolution, cosmic-seed flag, Base Sepolia tx).
// This is the visual bridge to the Pitch's Reveal-Beat ("what Maria didn't see").

import { useEffect, useId, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useTwinSound } from "@/lib/use-twin-sound"
import { SendCelebration } from "@/components/send-celebration"
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Eye,
  EyeOff,
  Globe,
  KeyRound,
  Satellite,
  ShieldCheck,
} from "lucide-react"
import { useEnsAvatar } from "@/lib/use-ens-avatar"

type ReceiptPostcardProps = {
  amount: string
  recipientEnsName?: string
  fromEnsName?: string
  txHash?: string
  explorerUrl?: string
  stealthAddress?: string
  cosmicSeeded?: boolean
  privateBadge?: boolean
  className?: string
}

function shortHex(a?: string): string {
  if (!a || a.length < 12) return a ?? ""
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}

function fiatLabel(amount: string): { value: string; unit: string } {
  // Inputs we see: "100 USDC", "0.5 ETH", "$1 USDC", "100" — render plainly.
  const trimmed = amount.trim()
  const usdcMatch = trimmed.match(/^([\d.]+)\s*USDC?$/i)
  if (usdcMatch) return { value: usdcMatch[1], unit: "dollars" }
  const ethMatch = trimmed.match(/^([\d.]+)\s*ETH$/i)
  if (ethMatch) return { value: ethMatch[1], unit: "ETH" }
  return { value: trimmed, unit: "" }
}

export function ReceiptPostcard({
  amount,
  recipientEnsName,
  fromEnsName,
  txHash,
  explorerUrl,
  stealthAddress,
  cosmicSeeded = false,
  privateBadge = false,
  className = "",
}: ReceiptPostcardProps) {
  const [open, setOpen] = useState(false)
  const avatar = useEnsAvatar(recipientEnsName ?? null)
  const friendly = recipientEnsName ? recipientEnsName.split(".")[0] : "recipient"
  const fiat = fiatLabel(amount)
  const sound = useTwinSound()
  const cardId = useId()
  const cardClassId = `receipt-${cardId.replace(/[:#]/g, "")}`

  useEffect(() => {
    sound.play("done", 0.4)
    // play once on mount; intentionally no deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
      className={`mx-auto w-full max-w-md ${className} ${cardClassId}`}
      data-receipt-id={cardClassId}
    >
      <SendCelebration
        trigger={txHash ?? cardClassId}
        originSelector={`.${cardClassId}`}
      />
      <div className="relative">
        {/* Front: warm postcard. Slides up + fades when X-ray opens. */}
        <motion.div
          animate={
            open
              ? { y: -6, opacity: 0.4, scale: 0.97 }
              : { y: 0, opacity: 1, scale: 1 }
          }
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="overflow-hidden rounded-3xl border border-border/50 bg-card/90 p-5 shadow-lg"
        >
          <div className="flex items-center gap-4">
            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-secondary/60 ring-2 ring-primary/40">
              {avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatar}
                  alt={friendly}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div
                  className="h-full w-full"
                  style={{
                    background:
                      "conic-gradient(from 200deg, oklch(0.78 0.14 30), oklch(0.85 0.1 145), oklch(0.78 0.14 30))",
                  }}
                />
              )}
              <div className="absolute -bottom-1 -right-1 grid h-6 w-6 place-items-center rounded-full bg-emerald-500 text-white shadow">
                <Check className="h-3.5 w-3.5" strokeWidth={3} />
              </div>
            </div>

            <div className="flex flex-1 flex-col">
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-semibold tracking-tight text-foreground">
                  {fiat.value}
                </span>
                {fiat.unit ? (
                  <span className="text-base text-muted-foreground">{fiat.unit}</span>
                ) : null}
              </div>
              <div className="text-sm text-muted-foreground">
                sent to <span className="font-medium text-foreground">{friendly}</span> ·
                just now
              </div>
              {privateBadge ? (
                <div className="mt-1 inline-flex w-fit items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                  <Sparkles className="h-3 w-3" />
                  Private
                </div>
              ) : null}
            </div>
          </div>
        </motion.div>

        {/* X-ray layer: same shape, tech detail rows, blueprint backdrop.
            Fades in *behind* the postcard, then takes over when open. */}
        <AnimatePresence initial={false}>
          {open ? (
            <motion.div
              key="xray"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.35, delay: 0.1, ease: "easeOut" }}
              className="absolute inset-0 overflow-hidden rounded-3xl border border-emerald-500/30 bg-[linear-gradient(135deg,oklch(0.18_0.04_240/0.96),oklch(0.22_0.04_280/0.96))] p-5 text-emerald-50 shadow-xl"
            >
              <div
                aria-hidden
                className="absolute inset-0 opacity-[0.07]"
                style={{
                  backgroundImage:
                    "linear-gradient(oklch(0.95 0.05 200) 1px, transparent 1px), linear-gradient(90deg, oklch(0.95 0.05 200) 1px, transparent 1px)",
                  backgroundSize: "24px 24px",
                }}
              />
              <div className="relative flex items-center justify-between">
                <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-emerald-200/80">
                  what really happened
                </span>
                <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-mono text-[10px] text-emerald-200">
                  on-chain
                </span>
              </div>
              <ul className="relative mt-3 space-y-2.5 font-mono text-[11px]">
                <XrayRow
                  icon={<KeyRound className="h-3.5 w-3.5" />}
                  label="signed with passkey"
                  badge="Privy · ERC-4337"
                  delay={0}
                />
                {recipientEnsName ? (
                  <XrayRow
                    icon={<Globe className="h-3.5 w-3.5" />}
                    label={`resolved ${recipientEnsName}`}
                    badge="ENS Sepolia"
                    delay={0.06}
                  />
                ) : null}
                {stealthAddress ? (
                  <XrayRow
                    icon={<Eye className="h-3.5 w-3.5" />}
                    label={`one-time address ${shortHex(stealthAddress)}`}
                    badge="EIP-5564"
                    delay={0.12}
                  />
                ) : null}
                {cosmicSeeded ? (
                  <XrayRow
                    icon={<Satellite className="h-3.5 w-3.5" />}
                    label="randomness from satellite"
                    badge="Orbitport cTRNG"
                    delay={0.18}
                  />
                ) : null}
                <XrayRow
                  icon={<ShieldCheck className="h-3.5 w-3.5" />}
                  label="recipient verified"
                  badge="ENSIP-25"
                  delay={0.24}
                />
                {txHash ? (
                  <XrayRow
                    icon={<EyeOff className="h-3.5 w-3.5" />}
                    label={`tx ${shortHex(txHash)}`}
                    badge="Base Sepolia"
                    delay={0.3}
                  />
                ) : null}
              </ul>
              {explorerUrl ? (
                <a
                  href={explorerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={[
                    // Big designed CTA — emerald glassmorphic with hover glow.
                    // Sits at the bottom of the reveal as the cta hand-off.
                    "relative mt-4 flex w-full items-center justify-between gap-3",
                    "rounded-2xl border border-emerald-400/40 px-4 py-3",
                    "bg-gradient-to-br from-emerald-500/25 via-emerald-500/10 to-transparent",
                    "shadow-lg shadow-emerald-500/10 ring-1 ring-emerald-400/20",
                    "transition hover:border-emerald-300/70 hover:from-emerald-500/35 hover:shadow-emerald-500/20",
                  ].join(" ")}
                >
                  <span className="flex items-center gap-3">
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-400/20 ring-1 ring-emerald-300/40">
                      <Globe className="h-4 w-4 text-emerald-100" />
                    </span>
                    <span className="flex flex-col leading-tight">
                      <span className="text-[11px] font-mono uppercase tracking-[0.18em] text-emerald-200/80">
                        verify on
                      </span>
                      <span className="text-sm font-semibold text-emerald-50">
                        {explorerUrl.includes("basescan")
                          ? "Basescan"
                          : "Etherscan"}
                      </span>
                    </span>
                  </span>
                  <span className="flex items-center gap-1 font-mono text-[10px] text-emerald-100/80">
                    {txHash ? shortHex(txHash) : "open tx"}
                    <ArrowUpRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                  </span>
                </a>
              ) : null}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mx-auto mt-3 inline-flex items-center gap-1.5 rounded-full bg-secondary/70 px-4 py-2 text-xs text-muted-foreground transition hover:bg-secondary"
      >
        {open ? (
          <>
            <ChevronUp className="h-3.5 w-3.5" />
            Hide what really happened
          </>
        ) : (
          <>
            <ChevronDown className="h-3.5 w-3.5" />
            Show what really happened
          </>
        )}
      </button>
    </motion.div>
  )
}

function XrayRow({
  icon,
  label,
  badge,
  delay = 0,
}: {
  icon: React.ReactNode
  label: string
  badge: string
  delay?: number
}) {
  return (
    <motion.li
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay, ease: "easeOut" }}
      className="flex items-center justify-between gap-3 rounded-xl border border-emerald-500/15 bg-emerald-500/5 px-2.5 py-1.5"
    >
      <span className="flex min-w-0 items-center gap-2 text-emerald-50/90">
        <span className="text-emerald-300">{icon}</span>
        <span className="truncate">{label}</span>
      </span>
      <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium tracking-wide text-emerald-200">
        {badge}
      </span>
    </motion.li>
  )
}
