import { AbsoluteFill, interpolate, random, spring, useCurrentFrame, useVideoConfig } from "remotion"
import { colors, fonts } from "../tokens"
import { CosmicOrb } from "../components/CosmicOrb"

export function CosmicReveal() {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const enter = spring({ frame, fps, config: { damping: 18, mass: 0.7 } })
  const opacityIn = interpolate(frame, [0, 14], [0, 1], { extrapolateRight: "clamp" })
  const opacityOut = interpolate(frame, [150, 180], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
  const opacity = Math.min(opacityIn, opacityOut)

  // Background dim — transitions from cream to deep cosmic
  const bgT = interpolate(frame, [0, 30], [0, 1], { extrapolateRight: "clamp" })

  // Hash reveal at 80f
  const hashOpacity = interpolate(frame, [80, 100], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
  const hashY = interpolate(frame, [80, 100], [12, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(135deg, ${interpolateColor(colors.cream, colors.cosmicDeep, bgT)}, ${interpolateColor(
          "#f5e8d3",
          colors.cosmicMid,
          bgT,
        )})`,
        display: "grid",
        placeItems: "center",
        fontFamily: fonts.sans,
        opacity,
      }}
    >
      {/* Stars */}
      {Array.from({ length: 60 }).map((_, i) => {
        const x = random(`star-x-${i}`) * 100
        const y = random(`star-y-${i}`) * 100
        const size = random(`star-s-${i}`) * 2.5 + 0.5
        const twinkle = Math.sin((frame + i * 11) / 18) * 0.5 + 0.5
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${x}%`,
              top: `${y}%`,
              width: size,
              height: size,
              borderRadius: "50%",
              background: "white",
              opacity: bgT * twinkle * 0.9,
              boxShadow: "0 0 4px rgba(255,255,255,0.8)",
            }}
          />
        )
      })}

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 50, transform: `scale(${0.95 + enter * 0.05})` }}>
        <CosmicOrb size={420} intensity={bgT} />

        <div style={{ textAlign: "center" }}>
          <div
            style={{
              fontSize: 18,
              letterSpacing: 6,
              textTransform: "uppercase",
              color: bgT > 0.5 ? "#a7b4d8" : colors.mutedForeground,
              opacity: bgT,
              marginBottom: 14,
            }}
          >
            SpaceComputer · KMS
          </div>
          <div
            style={{
              fontSize: 56,
              fontWeight: 700,
              letterSpacing: -1.5,
              color: bgT > 0.5 ? "white" : colors.ink,
              opacity: bgT,
            }}
          >
            Every twin signed in orbit.
          </div>
          <div
            style={{
              opacity: hashOpacity,
              transform: `translateY(${hashY}px)`,
              marginTop: 24,
              fontFamily: fonts.mono,
              fontSize: 24,
              color: colors.satellitePurple,
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(183,148,246,0.3)",
              borderRadius: 12,
              padding: "10px 22px",
              display: "inline-block",
            }}
          >
            0x7a3f…b91c · KMS-signed
          </div>
        </div>
      </div>
    </AbsoluteFill>
  )
}

// Linear interpolation between two hex colors
function interpolateColor(a: string, b: string, t: number) {
  const ca = hexToRgb(a)
  const cb = hexToRgb(b)
  const r = Math.round(ca.r + (cb.r - ca.r) * t)
  const g = Math.round(ca.g + (cb.g - ca.g) * t)
  const bl = Math.round(ca.b + (cb.b - ca.b) * t)
  return `rgb(${r}, ${g}, ${bl})`
}

function hexToRgb(hex: string) {
  const h = hex.replace("#", "")
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  }
}
