import { getAddress, type Address } from "viem"
import { sepoliaClient, getDevWalletClient, PARENT_DOMAIN } from "../lib/viem"
import {
  createSubname,
  readResolver,
  readSubnameOwner,
  readTwinRecords,
  setAddressRecord,
  setTextRecord,
  withEnsName,
} from "../lib/ens"

const PARENT = PARENT_DOMAIN
const LABEL = process.env.TWIN_LABEL ?? "daniel"
const FQN = `${LABEL}.${PARENT}`

const TEXT_RECORDS: Record<string, string> = {
  description: "Daniel's AI Twin — voice-controlled co-pilot for his on-chain life.",
  avatar: "https://avatars.githubusercontent.com/u/1?v=4",
  url: "https://ethtwin.eth.limo",
  "twin.persona": "Concise, privacy-first, defaults to stealth addresses for value transfers.",
}

function logStep(label: string, result: unknown) {
  console.log(`OK    ${label}`)
  console.log(`      →`, result)
}

async function waitForTx(hash: `0x${string}`) {
  return sepoliaClient.waitForTransactionReceipt({ hash })
}

async function main() {
  const { account } = getDevWalletClient()
  console.log(`Dev wallet: ${account.address}`)
  console.log(`Provisioning ${FQN} on Sepolia ENS...\n`)

  // 1. Sanity check parent ownership
  const parentOwner = await readSubnameOwner(PARENT)
  if (getAddress(parentOwner) !== getAddress(account.address)) {
    console.log(`FAIL  Parent ${PARENT} is owned by ${parentOwner}`)
    console.log(`      Dev wallet ${account.address} cannot create subnames.`)
    process.exit(1)
  }
  logStep(`parent ${PARENT} owner check`, parentOwner)

  const parentResolver = await readResolver(PARENT)
  if (parentResolver === "0x0000000000000000000000000000000000000000") {
    console.log(`FAIL  Parent ${PARENT} has no resolver set. Configure one in the ENS app first.`)
    process.exit(1)
  }
  logStep(`parent resolver`, parentResolver)

  // 2. Create subname (or skip if it already exists)
  const existingOwner = await readSubnameOwner(FQN)
  if (existingOwner !== "0x0000000000000000000000000000000000000000") {
    logStep(`${FQN} already exists, skipping creation`, existingOwner)
  } else {
    const txHash = await createSubname({
      parent: PARENT,
      label: LABEL,
      owner: account.address,
      resolver: parentResolver as Address,
    })
    console.log(`PEND  createSubname tx: ${txHash}`)
    const receipt = await waitForTx(txHash)
    logStep(`createSubname mined in block ${receipt.blockNumber}`, receipt.status)
  }

  // 3. Set forward address record so daniel.ethtwin.eth → wallet
  const addrTx = await setAddressRecord(FQN, account.address)
  console.log(`PEND  setAddr tx: ${addrTx}`)
  await waitForTx(addrTx)
  logStep(`setAddr ${FQN} → ${account.address}`, "mined")

  // 4. Write text records sequentially (sepolia gas is free, simplicity > speed)
  for (const [key, value] of Object.entries(TEXT_RECORDS)) {
    const tx = await setTextRecord(FQN, key, value)
    await waitForTx(tx)
    logStep(`setText ${key}`, value)
  }

  // 5. Read everything back
  console.log("\nVerifying on-chain state...")
  const [readback, resolvedAddr, primaryName] = await Promise.all([
    readTwinRecords(FQN),
    sepoliaClient.getEnsAddress({ name: FQN }),
    withEnsName(account.address),
  ])
  console.log(`  ${FQN} text records:`, readback)
  console.log(`  ${FQN} → addr:`, resolvedAddr)
  console.log(`  withEnsName(${account.address}):`, primaryName)
  console.log(`\nDone. Inspect at https://sepolia.app.ens.domains/${FQN}`)
}

main().catch((err) => {
  console.error("FAIL", err instanceof Error ? err.message : err)
  process.exit(1)
})
