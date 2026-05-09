import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion"
import { colors, fonts } from "../tokens"

type CaptionProps = {
  text: string
  subtext?: string
  delay?: number
  align?: "center" | "left"
  size?: "sm" | "md" | "lg" | "xl"
  color?: string
  bg?: "none" | "card" | "dark"
}

const SIZE_MAP: Record<NonNullable<CaptionProps["size"]>, number> = {
  sm: 28,
  md: 44,
  lg: 64,
  xl: 96,
}

export function Caption({
  text,
  subtext,
  delay = 0,
  align = "center",
  size = "md",
  color = colors.ink,
  bg = "none",
}: CaptionProps) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const local = frame - delay
  const enter = spring({ frame: local, fps, config: { damping: 18, mass: 0.7 } })
  const opacity = interpolate(local, [0, 12], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" })
  const y = interpolate(enter, [0, 1], [16, 0])
  const fontSize = SIZE_MAP[size]
  const sub = subtext
    ? {
        opacity: interpolate(local, [10, 22], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" }),
        y: interpolate(local, [10, 22], [10, 0], { extrapolateRight: "clamp", extrapolateLeft: "clamp" }),
      }
    : null

  const bgStyle =
    bg === "card"
      ? { background: "rgba(255,255,255,0.85)", backdropFilter: "blur(6px)", padding: "20px 32px", borderRadius: 28 }
      : bg === "dark"
        ? { background: "rgba(13,20,40,0.72)", padding: "20px 32px", borderRadius: 28 }
        : {}

  return (
    <div
      style={{
        opacity,
        transform: `translateY(${y}px)`,
        textAlign: align,
        fontFamily: fonts.sans,
        color,
        ...bgStyle,
      }}
    >
      <div style={{ fontSize, fontWeight: 700, letterSpacing: -0.5, lineHeight: 1.05 }}>{text}</div>
      {subtext && sub ? (
        <div
          style={{
            marginTop: 14,
            fontSize: Math.max(20, fontSize * 0.42),
            fontWeight: 500,
            color: colors.mutedForeground,
            opacity: sub.opacity,
            transform: `translateY(${sub.y}px)`,
          }}
        >
          {subtext}
        </div>
      ) : null}
    </div>
  )
}
