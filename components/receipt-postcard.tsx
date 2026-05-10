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
  Globe,
  Satellite,
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
      {/* Postcard front — always visible, never gets covered. */}
      <div className="overflow-hidden rounded-3xl border border-border/50 bg-card/90 p-5 shadow-lg">
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
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {privateBadge ? (
                <div className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                  <Sparkles className="h-3 w-3" />
                  Private
                </div>
              ) : null}
              <SpaceSecuredBadge />
            </div>
          </div>
        </div>
      </div>

      {/* Reveal — tight one-liner about on-chain + space, then a fancy
          Basescan/Etherscan CTA. Renders inline (NOT absolute), so it
          grows below the postcard front instead of clipping content
          inside the front's height. */}
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="xray"
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: "auto", marginTop: 12 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={{ duration: 0.32, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="relative overflow-hidden rounded-3xl border border-emerald-500/30 bg-[linear-gradient(135deg,oklch(0.18_0.04_240/0.96),oklch(0.22_0.04_280/0.96))] p-5 text-emerald-50 shadow-xl">
              {/* Blueprint grid background. */}
              <div
                aria-hidden
                className="absolute inset-0 opacity-[0.07]"
                style={{
                  backgroundImage:
                    "linear-gradient(oklch(0.95 0.05 200) 1px, transparent 1px), linear-gradient(90deg, oklch(0.95 0.05 200) 1px, transparent 1px)",
                  backgroundSize: "24px 24px",
                }}
              />
              {/* Drifting starfield to match the sponsor's space aesthetic. */}
              <RevealStars />

              <div className="relative flex flex-col items-center gap-1 text-center">
                <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.2em] text-emerald-200">
                  <Satellite className="h-3 w-3" />
                  on-chain · space-secured
                </div>
                <p className="mt-2 text-sm font-medium leading-snug text-emerald-50">
                  Settled on-chain.
                  <br />
                  Signed off-Earth.
                </p>
                <p className="mt-1 max-w-xs text-[11px] leading-relaxed text-emerald-100/70">
                  Your twin&apos;s key lives in a satellite-attested KMS, and
                  the transaction is publicly verifiable on{" "}
                  {explorerUrl?.includes("basescan") ? "Basescan" : "Etherscan"}.
                </p>
              </div>

              {explorerUrl ? (
                <a
                  href={explorerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={[
                    "group relative mt-4 flex w-full items-center justify-between gap-3",
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
              ) : (
                <p className="relative mt-4 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-center text-[11px] text-amber-100">
                  Block-explorer link unavailable for this send.
                </p>
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

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

/**
 * Drifting starfield for the reveal layer's blueprint background. Twelve
 * dots positioned deterministically across the canvas, each twinkling on a
 * staggered loop. Cosmetic only — pairs with the SpaceComputer aesthetic
 * the sponsor uses across their marketing.
 */
function RevealStars() {
  const stars = [
    { top: "8%", left: "6%", delay: 0, size: 1 },
    { top: "14%", left: "82%", delay: 0.4, size: 2 },
    { top: "22%", left: "38%", delay: 1.1, size: 1 },
    { top: "26%", left: "70%", delay: 0.7, size: 1 },
    { top: "44%", left: "12%", delay: 1.5, size: 2 },
    { top: "52%", left: "92%", delay: 0.2, size: 1 },
    { top: "60%", left: "48%", delay: 0.9, size: 1 },
    { top: "70%", left: "20%", delay: 1.3, size: 2 },
    { top: "76%", left: "76%", delay: 0.5, size: 1 },
    { top: "85%", left: "8%", delay: 1.0, size: 1 },
    { top: "90%", left: "60%", delay: 1.7, size: 1 },
    { top: "32%", left: "94%", delay: 0.3, size: 1 },
  ]
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {stars.map((s, i) => (
        <motion.span
          key={i}
          className="absolute rounded-full bg-white shadow-[0_0_6px_1px_rgba(255,255,255,0.75)]"
          style={{
            top: s.top,
            left: s.left,
            width: `${s.size}px`,
            height: `${s.size}px`,
          }}
          initial={{ opacity: 0.15, scale: 0.6 }}
          animate={{ opacity: [0.15, 1, 0.15], scale: [0.6, 1.5, 0.6] }}
          transition={{
            duration: 2.6,
            delay: s.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  )
}

/**
 * Space-themed trust badge — surfaces the SpaceComputer KMS provenance on
 * the postcard front. Cosmetic only, but ties the visual back to the
 * sponsor's stars-and-satellite aesthetic. Twinkling stars are CSS-only
 * (framer-motion animates opacity on a few absolutely-positioned dots).
 */
function SpaceSecuredBadge() {
  // Deterministic positions for the twinkling stars so they don't reflow on
  // every render. Eight tiny dots scattered across the badge.
  const stars = [
    { top: "20%", left: "12%", delay: 0 },
    { top: "65%", left: "8%", delay: 0.6 },
    { top: "30%", left: "32%", delay: 1.2 },
    { top: "75%", left: "45%", delay: 0.3 },
    { top: "18%", left: "62%", delay: 1.6 },
    { top: "55%", left: "70%", delay: 0.9 },
    { top: "35%", left: "88%", delay: 1.4 },
    { top: "82%", left: "92%", delay: 0.5 },
  ]
  return (
    <motion.span
      title="Signed by SpaceComputer Orbitport KMS — your twin's signing key lives in a satellite-attested HSM."
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.15 }}
      className={[
        "relative inline-flex items-center gap-1.5 overflow-hidden rounded-full",
        "border border-violet-400/40 px-2.5 py-0.5 text-[11px] font-medium",
        "bg-gradient-to-br from-indigo-600/25 via-violet-500/20 to-blue-500/25",
        "text-violet-700 dark:text-violet-100",
        "shadow-[0_0_12px_-2px_rgba(139,92,246,0.35)]",
      ].join(" ")}
    >
      {/* Twinkling starfield — eight tiny dots fading in/out at staggered
       *  intervals so the badge feels alive without being noisy. */}
      {stars.map((s, i) => (
        <motion.span
          key={i}
          aria-hidden
          className="pointer-events-none absolute h-px w-px rounded-full bg-white shadow-[0_0_4px_1px_rgba(255,255,255,0.85)]"
          style={{ top: s.top, left: s.left }}
          initial={{ opacity: 0.2, scale: 0.6 }}
          animate={{ opacity: [0.2, 1, 0.2], scale: [0.6, 1.4, 0.6] }}
          transition={{
            duration: 2.4,
            delay: s.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
      <Satellite className="relative h-3 w-3" />
      <span className="relative">Space-secured</span>
    </motion.span>
  )
}
