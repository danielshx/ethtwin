// Seed Maria + Tom for the live demo (T1-22).
//
// Mints two twin subnames under the parent, sets their addr record, all
// default text records, ENSIP-25 agent registration, and a fresh stealth-
// meta-address so they can receive private payments. Backfills the
// agents.directory text record at the end.
//
// Usage:
//   pnpm twins:seed-demo
//
// Requires:
//   - Sepolia ETH on the dev wallet (≈0.01 ETH covers all txs comfortably).
//   - Dev wallet must own the parent ENS (ethtwin.eth).

import { encodeFunctionData, getAddress, namehash } from "viem"
import { type Address } from "viem"
import { sepolia } from "viem/chains"
import { sepoliaClient, getDevWalletClient, PARENT_DOMAIN } from "../lib/viem"
import {
  ENS_REGISTRY,
  createSubname,
  readSubnameOwner,
  readResolver,
  setAddressRecord,
  setTextRecord,
} from "../lib/ens"
import { ensResolverAbi } from "../lib/abis"
import { encodeInteropAddress, ERC8004_REGISTRY, CHAIN_REFERENCE } from "../lib/ensip25"
import { generateStealthMetaKeys } from "../lib/stealth"
import { buildAvatarUrl } from "../lib/twin-profile"
import { addAgentToDirectory, readAgentDirectory } from "../lib/agents"

type DemoTwin = {
  label: string
  description: string
  persona: string
  capabilities: string[]
}

const TWINS: DemoTwin[] = [
  {
    label: "maria",
    description:
      "Maria, 67, Stuttgart. New to crypto — her twin handles the hard parts.",
    persona: JSON.stringify({
      tone: "warm, curious, asks questions in plain language",
      style: "no jargon, sentences a 7-year-old could follow",
      relationship: "grandmother of tom",
    }),
    capabilities: ["transact", "stealth_send", "voice_assist"],
  },
  {
    label: "tom",
    description:
      "Tom, 24, Berlin. Maria's grandson — receives money from her, sends thanks.",
    persona: JSON.stringify({
      tone: "friendly, brief, slightly emoji-y",
      style: "casual english",
      relationship: "grandson of maria",
    }),
    capabilities: ["transact", "stealth_send"],
  },
]

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://ethtwin-woad.vercel.app"

function logStep(label: string, value?: unknown) {
  if (value === undefined) console.log(`OK    ${label}`)
  else console.log(`OK    ${label}\n      →`, value)
}

async function waitFor(hash: `0x${string}`) {
  return sepoliaClient.waitForTransactionReceipt({ hash })
}

async function ensureSubname(label: string, ownerWallet: Address, resolver: Address) {
  const fqn = `${label}.${PARENT_DOMAIN}`
  const existing = await readSubnameOwner(fqn)
  if (existing !== "0x0000000000000000000000000000000000000000") {
    logStep(`${fqn} already exists`, existing)
    return
  }
  const tx = await createSubname({
    parent: PARENT_DOMAIN,
    label,
    owner: ownerWallet,
    resolver,
  })
  console.log(`PEND  createSubname ${fqn}: ${tx}`)
  await waitFor(tx)
  logStep(`createSubname ${fqn} mined`)
}

async function provisionTwin(twin: DemoTwin, ownerWallet: Address) {
  const fqn = `${twin.label}.${PARENT_DOMAIN}`
  console.log(`\n── Provisioning ${fqn} ─────────────────────────────`)

  // Stealth meta keys — fresh per twin. Private keys are logged for
  // completeness (you would normally save these — for the live demo we
  // only need the on-chain meta-address record so sends can be broadcast).
  const meta = generateStealthMetaKeys()
  console.log(`  stealth meta URI: ${meta.stealthMetaAddress}`)
  console.log(
    `  (spendingPriv: ${meta.spendingPrivateKey.slice(0, 10)}…  viewingPriv: ${meta.viewingPrivateKey.slice(0, 10)}…)`,
  )

  // 1. Forward addr record so resolution works.
  const addrTx = await setAddressRecord(fqn, ownerWallet)
  await waitFor(addrTx)
  logStep(`setAddr ${fqn} → ${ownerWallet}`)

  // 2. Build the full text-record set, then write sequentially. (Could be
  // multicalled, but Sepolia gas is free and the script is one-shot.)
  const interop = encodeInteropAddress(
    ERC8004_REGISTRY.baseSepolia,
    CHAIN_REFERENCE.baseSepolia,
  )
  const ensipKey = `agent-registration[${interop}][${twin.label}]`
  const records: Record<string, string> = {
    avatar: buildAvatarUrl(twin.label),
    description: twin.description,
    url: APP_URL,
    "twin.persona": twin.persona,
    "twin.capabilities": JSON.stringify(twin.capabilities),
    "twin.endpoint": `${APP_URL}/api/twin`,
    "twin.version": "0.1.0",
    "stealth-meta-address": meta.stealthMetaAddress,
    [ensipKey]: "1",
  }
  for (const [key, value] of Object.entries(records)) {
    const tx = await setTextRecord(fqn, key, value)
    await waitFor(tx)
    logStep(`setText ${key}`, value.length > 80 ? `${value.slice(0, 77)}…` : value)
  }
}

async function main() {
  const { account } = getDevWalletClient()
  console.log(`Dev wallet: ${account.address}`)
  console.log(`Parent: ${PARENT_DOMAIN}\n`)

  const parentOwner = await readSubnameOwner(PARENT_DOMAIN)
  if (getAddress(parentOwner) !== getAddress(account.address)) {
    console.error(
      `FAIL  Parent ${PARENT_DOMAIN} is owned by ${parentOwner}, not the dev wallet.`,
    )
    process.exit(1)
  }
  const parentResolver = (await readResolver(PARENT_DOMAIN)) as Address
  if (parentResolver === "0x0000000000000000000000000000000000000000") {
    console.error(`FAIL  Parent ${PARENT_DOMAIN} has no resolver.`)
    process.exit(1)
  }
  logStep("parent ownership + resolver", parentResolver)

  // Both Maria and Tom point at the dev wallet's `addr` (so the dev wallet
  // can sign txs for both during the demo). Real production would mint each
  // twin against the user's smart-wallet-account address.
  for (const twin of TWINS) {
    await ensureSubname(twin.label, account.address, parentResolver)
    await provisionTwin(twin, account.address)
  }

  // Append both to the agents.directory text record on the parent so they
  // show up in `findAgents` / `listAgentDirectory`.
  console.log(`\n── Updating agents.directory on ${PARENT_DOMAIN} ──`)
  const before = await readAgentDirectory()
  const beforeLabels = new Set(before.map((d) => d.ens))
  for (const twin of TWINS) {
    const fqn = `${twin.label}.${PARENT_DOMAIN}`
    if (beforeLabels.has(fqn)) {
      logStep(`${fqn} already in directory`, "skip")
      continue
    }
    await addAgentToDirectory(fqn)
    logStep(`added ${fqn} to directory`)
  }

  console.log(`\nDone.`)
  console.log(`  → https://sepolia.app.ens.domains/maria.${PARENT_DOMAIN}`)
  console.log(`  → https://sepolia.app.ens.domains/tom.${PARENT_DOMAIN}`)
  console.log(`\nNext: open ${APP_URL}/?demoMode=1 — sign in as the dev wallet`)
  console.log(`      and the localStorage session for either ENS will resolve.`)
  // Suppress an unused-import warning while keeping the imports useful in case
  // someone wants to extend the script with raw resolver multicalls.
  void encodeFunctionData
  void ensResolverAbi
  void namehash
  void ENS_REGISTRY
  void sepolia
}

main().catch((err) => {
  console.error("FAIL", err instanceof Error ? err.message : err)
  process.exit(1)
})
