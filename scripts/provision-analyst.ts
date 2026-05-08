// Provision analyst.ethtwin.eth — the sample sub-agent the Twin can hire.
//
// What it does:
//   1. Mints `analyst.ethtwin.eth` on Sepolia ENS (dev wallet = registry owner)
//   2. Sets all Twin Text Records:
//      - avatar (Pollinations seeded by "analyst")
//      - description, url, twin.persona, twin.capabilities, twin.endpoint,
//        twin.version
//      - ENSIP-25 agent-registration[<ERC-7930 interopAddr>][<agentId>] = "1"
//      - addr record → dev wallet (so payments work; replace post-hackathon)
//   3. Adds entry to on-chain agents.directory on ethtwin.eth
//
// Why a script and not the onboarding flow: onboarding requires a Privy auth
// token, but the analyst is a synthetic peer agent we own. This skips that.
//
// Run: pnpm ens:provision-analyst
// Override label / endpoint / agent id via env:
//   ANALYST_LABEL=analyst
//   ANALYST_AGENT_ID=1
//   ANALYST_ENDPOINT=https://<deploy>/api/agents/analyst

import { getAddress, type Address } from "viem"
import {
  PARENT_DOMAIN,
  getDevWalletClient,
  sepoliaClient,
} from "../lib/viem"
import {
  createSubname,
  readResolver,
  readSubnameOwner,
  readTextRecord,
  readTwinRecords,
  resolveEnsAddress,
  setAddressRecord,
  setTextRecord,
} from "../lib/ens"
import {
  CHAIN_REFERENCE,
  ERC8004_REGISTRY,
  encodeInteropAddress,
} from "../lib/ensip25"
import { addAgentToDirectory } from "../lib/agents"
import { buildDefaultProfileRecords } from "../lib/twin-profile"

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"

const LABEL = process.env.ANALYST_LABEL ?? "analyst"
const AGENT_ID = process.env.ANALYST_AGENT_ID ?? "1"
const FQN = `${LABEL}.${PARENT_DOMAIN}`
const APP_URL =
  process.env.ANALYST_ENDPOINT_BASE ??
  process.env.NEXT_PUBLIC_APP_URL ??
  "http://localhost:3000"
const ENDPOINT = `${APP_URL.replace(/\/$/, "")}/api/agents/analyst`

const PERSONA = JSON.stringify({
  tone: "specialist, terse, source-aware",
  style: "DeFi research analyst — yields, protocols, risk",
})
const CAPABILITIES = JSON.stringify(["research", "defi-analysis"])

async function waitForTx(hash: `0x${string}`) {
  return sepoliaClient.waitForTransactionReceipt({ hash })
}

function logStep(label: string, detail?: unknown) {
  console.log(`OK    ${label}`)
  if (detail !== undefined) console.log(`      →`, detail)
}

async function main() {
  const { account } = getDevWalletClient()
  console.log(`Dev wallet: ${account.address}`)
  console.log(`Provisioning ${FQN} on Sepolia ENS …\n`)

  const parentResolver = await readResolver(PARENT_DOMAIN)
  if (parentResolver === ZERO_ADDRESS) {
    console.error(`FAIL  ${PARENT_DOMAIN} has no resolver set on Sepolia.`)
    process.exit(1)
  }
  logStep(`${PARENT_DOMAIN} resolver`, parentResolver)

  const parentOwner = await readSubnameOwner(PARENT_DOMAIN)
  if (getAddress(parentOwner) !== getAddress(account.address)) {
    console.error(
      `FAIL  ${PARENT_DOMAIN} is owned by ${parentOwner} — dev wallet ${account.address} cannot mint subnames.`,
    )
    process.exit(1)
  }
  logStep(`${PARENT_DOMAIN} owner`, parentOwner)

  // 1. Mint subname (or skip if it exists & is ours).
  const existingOwner = await readSubnameOwner(FQN)
  if (existingOwner === ZERO_ADDRESS) {
    const tx = await createSubname({
      parent: PARENT_DOMAIN,
      label: LABEL,
      owner: account.address,
      resolver: parentResolver as Address,
    })
    console.log(`PEND  createSubname ${FQN}: ${tx}`)
    const receipt = await waitForTx(tx)
    logStep(`createSubname mined`, `block ${receipt.blockNumber}`)
  } else if (getAddress(existingOwner) !== getAddress(account.address)) {
    console.error(
      `FAIL  ${FQN} already owned by ${existingOwner} — refusing to overwrite.`,
    )
    process.exit(1)
  } else {
    logStep(`${FQN} already minted`, existingOwner)
  }

  // 2. addr record → dev wallet (so the analyst can receive payments).
  const existingAddr = await resolveEnsAddress(FQN)
  if (!existingAddr || getAddress(existingAddr) !== getAddress(account.address)) {
    const tx = await setAddressRecord(FQN, account.address)
    await waitForTx(tx)
    logStep(`setAddr ${FQN} → ${account.address}`, tx)
  } else {
    logStep(`addr already set`, existingAddr)
  }

  // 3. ENSIP-25 record key.
  const interop = encodeInteropAddress(
    ERC8004_REGISTRY.baseSepolia,
    CHAIN_REFERENCE.baseSepolia,
  )
  const ensipKey = `agent-registration[${interop}][${AGENT_ID}]`

  // 4. Text records.
  const profile = buildDefaultProfileRecords(LABEL)
  const records: Record<string, string> = {
    ...profile,
    description:
      "DeFi research specialist. Hire me via x402 — I answer yields/risk questions concisely with sources.",
    "twin.persona": PERSONA,
    "twin.capabilities": CAPABILITIES,
    "twin.endpoint": ENDPOINT,
    "twin.version": "0.1.0",
    [ensipKey]: "1",
  }

  for (const [key, value] of Object.entries(records)) {
    const tx = await setTextRecord(FQN, key, value)
    await waitForTx(tx)
    logStep(`setText ${key}`, key === ensipKey ? "1 (ENSIP-25)" : truncate(value))
  }

  // 5. Add to directory (idempotent).
  const directoryTx = await addAgentToDirectory(FQN)
  if (directoryTx) {
    await waitForTx(directoryTx)
    logStep(`agents.directory updated`, directoryTx)
  } else {
    logStep(`agents.directory already includes ${FQN}`)
  }

  // 6. Verify.
  console.log("\nVerifying on-chain state …")
  const [readback, ensipValue] = await Promise.all([
    readTwinRecords(FQN),
    readTextRecord(FQN, ensipKey),
  ])
  console.log(`  ${FQN} records:`, {
    avatar: truncate(readback.avatar),
    description: truncate(readback.description),
    "twin.persona": truncate(readback["twin.persona"]),
    "twin.capabilities": readback["twin.capabilities"],
    "twin.endpoint": readback["twin.endpoint"],
    "twin.version": readback["twin.version"],
    "ENSIP-25 agent-registration": ensipValue ?? "(missing)",
  })
  console.log(`\nDone. Inspect at https://sepolia.app.ens.domains/${FQN}`)
  console.log(`From the Twin: try "find an analyst and hire them to summarise base sepolia yields"`)
}

function truncate(value: string | undefined, max = 80): string {
  if (!value) return ""
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

main().catch((err) => {
  console.error("FAIL", err instanceof Error ? err.message : err)
  process.exit(1)
})
