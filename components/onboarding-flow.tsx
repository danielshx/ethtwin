"use client"

import { useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { CheckCircle2, Copy, Loader2, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { CosmicOrb, useCosmicSeed } from "./cosmic-orb"
import { BountyTrail } from "./bounty-trail"
import { cn } from "@/lib/utils"

export type OnboardingResult = {
  ensName: string
  username: string
  /** The KMS-derived EVM address bound to the twin's ENS `addr` record. */
  smartWalletAddress: `0x${string}` | string
  cosmicAttestation: string
  /** SpaceComputer KMS KeyId for this twin's signing key. */
  kmsKeyId?: string | null
  /** One-time recovery code emitted at mint — required to log in from a new
   *  browser. Stored in localStorage on this device. */
  recoveryCode?: string | null
}

// Retained for backwards compatibility with old call sites; the KMS-only
// flow has no auth methods — the server mints + signs.
export type AuthMethod = "any" | "passkey" | "wallet"

type Step = "intro" | "username" | "cosmic" | "minting" | "done"

type OnboardingFlowProps = {
  parentDomain?: string
  defaultUsername?: string
  onMint: (input: {
    username: string
    smartWalletAddress: `0x${string}` | string
    cosmicAttestation: string
  }) => Promise<{
    ensName: string
    walletAddress?: string
    kmsKeyId?: string | null
    recoveryCode?: string
  }>
  onComplete: (result: OnboardingResult) => void
  className?: string
}

export function OnboardingFlow({
  parentDomain = "ethtwin.eth",
  defaultUsername = "",
  onMint,
  onComplete,
  className,
}: OnboardingFlowProps) {
  const [step, setStep] = useState<Step>("intro")
  const [username, setUsername] = useState(defaultUsername)
  const [error, setError] = useState<string | null>(null)
  // Captured from the mint response so the "done" step can surface it for
  // the user to write down — only handed back to onComplete after they
  // explicitly continue.
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null)
  const [recoveryAcknowledged, setRecoveryAcknowledged] = useState(false)
  // Stash the rest of the mint result so the user-driven "I saved it"
  // continue can fire onComplete without re-minting.
  const mintCtxRef = useRef<{
    ensName: string
    effectiveAddress: string
    kmsKeyId: string | null
    recoveryCode: string | null
  } | null>(null)
  const cosmic = useCosmicSeed()

  async function handleStart() {
    setError(null)
    setStep("username")
  }

  async function handleCosmic() {
    setError(null)

    // Pre-flight: is this username already taken? With KMS-only auth there's
    // no wallet to compare against the existing owner — if the name is
    // taken we just ask for a different one. Re-entry to an existing twin
    // happens via the "Already have a twin?" login on the home page.
    try {
      const res = await fetch(`/api/check-username?u=${encodeURIComponent(username)}`)
      const data = (await res.json()) as {
        ok: boolean
        taken: boolean
        ensName: string
        error?: string
      }
      if (data.ok && data.taken) {
        setError(
          `${data.ensName} is already taken. Pick a different name, or sign in to it from the home page.`,
        )
        return
      }
    } catch {
      // Network blip — fall through and let the mint route surface the
      // canonical error if the name really is taken.
    }

    setStep("cosmic")
    const sample = await cosmic.fetchSeed()
    if (!sample) {
      setError("cosmic seed unavailable — using local entropy")
    }
  }

  async function handleMint() {
    setStep("minting")
    setError(null)
    try {
      // The server mints a KMS-managed key for the new twin and returns its
      // derived EVM address. We pass empty string for smartWalletAddress
      // because the KMS path ignores it — the server is in charge.
      const mintResult = await onMint({
        username,
        smartWalletAddress: "",
        cosmicAttestation: cosmic.sample?.attestation ?? "mock-attestation",
      })
      const effectiveAddress = mintResult.walletAddress ?? null
      if (!effectiveAddress) {
        throw new Error(
          "Mint succeeded but the server didn't return a wallet address — KMS may be misconfigured.",
        )
      }
      const ready = await pollUntilTwinReady(username, effectiveAddress, {
        timeoutMs: 90_000,
        intervalMs: 3_000,
      })
      if (!ready) {
        throw new Error(
          "Mint is taking longer than expected. Sepolia might be congested — try again in a minute.",
        )
      }
      // Capture the recovery code so the "done" step can surface it. We
      // delay onComplete until the user acknowledges they saved it (or
      // skip the gate when no code came back, e.g. legacy server build).
      setRecoveryCode(mintResult.recoveryCode ?? null)
      setStep("done")
      if (!mintResult.recoveryCode) {
        setTimeout(() => {
          onComplete({
            ensName: mintResult.ensName,
            username,
            smartWalletAddress: effectiveAddress,
            cosmicAttestation: cosmic.sample?.attestation ?? "mock-attestation",
            kmsKeyId: mintResult.kmsKeyId ?? null,
            recoveryCode: null,
          })
        }, 900)
      }
      // Stash the rest of the mint result on the closure for the user-driven
      // continue button to use.
      mintCtxRef.current = {
        ensName: mintResult.ensName,
        effectiveAddress,
        kmsKeyId: mintResult.kmsKeyId ?? null,
        recoveryCode: mintResult.recoveryCode ?? null,
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "mint failed")
      setStep("cosmic")
    }
  }

  function continueAfterRecovery() {
    const ctx = mintCtxRef.current
    if (!ctx) return
    setRecoveryAcknowledged(true)
    onComplete({
      ensName: ctx.ensName,
      username,
      smartWalletAddress: ctx.effectiveAddress,
      cosmicAttestation: cosmic.sample?.attestation ?? "mock-attestation",
      kmsKeyId: ctx.kmsKeyId,
      recoveryCode: ctx.recoveryCode,
    })
  }

  return (
    <Card
      className={cn(
        "relative w-full max-w-xl overflow-hidden border-border/60 bg-card/95 p-0 backdrop-blur",
        className,
      )}
    >
      <StepIndicator step={step} />

      <div className="px-8 pb-8 pt-4">
        <AnimatePresence mode="wait">
          {step === "intro" && (
            <StepShell key="intro">
              <h2 className="text-3xl font-semibold tracking-tight">
                Set up your twin
              </h2>
              <p className="text-base text-muted-foreground">
                Your personal assistant for sending money, talking to friends,
                and keeping things private. No seed phrase, no wallet — your
                twin's key lives in space, on a SpaceComputer satellite.
              </p>
              <div className="my-2 grid gap-2.5 text-sm">
                <Bullet>Send money by saying a name out loud</Bullet>
                <Bullet>Private by default — no one sees what you send</Bullet>
                <Bullet>Lives at <span className="font-medium text-foreground">yourname.ethtwin.eth</span></Bullet>
              </div>

              <div className="mt-2 grid gap-3">
                <Button
                  onClick={handleStart}
                  size="lg"
                  className="relative h-14 overflow-hidden rounded-2xl bg-primary text-primary-foreground text-base font-semibold shadow-lg shadow-primary/20 transition hover:shadow-primary/30"
                >
                  <Sparkles className="mr-2 h-4 w-4" /> Mint a new twin
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  Already have a twin? Use the &ldquo;Log in&rdquo; box below.
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
                <div className="flex items-stretch overflow-hidden rounded-md border border-border/60 bg-secondary/50">
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
                <p className="text-[11px] text-muted-foreground">
                  A new SpaceComputer KMS key is minted for your twin on Sepolia.
                </p>
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
                  ENSIP-25 · stealth-meta-address set · KMS-signed
                </Badge>
                <BountyTrail
                  tags={["ens", "ensip25", "kms", "ctrng", "stealth"]}
                  className="justify-center"
                />
                {recoveryCode ? (
                  <div className="mt-2 w-full max-w-md rounded-lg border border-primary/40 bg-primary/5 p-4 text-left">
                    <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
                      <Sparkles className="h-3 w-3" /> Recovery code
                    </div>
                    <p className="mb-2 text-xs text-muted-foreground">
                      Save this somewhere you trust. You&apos;ll need it to log
                      back into <span className="font-mono">{username}.{parentDomain}</span>{" "}
                      from a different browser. We can&apos;t recover it for you
                      — there&apos;s no email, no password reset.
                    </p>
                    <div className="flex items-stretch gap-2">
                      <code className="flex-1 break-all rounded-md border border-border/60 bg-background/60 px-3 py-2 font-mono text-sm">
                        {recoveryCode}
                      </code>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          navigator.clipboard.writeText(recoveryCode).catch(() => {})
                          toast.success("Recovery code copied")
                        }}
                        className="px-3"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <Button
                      type="button"
                      onClick={continueAfterRecovery}
                      disabled={recoveryAcknowledged}
                      size="lg"
                      className="mt-3 w-full"
                    >
                      I saved it — continue
                    </Button>
                  </div>
                ) : null}
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
            i <= idx ? "bg-primary" : "bg-secondary/60",
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

/**
 * Polls /api/check-username until the new twin's addr record on-chain matches
 * the freshly-minted KMS-derived address. Returns true once ready, false on
 * timeout.
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
