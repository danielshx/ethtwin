"use client"

import { useEffect, useMemo, useState } from "react"
import { useConnectWallet, usePrivy, useWallets } from "@privy-io/react-auth"
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets"
import { motion } from "framer-motion"
import { LogOut, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { OnboardingFlow, type AuthMethod, type OnboardingResult } from "@/components/onboarding-flow"
import { TwinChat } from "@/components/twin-chat"
import { Messenger } from "@/components/messenger"
import { Toaster } from "@/components/ui/sonner"
import { toast } from "sonner"

const PARENT_DOMAIN = process.env.NEXT_PUBLIC_PARENT_DOMAIN ?? "ethtwin.eth"
const PRIVY_CONFIGURED = !!process.env.NEXT_PUBLIC_PRIVY_APP_ID
const STORAGE_KEY = "ethtwin.session.v1"
// Fallback addr record when an email-only user signs in but no embedded smart
// wallet has surfaced yet. The twin is mintable; the addr record points at the
// shared dev wallet. Caveat: multiple email-only users would share an addr.
const DEV_WALLET_FALLBACK = "0x4E09c220BD556396Bc255A4DD24F858Bafeba6f5"

type SessionState = {
  ensName: string
  username: string
  smartWalletAddress: string
  cosmicAttestation: string
}

export default function HomePage() {
  return (
    <main className="relative min-h-dvh overflow-hidden bg-background">
      <BackgroundGlow />
      {PRIVY_CONFIGURED ? <App /> : <MissingEnv />}
      <Toaster theme="dark" />
    </main>
  )
}

function App() {
  const privy = usePrivy()
  const { wallets } = useWallets()
  const smart = useSmartWallets()
  const { connectWallet } = useConnectWallet()
  const [session, setSession] = useState<SessionState | null>(null)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) setSession(JSON.parse(raw) as SessionState)
    } catch {}
    setHydrated(true)
  }, [])

  const smartWalletAddress = useMemo(() => {
    const smartAccount = smart.client?.account?.address
    if (smartAccount) return smartAccount
    const embedded = wallets.find((w) => w.walletClientType === "privy")
    if (embedded?.address) return embedded.address
    // External wallet login (MetaMask/Rabby/etc.) — use whatever's connected.
    if (wallets[0]?.address) return wallets[0].address
    // Email-only user with no embedded wallet yet — fall back to the shared
    // dev wallet so the twin can still be minted.
    if (privy.authenticated) return DEV_WALLET_FALLBACK
    return null
  }, [smart.client?.account?.address, wallets, privy.authenticated])

  async function handleAuthenticate(method: AuthMethod = "any") {
    if (!privy.authenticated) {
      if (method === "wallet") {
        // Direct wallet picker — skips the email/passkey choices.
        connectWallet()
      } else if (method === "passkey") {
        privy.login({ loginMethods: ["passkey"] })
      } else {
        // Generic — Privy modal lets user pick any method.
        privy.login()
      }
    }
    return { smartWalletAddress: smartWalletAddress ?? DEV_WALLET_FALLBACK }
  }

  async function handleMint(input: {
    username: string
    smartWalletAddress: string
    cosmicAttestation: string
  }) {
    const token = await privy.getAccessToken().catch(() => null)
    const res = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        privyToken: token,
        username: input.username,
        smartWalletAddress: input.smartWalletAddress,
        stealthMetaAddress: `st:eth:0x${input.cosmicAttestation
          .replace(/[^a-f0-9]/gi, "")
          .padEnd(128, "0")
          .slice(0, 128)}`,
        twinAgentId: input.username,
      }),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(text || `mint failed (${res.status})`)
    }
    const data = (await res.json()) as { ensName: string }
    return { ensName: data.ensName }
  }

  function handleComplete(result: OnboardingResult) {
    const next: SessionState = {
      ensName: result.ensName,
      username: result.username,
      smartWalletAddress: String(result.smartWalletAddress),
      cosmicAttestation: result.cosmicAttestation,
    }
    setSession(next)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {}
    toast.success(`${next.ensName} is live`)
  }

  function handleSignOut() {
    privy.logout?.()
    setSession(null)
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {}
  }

  if (!hydrated) return null

  return (
    <>
      <header className="relative z-10 flex items-center justify-between px-6 py-5 sm:px-10">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-primary/20 text-primary">
            <Sparkles className="h-4 w-4" />
          </span>
          <span className="text-lg font-semibold tracking-tight">EthTwin</span>
          <Badge
            variant="secondary"
            className="hidden font-mono text-[10px] sm:inline-flex"
          >
            ETHPrague 2026
          </Badge>
        </div>
        {session ? (
          <div className="flex items-center gap-3 text-sm">
            <span className="font-mono text-xs text-muted-foreground">
              {session.ensName}
            </span>
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        ) : null}
      </header>

      <section className="relative z-10 mx-auto flex w-full max-w-5xl flex-col items-center gap-10 px-6 pb-16 pt-4 sm:px-10">
        {!session ? (
          <>
            <Hero />
            <OnboardingFlow
              parentDomain={PARENT_DOMAIN}
              isAuthenticated={privy.authenticated}
              smartWalletAddress={smartWalletAddress}
              onAuthenticate={handleAuthenticate}
              onMint={handleMint}
              onComplete={handleComplete}
            />
          </>
        ) : (
          <SignedInTabs session={session} privy={privy} />
        )}
      </section>
    </>
  )
}

function SignedInTabs({
  session,
  privy,
}: {
  session: SessionState
  privy: ReturnType<typeof usePrivy>
}) {
  const [tab, setTab] = useState<"chat" | "messenger">("chat")
  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      <div className="flex items-center gap-1 self-center rounded-full border border-white/10 bg-card/60 p-1 text-xs backdrop-blur">
        <Button
          variant={tab === "chat" ? "default" : "ghost"}
          size="sm"
          className="rounded-full"
          onClick={() => setTab("chat")}
        >
          Twin Chat
        </Button>
        <Button
          variant={tab === "messenger" ? "default" : "ghost"}
          size="sm"
          className="rounded-full"
          onClick={() => setTab("messenger")}
        >
          ENS Messenger
        </Button>
      </div>
      {tab === "chat" ? (
        <TwinChat
          ensName={session.ensName}
          className="h-[70dvh] w-full border-white/10 bg-card/80 backdrop-blur"
        />
      ) : (
        <Messenger
          myEnsName={session.ensName}
          getAuthToken={() => privy.getAccessToken().catch(() => null)}
          className="w-full border-white/10 bg-card/80 backdrop-blur"
        />
      )}
    </div>
  )
}

function MissingEnv() {
  return (
    <section className="relative z-10 mx-auto flex min-h-dvh w-full max-w-3xl flex-col items-center justify-center gap-6 px-6 text-center">
      <Hero />
      <Card className="max-w-md border-white/10 bg-card/80 p-6 text-left text-sm">
        <p className="font-medium text-foreground">Privy not configured</p>
        <p className="mt-1 text-muted-foreground">
          Set <code className="font-mono text-xs">NEXT_PUBLIC_PRIVY_APP_ID</code> in
          <code className="ml-1 font-mono text-xs">.env.local</code> to enable login,
          smart wallet, and onboarding. See{" "}
          <code className="font-mono text-xs">.env.example</code> and{" "}
          <code className="font-mono text-xs">docs/09-Setup.md</code>.
        </p>
      </Card>
    </section>
  )
}

function Hero() {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <motion.h1
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-4xl font-semibold tracking-tight sm:text-5xl"
      >
        The AI co-pilot for your{" "}
        <span className="bg-gradient-to-r from-primary to-fuchsia-400 bg-clip-text text-transparent">
          on-chain life
        </span>
      </motion.h1>
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="max-w-xl text-base text-muted-foreground sm:text-lg"
      >
        Voice-first. Privacy by default. Lives in ENS. Hires other agents via x402.
      </motion.p>
    </div>
  )
}

function BackgroundGlow() {
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[40rem] w-[40rem] -translate-x-1/2 rounded-full opacity-50 blur-3xl"
        style={{
          background:
            "radial-gradient(circle, oklch(0.6 0.2 290 / 0.5), transparent 65%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-[-20rem] right-[-10rem] h-[30rem] w-[30rem] rounded-full opacity-40 blur-3xl"
        style={{
          background:
            "radial-gradient(circle, oklch(0.6 0.18 320 / 0.4), transparent 70%)",
        }}
      />
    </>
  )
}
