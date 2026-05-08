import type { Metadata } from "next"
import "./globals.css"
import { Providers } from "./providers"
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "Twinpilot — AI co-pilot for your on-chain life",
  description:
    "Voice-first AI Twin that lives in ENS, hires agents via x402, and uses cosmic randomness for stealth privacy.",
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={cn("dark", "font-sans", geist.variable)}>
      <body className="min-h-dvh antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
