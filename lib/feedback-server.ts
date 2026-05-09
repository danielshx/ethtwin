// Action feedback store. Fair V0 for agent/twin learning:
// - Reviews are scoped to an existing action id (usually history entry id / txHash).
// - One review per reviewer ENS per action id; later votes replace earlier ones.
// - Stored server-side as JSON for hackathon demo durability.
//
// Production note: replace this file-based store with KV/DB and signed reviews
// where signerAddress == addr(reviewerEns).

import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"

export type FeedbackRating = "up" | "down"

export type ActionFeedback = {
  id: string
  actionId: string
  reviewerEns: string
  targetEns?: string
  rating: FeedbackRating
  reason?: string
  createdAt: number
  updatedAt: number
}

export type FeedbackSummary = {
  actionId?: string
  targetEns?: string
  up: number
  down: number
  total: number
  score: number
}

// Vercel's deployment bundle is read-only. `/tmp` is writable during a
// function instance lifetime, which is enough for hackathon demo feedback.
// Override with ETHTWIN_DATA_DIR when running a persistent server.
const DATA_ROOT = process.env.ETHTWIN_DATA_DIR ?? path.join(os.tmpdir(), "ethtwin")
const ROOT = path.join(DATA_ROOT, ".feedback")
const FEEDBACK_FILE = path.join(ROOT, "action-feedback.json")
const locks = new Map<string, Promise<unknown>>()

async function ensureRoot() {
  await fs.mkdir(ROOT, { recursive: true })
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

async function readAll(): Promise<ActionFeedback[]> {
  try {
    const raw = await fs.readFile(FEEDBACK_FILE, "utf8")
    const parsed = JSON.parse(raw) as { feedback?: unknown }
    if (!parsed || !Array.isArray(parsed.feedback)) return []
    return parsed.feedback as ActionFeedback[]
  } catch {
    return []
  }
}

async function writeAll(feedback: ActionFeedback[]) {
  await ensureRoot()
  await fs.writeFile(FEEDBACK_FILE, JSON.stringify({ feedback }, null, 2), "utf8")
}

function keyFor(reviewerEns: string, actionId: string) {
  return `${reviewerEns.toLowerCase()}::${actionId}`
}

export async function upsertActionFeedback(args: {
  reviewerEns: string
  actionId: string
  rating: FeedbackRating
  targetEns?: string
  reason?: string
}): Promise<ActionFeedback> {
  return withLock(FEEDBACK_FILE, async () => {
    const all = await readAll()
    const id = keyFor(args.reviewerEns, args.actionId)
    const now = Math.floor(Date.now() / 1000)
    const existing = all.find((f) => f.id === id)
    const next: ActionFeedback = {
      id,
      actionId: args.actionId,
      reviewerEns: args.reviewerEns,
      ...(args.targetEns !== undefined && { targetEns: args.targetEns }),
      rating: args.rating,
      ...(args.reason !== undefined && { reason: args.reason }),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    const merged = [next, ...all.filter((f) => f.id !== id)]
    await writeAll(merged)
    return next
  })
}

export async function readFeedbackForAction(actionId: string): Promise<ActionFeedback[]> {
  const all = await readAll()
  return all.filter((f) => f.actionId === actionId)
}

export async function readFeedbackByReviewer(reviewerEns: string): Promise<ActionFeedback[]> {
  const all = await readAll()
  return all.filter((f) => f.reviewerEns.toLowerCase() === reviewerEns.toLowerCase())
}

export async function summarizeActionFeedback(actionId: string): Promise<FeedbackSummary> {
  const feedback = await readFeedbackForAction(actionId)
  const up = feedback.filter((f) => f.rating === "up").length
  const down = feedback.filter((f) => f.rating === "down").length
  return {
    actionId,
    up,
    down,
    total: feedback.length,
    score: up - 2 * down,
  }
}

export async function summarizeTargetFeedback(targetEns: string): Promise<FeedbackSummary> {
  const all = await readAll()
  const feedback = all.filter(
    (f) => f.targetEns?.toLowerCase() === targetEns.toLowerCase(),
  )
  const up = feedback.filter((f) => f.rating === "up").length
  const down = feedback.filter((f) => f.rating === "down").length
  return {
    targetEns,
    up,
    down,
    total: feedback.length,
    score: up - 2 * down,
  }
}
