// Design tokens mirrored from app/globals.css for Remotion (no Tailwind).
// OKLCH values converted to hex/rgb so we can inline-style without a runtime.

export const colors = {
  // Warm fintech palette
  background: "#fffaf2",
  cream: "#fffaf2",
  card: "#ffffff",
  foreground: "#1d2233",
  ink: "#1d2233",
  muted: "#f1ece2",
  mutedForeground: "#6c7393",
  border: "#e9e0d0",

  // Accents from CLAUDE.md
  primary: "#ff7059", // coral
  amber: "#ffba6b",
  sage: "#9bd6a8",
  glow: "#ffd2b8",

  // Cosmic / X-ray
  cosmicDeep: "#0d1428",
  cosmicMid: "#1c2548",
  emerald: "#2dd4bf",
  emeraldSoft: "#a7f3d0",
  star: "#ffffff",

  // Bounty pill colors
  ensBlue: "#5298ff",
  satellitePurple: "#b794f6",
} as const

export const fonts = {
  sans: "Geist, system-ui, sans-serif",
  mono: "ui-monospace, 'SF Mono', Menlo, monospace",
} as const

export const FPS = 30
export const WIDTH = 1920
export const HEIGHT = 1080
export const TOTAL_FRAMES = 1500 // ~50s

// Scene boundaries (frame index where each begins)
export const SCENES = {
  coldOpen: { from: 0, dur: 90 },
  mariaIntro: { from: 90, dur: 180 },
  voiceSend: { from: 270, dur: 270 },
  postcard: { from: 540, dur: 240 },
  cosmic: { from: 780, dur: 180 },
  xray: { from: 960, dur: 330 },
  outro: { from: 1290, dur: 210 },
} as const
