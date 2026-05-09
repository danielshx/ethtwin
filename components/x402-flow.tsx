"use client"

// Visualizes the 3-step Twin↔Analyst x402 sequence while `hireAgent` is in flight:
//   1. Twin → x402 request → Analyst   (forward arrow + "$1 USDC" pill)
//   2. Analyst processes                (pulse on analyst node)
//   3. Analyst → answer → Twin          (return arrow)
//
// Two render modes:
//   - state="active"  — running animation while the tool call is streaming
//   - state="done"    — settled snapshot once the answer arrived
//
// Tasteful, not a circus: short fades, single packet on the wire, nothing
// neon. Heavier than a tool-pill, lighter than the cosmic orb.

import { motion } from "framer-motion"
import { ShieldCheck, ShieldAlert } from "lucide-react"
import { AvatarImage } from "@/components/agent-profile"
import { buildAvatarUrl } from "@/lib/twin-profile"
import { displayNameFromEns } from "@/lib/ens"
import { cn } from "@/lib/utils"

type X402FlowProps = {
  fromEns: string
  toEns: string
  verified?: boolean
  state: "active" | "done"
  amount?: string
  className?: string
}

export function X402Flow({
  fromEns,
  toEns,
  verified,
  state,
  amount = "$1 USDC",
  className,
}: X402FlowProps) {
  return (
    <div
      className={cn(
        "ml-5 mt-1 mb-1 rounded-md border border-white/10 bg-black/30 px-3 py-3",
        className,
      )}
    >
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <Node ens={fromEns} role="twin" align="start" />
        <Wire state={state} amount={amount} verified={verified} />
        <Node ens={toEns} role="analyst" align="end" pulse={state === "active"} />
      </div>
    </div>
  )
}

function Node({
  ens,
  role,
  align,
  pulse,
}: {
  ens: string
  role: "twin" | "analyst"
  align: "start" | "end"
  pulse?: boolean
}) {
  const label = ens.split(".")[0] ?? ens
  const { displayName } = displayNameFromEns(ens)
  return (
    <div
      className={cn(
        "flex flex-col gap-1",
        align === "end" ? "items-end text-right" : "items-start text-left",
      )}
    >
      <span className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
        {role}
      </span>
      <div
        className={cn(
          "flex items-center gap-1.5",
          align === "end" ? "flex-row-reverse" : "flex-row",
        )}
      >
        <span className="relative inline-block">
          <AvatarImage src={buildAvatarUrl(label)} ens={ens} size={24} />
          {pulse ? (
            <motion.span
              aria-hidden
              className="absolute inset-0 rounded-full border border-primary/60"
              initial={{ opacity: 0.6, scale: 1 }}
              animate={{ opacity: 0, scale: 1.8 }}
              transition={{
                duration: 1.2,
                repeat: Infinity,
                ease: "easeOut",
              }}
            />
          ) : null}
        </span>
        <div className={cn("flex flex-col leading-tight", align === "end" ? "items-end" : "items-start")}>
          <span className="text-[11px] font-medium text-foreground/90">{displayName}</span>
          <span className="font-mono text-[9px] text-muted-foreground">{ens}</span>
        </div>
      </div>
    </div>
  )
}

function Wire({
  state,
  amount,
  verified,
}: {
  state: "active" | "done"
  amount: string
  verified?: boolean
}) {
  return (
    <div className="relative flex h-12 w-32 flex-col items-center justify-center sm:w-40">
      {/* base track */}
      <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-white/10" />

      {state === "active" ? (
        <>
          {/* outbound packet */}
          <motion.div
            className="absolute top-1/2 -translate-y-1/2"
            initial={{ left: "0%" }}
            animate={{ left: "100%" }}
            transition={{
              duration: 1.4,
              repeat: Infinity,
              ease: "easeInOut",
              repeatType: "loop",
            }}
          >
            <div className="-translate-x-1/2 rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-medium text-primary-foreground shadow-[0_0_10px_rgba(168,85,247,0.5)]">
              {amount}
            </div>
          </motion.div>

          {/* return packet, offset in time */}
          <motion.div
            aria-hidden
            className="absolute top-1/2 h-1 w-1 -translate-y-1/2 rounded-full bg-emerald-300"
            initial={{ left: "100%" }}
            animate={{ left: "0%" }}
            transition={{
              duration: 1.4,
              repeat: Infinity,
              ease: "easeInOut",
              repeatType: "loop",
              delay: 0.7,
            }}
          />
        </>
      ) : (
        <>
          {/* settled state — solid track + pill in the middle */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="relative z-10 inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-medium text-emerald-200"
          >
            {verified ? (
              <ShieldCheck className="h-3 w-3" />
            ) : (
              <ShieldAlert className="h-3 w-3" />
            )}
            paid · {amount}
          </motion.div>
        </>
      )}

      <div className="absolute -bottom-0.5 w-full text-center text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
        x402
      </div>
    </div>
  )
}
