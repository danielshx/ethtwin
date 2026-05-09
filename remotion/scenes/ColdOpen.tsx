import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion"
import { colors, fonts } from "../tokens"

export function ColdOpen() {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const fadeIn = interpolate(frame, [0, 14], [0, 1], { extrapolateRight: "clamp" })
  const fadeOut = interpolate(frame, [70, 90], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
  const opacity = Math.min(fadeIn, fadeOut)
  const scale = spring({ frame, fps, config: { damping: 22, mass: 0.8 } })

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse at center, #fff7eb 0%, ${colors.cream} 50%, #f5e8d3 100%)`,
        display: "grid",
        placeItems: "center",
        fontFamily: fonts.sans,
      }}
    >
      <div style={{ opacity, textAlign: "center", transform: `scale(${0.95 + scale * 0.05})` }}>
        {/* Logomark */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 132,
            height: 132,
            borderRadius: 36,
            background: `linear-gradient(135deg, ${colors.primary}, ${colors.amber})`,
            boxShadow: `0 24px 48px ${colors.primary}55`,
            marginBottom: 36,
            position: "relative",
          }}
        >
          {/* Sparkle */}
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 2L13.5 9.5L21 11L13.5 12.5L12 20L10.5 12.5L3 11L10.5 9.5L12 2Z"
              fill="white"
            />
            <circle cx="19" cy="5" r="1.5" fill="white" opacity="0.8" />
            <circle cx="5" cy="19" r="1" fill="white" opacity="0.6" />
          </svg>
        </div>
        <div
          style={{
            fontSize: 124,
            fontWeight: 800,
            letterSpacing: -4,
            color: colors.ink,
            lineHeight: 1,
            marginBottom: 26,
          }}
        >
          Eth<span style={{ color: colors.primary }}>Twin</span>
        </div>
        <div style={{ fontSize: 38, fontWeight: 500, color: colors.mutedForeground, letterSpacing: -0.5 }}>
          Crypto for everyone — even my grandma.
        </div>
      </div>
    </AbsoluteFill>
  )
}
