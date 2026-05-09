import { AbsoluteFill, interpolate, random, spring, useCurrentFrame, useVideoConfig } from "remotion"
import { colors, fonts } from "../tokens"
import { Postcard } from "../components/Postcard"

const PARTICLE_COLORS = [colors.primary, colors.amber, colors.sage, colors.glow, "#fbbf24"]

function ConfettiParticle({ index, burstFrame }: { index: number; burstFrame: number }) {
  const frame = useCurrentFrame()
  const local = frame - burstFrame
  if (local < 0) return null

  const angle = random(`angle-${index}`) * Math.PI * 2
  const distance = 200 + random(`dist-${index}`) * 700
  const fall = local * (3 + random(`fall-${index}`) * 2.5)
  const x = Math.cos(angle) * distance * Math.min(local / 30, 1)
  const y = Math.sin(angle) * distance * Math.min(local / 30, 1) + fall * 0.5
  const rot = local * (4 + random(`rot-${index}`) * 6)
  const opacity = interpolate(local, [0, 8, 70, 90], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })
  const size = 10 + random(`size-${index}`) * 16
  const colorIdx = Math.floor(random(`col-${index}`) * PARTICLE_COLORS.length)
  const isCircle = random(`shape-${index}`) > 0.5

  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        width: size,
        height: size * (isCircle ? 1 : 0.4),
        background: PARTICLE_COLORS[colorIdx],
        borderRadius: isCircle ? "50%" : 2,
        transform: `translate(${x - size / 2}px, ${y - size / 2}px) rotate(${rot}deg)`,
        opacity,
      }}
    />
  )
}

export function PostcardConfetti() {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const cardEnter = spring({ frame, fps, config: { damping: 14, mass: 0.9 } })
  const cardY = interpolate(cardEnter, [0, 1], [120, 0])
  const cardOpacity = interpolate(frame, [0, 14], [0, 1], { extrapolateRight: "clamp" })
  const cardScale = interpolate(cardEnter, [0, 1], [0.85, 1])

  const exit = interpolate(frame, [210, 240], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
  const opacity = Math.min(cardOpacity, exit)

  const burstFrame = 18

  // Background warm pulse
  const pulse = interpolate(frame, [burstFrame - 4, burstFrame + 12, burstFrame + 50], [0, 0.55, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse at center, #fff5e7 0%, ${colors.cream} 70%)`,
        fontFamily: fonts.sans,
        opacity,
      }}
    >
      {/* Warm radial pulse */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at center, ${colors.glow}aa 0%, transparent 55%)`,
          opacity: pulse,
        }}
      />

      {/* Confetti */}
      <AbsoluteFill style={{ display: "grid", placeItems: "center" }}>
        <div style={{ position: "relative", width: 0, height: 0 }}>
          {Array.from({ length: 80 }).map((_, i) => (
            <ConfettiParticle key={i} index={i} burstFrame={burstFrame} />
          ))}
        </div>
      </AbsoluteFill>

      {/* Postcard */}
      <AbsoluteFill style={{ display: "grid", placeItems: "center" }}>
        <div style={{ transform: `translateY(${cardY}px) scale(${cardScale})`, opacity: cardOpacity }}>
          <Postcard amount="100" unit="dollars" recipient="tom" privateBadge />
        </div>
      </AbsoluteFill>

      {/* Caption below */}
      <AbsoluteFill style={{ display: "grid", placeItems: "end center", paddingBottom: 100 }}>
        <div
          style={{
            opacity: interpolate(frame, [40, 60], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
            fontSize: 32,
            fontWeight: 600,
            color: colors.mutedForeground,
          }}
        >
          No seed phrase. No hex. Just <span style={{ color: colors.primary, fontWeight: 700 }}>tom.ethtwin.eth</span>.
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}
