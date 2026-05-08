import { readAgentDirectory } from "@/lib/agents"
import { jsonError } from "@/lib/api-guard"

export const runtime = "nodejs"

export async function GET() {
  try {
    const agents = await readAgentDirectory()
    return Response.json({ ok: true, agents })
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Failed to read agent directory",
      502,
    )
  }
}
