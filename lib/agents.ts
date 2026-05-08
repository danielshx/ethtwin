// On-chain agent directory.
// Stored as a JSON array in the `agents.directory` text record on the parent
// (ethtwin.eth). Each entry: { ens, addedAt }. Read by anyone, written by the
// dev wallet (which owns the parent).
//
// Creative ENS use: discovery is fully on-chain — the messenger pulls this list
// to populate its sidebar, and any wallet on Sepolia can read it via standard
// ENS text-record resolution.

import { PARENT_DOMAIN } from "./viem"
import { readTextRecord, setTextRecord } from "./ens"
import type { Hash } from "viem"

const DIRECTORY_KEY = "agents.directory"
const MAX_ENTRIES = 100 // text records are size-bounded; cap for safety

export type AgentEntry = {
  ens: string
  addedAt: number // unix seconds
}

/** Read the on-chain agent directory. Returns [] if empty/missing. */
export async function readAgentDirectory(): Promise<AgentEntry[]> {
  try {
    const raw = await readTextRecord(PARENT_DOMAIN, DIRECTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (e): e is AgentEntry =>
        typeof e === "object" &&
        e !== null &&
        typeof (e as AgentEntry).ens === "string" &&
        typeof (e as AgentEntry).addedAt === "number",
    )
  } catch {
    return []
  }
}

/**
 * Add an agent to the directory. Idempotent — if the ENS is already present,
 * returns null (no tx). Otherwise appends and writes the updated record.
 */
export async function addAgentToDirectory(ens: string): Promise<Hash | null> {
  const current = await readAgentDirectory()
  if (current.some((e) => e.ens.toLowerCase() === ens.toLowerCase())) {
    return null
  }
  const next: AgentEntry[] = [
    ...current,
    { ens, addedAt: Math.floor(Date.now() / 1000) },
  ].slice(-MAX_ENTRIES)
  return setTextRecord(PARENT_DOMAIN, DIRECTORY_KEY, JSON.stringify(next))
}
