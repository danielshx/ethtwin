"use client"

import { useEffect, useState } from "react"
import { ExternalLink, Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

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
}

type AgentProfileDialogProps = {
  ens: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AgentProfileDialog({ ens, open, onOpenChange }: AgentProfileDialogProps) {
  const [profile, setProfile] = useState<AgentProfile | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !ens) {
      setProfile(null)
      return
    }
    let cancelled = false
    setLoading(true)
    fetch(`/api/agent/${encodeURIComponent(ens)}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        if (data.ok) setProfile(data as AgentProfile)
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-mono text-base">{ens}</DialogTitle>
          {profile?.description ? (
            <DialogDescription className="text-sm">{profile.description}</DialogDescription>
          ) : null}
        </DialogHeader>

        {loading || !profile ? (
          <div className="flex h-48 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
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
  const [errored, setErrored] = useState(false)
  const initial = (ens.split(".")[0] ?? ens).charAt(0).toUpperCase()
  if (!src || errored) {
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
      src={src}
      alt={`${ens} avatar`}
      width={size}
      height={size}
      onError={() => setErrored(true)}
      className={cn("shrink-0 rounded-full object-cover", className)}
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
        <div className="rounded-md border border-white/10 bg-card/40 px-3 py-2 text-xs">
          {Object.entries(parsed).map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <span className="min-w-20 font-mono text-muted-foreground">{k}</span>
              <span className="break-words">{String(v)}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-md border border-white/10 bg-card/40 px-3 py-2 text-xs">{raw}</p>
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
