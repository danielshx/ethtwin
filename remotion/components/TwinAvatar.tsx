import { interpolate, useCurrentFrame } from "remotion"
import { colors } from "../tokens"

type TwinAvatarProps = {
  size?: number
  state?: "idle" | "listening" | "speaking"
  initial?: string
}

export function TwinAvatar({ size = 220, state = "listening", initial = "T" }: TwinAvatarProps) {
  const frame = useCurrentFrame()
  // Pulse frequencies match components/twin-avatar.tsx (Hz → frames at 30fps)
  const period = state === "listening" ? 48 : state === "speaking" ? 27 : 72
  const phase = (frame % period) / period
  const wave = Math.sin(phase * Math.PI * 2)
  const scale = 1 + (state === "listening" ? 0.05 : state === "speaking" ? 0.035 : 0.015) * wave

  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        display: "grid",
        placeItems: "center",
      }}
    >
      {/* Outer halo glow */}
      <div
        style={{
          position: "absolute",
          inset: -size * 0.35,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${colors.glow}aa, transparent 65%)`,
          filter: "blur(40px)",
          opacity: 0.7,
          transform: `scale(${1 + wave * 0.04})`,
        }}
      />
      {/* Pulse rings */}
      {[0, 1, 2].map((i) => {
        const ringFrame = (frame + i * 18) % 60
        const t = ringFrame / 60
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              width: size,
              height: size,
              borderRadius: "50%",
              border: `2px solid ${colors.primary}`,
              opacity: interpolate(t, [0, 0.7, 1], [0.55, 0.18, 0]),
              transform: `scale(${1 + t * 0.5})`,
            }}
          />
        )
      })}
      {/* Avatar core */}
      <div
        style={{
          position: "relative",
          width: size,
          height: size,
          borderRadius: "50%",
          background: `conic-gradient(from 200deg, ${colors.primary}, ${colors.amber}, ${colors.sage}, ${colors.primary})`,
          boxShadow: `0 30px 60px ${colors.primary}33, inset 0 -8px 24px rgba(0,0,0,0.08)`,
          transform: `scale(${scale})`,
          display: "grid",
          placeItems: "center",
          color: "white",
          fontSize: size * 0.42,
          fontWeight: 700,
          letterSpacing: -2,
          textShadow: "0 2px 8px rgba(0,0,0,0.18)",
        }}
      >
        {initial}
      </div>
    </div>
  )
}
