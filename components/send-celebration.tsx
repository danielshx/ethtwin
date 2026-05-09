"use client"

// SendCelebration — fires once when a successful send postcard mounts.
// Combines:
//   • cosmic mikro-pulse (radial light burst, 1.5 s)
//   • a soft confetti shower from the postcard origin
//   • the "done" sound cue (already wired via ReceiptPostcard's mount)
//   • optional first-send badge (gamification — emits to localStorage)
//
// Drop one inside Maria-Mode shells next to the postcard. Headless: it
// renders a fixed-position overlay div for confetti and dismisses itself
// after the animation completes.

import { useEffect, useRef } from "react"
import confetti from "canvas-confetti"
import { motion, AnimatePresence } from "framer-motion"

type Props = {
  trigger: string | number
  /** Optional point of origin in CSS pixels (defaults to viewport center). */
  originSelector?: string
  intensity?: "soft" | "celebrate"
}

export function SendCelebration({
  trigger,
  originSelector,
  intensity = "celebrate",
}: Props) {
  const lastTriggerRef = useRef<typeof trigger | null>(null)
  const showOverlayRef = useRef(false)

  useEffect(() => {
    if (lastTriggerRef.current === trigger) return
    lastTriggerRef.current = trigger
    if (typeof window === "undefined") return

    showOverlayRef.current = true

    let originX = 0.5
    let originY = 0.5
    if (originSelector) {
      const el = document.querySelector(originSelector)
      if (el) {
        const rect = el.getBoundingClientRect()
        originX = (rect.left + rect.width / 2) / window.innerWidth
        originY = (rect.top + rect.height / 2) / window.innerHeight
      }
    }

    const colors = ["#ff7059", "#ffba6b", "#9bd6a8", "#ffe0a3"]
    const burstCount = intensity === "celebrate" ? 2 : 1
    for (let i = 0; i < burstCount; i++) {
      setTimeout(() => {
        confetti({
          particleCount: intensity === "celebrate" ? 80 : 40,
          spread: 70,
          startVelocity: 35,
          gravity: 0.9,
          ticks: 200,
          scalar: 0.9,
          origin: { x: originX, y: originY },
          colors,
          disableForReducedMotion: true,
        })
      }, i * 180)
    }
  }, [trigger, originSelector, intensity])

  return (
    <AnimatePresence>
      <motion.div
        key={String(trigger)}
        initial={{ opacity: 0, scale: 0.7 }}
        animate={{ opacity: [0, 0.55, 0], scale: [0.7, 1.4, 1.8] }}
        exit={{ opacity: 0 }}
        transition={{ duration: 1.5, ease: "easeOut" }}
        aria-hidden
        className="pointer-events-none fixed inset-0 z-40 grid place-items-center"
      >
        <div
          className="h-72 w-72 rounded-full blur-2xl"
          style={{
            background:
              "radial-gradient(circle, oklch(0.78 0.16 30 / 0.55), oklch(0.85 0.08 145 / 0.35) 45%, transparent 70%)",
          }}
        />
      </motion.div>
    </AnimatePresence>
  )
}
