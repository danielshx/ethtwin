"use client"

import { motion, AnimatePresence } from "framer-motion"
import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

type CosmicSample = {
  bytes: `0x${string}`
  attestation: string
  fetchedAt: number
}

type Phase = "idle" | "fetching" | "revealed"

type CosmicOrbProps = {
  phase: Phase
  sample?: CosmicSample | null
  size?: number
  className?: string
}

export function CosmicOrb({
  phase,
  sample,
  size = 220,
  className,
}: CosmicOrbProps) {
  const isAnimating = phase === "fetching"

  return (
    <div
      className={cn("relative flex items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <motion.div
        aria-hidden
        className="absolute inset-0 rounded-full"
        style={{
          background:
            "radial-gradient(circle at 30% 30%, oklch(0.78 0.21 290 / 0.85), oklch(0.4 0.18 280 / 0.6) 45%, transparent 70%)",
          filter: "blur(2px)",
        }}
        animate={
          isAnimating
            ? { scale: [1, 1.08, 1], rotate: [0, 360] }
            : { scale: phase === "revealed" ? 1.05 : 1, rotate: 0 }
        }
        transition={
          isAnimating
            ? {
                scale: { duration: 1.6, repeat: Infinity, ease: "easeInOut" },
                rotate: { duration: 14, repeat: Infinity, ease: "linear" },
              }
            : { duration: 0.6 }
        }
      />

      <motion.div
        aria-hidden
        className="absolute inset-2 rounded-full border border-white/20"
        animate={
          isAnimating
            ? { rotate: -360, opacity: [0.6, 1, 0.6] }
            : { rotate: 0, opacity: 0.5 }
        }
        transition={
          isAnimating
            ? {
                rotate: { duration: 22, repeat: Infinity, ease: "linear" },
                opacity: { duration: 2, repeat: Infinity, ease: "easeInOut" },
              }
            : { duration: 0.4 }
        }
      />

      <motion.div
        aria-hidden
        className="absolute inset-6 rounded-full border border-dashed border-white/10"
        animate={isAnimating ? { rotate: 360 } : { rotate: 0 }}
        transition={
          isAnimating
            ? { duration: 30, repeat: Infinity, ease: "linear" }
            : { duration: 0.4 }
        }
      />

      <Particles active={isAnimating} radius={size / 2 - 6} />

      <div className="relative z-10 flex flex-col items-center justify-center px-4 text-center">
        <AnimatePresence mode="wait">
          {phase === "idle" && (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-xs uppercase tracking-[0.25em] text-white/60"
            >
              Cosmic Seed
            </motion.div>
          )}
          {phase === "fetching" && (
            <motion.div
              key="fetch"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-xs uppercase tracking-[0.25em] text-white/80"
            >
              Listening to the cosmos…
            </motion.div>
          )}
          {phase === "revealed" && sample && (
            <motion.div
              key="rev"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-1"
            >
              <span className="text-[10px] uppercase tracking-[0.25em] text-white/60">
                cTRNG seed
              </span>
              <span className="font-mono text-xs text-white/90">
                {short(sample.bytes)}
              </span>
              <span className="text-[10px] text-white/40">
                attestation {short(sample.attestation, 6)}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

function Particles({ active, radius }: { active: boolean; radius: number }) {
  const [seeds] = useState(() =>
    Array.from({ length: 14 }, (_, i) => ({
      angle: (i / 14) * Math.PI * 2,
      offset: Math.random() * 0.4 + 0.6,
      delay: Math.random() * 1.4,
    })),
  )

  return (
    <>
      {seeds.map((s, i) => {
        const x = Math.cos(s.angle) * radius * s.offset
        const y = Math.sin(s.angle) * radius * s.offset
        return (
          <motion.span
            key={i}
            aria-hidden
            className="absolute h-1 w-1 rounded-full bg-white/80"
            initial={{ x: 0, y: 0, opacity: 0 }}
            animate={
              active
                ? { x, y, opacity: [0, 1, 0] }
                : { x: 0, y: 0, opacity: 0 }
            }
            transition={
              active
                ? {
                    duration: 2.4,
                    delay: s.delay,
                    repeat: Infinity,
                    ease: "easeOut",
                  }
                : { duration: 0.3 }
            }
          />
        )
      })}
    </>
  )
}

function short(value: string, head = 8) {
  if (!value) return ""
  if (value.length <= head * 2 + 3) return value
  return `${value.slice(0, head)}…${value.slice(-4)}`
}

export function useCosmicSeed() {
  const [phase, setPhase] = useState<Phase>("idle")
  const [sample, setSample] = useState<CosmicSample | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    return () => {
      setPhase("idle")
    }
  }, [])

  async function fetchSeed() {
    setError(null)
    setPhase("fetching")
    try {
      const res = await fetch("/api/cosmic-seed")
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as CosmicSample
      // Hold the animation for at least 1.4s so the orb doesn't blink past.
      await new Promise((r) => setTimeout(r, 1400))
      setSample(data)
      setPhase("revealed")
      return data
    } catch (e) {
      setError(e instanceof Error ? e.message : "unknown error")
      setPhase("idle")
      return null
    }
  }

  return { phase, sample, error, fetchSeed }
}
