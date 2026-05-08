// Mints an OpenAI Realtime ephemeral key (60s TTL) for the browser to open
// a WebRTC peer connection. Frontend must reconnect ~50s in.

export const runtime = "nodejs"

export async function POST() {
  const key = process.env.OPENAI_API_KEY
  if (!key) return Response.json({ error: "OPENAI_API_KEY missing" }, { status: 500 })

  const res = await fetch("https://api.openai.com/v1/realtime/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-realtime-preview",
      voice: "alloy",
    }),
  })

  if (!res.ok) {
    return Response.json(
      { error: `OpenAI Realtime session mint failed: ${res.status}` },
      { status: 500 },
    )
  }

  const data = await res.json()
  return Response.json(data)
}
