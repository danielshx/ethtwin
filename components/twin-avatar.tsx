"use client"

// TwinAvatar — breathing avatar with optional state-driven animation.
// Used in the Maria-Mode shell + can be reused inline in voice/chat surfaces.
// Pulls Pollinations-derived avatar URLs via /api/profile when an ensName
// is given; falls back to a generated gradient orb when offline.

import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { useEnsAvatar } from "@/lib/use-ens-avatar"

type TwinAvatarProps = {
  ensName: string
  size?: number
  state?: "idle" | "listening" | "thinking" | "speaking"
  className?: string
}

export function TwinAvatar({
  ensName,
  size = 96,
  state = "idle",
  className,
}: TwinAvatarProps) {
  const avatar = useEnsAvatar(ensName)
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    if (avatar) setSrc(avatar)
  }, [avatar])

  const pulse =
    state === "listening"
      ? { scale: [1, 1.05, 1] }
      : state === "thinking"
        ? { scale: [1, 1.02, 0.99, 1.02, 1] }
        : state === "speaking"
          ? { scale: [1, 1.03, 1.01, 1.03, 1] }
          : { scale: [1, 1.015, 1] }

  const duration =
    state === "listening" ? 1.6 : state === "thinking" ? 1.1 : state === "speaking" ? 0.9 : 2.4

  return (
    <motion.div
      className={`relative grid place-items-center rounded-full ${className ?? ""}`}
      style={{ width: size, height: size }}
      animate={pulse}
      transition={{ duration, repeat: Infinity, ease: "easeInOut" }}
    >
      <div
        aria-hidden
        className="absolute inset-0 rounded-full opacity-70 blur-lg"
        style={{
          background:
            "radial-gradient(circle, oklch(0.78 0.14 30 / 0.55), transparent 65%)",
        }}
      />
      <div
        className="relative grid place-items-center overflow-hidden rounded-full bg-secondary/60 ring-2 ring-primary/30"
        style={{ width: size, height: size }}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={ensName}
            className="h-full w-full object-cover"
            onError={() => setSrc(null)}
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
      </div>
    </motion.div>
  )
}
