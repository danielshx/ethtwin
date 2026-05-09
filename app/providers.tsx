"use client"

// Providers shell.
//
// Privy + SmartWallets used to live here; both are gone. Authentication is
// now a server-issued HMAC cookie (see lib/session.ts) and signing happens
// server-side via SpaceComputer KMS (see lib/kms.ts). The shell is a
// passthrough — kept for future client-side providers (theme, analytics,
// websocket clients, etc.) without touching app/layout.tsx.

export function Providers({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
