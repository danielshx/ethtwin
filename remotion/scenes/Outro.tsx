import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion"
import { colors, fonts } from "../tokens"
import { BountyPill } from "../components/BountyPill"

const BOUNTIES = [
  { label: "Umia · Agentic Venture", color: colors.primary },
  { label: "ENS · AI Agents (ENSIP-25)", color: colors.ensBlue },
  { label: "ENS · Most Creative", color: colors.amber },
  { label: "Apify · x402 Live", color: colors.sage },
  { label: "SpaceComputer · KMS", color: colors.satellitePurple },
  { label: "Best Privacy by Design", color: "#10b981" },
]

export function Outro() {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const enter = spring({ frame, fps, config: { damping: 18, mass: 0.7 } })
  const opacityIn = interpolate(frame, [0, 16], [0, 1], { extrapolateRight: "clamp" })
  const opacityOut = interpolate(frame, [180, 210], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
  const opacity = Math.min(opacityIn, opacityOut)
  const y = interpolate(enter, [0, 1], [30, 0])

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse at center, #fff7eb 0%, ${colors.cream} 60%, #f5e8d3 100%)`,
        display: "grid",
        placeItems: "center",
        fontFamily: fonts.sans,
        opacity,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 50, transform: `translateY(${y}px)` }}>
        {/* Logomark */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 24,
          }}
        >
          <div
            style={{
              width: 96,
              height: 96,
              borderRadius: 26,
              background: `linear-gradient(135deg, ${colors.primary}, ${colors.amber})`,
              display: "grid",
              placeItems: "center",
              boxShadow: `0 16px 36px ${colors.primary}55`,
            }}
          >
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 2L13.5 9.5L21 11L13.5 12.5L12 20L10.5 12.5L3 11L10.5 9.5L12 2Z"
                fill="white"
              />
            </svg>
          </div>
          <div style={{ fontSize: 110, fontWeight: 800, color: colors.ink, letterSpacing: -4, lineHeight: 1 }}>
            Eth<span style={{ color: colors.primary }}>Twin</span>
          </div>
        </div>

        <div style={{ fontSize: 38, fontWeight: 500, color: colors.mutedForeground, textAlign: "center" }}>
          Crypto for everyone — even my grandma.
        </div>

        {/* Bounty pills */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 14,
            justifyContent: "center",
            maxWidth: 1100,
          }}
        >
          {BOUNTIES.map((b, i) => (
            <BountyPill key={i} label={b.label} accent={b.color} delay={20 + i * 6} />
          ))}
        </div>

        <div
          style={{
            marginTop: 30,
            padding: "12px 28px",
            borderRadius: 999,
            background: "white",
            border: `1.5px solid ${colors.border}`,
            fontFamily: fonts.mono,
            fontSize: 22,
            color: colors.ink,
            fontWeight: 500,
            opacity: interpolate(frame, [60, 90], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          }}
        >
          github.com/danielshamsi/twinpilot
        </div>
      </div>
    </AbsoluteFill>
  )
}
