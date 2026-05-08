import { getAddress } from "viem"
import { PARENT_DOMAIN } from "../lib/viem"
import {
  readTwinRecords,
  readTextRecord,
  resolveEnsAddress,
  reverseResolve,
  readResolver,
  readSubnameOwner,
  withEnsName,
  shortenAddress,
} from "../lib/ens"

const LABEL = process.env.TWIN_LABEL ?? "daniel"
const FQN = `${LABEL}.${PARENT_DOMAIN}`

function pretty(label: string, value: unknown) {
  console.log(`  ${label.padEnd(28)} ${JSON.stringify(value)}`)
}

async function main() {
  console.log(`Reading ${FQN} from Sepolia ENS...\n`)

  // Forward resolution
  const addr = await resolveEnsAddress(FQN)
  console.log("Forward resolution")
  pretty("getEnsAddress(name)", addr)

  // Registry-level ownership / resolver
  const [owner, resolver] = await Promise.all([
    readSubnameOwner(FQN),
    readResolver(FQN),
  ])
  console.log("\nRegistry record")
  pretty("owner", owner)
  pretty("resolver", resolver)

  // All known twin text records in one shot (parallel)
  const records = await readTwinRecords(FQN)
  console.log("\nText records (readTwinRecords)")
  for (const [k, v] of Object.entries(records)) pretty(k, v)

  // One-off text record — same path your agent will hit per-key
  const persona = await readTextRecord(FQN, "twin.persona")
  console.log("\nSingle-key read (readTextRecord)")
  pretty("twin.persona", persona)

  // Reverse-resolution helpers
  if (addr) {
    const checksummed = getAddress(addr)
    const [reverseName, friendly] = await Promise.all([
      reverseResolve(checksummed),
      withEnsName(checksummed),
    ])
    console.log("\nReverse resolution")
    pretty("reverseResolve(addr)", reverseName)
    pretty("withEnsName(addr)", friendly)
    pretty("shortenAddress(addr)", shortenAddress(checksummed))
  } else {
    console.log("\n(no addr record set — skipping reverse helpers)")
  }
}

main().catch((err) => {
  console.error("FAIL", err instanceof Error ? err.message : err)
  process.exit(1)
})
