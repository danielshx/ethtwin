import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion"
import { colors, fonts } from "../tokens"

export function MariaIntro() {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const enter = spring({ frame, fps, config: { damping: 18, mass: 0.7 } })
  const exit = interpolate(frame, [150, 180], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
  const y = interpolate(enter, [0, 1], [40, 0])
  const opacity = Math.min(interpolate(frame, [0, 16], [0, 1], { extrapolateRight: "clamp" }), exit)

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(135deg, #fffaf2 0%, #ffeede 100%)`,
        display: "grid",
        placeItems: "center",
        fontFamily: fonts.sans,
      }}
    >
      <div
        style={{
          opacity,
          transform: `translateY(${y}px)`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 40,
        }}
      >
        {/* Maria avatar */}
        <div
          style={{
            position: "relative",
            width: 220,
            height: 220,
            borderRadius: "50%",
            background: `conic-gradient(from 200deg, ${colors.primary}, ${colors.amber}, ${colors.sage}, ${colors.primary})`,
            boxShadow: `0 30px 60px ${colors.primary}33`,
            display: "grid",
            placeItems: "center",
            color: "white",
            fontSize: 110,
            fontWeight: 800,
            letterSpacing: -4,
          }}
        >
          M
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 80, fontWeight: 700, color: colors.ink, letterSpacing: -2, lineHeight: 1.05 }}>
            Meet Maria.
          </div>
          <div
            style={{
              marginTop: 22,
              fontSize: 34,
              color: colors.mutedForeground,
              fontWeight: 500,
              maxWidth: 900,
            }}
          >
            67 years old. Stuttgart. Wants to send her grandson{" "}
            <span style={{ color: colors.primary, fontWeight: 700 }}>Tom</span> 100 dollars on-chain.
          </div>
        </div>
      </div>
    </AbsoluteFill>
  )
}
