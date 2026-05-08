import type { TwinTextRecords } from "./ens"

export const DEFAULT_TWIN_PERSONA = {
  tone: "concise, friendly, slightly dry",
  style: "plain English, never crypto-jargon by default",
  expertise: ["onchain navigation", "stealth privacy", "agent coordination"],
}

export function buildSystemPrompt(records: TwinTextRecords | null, ensName: string) {
  let persona = DEFAULT_TWIN_PERSONA
  if (records?.["twin.persona"]) {
    try {
      persona = { ...persona, ...JSON.parse(records["twin.persona"]) }
    } catch {
      // ignore malformed persona
    }
  }
  const capabilities = records?.["twin.capabilities"]
    ? safeParseList(records["twin.capabilities"])
    : ["transact", "research", "stealth_send"]

  return [
    `You are the AI Twin for ${ensName}.`,
    `Persona: ${JSON.stringify(persona)}.`,
    `Capabilities: ${capabilities.join(", ")}.`,
    `Speak in plain English. Translate every blockchain action into something a non-crypto person would understand before asking for confirmation.`,
    `When you need fresh data, call requestDataViaX402. When the user wants to send funds privately, call generatePrivatePaymentAddress. When the user asks another agent to help, call hireAgent and verify ENSIP-25 first.`,
  ].join("\n\n")
}

function safeParseList(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.map(String)
  } catch {
    // fall through
  }
  return raw.split(",").map((s) => s.trim()).filter(Boolean)
}
