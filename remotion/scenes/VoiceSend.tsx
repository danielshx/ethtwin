import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion"
import { colors, fonts } from "../tokens"
import { TwinAvatar } from "../components/TwinAvatar"

export function VoiceSend() {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const enter = spring({ frame, fps, config: { damping: 18, mass: 0.6 } })
  const opacityIn = interpolate(frame, [0, 16], [0, 1], { extrapolateRight: "clamp" })
  const opacityOut = interpolate(frame, [240, 270], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
  const opacity = Math.min(opacityIn, opacityOut)

  // Speech bubble enter at 60f
  const bubbleEnter = spring({ frame: frame - 60, fps, config: { damping: 16 } })
  const bubbleOpacity = interpolate(frame - 60, [0, 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })

  // Confirmation badge at 180f
  const confirmEnter = spring({ frame: frame - 180, fps, config: { damping: 14 } })
  const confirmOpacity = interpolate(frame - 180, [0, 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })

  // Avatar state shifts from listening → speaking around frame 170
  const speakingState = frame > 170 ? "speaking" : "listening"

  // Voice waveform bars
  const bars = Array.from({ length: 24 }).map((_, i) => {
    const seed = (Math.sin((frame + i * 7) / 6) + 1) / 2
    const h = 12 + seed * (frame > 60 && frame < 170 ? 60 : 14)
    return h
  })

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse at 30% 30%, #fff5e7 0%, ${colors.cream} 60%, #f5e8d3 100%)`,
        display: "grid",
        placeItems: "center",
        fontFamily: fonts.sans,
        opacity,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 60, transform: `scale(${0.95 + enter * 0.05})` }}>
        {/* Speech bubble (Maria) */}
        <div
          style={{
            opacity: bubbleOpacity,
            transform: `translateY(${interpolate(bubbleEnter, [0, 1], [20, 0])}px)`,
            background: colors.card,
            border: `1px solid ${colors.border}`,
            borderRadius: 32,
            padding: "22px 36px",
            boxShadow: "0 20px 40px rgba(40,30,20,0.12)",
            position: "relative",
          }}
        >
          <div style={{ fontSize: 44, fontWeight: 600, color: colors.ink, letterSpacing: -1 }}>
            "Send 100 dollars to <span style={{ color: colors.primary }}>Tom</span>"
          </div>
          {/* Tail */}
          <div
            style={{
              position: "absolute",
              bottom: -12,
              left: "50%",
              transform: "translateX(-50%) rotate(45deg)",
              width: 24,
              height: 24,
              background: colors.card,
              borderRight: `1px solid ${colors.border}`,
              borderBottom: `1px solid ${colors.border}`,
            }}
          />
        </div>

        {/* Avatar */}
        <TwinAvatar size={280} state={speakingState} initial="T" />

        {/* Waveform */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, height: 80 }}>
          {bars.map((h, i) => (
            <div
              key={i}
              style={{
                width: 6,
                height: h,
                borderRadius: 3,
                background: `linear-gradient(${colors.primary}, ${colors.amber})`,
                opacity: 0.85,
              }}
            />
          ))}
        </div>

        {/* Confirmation */}
        <div
          style={{
            opacity: confirmOpacity,
            transform: `translateY(${interpolate(confirmEnter, [0, 1], [16, 0])}px) scale(${interpolate(
              confirmEnter,
              [0, 1],
              [0.9, 1],
            )})`,
            display: "inline-flex",
            alignItems: "center",
            gap: 14,
            padding: "14px 30px",
            borderRadius: 999,
            background: "white",
            border: `1.5px solid ${colors.sage}`,
            boxShadow: "0 12px 32px rgba(155,214,168,0.4)",
            fontSize: 28,
            fontWeight: 600,
            color: colors.ink,
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: "#10b981",
              display: "grid",
              placeItems: "center",
              color: "white",
              fontWeight: 800,
              fontSize: 18,
            }}
          >
            ✓
          </div>
          tom.ethtwin.eth · 100 USDC
        </div>
      </div>
    </AbsoluteFill>
  )
}
