import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion"
import { colors, fonts } from "../tokens"

type Props = {
  label: string
  delay?: number
  accent?: string
}

export function BountyPill({ label, delay = 0, accent = colors.primary }: Props) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const local = frame - delay
  const enter = spring({ frame: local, fps, config: { damping: 14 } })
  const opacity = interpolate(local, [0, 8], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" })
  const scale = interpolate(enter, [0, 1], [0.7, 1])

  return (
    <div
      style={{
        opacity,
        transform: `scale(${scale})`,
        padding: "12px 22px",
        borderRadius: 999,
        background: "rgba(255,255,255,0.95)",
        border: `1.5px solid ${accent}55`,
        fontFamily: fonts.sans,
        fontSize: 20,
        fontWeight: 600,
        color: colors.ink,
        boxShadow: `0 8px 20px rgba(40,30,20,0.08)`,
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      <span style={{ width: 10, height: 10, borderRadius: "50%", background: accent }} />
      {label}
    </div>
  )
}
