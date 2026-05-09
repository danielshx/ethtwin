import { interpolate, random, useCurrentFrame } from "remotion"
import { colors } from "../tokens"

type Props = {
  size?: number
  intensity?: number // 0..1
}

export function CosmicOrb({ size = 360, intensity = 1 }: Props) {
  const frame = useCurrentFrame()
  const rotate = (frame / 14 / 30) * 360 // 14s loop matches lib component
  const rotateInner = -(frame / 22 / 30) * 360
  const rotateDashed = (frame / 30 / 30) * 360
  const breath = Math.sin((frame / 48) * Math.PI * 2) * 0.04 + 1

  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        display: "grid",
        placeItems: "center",
        transform: `scale(${breath})`,
      }}
    >
      {/* Outer glow */}
      <div
        style={{
          position: "absolute",
          inset: -size * 0.4,
          borderRadius: "50%",
          background: `radial-gradient(circle at 35% 30%, ${colors.satellitePurple}cc, ${colors.cosmicMid}80 45%, transparent 72%)`,
          filter: "blur(28px)",
          opacity: intensity,
          transform: `rotate(${rotate}deg)`,
        }}
      />
      {/* Core sphere */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          background: `radial-gradient(circle at 30% 30%, #c8b4ff, #6e5cd6 38%, #1c2548 78%)`,
          boxShadow: `inset 0 -20px 60px rgba(0,0,0,0.55), 0 30px 60px rgba(110,92,214,0.4)`,
          transform: `rotate(${rotate}deg)`,
        }}
      />
      {/* Ring 1 */}
      <div
        style={{
          position: "absolute",
          inset: size * 0.04,
          borderRadius: "50%",
          border: "1.5px solid rgba(255,255,255,0.35)",
          transform: `rotate(${rotateInner}deg)`,
          opacity: 0.85,
        }}
      />
      {/* Ring 2 dashed */}
      <div
        style={{
          position: "absolute",
          inset: size * 0.12,
          borderRadius: "50%",
          border: "1.5px dashed rgba(255,255,255,0.2)",
          transform: `rotate(${rotateDashed}deg)`,
        }}
      />
      {/* Particles */}
      {Array.from({ length: 18 }).map((_, i) => {
        const angle = (i / 18) * Math.PI * 2 + (frame / 100)
        const offset = random(`p-${i}`) * 0.45 + 0.55
        const radius = (size / 2) * offset
        const x = Math.cos(angle) * radius
        const y = Math.sin(angle) * radius
        const twinkle = Math.sin((frame + i * 7) / 12) * 0.5 + 0.5
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              width: 4,
              height: 4,
              borderRadius: "50%",
              background: "white",
              boxShadow: "0 0 10px rgba(255,255,255,0.9)",
              transform: `translate(${x}px, ${y}px)`,
              opacity: twinkle * intensity,
            }}
          />
        )
      })}
    </div>
  )
}
