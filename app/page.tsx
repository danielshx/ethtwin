"use client"

import { useEffect, useMemo, useState } from "react"
import { useConnectWallet, usePrivy, useWallets } from "@privy-io/react-auth"
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets"
import { motion } from "framer-motion"
import { Eye, EyeOff, LogOut, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { OnboardingFlow, type AuthMethod, type OnboardingResult } from "@/components/onboarding-flow"
import { TwinChat } from "@/components/twin-chat"
import { Messenger } from "@/components/messenger"
import { TokenTransfer } from "@/components/token-transfer"
import { StealthSend } from "@/components/stealth-send"
import { History } from "@/components/history"
import { VoiceTwin } from "@/components/voice-twin"
import { NotificationPanel } from "@/components/notification-panel"
import { MariaShell } from "@/components/maria-shell"
import { ContrastCard } from "@/components/contrast-card"
import { addHistoryEntry } from "@/lib/history"
import { useDemoMode } from "@/lib/use-demo-mode"
import { Toaster } from "@/components/ui/sonner"
import { toast } from "sonner"

const PARENT_DOMAIN = process.env.NEXT_PUBLIC_PARENT_DOMAIN ?? "ethtwin.eth"
const PRIVY_CONFIGURED = !!process.env.NEXT_PUBLIC_PRIVY_APP_ID
const STORAGE_KEY = "ethtwin.session.v1"
// Fallback addr record when an email-only user signs in but no embedded smart
// wallet has surfaced yet. The twin is mintable; the addr record points at the
// shared dev wallet. Sourced from env so a key rotation also rotates this.
// Caveat: multiple email-only users would share an addr.
const DEV_WALLET_FALLBACK = (process.env.NEXT_PUBLIC_DEV_WALLET_ADDRESS ??
  "0x4E09c220BD556396Bc255A4DD24F858Bafeba6f5") as `0x${string}`

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
      <Toaster />
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
  const [demoMode, setDemoMode] = useDemoMode()

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
    addHistoryEntry({
      kind: "mint",
      status: "success",
      chain: "sepolia",
      summary: `Twin minted: ${next.ensName}`,
      description: `Linked to wallet ${next.smartWalletAddress}`,
      explorerUrl: `https://sepolia.app.ens.domains/${next.ensName}`,
      syncTo: {
        ens: next.ensName,
        getAuthToken: () => privy.getAccessToken().catch(() => null),
      },
    })
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
        <div className="flex items-center gap-2.5">
          <motion.span
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.4 }}
            className="grid h-9 w-9 place-items-center rounded-2xl bg-gradient-to-br from-primary to-amber-400 text-primary-foreground shadow-md shadow-primary/20"
          >
            <Sparkles className="h-4 w-4" />
          </motion.span>
          <span className="text-lg font-semibold tracking-tight">EthTwin</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <DemoModeToggle enabled={demoMode} onChange={setDemoMode} />
          {session ? (
            <>
              {!demoMode ? (
                <span className="hidden font-mono text-xs text-muted-foreground sm:inline">
                  {session.ensName}
                </span>
              ) : null}
              <Button variant="ghost" size="sm" onClick={handleSignOut}>
                <LogOut className="h-4 w-4" />
              </Button>
            </>
          ) : null}
        </div>
      </header>

      <section className="relative z-10 mx-auto flex w-full max-w-5xl flex-col items-center gap-10 px-6 pb-16 pt-4 sm:px-10">
        {!session ? (
          <>
            <Hero demoMode={demoMode} />
            <OnboardingFlow
              parentDomain={PARENT_DOMAIN}
              isAuthenticated={privy.authenticated}
              smartWalletAddress={smartWalletAddress}
              onAuthenticate={handleAuthenticate}
              onMint={handleMint}
              onComplete={handleComplete}
            />
            <div className="w-full max-w-4xl space-y-4 pt-10">
              <div className="text-center">
                <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                  Same transaction. Two worlds.
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Crypto today vs. crypto for everyone.
                </p>
              </div>
              <ContrastCard />
            </div>
          </>
        ) : demoMode ? (
          <MariaShell
            ensName={session.ensName}
            walletAddress={smartWalletAddress ?? session.smartWalletAddress}
            getAuthToken={() => privy.getAccessToken().catch(() => null)}
          />
        ) : (
          <SignedInTabs
            session={session}
            privy={privy}
            walletAddress={smartWalletAddress}
            onTwinDeleted={handleSignOut}
          />
        )}
      </section>
      {session && !demoMode ? (
        <NotificationPanel
          ensName={session.ensName}
          walletAddress={smartWalletAddress ?? session.smartWalletAddress}
        />
      ) : null}
    </>
  )
}

function SignedInTabs({
  session,
  privy,
  walletAddress,
  onTwinDeleted,
}: {
  session: SessionState
  privy: ReturnType<typeof usePrivy>
  walletAddress: string | null
  onTwinDeleted?: () => void
}) {
  const [tab, setTab] = useState<
    "chat" | "voice" | "messenger" | "transfer" | "stealth" | "history"
  >("chat")
  const getAuthToken = () => privy.getAccessToken().catch(() => null)
  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      <SegmentedTabs
        value={tab}
        onChange={setTab}
        items={[
          { value: "chat", label: "Chat" },
          { value: "voice", label: "Voice" },
          { value: "messenger", label: "Messages" },
          { value: "transfer", label: "Send" },
          { value: "stealth", label: "Private send" },
          { value: "history", label: "Activity" },
        ]}
      />
      {tab === "chat" ? (
        <TwinChat
          ensName={session.ensName}
          getAuthToken={getAuthToken}
          onTwinDeleted={onTwinDeleted}
          className="h-[70dvh] w-full border-border/60 bg-card shadow-sm"
        />
      ) : tab === "voice" ? (
        <VoiceTwin
          ensName={session.ensName}
          getAuthToken={getAuthToken}
          onSwitchToChat={() => setTab("chat")}
          className="w-full border-border/60 bg-card shadow-sm"
        />
      ) : tab === "messenger" ? (
        <Messenger
          myEnsName={session.ensName}
          getAuthToken={getAuthToken}
          className="w-full border-border/60 bg-card shadow-sm"
        />
      ) : tab === "transfer" ? (
        <TokenTransfer
          myEnsName={session.ensName}
          getAuthToken={getAuthToken}
          className="w-full border-border/60 bg-card shadow-sm"
        />
      ) : tab === "stealth" ? (
        <StealthSend
          myEnsName={session.ensName}
          getAuthToken={getAuthToken}
          className="w-full border-border/60 bg-card shadow-sm"
        />
      ) : (
        <History
          ensName={session.ensName}
          walletAddress={walletAddress ?? session.smartWalletAddress}
          className="w-full border-border/60 bg-card shadow-sm"
        />
      )}
    </div>
  )
}

function DemoModeToggle({
  enabled,
  onChange,
}: {
  enabled: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={enabled ? "Switch to developer view" : "Switch to demo view"}
      onClick={() => onChange(!enabled)}
      className="group inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/80 px-3 py-1.5 text-xs shadow-sm transition hover:border-primary/40"
      title={
        enabled
          ? "Currently in demo view — tap to switch to developer view"
          : "Currently in developer view — tap to switch to demo view"
      }
    >
      <span
        className={`grid h-5 w-5 place-items-center rounded-full ${
          enabled
            ? "bg-primary text-primary-foreground"
            : "bg-secondary text-muted-foreground"
        }`}
      >
        {enabled ? (
          <Eye className="h-3 w-3" />
        ) : (
          <EyeOff className="h-3 w-3" />
        )}
      </span>
      <span className="hidden font-medium text-foreground/90 sm:inline">
        {enabled ? "Demo view" : "Dev view"}
      </span>
    </button>
  )
}

function SegmentedTabs<T extends string>({
  value,
  onChange,
  items,
}: {
  value: T
  onChange: (v: T) => void
  items: ReadonlyArray<{ value: T; label: string }>
}) {
  return (
    <div className="relative flex w-full max-w-2xl items-center self-center rounded-full border border-border/60 bg-card/80 p-1 text-xs shadow-sm">
      {items.map((it) => {
        const active = it.value === value
        return (
          <button
            key={it.value}
            type="button"
            onClick={() => onChange(it.value)}
            className="relative flex-1 rounded-full px-3 py-2 text-center font-medium transition"
          >
            {active ? (
              <motion.span
                layoutId="seg-tab-active"
                className="absolute inset-0 rounded-full bg-primary text-primary-foreground shadow"
                transition={{ type: "spring", duration: 0.4, bounce: 0.2 }}
              />
            ) : null}
            <span
              className={
                active
                  ? "relative z-10 text-primary-foreground"
                  : "relative z-10 text-muted-foreground hover:text-foreground"
              }
            >
              {it.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function MissingEnv() {
  return (
    <section className="relative z-10 mx-auto flex min-h-dvh w-full max-w-3xl flex-col items-center justify-center gap-6 px-6 text-center">
      <Hero />
      <Card className="max-w-md border-border/60 bg-card/95 p-6 text-left text-sm">
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

function Hero({ demoMode = false }: { demoMode?: boolean }) {
  if (demoMode) {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-4xl font-semibold tracking-tight sm:text-5xl"
        >
          Crypto for everyone —{" "}
          <span className="bg-gradient-to-r from-primary to-amber-500 bg-clip-text text-transparent">
            even my grandma
          </span>
          .
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="max-w-xl text-base text-muted-foreground sm:text-lg"
        >
          Built for humans, not engineers. Voice. Names instead of addresses.
          Private by default.
        </motion.p>
      </div>
    )
  }
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <motion.h1
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl"
      >
        Crypto for everyone —{" "}
        <span className="bg-gradient-to-r from-primary to-amber-500 bg-clip-text text-transparent">
          even my grandma
        </span>
        .
      </motion.h1>
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="max-w-xl text-base text-muted-foreground sm:text-lg"
      >
        Send money by saying a name. Stay private without thinking about it.
        Built for humans, not engineers.
      </motion.p>
    </div>
  )
}

function BackgroundGlow() {
  // In maria-mode the body gradient (see globals.css) carries the warm wash;
  // these purple blobs would clash, so we hide them via the maria-mode class.
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[40rem] w-[40rem] -translate-x-1/2 rounded-full opacity-50 blur-3xl background-glow"
        style={{
          background:
            "radial-gradient(circle, oklch(0.6 0.2 290 / 0.5), transparent 65%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-[-20rem] right-[-10rem] h-[30rem] w-[30rem] rounded-full opacity-40 blur-3xl background-glow"
        style={{
          background:
            "radial-gradient(circle, oklch(0.6 0.18 320 / 0.4), transparent 70%)",
        }}
      />
    </>
  )
}
