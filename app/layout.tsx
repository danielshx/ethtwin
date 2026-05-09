import type { Metadata } from "next"
import "./globals.css"
import { Providers } from "./providers"
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "EthTwin — Crypto for everyone, even my grandma",
  description:
    "The first crypto interface built for humans, not engineers. Voice-first. Privacy by default. Lives in ENS.",
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={cn("font-sans", geist.variable)}>
      <body className="min-h-dvh antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
