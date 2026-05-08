import { generateText } from "ai"
import { anthropic } from "@ai-sdk/anthropic"

const r = await generateText({
  model: anthropic("claude-sonnet-4-6"),
  prompt: "Say 'Twin online' if you can read this.",
})
console.log(r.text)
