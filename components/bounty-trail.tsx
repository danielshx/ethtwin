"use client"

// Compact "Powered by" trail surfacing every bounty integration that ran
// for the action being shown. Used in the onboarding done step, send /
// message success panels, history rows, and the agent profile so sponsors
// can see their tools live during the demo.
//
// Add a new sponsor by extending the BountyTag union + META map below.
// Keep entries small — these chips appear inline next to other UI text,
// not as standalone callouts.

import {
  Coins,
  Eye,
  Globe,
  Satellite,
  ShieldCheck,
  Zap,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

export type BountyTag =
  | "ens"
  | "ensip25"
  | "kms"
  | "stealth"
  | "sourcify"
  | "x402"

type BountyMeta = {
  label: string
  tip: string
  Icon: LucideIcon
  tone: string
}

const META: Record<BountyTag, BountyMeta> = {
  ens: {
    label: "ENS",
    tip:
      "Twin lives at an ENS subname; messages live as text records on a chat sub-subdomain. " +
      "Resolved via the standard ENS Registry on Sepolia.",
    Icon: Globe,
    tone: "text-sky-400",
  },
  ensip25: {
    label: "ENSIP-25",
    tip:
      "Agent identity registered per ENSIP-25 + ERC-8004 IdentityRegistry — " +
      "the agent's chain interop address is published as a text record.",
    Icon: Coins,
    tone: "text-blue-400",
  },
  kms: {
    label: "SpaceComputer KMS",
    tip:
      "Twin's signing key is a satellite-attested ETHEREUM key in SpaceComputer Orbitport KMS. " +
      "Every transaction (mint, message, send) is signed by KMS server-side.",
    Icon: Satellite,
    tone: "text-purple-400",
  },
  stealth: {
    label: "EIP-5564",
    tip:
      "Payment goes to a one-time stealth address derived from the recipient's " +
      "stealth-meta-address — only the recipient can spend it.",
    Icon: Eye,
    tone: "text-fuchsia-400",
  },
  sourcify: {
    label: "Sourcify",
    tip:
      "Calldata decoded against verified contract source from Sourcify before signing. " +
      "Risky approvals get flagged in plain English.",
    Icon: ShieldCheck,
    tone: "text-emerald-400",
  },
  x402: {
    label: "x402",
    tip:
      "Agent-to-agent micropayment — the called agent gates its response with HTTP 402 and " +
      "is paid in USDC per request.",
    Icon: Zap,
    tone: "text-yellow-400",
  },
}

export function BountyTrail({
  tags,
  className,
  showLabel = true,
}: {
  tags: BountyTag[]
  className?: string
  /** "powered by" prefix; turn off when the surrounding text already says it. */
  showLabel?: boolean
}) {
  if (tags.length === 0) return null
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {showLabel ? (
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          powered by
        </span>
      ) : null}
      {tags.map((t) => {
        const m = META[t]
        const Icon = m.Icon
        return (
          <span
            key={t}
            title={m.tip}
            className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-card/70 px-2 py-0.5 text-[10px] font-medium"
          >
            <Icon className={cn("h-3 w-3 shrink-0", m.tone)} />
            <span className="text-foreground/85">{m.label}</span>
          </span>
        )
      })}
    </div>
  )
}

/** Plain-text version for toasts where JSX isn't ideal. */
export function bountyTrailText(tags: BountyTag[]): string {
  if (tags.length === 0) return ""
  return tags.map((t) => META[t].label).join(" · ")
}
