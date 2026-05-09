import { z } from "zod"
import { verifyAuthToken } from "@/lib/privy-server"
import { jsonError, parseJsonBody } from "@/lib/api-guard"
import {
  readFeedbackForAction,
  summarizeActionFeedback,
  summarizeTargetFeedback,
  upsertActionFeedback,
} from "@/lib/feedback-server"
import { readServerHistory } from "@/lib/history-server"

export const runtime = "nodejs"

// GET /api/feedback?actionId=<id>
// GET /api/feedback?target=<ens>
export async function GET(req: Request) {
  const url = new URL(req.url)
  const actionId = url.searchParams.get("actionId")
  const target = url.searchParams.get("target")

  try {
    if (actionId) {
      const feedback = await readFeedbackForAction(actionId)
      const summary = await summarizeActionFeedback(actionId)
      return Response.json({ ok: true, actionId, feedback, summary })
    }

    if (target) {
      const summary = await summarizeTargetFeedback(target)
      return Response.json({ ok: true, target, summary })
    }

    return jsonError("Provide ?actionId=<id> or ?target=<ens>", 400)
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Failed to read feedback",
      502,
    )
  }
}

const postBodySchema = z.object({
  privyToken: z.string().min(1),
  reviewerEns: z.string().min(1),
  actionId: z.string().min(1),
  rating: z.enum(["up", "down"]),
  targetEns: z.string().optional(),
  reason: z.string().max(500).optional(),
})

export async function POST(req: Request) {
  const parsed = await parseJsonBody(req, postBodySchema)
  if (!parsed.ok) return parsed.response
  const body = parsed.data

  try {
    await verifyAuthToken(body.privyToken)
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Privy token verification failed",
      401,
    )
  }

  // Fairness guard:
  // reviewer may only review actions that actually exist in their history.
  try {
    const history = await readServerHistory(body.reviewerEns)
    const exists = history.some((e) => e.id === body.actionId)
    if (!exists) {
      return jsonError(
        `Action ${body.actionId} does not exist in ${body.reviewerEns} history`,
        400,
      )
    }
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Failed to validate action",
      502,
    )
  }

  try {
    const feedback = await upsertActionFeedback({
      reviewerEns: body.reviewerEns,
      actionId: body.actionId,
      rating: body.rating,
      targetEns: body.targetEns,
      reason: body.reason,
    })

    const summary = await summarizeActionFeedback(body.actionId)

    return Response.json({
      ok: true,
      feedback,
      summary,
    })
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Failed to write feedback",
      502,
    )
  }
}
