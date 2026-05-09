"use client"

import { useEffect, useState } from "react"
import { Check, ExternalLink, Loader2, Pencil, Trash2, X } from "lucide-react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { addHistoryEntry } from "@/lib/history"
import { displayNameFromEns } from "@/lib/ens"
import { buildAvatarUrl } from "@/lib/twin-profile"
import { cn } from "@/lib/utils"
import { BountyTrail, type BountyTag } from "@/components/bounty-trail"

type AgentProfile = {
  ens: string
  addr: string | null
  avatar: string | null
  description: string | null
  url: string | null
  persona: string | null
  capabilities: string | null
  endpoint: string | null
  stealthMeta: string | null
  version: string | null
  /** SpaceComputer KMS keyId — present when the twin's signing key is
   *  satellite-attested. Read from the `twin.kms-key-id` text record. */
  kmsKeyId?: string | null
}

type AgentProfileDialogProps = {
  ens: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** When true, the dialog renders an Edit button so the viewer can update
   *  avatar + description on-chain via /api/profile. Pass true only when the
   *  dialog is showing the *viewer's own* twin. */
  editable?: boolean
  getAuthToken?: () => Promise<string | null>
  /** Optional callback fired after the user successfully deletes their twin.
   *  The hosting app should sign-out / drop the session so the user is
   *  re-routed to onboarding. */
  onDeleted?: () => void
}

export function AgentProfileDialog({
  ens,
  open,
  onOpenChange,
  editable,
  getAuthToken,
  onDeleted,
}: AgentProfileDialogProps) {
  const [profile, setProfile] = useState<AgentProfile | null>(null)
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draftAvatar, setDraftAvatar] = useState("")
  const [draftDescription, setDraftDescription] = useState("")
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!open || !ens) {
      setProfile(null)
      setEditing(false)
      return
    }
    let cancelled = false
    setLoading(true)
    fetch(`/api/agent/${encodeURIComponent(ens)}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        if (data.ok) {
          setProfile(data as AgentProfile)
          setDraftAvatar(data.avatar ?? "")
          setDraftDescription(data.description ?? "")
        }
      })
      .catch(() => {
        // best-effort — UI shows a fallback
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, ens])

  async function handleSave() {
    if (!ens) return
    const trimmedAvatar = draftAvatar.trim()
    const trimmedDesc = draftDescription.trim()
    const avatarChanged = trimmedAvatar !== (profile?.avatar ?? "")
    const descChanged = trimmedDesc !== (profile?.description ?? "")
    if (!avatarChanged && !descChanged) {
      setEditing(false)
      return
    }
    setSaving(true)
    try {
      // Same relaxed-auth pattern as handleDelete / onboarding.
      const token = (await getAuthToken?.().catch(() => null)) ?? null
      const payload: {
        privyToken: string | null
        ens: string
        avatar?: string
        description?: string
      } = {
        privyToken: token,
        ens,
      }
      if (avatarChanged) payload.avatar = trimmedAvatar
      if (descChanged) payload.description = trimmedDesc

      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const ct = res.headers.get("content-type") ?? ""
      if (!ct.includes("application/json")) {
        const text = await res.text()
        toast.error(
          res.status === 504
            ? "Vercel timed out — your update may still land. Refresh in ~30s."
            : `Server error ${res.status}: ${text.slice(0, 120)}`,
        )
        return
      }
      const data = (await res.json()) as {
        ok: boolean
        error?: string
        txHash?: string
        blockExplorerUrl?: string
      }
      if (!data.ok) {
        toast.error(data.error ?? "Profile update failed")
        return
      }

      const summaryBits: string[] = []
      if (avatarChanged) summaryBits.push("avatar")
      if (descChanged) summaryBits.push("bio")
      toast.success(`Updated ${summaryBits.join(" + ")} on-chain`, {
        description: data.blockExplorerUrl,
      })
      addHistoryEntry({
        kind: "other",
        status: "success",
        chain: "sepolia",
        summary: `Updated ${summaryBits.join(" + ")} on ${ens}`,
        description: "ENS text records on Sepolia",
        txHash: data.txHash,
        explorerUrl: data.blockExplorerUrl,
        ...(getAuthToken ? { syncTo: { ens, getAuthToken } } : {}),
      })
      // Optimistic local update so the dialog shows the new values immediately;
      // the on-chain copy will catch up on next reload.
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              avatar: avatarChanged ? trimmedAvatar : prev.avatar,
              description: descChanged ? trimmedDesc : prev.description,
            }
          : prev,
      )
      setEditing(false)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Profile update failed"
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  function resetDrafts() {
    if (!profile) return
    setDraftAvatar(profile.avatar ?? "")
    setDraftDescription(profile.description ?? "")
  }

  async function handleDelete() {
    if (!ens) return
    const confirmed = confirm(
      `Delete ${ens} forever?\n\nThis wipes the on-chain ENS subdomain (addr + every text record) and removes it from the directory. The action is irreversible.`,
    )
    if (!confirmed) return
    setDeleting(true)
    try {
      // Privy access token is best-effort — email-only / fresh wallet sessions
      // may not have one yet. The server treats it as optional.
      const token = (await getAuthToken?.().catch(() => null)) ?? null
      const res = await fetch("/api/profile/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ privyToken: token, ens }),
      })
      const ct = res.headers.get("content-type") ?? ""
      if (!ct.includes("application/json")) {
        const text = await res.text()
        toast.error(
          res.status === 504
            ? "Vercel timed out — the delete may still land. Refresh in ~30s."
            : `Server error ${res.status}: ${text.slice(0, 120)}`,
        )
        return
      }
      const data = (await res.json()) as {
        ok: boolean
        error?: string
        txHash?: string
        blockExplorerUrl?: string
      }
      if (!data.ok) {
        toast.error(data.error ?? "Delete failed")
        return
      }
      toast.success(`${ens} deleted on-chain`, {
        description: data.blockExplorerUrl,
      })
      addHistoryEntry({
        kind: "other",
        status: "success",
        chain: "sepolia",
        summary: `Deleted twin: ${ens}`,
        description: "Cleared ENS subdomain records + orphaned in registry",
        txHash: data.txHash,
        explorerUrl: data.blockExplorerUrl,
        ...(getAuthToken ? { syncTo: { ens, getAuthToken } } : {}),
      })
      onOpenChange(false)
      onDeleted?.()
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Delete failed"
      toast.error(msg)
    } finally {
      setDeleting(false)
    }
  }

  function suggestRandomAvatar() {
    if (!ens) return
    const label = ens.split(".")[0] ?? ens
    // Append a random component so Pollinations regenerates a different image
    // for the same label. Seed differs → image differs.
    const variant = `${label}-${Math.floor(Math.random() * 9_000) + 1_000}`
    setDraftAvatar(buildAvatarUrl(variant))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-lg">
                {ens ? displayNameFromEns(ens).displayName : "Agent"}
              </DialogTitle>
              <DialogDescription className="font-mono text-xs text-muted-foreground">
                {ens}
              </DialogDescription>
            </div>
            {editable && !editing && profile ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditing(true)}
                className="h-7 gap-1 px-2 text-[11px]"
              >
                <Pencil className="h-3 w-3" />
                Edit
              </Button>
            ) : null}
          </div>
          {profile?.description && !editing ? (
            <p className="pt-2 text-sm">{profile.description}</p>
          ) : null}
        </DialogHeader>

        {loading || !profile ? (
          <div className="flex h-48 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : editing ? (
          <div className="grid gap-4">
            <div className="flex items-center gap-4">
              <AvatarImage
                src={draftAvatar.trim() || null}
                ens={profile.ens}
                size={88}
              />
              <div className="flex flex-1 flex-col gap-1.5">
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Avatar URL
                </label>
                <Input
                  value={draftAvatar}
                  onChange={(e) => setDraftAvatar(e.target.value)}
                  placeholder="https://…/avatar.png"
                  className="font-mono text-xs"
                  disabled={saving}
                />
                <button
                  type="button"
                  onClick={suggestRandomAvatar}
                  disabled={saving}
                  className="self-start text-[10px] text-primary/80 hover:text-primary hover:underline"
                >
                  ✨ regenerate avatar
                </button>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground">
                Bio
              </label>
              <textarea
                value={draftDescription}
                onChange={(e) => setDraftDescription(e.target.value)}
                placeholder="One-line bio for your twin"
                disabled={saving}
                maxLength={280}
                rows={3}
                className="w-full resize-none rounded-md border border-border/60 bg-background/60 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 disabled:opacity-50"
              />
              <div className="mt-1 text-right font-mono text-[10px] text-muted-foreground">
                {draftDescription.length}/280
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDelete}
                disabled={saving || deleting}
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                {deleting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Deleting on-chain…
                  </>
                ) : (
                  <>
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete twin
                  </>
                )}
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    resetDrafts()
                    setEditing(false)
                  }}
                  disabled={saving || deleting}
                >
                  <X className="h-3.5 w-3.5" />
                  Cancel
                </Button>
                <Button size="sm" onClick={handleSave} disabled={saving || deleting}>
                  {saving ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Writing on-chain…
                    </>
                  ) : (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      Save on ENS
                    </>
                  )}
                </Button>
              </div>
            </div>
            <p className="font-mono text-[10px] text-muted-foreground">
              Stored on Sepolia ENS as <span className="text-foreground/80">avatar</span> +{" "}
              <span className="text-foreground/80">description</span> text records · ~24s to land.
              Deleting wipes every record + orphans the subname on-chain.
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            <div className="flex items-center gap-4">
              <AvatarImage src={profile.avatar} ens={profile.ens} size={88} />
              <div className="flex flex-col gap-2">
                {profile.addr ? (
                  <Field label="addr" mono>
                    {shortAddr(profile.addr)}
                  </Field>
                ) : null}
                {profile.version ? (
                  <Field label="twin version" mono>
                    {profile.version}
                  </Field>
                ) : null}
              </div>
            </div>

            {profile.capabilities ? (
              <div>
                <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                  Capabilities
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {parseList(profile.capabilities).map((c) => (
                    <Badge key={c} variant="secondary" className="font-mono text-[10px]">
                      {c}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}

            {profile.persona ? (
              <PersonaBlock raw={profile.persona} />
            ) : null}

            {profile.stealthMeta ? (
              <Field label="stealth meta-key" mono breakAll>
                {profile.stealthMeta.slice(0, 24)}…{profile.stealthMeta.slice(-8)}
              </Field>
            ) : null}

            {profile.kmsKeyId ? (
              <Field label="SpaceComputer KMS keyId" mono breakAll>
                {profile.kmsKeyId}
              </Field>
            ) : null}

            {/* Recovery code — visible ONLY in the browser that minted the
             *  twin (where it's persisted in localStorage). Other viewers
             *  see nothing. Editable=true is also a guard so this never
             *  appears when looking at someone else's profile. */}
            {editable ? <OwnRecoveryCodePanel ens={profile.ens} /> : null}

            <BountyTrail
              tags={
                [
                  "ens",
                  "ensip25",
                  ...(profile.kmsKeyId ? (["kms"] as const) : []),
                  ...(profile.stealthMeta ? (["stealth"] as const) : []),
                ] as BountyTag[]
              }
              className="pt-1"
            />

            {profile.url ? (
              <a
                href={profile.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                {profile.url} <ExternalLink className="h-3 w-3" />
              </a>
            ) : null}

            <a
              href={`https://sepolia.app.ens.domains/${profile.ens}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[10px] font-mono text-muted-foreground hover:text-primary"
            >
              View on Sepolia ENS app <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function AvatarImage({
  src,
  ens,
  size = 32,
  className,
}: {
  src: string | null | undefined
  ens: string
  size?: number
  className?: string
}) {
  const label = ens.split(".")[0] ?? ens
  const fallbackUrl = buildAvatarUrl(label)
  // Three-step fallback so every chat row in the messenger always has a face:
  //   0 → on-chain ENS avatar (whatever the twin set)
  //   1 → deterministic DiceBear from the ENS label (matches what onboarding
  //       writes for fresh twins, and rescues older twins whose stored URL
  //       (e.g. stale Pollinations) no longer resolves)
  //   2 → initial-letter circle (only if even DiceBear's CDN dies)
  const [attempt, setAttempt] = useState<0 | 1 | 2>(src ? 0 : 1)
  const candidate = attempt === 0 ? src : attempt === 1 ? fallbackUrl : null
  const initial = label.charAt(0).toUpperCase()
  if (!candidate) {
    return (
      <span
        className={cn(
          "inline-grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary/40 to-fuchsia-500/40 font-mono text-xs font-semibold text-primary-foreground",
          className,
        )}
        style={{ width: size, height: size }}
        aria-label={`${ens} avatar`}
      >
        {initial}
      </span>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={candidate}
      alt={`${ens} avatar`}
      width={size}
      height={size}
      onError={() => setAttempt((prev) => (prev < 2 ? ((prev + 1) as 0 | 1 | 2) : 2))}
      className={cn("shrink-0 rounded-full bg-card object-cover", className)}
      style={{ width: size, height: size }}
    />
  )
}

function PersonaBlock({ raw }: { raw: string }) {
  let parsed: Record<string, unknown> | null = null
  try {
    const v = JSON.parse(raw)
    if (typeof v === "object" && v !== null) parsed = v as Record<string, unknown>
  } catch {
    // keep raw
  }
  return (
    <div>
      <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        Persona
      </div>
      {parsed ? (
        <div className="rounded-md border border-border/60 bg-card/40 px-3 py-2 text-xs">
          {Object.entries(parsed).map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <span className="min-w-20 font-mono text-muted-foreground">{k}</span>
              <span className="break-words">{String(v)}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-md border border-border/60 bg-card/40 px-3 py-2 text-xs">{raw}</p>
      )}
    </div>
  )
}

function Field({
  label,
  children,
  mono,
  breakAll,
}: {
  label: string
  children: React.ReactNode
  mono?: boolean
  breakAll?: boolean
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "text-xs",
          mono && "font-mono",
          breakAll && "break-all",
        )}
      >
        {children}
      </div>
    </div>
  )
}

function parseList(raw: string): string[] {
  try {
    const v = JSON.parse(raw)
    if (Array.isArray(v)) return v.map(String)
  } catch {
    // fall through
  }
  return raw.split(",").map((s) => s.trim()).filter(Boolean)
}

function shortAddr(a: string): string {
  if (a.length < 12) return a
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}

/**
 * Reveals the SpaceComputer KMS recovery code for the user's own twin
 * iff it's persisted in this browser's localStorage. Other browsers /
 * other users see nothing — the code is only ever stored client-side.
 */
function OwnRecoveryCodePanel({ ens }: { ens: string }) {
  const [code, setCode] = useState<string | null>(null)
  const [revealed, setRevealed] = useState(false)
  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      const raw = window.localStorage.getItem(
        `ethtwin.recovery.${ens.toLowerCase()}`,
      )
      setCode(raw ?? null)
    } catch {
      setCode(null)
    }
  }, [ens])

  return (
    <div className="rounded-md border border-purple-500/30 bg-purple-500/5 p-3 text-left">
      <div className="mb-1 text-[10px] uppercase tracking-wider text-purple-300">
        Your KMS recovery code
      </div>
      {code ? (
        <>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Required to log into <span className="font-mono">{ens}</span> from
            another browser. Treat it like a password — anyone with it can sign
            in as you.
          </p>
          <div className="mt-2 flex items-stretch gap-2">
            <code
              className={cn(
                "flex-1 break-all rounded-md border border-border/60 bg-background/60 px-3 py-2 font-mono text-sm",
                revealed ? "" : "select-none text-transparent",
              )}
              style={
                revealed
                  ? undefined
                  : { textShadow: "0 0 12px rgba(255,255,255,0.5)" }
              }
            >
              {revealed ? code : "•".repeat(Math.min(code.length, 22))}
            </code>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setRevealed((v) => !v)}
              className="px-3"
            >
              {revealed ? "Hide" : "Reveal"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(code).catch(() => {})
                toast.success("Recovery code copied")
              }}
              className="px-3"
            >
              Copy
            </Button>
          </div>
        </>
      ) : (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Not in this browser. The recovery code was shown once at mint and
          stored in localStorage; if you cleared site data or you minted from a
          different browser, it&apos;s no longer recoverable here.
        </p>
      )}
    </div>
  )
}
