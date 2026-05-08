import { warmCache } from "../lib/cosmic"

await warmCache(10)
console.log("cosmic cache warmed: 10 fresh samples ready")
