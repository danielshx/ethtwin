import { colors, fonts } from "../tokens"

type Props = {
  amount: string
  unit?: string
  recipient: string
  scale?: number
  shadow?: boolean
  privateBadge?: boolean
}

export function Postcard({
  amount,
  unit = "dollars",
  recipient,
  scale = 1,
  shadow = true,
  privateBadge = true,
}: Props) {
  return (
    <div
      style={{
        width: 680,
        background: colors.card,
        border: `1px solid ${colors.border}`,
        borderRadius: 36,
        padding: "32px 36px",
        boxShadow: shadow ? "0 40px 80px rgba(40,30,20,0.18), 0 8px 24px rgba(40,30,20,0.08)" : "none",
        fontFamily: fonts.sans,
        transform: `scale(${scale})`,
        transformOrigin: "center",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        {/* Avatar */}
        <div
          style={{
            position: "relative",
            width: 96,
            height: 96,
            borderRadius: "50%",
            background: `conic-gradient(from 200deg, ${colors.primary}, ${colors.amber}, ${colors.sage}, ${colors.primary})`,
            boxShadow: `0 0 0 3px ${colors.primary}55`,
            display: "grid",
            placeItems: "center",
            color: "white",
            fontSize: 44,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {recipient.charAt(0).toUpperCase()}
          {/* Check badge */}
          <div
            style={{
              position: "absolute",
              right: -4,
              bottom: -4,
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: "#10b981",
              display: "grid",
              placeItems: "center",
              color: "white",
              fontSize: 22,
              fontWeight: 800,
              boxShadow: "0 4px 12px rgba(16,185,129,0.4)",
            }}
          >
            ✓
          </div>
        </div>
        {/* Text */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <span style={{ fontSize: 72, fontWeight: 700, color: colors.ink, letterSpacing: -2 }}>{amount}</span>
            <span style={{ fontSize: 28, color: colors.mutedForeground }}>{unit}</span>
          </div>
          <div style={{ fontSize: 22, color: colors.mutedForeground }}>
            sent to <span style={{ color: colors.ink, fontWeight: 600 }}>{recipient}</span> · just now
          </div>
          {privateBadge ? (
            <div
              style={{
                marginTop: 6,
                display: "inline-flex",
                width: "fit-content",
                alignItems: "center",
                gap: 8,
                padding: "6px 14px",
                borderRadius: 999,
                background: "#ecfdf5",
                color: "#047857",
                fontSize: 16,
                fontWeight: 600,
              }}
            >
              ✦ Private
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
