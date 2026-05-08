"use client"

import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { CheckCircle2, KeyRound, Loader2, Sparkles, Wallet } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { CosmicOrb, useCosmicSeed } from "./cosmic-orb"
import { cn } from "@/lib/utils"

export type OnboardingResult = {
  ensName: string
  username: string
  smartWalletAddress: `0x${string}` | string
  cosmicAttestation: string
}

export type AuthMethod = "any" | "passkey" | "wallet"

type Step = "intro" | "username" | "cosmic" | "minting" | "done"

type OnboardingFlowProps = {
  parentDomain?: string
  defaultUsername?: string
  smartWalletAddress?: `0x${string}` | string | null
  onAuthenticate: (
    method?: AuthMethod,
  ) => Promise<{ smartWalletAddress: `0x${string}` | string } | void> | void
  onMint: (input: {
    username: string
    smartWalletAddress: `0x${string}` | string
    cosmicAttestation: string
  }) => Promise<{ ensName: string }>
  onComplete: (result: OnboardingResult) => void
  isAuthenticated?: boolean
  className?: string
}

export function OnboardingFlow({
  parentDomain = "ethtwin.eth",
  defaultUsername = "",
  smartWalletAddress,
  onAuthenticate,
  onMint,
  onComplete,
  isAuthenticated = false,
  className,
}: OnboardingFlowProps) {
  const [step, setStep] = useState<Step>(
    isAuthenticated ? "username" : "intro",
  )
  const [username, setUsername] = useState(defaultUsername)
  const [error, setError] = useState<string | null>(null)
  const [authBusy, setAuthBusy] = useState(false)
  const [walletAddr, setWalletAddr] = useState<string | null>(
    smartWalletAddress ?? null,
  )
  const cosmic = useCosmicSeed()

  useEffect(() => {
    if (isAuthenticated && step === "intro") setStep("username")
  }, [isAuthenticated, step])

  useEffect(() => {
    if (smartWalletAddress) setWalletAddr(smartWalletAddress)
  }, [smartWalletAddress])

  async function handleAuth(method: AuthMethod = "any") {
    setAuthBusy(true)
    setError(null)
    try {
      const result = await onAuthenticate(method)
      if (result?.smartWalletAddress) setWalletAddr(result.smartWalletAddress)
      setStep("username")
    } catch (e) {
      setError(e instanceof Error ? e.message : "login failed")
    } finally {
      setAuthBusy(false)
    }
  }

  async function handleCosmic() {
    if (!walletAddr) {
      setError("connect a wallet first")
      return
    }
    setError(null)

    // Pre-flight: is this username already taken?
    try {
      const res = await fetch(`/api/check-username?u=${encodeURIComponent(username)}`)
      const data = (await res.json()) as {
        ok: boolean
        taken: boolean
        ownerAddr: string | null
        ensName: string
        error?: string
      }
      if (data.ok && data.taken) {
        const ownerLower = (data.ownerAddr ?? "").toLowerCase()
        const meLower = walletAddr.toLowerCase()
        if (ownerLower && ownerLower === meLower) {
          // Same wallet — skip mint, sign them straight in.
          toast.success(`Welcome back to ${data.ensName}`)
          setStep("done")
          setTimeout(() => {
            onComplete({
              ensName: data.ensName,
              username,
              smartWalletAddress: walletAddr,
              cosmicAttestation: cosmic.sample?.attestation ?? "mock-attestation",
            })
          }, 600)
          return
        }
        // Different wallet — block + error popup.
        const ownerShort = data.ownerAddr ? shortAddr(data.ownerAddr) : "another wallet"
        toast.error(`${data.ensName} is already taken`, {
          description: `Owned by ${ownerShort}. Pick a different username.`,
        })
        setError(`${data.ensName} is already taken by ${ownerShort}. Pick a different name.`)
        return
      }
    } catch {
      // If the check-username route fails, fall through and let the mint route
      // produce the canonical error. We don't want network blips to block onboarding.
    }

    // Free name — proceed with cosmic + mint.
    setStep("cosmic")
    const sample = await cosmic.fetchSeed()
    if (!sample) {
      setError("cosmic seed unavailable — using local entropy")
    }
  }

  async function handleMint() {
    if (!walletAddr) {
      setError("connect a wallet first")
      return
    }
    setStep("minting")
    setError(null)
    try {
      const { ensName } = await onMint({
        username,
        smartWalletAddress: walletAddr,
        cosmicAttestation: cosmic.sample?.attestation ?? "mock-attestation",
      })
      // Server returned within seconds after broadcasting. Poll until the addr
      // record actually lands on-chain (~24-30s on Sepolia).
      const ready = await pollUntilTwinReady(username, walletAddr, {
        timeoutMs: 90_000,
        intervalMs: 3_000,
      })
      if (!ready) {
        throw new Error(
          "Mint is taking longer than expected. Sepolia might be congested — try again in a minute.",
        )
      }
      setStep("done")
      setTimeout(() => {
        onComplete({
          ensName,
          username,
          smartWalletAddress: walletAddr,
          cosmicAttestation: cosmic.sample?.attestation ?? "mock-attestation",
        })
      }, 900)
    } catch (e) {
      setError(e instanceof Error ? e.message : "mint failed")
      setStep("cosmic")
    }
  }

  return (
    <Card
      className={cn(
        "relative w-full max-w-xl overflow-hidden border-white/10 bg-card/80 p-0 backdrop-blur",
        className,
      )}
    >
      <StepIndicator step={step} />

      <div className="px-8 pb-8 pt-4">
        <AnimatePresence mode="wait">
          {step === "intro" && (
            <StepShell key="intro">
              <h2 className="text-2xl font-semibold tracking-tight">
                Spawn your AI twin
              </h2>
              <p className="text-sm text-muted-foreground">
                A long-lived agent that lives in ENS, transacts on your behalf,
                and coordinates with other twins. No seed phrase, no extension.
              </p>
              <div className="my-2 grid gap-2 text-sm">
                <Bullet>Identity lives in ENS — persona + stealth keys + capabilities</Bullet>
                <Bullet>Privacy-first payments via EIP-5564 stealth addresses</Bullet>
                <Bullet>Talks to other twins through on-chain ENS messaging</Bullet>
              </div>

              <div className="mt-2 grid gap-3">
                <Button
                  onClick={() => handleAuth("any")}
                  disabled={authBusy}
                  size="lg"
                  className="relative h-12 overflow-hidden bg-gradient-to-r from-primary to-fuchsia-500 text-primary-foreground shadow-lg shadow-primary/25 transition hover:shadow-primary/40"
                >
                  {authBusy ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Connecting…
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" /> Create new twin agent
                    </>
                  )}
                </Button>

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    onClick={() => handleAuth("passkey")}
                    disabled={authBusy}
                    variant="outline"
                    size="lg"
                    className="h-11 border-white/15 bg-white/5 hover:border-primary/40 hover:bg-primary/10"
                  >
                    <KeyRound className="mr-2 h-4 w-4" /> Sign in with passkey
                  </Button>
                  <Button
                    onClick={() => handleAuth("wallet")}
                    disabled={authBusy}
                    variant="outline"
                    size="lg"
                    className="h-11 border-white/15 bg-white/5 hover:border-primary/40 hover:bg-primary/10"
                  >
                    <Wallet className="mr-2 h-4 w-4" /> Connect wallet
                  </Button>
                </div>

                <p className="text-center font-mono text-[10px] text-muted-foreground">
                  Returning users land back in their existing twin automatically.
                </p>
              </div>
            </StepShell>
          )}

          {step === "username" && (
            <StepShell key="username">
              <h2 className="text-2xl font-semibold tracking-tight">
                Pick your ENS subname
              </h2>
              <p className="text-sm text-muted-foreground">
                Your twin will live at this address. Lowercase letters, numbers, and dashes.
              </p>
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <div className="flex items-stretch overflow-hidden rounded-md border border-white/10 bg-black/20">
                  <Input
                    id="username"
                    autoFocus
                    value={username}
                    onChange={(e) => setUsername(sanitize(e.target.value))}
                    placeholder="daniel"
                    className="border-0 bg-transparent focus-visible:ring-0"
                  />
                  <span className="flex items-center pr-3 text-sm text-muted-foreground">
                    .{parentDomain}
                  </span>
                </div>
                {walletAddr && (
                  <p className="text-xs text-muted-foreground">
                    Wallet:{" "}
                    <span className="font-mono">{shortAddr(walletAddr)}</span>
                  </p>
                )}
              </div>
              <Button
                onClick={handleCosmic}
                size="lg"
                disabled={!isValid(username)}
              >
                Spawn twin →
              </Button>
            </StepShell>
          )}

          {(step === "cosmic" || step === "minting") && (
            <StepShell key="cosmic">
              <div className="flex flex-col items-center gap-6">
                <CosmicOrb phase={cosmic.phase} sample={cosmic.sample} />
                <div className="text-center">
                  <h2 className="text-xl font-semibold">
                    {cosmic.phase === "revealed"
                      ? "Cosmic seed received"
                      : "Pulling entropy from orbit"}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {cosmic.phase === "revealed"
                      ? "This seeds your stealth meta-key — only you can decrypt private payments."
                      : "Orbitport cTRNG → satellite → your twin."}
                  </p>
                </div>
                <Button
                  size="lg"
                  onClick={handleMint}
                  disabled={cosmic.phase !== "revealed" || step === "minting"}
                >
                  {step === "minting" ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Confirming on Sepolia…
                    </>
                  ) : (
                    <>Mint {username}.{parentDomain}</>
                  )}
                </Button>
                {step === "minting" && (
                  <p className="text-center font-mono text-[10px] text-muted-foreground">
                    txs broadcast — waiting for the next Sepolia block (~12-30s)…
                  </p>
                )}
              </div>
            </StepShell>
          )}

          {step === "done" && (
            <StepShell key="done">
              <div className="flex flex-col items-center gap-4 py-4 text-center">
                <motion.div
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 220, damping: 18 }}
                  className="grid h-16 w-16 place-items-center rounded-full bg-primary/20 text-primary"
                >
                  <CheckCircle2 className="h-8 w-8" />
                </motion.div>
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight">
                    {username}.{parentDomain} is live
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Your twin is online and listening. Say hi.
                  </p>
                </div>
                <Badge variant="secondary" className="font-mono text-[10px]">
                  ENSIP-25 · stealth-meta-address set
                </Badge>
              </div>
            </StepShell>
          )}
        </AnimatePresence>

        {error && (
          <p className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
    </Card>
  )
}

function StepShell({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25 }}
      className="flex flex-col gap-4"
    >
      {children}
    </motion.div>
  )
}

function StepIndicator({ step }: { step: Step }) {
  const order: Step[] = ["intro", "username", "cosmic", "done"]
  const idx = step === "minting" ? 2 : order.indexOf(step)
  return (
    <div className="flex items-center gap-1.5 px-8 pt-6">
      {order.map((s, i) => (
        <div
          key={s}
          className={cn(
            "h-1 flex-1 rounded-full transition-colors",
            i <= idx ? "bg-primary" : "bg-white/10",
          )}
        />
      ))}
    </div>
  )
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <span>{children}</span>
    </div>
  )
}

function sanitize(v: string) {
  return v.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 24)
}

function isValid(v: string) {
  return /^[a-z0-9][a-z0-9-]{1,23}$/.test(v)
}

function shortAddr(addr: string) {
  if (!addr) return ""
  if (addr.length < 14) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

/**
 * Polls /api/check-username until the new twin's addr record on-chain matches
 * the user's wallet (= both createSubname and the resolver multicall mined).
 * Returns true once ready, false on timeout.
 */
async function pollUntilTwinReady(
  username: string,
  walletAddr: string,
  opts: { timeoutMs: number; intervalMs: number },
): Promise<boolean> {
  const deadline = Date.now() + opts.timeoutMs
  const targetLower = walletAddr.toLowerCase()
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`/api/check-username?u=${encodeURIComponent(username)}`)
      const data = (await res.json()) as {
        ok: boolean
        taken: boolean
        ownerAddr: string | null
      }
      if (
        data.ok &&
        data.taken &&
        data.ownerAddr &&
        data.ownerAddr.toLowerCase() === targetLower
      ) {
        return true
      }
    } catch {
      // network blip — retry on the next interval
    }
    await new Promise((r) => setTimeout(r, opts.intervalMs))
  }
  return false
}
