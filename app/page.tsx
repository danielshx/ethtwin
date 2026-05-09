"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { Eye, EyeOff, LogIn, LogOut, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { OnboardingFlow, type OnboardingResult } from "@/components/onboarding-flow"
import { TwinChat } from "@/components/twin-chat"
import { Messenger } from "@/components/messenger"
import { StealthSend } from "@/components/stealth-send"
import { History } from "@/components/history"
import { VoiceTwin } from "@/components/voice-twin"
import { NotificationPanel } from "@/components/notification-panel"
import { MariaShell } from "@/components/maria-shell"
import { ContrastCard } from "@/components/contrast-card"
import { addHistoryEntry } from "@/lib/history"
import { useDemoMode } from "@/lib/use-demo-mode"
import { useSession, type Session } from "@/lib/use-session"
import { Toaster } from "@/components/ui/sonner"
import { toast } from "sonner"

const PARENT_DOMAIN = process.env.NEXT_PUBLIC_PARENT_DOMAIN ?? "ethtwin.eth"

// Per-twin recovery code is the bare-minimum ownership proof the user needs
// to log back in from a new browser. We persist it in localStorage so the
// SAME browser (the one that minted) auto-fills the field at login.
const RECOVERY_KEY = (ens: string) => `ethtwin.recovery.${ens.toLowerCase()}`

function persistRecoveryCode(ens: string, code: string) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(RECOVERY_KEY(ens), code)
  } catch {
    // ignore — best-effort
  }
}

function readRecoveryCode(ens: string): string | null {
  if (typeof window === "undefined") return null
  try {
    return window.localStorage.getItem(RECOVERY_KEY(ens))
  } catch {
    return null
  }
}

// Components downstream still expect a `getAuthToken` prop because the demo
// historically forwarded a Privy access token to API routes. The KMS-only
// stack doesn't need one — same-origin requests carry the session cookie
// automatically — so we hand them a constant null-resolver. Removing the
// prop entirely is a separate cleanup pass.
const NO_AUTH_TOKEN = () => Promise.resolve<string | null>(null)

export default function HomePage() {
  return (
    <main className="relative min-h-dvh overflow-hidden bg-background">
      <BackgroundGlow />
      <App />
      <Toaster />
    </main>
  )
}

function App() {
  const { session, hydrated, login, logout, adoptServerSession } = useSession()
  const [demoMode, setDemoMode] = useDemoMode()

  async function handleMint(input: {
    username: string
    smartWalletAddress: string
    cosmicAttestation: string
  }) {
    const res = await fetch("/api/onboarding", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: input.username,
        // No wallet pinned — the server mints a per-twin KMS-managed
        // ETHEREUM key and uses its derived address. No Privy token to
        // forward; auth is now cookie-based.
        stealthMetaAddress: `st:eth:0x${input.cosmicAttestation
          .replace(/[^a-f0-9]/gi, "")
          .padEnd(128, "0")
          .slice(0, 128)}`,
        twinAgentId: input.username,
        useKms: true,
      }),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(text || `mint failed (${res.status})`)
    }
    const data = (await res.json()) as {
      ensName: string
      walletAddress?: string
      kmsKeyId?: string | null
      kmsPublicKey?: string | null
      recoveryCode?: string
    }
    // Persist the recovery code right after mint — this is the artefact
    // the user needs to log back in from a different browser.
    if (data.recoveryCode) {
      persistRecoveryCode(data.ensName, data.recoveryCode)
    }
    // The onboarding route already wrote the session cookie, so mirror it
    // into client state without a second round-trip.
    adoptServerSession({
      ens: data.ensName,
      kmsKeyId: data.kmsKeyId ?? null,
      exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
    })
    return {
      ensName: data.ensName,
      walletAddress: data.walletAddress,
      kmsKeyId: data.kmsKeyId ?? null,
      kmsPublicKey: data.kmsPublicKey ?? null,
      recoveryCode: data.recoveryCode,
    }
  }

  function handleComplete(result: OnboardingResult) {
    toast.success(`${result.ensName} is live`)
    addHistoryEntry({
      kind: "mint",
      status: "success",
      chain: "sepolia",
      summary: `Twin minted: ${result.ensName}`,
      description: `Linked to wallet ${result.smartWalletAddress}`,
      explorerUrl: `https://sepolia.app.ens.domains/${result.ensName}`,
      syncTo: { ens: result.ensName, getAuthToken: NO_AUTH_TOKEN },
    })
  }

  async function handleSignOut() {
    await logout().catch(() => {})
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
                  {session.ens}
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
              onMint={handleMint}
              onComplete={handleComplete}
            />
            <ExistingTwinLogin parentDomain={PARENT_DOMAIN} login={login} />
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
            ensName={session.ens}
            walletAddress={""}
            getAuthToken={NO_AUTH_TOKEN}
          />
        ) : (
          <SignedInTabs session={session} onTwinDeleted={handleSignOut} />
        )}
      </section>
      {session && !demoMode ? (
        <NotificationPanel ensName={session.ens} walletAddress={""} />
      ) : null}
    </>
  )
}

function ExistingTwinLogin({
  parentDomain,
  login,
}: {
  parentDomain: string
  login: (ens: string, recoveryCode?: string) => Promise<Session>
}) {
  const [input, setInput] = useState("")
  const [recovery, setRecovery] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [needsRecovery, setNeedsRecovery] = useState(false)

  async function attemptLogin(ens: string, code: string | null) {
    return login(ens, code ?? undefined)
  }

  async function handle() {
    if (!input.trim()) return
    setBusy(true)
    setError(null)
    try {
      const candidate = input.toLowerCase().trim()
      const ens = candidate.endsWith(`.${parentDomain}`)
        ? candidate
        : `${candidate}.${parentDomain}`

      // Try the persisted recovery code from the same browser first — most
      // users won't ever see the second-factor field.
      const stored = readRecoveryCode(ens)
      const code = recovery.trim() || stored
      try {
        await attemptLogin(ens, code)
        // If the form-typed code worked, persist it so we can auto-fill
        // next time on this browser.
        if (recovery.trim()) {
          persistRecoveryCode(ens, recovery.trim())
        }
        toast.success(`Welcome back, ${ens}`)
        setNeedsRecovery(false)
        setRecovery("")
      } catch (e) {
        const msg = e instanceof Error ? e.message : "login failed"
        // Server says we need a code (either missing or wrong). Surface
        // the second-factor field instead of just printing the error.
        if (
          /recovery code/i.test(msg) ||
          msg.includes("401") ||
          msg.includes("403")
        ) {
          setNeedsRecovery(true)
          setError(
            recovery.trim()
              ? "Recovery code didn't match. Double-check the value you saved at mint."
              : "This twin needs a recovery code. Paste the one shown when you minted it.",
          )
        } else {
          throw e
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "login failed"
      setError(msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="w-full max-w-xl border-border/60 bg-card/70 px-6 py-5">
      <div className="flex flex-col gap-3">
        <div>
          <h3 className="text-base font-semibold">Already have a twin?</h3>
          <p className="text-xs text-muted-foreground">
            Type its ENS name. From this browser the recovery code is auto-filled;
            from a new browser you&apos;ll need to paste the code shown at mint.
          </p>
        </div>
        <div className="flex items-stretch gap-2">
          <div className="flex flex-1 items-stretch overflow-hidden rounded-md border border-border/60 bg-secondary/50">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  handle()
                }
              }}
              placeholder="daniel"
              className="border-0 bg-transparent text-sm focus-visible:ring-0"
              disabled={busy}
            />
            <span className="flex items-center pr-3 font-mono text-xs text-muted-foreground">
              .{parentDomain}
            </span>
          </div>
          <Button onClick={handle} disabled={busy || !input.trim()}>
            <LogIn className="mr-1.5 h-3.5 w-3.5" />
            Log in
          </Button>
        </div>
        {needsRecovery ? (
          <Input
            value={recovery}
            onChange={(e) => setRecovery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                handle()
              }
            }}
            placeholder="Recovery code (paste the value shown at mint)"
            className="font-mono text-xs"
            disabled={busy}
            autoFocus
          />
        ) : null}
        {error ? (
          <p className="text-xs text-destructive">{error}</p>
        ) : null}
      </div>
    </Card>
  )
}

function SignedInTabs({
  session,
  onTwinDeleted,
}: {
  session: Session
  onTwinDeleted?: () => void
}) {
  // The "Send" tab is the stealth flow only — every payment goes via
  // EIP-5564 stealth addresses seeded from Orbitport cTRNG, signed by
  // SpaceComputer KMS. The non-stealth transfer tab was removed.
  const [tab, setTab] = useState<
    "chat" | "voice" | "messenger" | "send" | "history"
  >("chat")
  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      <SegmentedTabs
        value={tab}
        onChange={setTab}
        items={[
          { value: "chat", label: "Chat" },
          { value: "voice", label: "Voice" },
          { value: "messenger", label: "Messages" },
          { value: "send", label: "Send" },
          { value: "history", label: "Activity" },
        ]}
      />
      {tab === "chat" ? (
        <TwinChat
          ensName={session.ens}
          getAuthToken={NO_AUTH_TOKEN}
          onTwinDeleted={onTwinDeleted}
          className="h-[70dvh] w-full border-border/60 bg-card shadow-sm"
        />
      ) : tab === "voice" ? (
        <VoiceTwin
          ensName={session.ens}
          getAuthToken={NO_AUTH_TOKEN}
          onSwitchToChat={() => setTab("chat")}
          className="w-full border-border/60 bg-card shadow-sm"
        />
      ) : tab === "messenger" ? (
        <Messenger
          myEnsName={session.ens}
          getAuthToken={NO_AUTH_TOKEN}
          className="w-full border-border/60 bg-card shadow-sm"
        />
      ) : tab === "send" ? (
        <StealthSend
          myEnsName={session.ens}
          getAuthToken={NO_AUTH_TOKEN}
          className="w-full border-border/60 bg-card shadow-sm"
        />
      ) : (
        <History
          ensName={session.ens}
          walletAddress={""}
          getAuthToken={NO_AUTH_TOKEN}
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
