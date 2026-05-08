import type { Metadata } from "next"
import "./globals.css"
import { Providers } from "./providers"

export const metadata: Metadata = {
  title: "Twinpilot — AI co-pilot for your on-chain life",
  description:
    "Voice-first AI Twin that lives in ENS, hires agents via x402, and uses cosmic randomness for stealth privacy.",
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-dvh bg-black text-white antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
