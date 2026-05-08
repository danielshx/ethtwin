// Server-side history store. File-based JSON, one file per agent ENS name.
// Survives logout, syncs across devices, captures both successes and failures.
//
// Storage: <project>/.history/<sanitized-ens>.json
// Structure: { entries: HistoryEntry[] }
// Cap: 100 entries per agent (rolling).
//
// Concurrency: writes are serialized per-file via an in-process mutex. For a
// hackathon demo running on a single Vercel function instance this is fine;
// for multi-region production you'd want a proper KV.

import { promises as fs } from "node:fs"
import path from "node:path"

export type ServerHistoryStatus = "success" | "failed" | "pending"
export type ServerHistoryKind =
  | "transfer"
  | "message"
  | "mint"
  | "stealth-send"
  | "other"

export type ServerHistoryEntry = {
  id: string
  at: number // unix seconds
  kind: ServerHistoryKind
  status: ServerHistoryStatus
  summary: string
  description?: string
  txHash?: string
  explorerUrl?: string
  chain?: string
  errorMessage?: string
}

const ROOT = path.resolve(process.cwd(), ".history")
const MAX_ENTRIES = 100
const locks = new Map<string, Promise<unknown>>()

function fileFor(ens: string): string {
  const safe = ens.toLowerCase().replace(/[^a-z0-9.-]/g, "_")
  return path.join(ROOT, `${safe}.json`)
}

async function ensureRoot() {
  await fs.mkdir(ROOT, { recursive: true })
}

async function readFile(file: string): Promise<ServerHistoryEntry[]> {
  try {
    const raw = await fs.readFile(file, "utf8")
    const parsed = JSON.parse(raw) as { entries?: unknown }
    if (!parsed || !Array.isArray(parsed.entries)) return []
    return parsed.entries as ServerHistoryEntry[]
  } catch {
    return []
  }
}

async function writeFile(file: string, entries: ServerHistoryEntry[]) {
  await ensureRoot()
  await fs.writeFile(file, JSON.stringify({ entries }, null, 2), "utf8")
}

async function withLock<T>(file: string, fn: () => Promise<T>): Promise<T> {
  const prior = locks.get(file) ?? Promise.resolve()
  let release!: () => void
  const next = new Promise<void>((r) => (release = r))
  locks.set(
    file,
    prior.then(() => next),
  )
  try {
    await prior
    return await fn()
  } finally {
    release()
    if (locks.get(file) === next) locks.delete(file)
  }
}

/** Read all entries for an ENS name, newest first. */
export async function readServerHistory(ens: string): Promise<ServerHistoryEntry[]> {
  return readFile(fileFor(ens))
}

/**
 * Append an entry. De-duped by id (txHash usually) so retries don't double-record.
 * Newest-first order is maintained.
 */
export async function appendServerHistory(
  ens: string,
  entry: Omit<ServerHistoryEntry, "id" | "at"> & { id?: string },
): Promise<ServerHistoryEntry> {
  const file = fileFor(ens)
  const id =
    entry.id ??
    entry.txHash ??
    `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const full: ServerHistoryEntry = {
    id,
    at: Math.floor(Date.now() / 1000),
    kind: entry.kind,
    status: entry.status,
    summary: entry.summary,
    ...(entry.description !== undefined && { description: entry.description }),
    ...(entry.txHash !== undefined && { txHash: entry.txHash }),
    ...(entry.explorerUrl !== undefined && { explorerUrl: entry.explorerUrl }),
    ...(entry.chain !== undefined && { chain: entry.chain }),
    ...(entry.errorMessage !== undefined && { errorMessage: entry.errorMessage }),
  }
  await withLock(file, async () => {
    const current = await readFile(file)
    const filtered = current.filter((e) => e.id !== full.id)
    const next = [full, ...filtered].slice(0, MAX_ENTRIES)
    await writeFile(file, next)
  })
  return full
}
