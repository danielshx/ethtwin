import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion"
import { colors, fonts } from "../tokens"
import { Postcard } from "../components/Postcard"

const PRIMITIVES = [
  { icon: "🔑", label: "Signed with passkey", badge: "Privy · ERC-4337", color: "#fbbf24" },
  { icon: "🌐", label: "Resolved tom.ethtwin.eth", badge: "ENS Subname", color: "#5298ff" },
  { icon: "👁", label: "One-time stealth address", badge: "EIP-5564", color: "#10b981" },
  { icon: "🛰", label: "Randomness from satellite", badge: "Orbitport cTRNG", color: "#b794f6" },
  { icon: "✓", label: "Recipient verified", badge: "ENSIP-25 · ERC-8004", color: "#34d399" },
  { icon: "⛓", label: "Settled on-chain", badge: "Base Sepolia", color: "#0ea5e9" },
]

export function XRayReveal() {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const opacityIn = interpolate(frame, [0, 14], [0, 1], { extrapolateRight: "clamp" })
  const opacityOut = interpolate(frame, [300, 330], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
  const opacity = Math.min(opacityIn, opacityOut)

  // Postcard peels back: rotateX from 0 → -75deg over 30 frames starting at 30
  const peel = interpolate(frame, [30, 70], [0, -78], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
  const cardY = interpolate(frame, [30, 70], [0, -120], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
  const cardScale = interpolate(frame, [30, 70], [1, 0.65], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
  const cardOpacity = interpolate(frame, [30, 90], [1, 0.18], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })

  // Blueprint slides up
  const bpEnter = spring({ frame: frame - 50, fps, config: { damping: 20, mass: 0.8 } })
  const bpY = interpolate(bpEnter, [0, 1], [60, 0])
  const bpOpacity = interpolate(frame, [50, 90], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })

  // Title
  const titleOpacity = interpolate(frame, [0, 14], [0, 1], { extrapolateRight: "clamp" })

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(135deg, ${colors.cosmicDeep}, ${colors.cosmicMid})`,
        fontFamily: fonts.sans,
        opacity,
      }}
    >
      {/* Blueprint grid */}
      <AbsoluteFill
        style={{
          backgroundImage:
            "linear-gradient(rgba(167,243,208,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(167,243,208,0.08) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          opacity: bpOpacity,
        }}
      />

      {/* Title */}
      <div
        style={{
          position: "absolute",
          top: 80,
          left: 0,
          right: 0,
          textAlign: "center",
          opacity: titleOpacity,
        }}
      >
        <div
          style={{
            fontSize: 18,
            letterSpacing: 6,
            textTransform: "uppercase",
            color: colors.emeraldSoft,
            marginBottom: 12,
            fontFamily: fonts.mono,
          }}
        >
          What really happened
        </div>
        <div style={{ fontSize: 64, fontWeight: 700, letterSpacing: -1.5, color: "white" }}>
          Underneath the postcard.
        </div>
      </div>

      {/* Postcard peeling */}
      <AbsoluteFill style={{ display: "grid", placeItems: "center" }}>
        <div
          style={{
            transform: `translateY(${cardY}px) scale(${cardScale}) perspective(1200px) rotateX(${peel}deg)`,
            transformOrigin: "center top",
            opacity: cardOpacity,
            filter: peel < -10 ? `blur(${Math.abs(peel) * 0.06}px)` : "none",
          }}
        >
          <Postcard amount="100" unit="dollars" recipient="tom" privateBadge={false} shadow={false} />
        </div>
      </AbsoluteFill>

      {/* Primitives grid */}
      <AbsoluteFill style={{ display: "grid", placeItems: "center", paddingTop: 120 }}>
        <div
          style={{
            opacity: bpOpacity,
            transform: `translateY(${bpY}px)`,
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(420px, 480px))",
            gap: 22,
            maxWidth: 1100,
          }}
        >
          {PRIMITIVES.map((p, i) => {
            const localFrame = frame - (60 + i * 12)
            const itemEnter = spring({ frame: localFrame, fps, config: { damping: 16 } })
            const itemOp = interpolate(localFrame, [0, 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
            const itemX = interpolate(itemEnter, [0, 1], [-30, 0])
            return (
              <div
                key={i}
                style={{
                  opacity: itemOp,
                  transform: `translateX(${itemX}px)`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 18,
                  padding: "18px 22px",
                  borderRadius: 18,
                  background: "rgba(167,243,208,0.06)",
                  border: `1px solid ${p.color}55`,
                  fontFamily: fonts.mono,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 12,
                      background: `${p.color}33`,
                      display: "grid",
                      placeItems: "center",
                      fontSize: 22,
                      flexShrink: 0,
                    }}
                  >
                    {p.icon}
                  </div>
                  <div style={{ color: "white", fontSize: 22, fontWeight: 500, fontFamily: fonts.sans }}>
                    {p.label}
                  </div>
                </div>
                <div
                  style={{
                    flexShrink: 0,
                    padding: "6px 14px",
                    borderRadius: 999,
                    background: `${p.color}22`,
                    color: p.color,
                    fontSize: 16,
                    fontWeight: 600,
                  }}
                >
                  {p.badge}
                </div>
              </div>
            )
          })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}
