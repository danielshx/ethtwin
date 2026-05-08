// Idempotent backfill: walk every agent in the on-chain directory and set
// any default profile records that are currently empty (avatar / description / url).
// Twins that already have these set are skipped. Each missing record is set
// individually via the dev wallet's resolver authority.
//
// Run: pnpm twins:backfill        — applies the changes
//      pnpm twins:backfill -- --dry-run   — only prints what would change

import { sepoliaClient } from "../lib/viem"
import { readAgentDirectory } from "../lib/agents"
import { readTextRecord, setTextRecord } from "../lib/ens"
import { buildDefaultProfileRecords } from "../lib/twin-profile"

const DRY = process.argv.includes("--dry-run")

function logHeader(s: string) {
  console.log(`\n── ${s} ${"─".repeat(Math.max(0, 76 - s.length))}`)
}

async function main() {
  const directory = await readAgentDirectory()
  logHeader("Backfill plan")
  console.log(`  ${directory.length} agents in directory`)
  console.log(`  dry-run: ${DRY}`)

  for (const agent of directory) {
    const label = agent.ens.split(".")[0] ?? agent.ens
    const defaults = buildDefaultProfileRecords(label)

    logHeader(agent.ens)
    let changesForThisAgent = 0
    for (const [key, defaultValue] of Object.entries(defaults)) {
      const existing = await readTextRecord(agent.ens, key).catch(() => null)
      if (existing && existing.length > 0) {
        console.log(`  skip   ${key} (already set)`)
        continue
      }
      console.log(`  set    ${key} = ${truncate(defaultValue)}`)
      if (!DRY) {
        const tx = await setTextRecord(agent.ens, key, defaultValue)
        await sepoliaClient.waitForTransactionReceipt({ hash: tx })
        console.log(`         tx ${tx}`)
      }
      changesForThisAgent++
    }
    if (changesForThisAgent === 0) console.log(`  (no changes needed)`)
  }

  logHeader("Done")
  if (DRY) console.log("  dry-run only — no on-chain changes were made.")
}

function truncate(s: string, max = 64): string {
  return s.length > max ? `${s.slice(0, max)}…` : s
}

main().catch((err) => {
  console.error("FAIL", err instanceof Error ? err.message : err)
  process.exit(1)
})
