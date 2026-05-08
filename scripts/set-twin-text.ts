import { sepoliaClient } from "../lib/viem"
import { readTextRecord, setTextRecord } from "../lib/ens"

const NAME = process.env.TWIN_NAME ?? "daniel.ethtwin.eth"
const KEY = process.env.TWIN_KEY
const VALUE = process.env.TWIN_VALUE

async function main() {
  if (!KEY || VALUE === undefined) {
    console.error("Usage: TWIN_KEY=<key> TWIN_VALUE=<value> [TWIN_NAME=<name>] pnpm ens:set-text")
    console.error('Example: TWIN_KEY="greeting" TWIN_VALUE="hello elena und rami" pnpm ens:set-text')
    process.exit(1)
  }
  console.log(`Setting text on ${NAME}: ${KEY} = ${JSON.stringify(VALUE)}`)

  const tx = await setTextRecord(NAME, KEY, VALUE)
  console.log(`PEND  tx: ${tx}`)
  await sepoliaClient.waitForTransactionReceipt({ hash: tx })

  const readback = await readTextRecord(NAME, KEY)
  console.log(`OK    ${KEY} → ${JSON.stringify(readback)}`)
}

main().catch((err) => {
  console.error("FAIL", err instanceof Error ? err.message : err)
  process.exit(1)
})
