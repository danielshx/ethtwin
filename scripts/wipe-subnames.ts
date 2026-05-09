// Wipe every direct subname under PARENT_DOMAIN (ethtwin.eth on Sepolia) so we
// can re-mint twins from scratch.
//
// Enumeration strategy: scan the ENS Registry's `NewOwner(node, label, owner)`
// event logs filtered by node = namehash(ethtwin.eth). This catches every
// subname ever minted as a direct child — twins, chat-* subnames, anything.
// We don't need to know the human-readable label: the labelHash from the event
// is what setSubnodeRecord takes anyway.
//
// What gets deleted:
//   * every direct child of ethtwin.eth that has a non-zero current owner
//     (skip already-zeroed ones)
//   * the agents.directory text record on ethtwin.eth (cleared to "[]")
//
// How "delete" works in ENS:
//   setSubnodeRecord(parent, labelHash, 0x0, 0x0, 0) sets owner=0x0 + resolver=0x0
//   on the subnode. This effectively un-mints the subname — the registry shows
//   it as unowned, the resolver path is broken, and a future setSubnodeRecord
//   from the parent owner can re-create it cleanly.
//
// Run with:
//   pnpm tsx scripts/wipe-subnames.ts                          # dry-run
//   pnpm tsx scripts/wipe-subnames.ts --execute                # actually wipe
//   pnpm tsx scripts/wipe-subnames.ts --execute --from-block N # custom start
//   pnpm tsx scripts/wipe-subnames.ts --execute --keep-directory
//
// Defaults to scanning the last 200k Sepolia blocks (~28 days). Bump the
// --from-block if you minted twins earlier than that.
//
// Requires the dev wallet (DEV_WALLET_PRIVATE_KEY) to own PARENT_DOMAIN.

import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })
loadEnv()

import {
  concat,
  createPublicClient,
  encodeFunctionData,
  formatEther,
  http,
  keccak256,
  namehash,
  parseEventLogs,
  type Address,
  type Hash,
  type Hex,
} from "viem"
import { sepolia } from "viem/chains"
import { ENS_REGISTRY, readSubnameOwner } from "../lib/ens"
import { ensRegistryAbi, ensResolverAbi } from "../lib/abis"
import { PARENT_DOMAIN, getDevWalletClient, sepoliaClient } from "../lib/viem"

// Alchemy's free tier caps eth_getLogs at 10 blocks, which makes a multi-day
// scan infeasible (20k+ requests). publicnode + tenderly accept larger ranges
// (~5000-10000 blocks) without auth. We use a separate read-only client just
// for the log scan; everything else (writes, owner reads) goes through the
// canonical sepoliaClient with its pinned Alchemy URL.
const LOG_RPC = process.env.SEPOLIA_LOG_RPC ?? "https://ethereum-sepolia-rpc.publicnode.com"
const logClient = createPublicClient({
  chain: sepolia,
  transport: http(LOG_RPC),
})

const PARENT_RESOLVER: Address = "0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5"
const ZERO_ADDRESS: Address = "0x0000000000000000000000000000000000000000"
const SEPOLIA_MAX_FEE_PER_GAS = 5_000_000_000n
const SEPOLIA_MAX_PRIORITY_FEE_PER_GAS = 1_500_000_000n
const SET_SUBNODE_GAS = 120_000n
const SET_TEXT_GAS = 120_000n

type Subname = {
  /** Full subname node = keccak256(parent || labelHash). */
  node: Hex
  /** Indexed labelHash from the NewOwner event. */
  labelHash: Hex
  /** Current registry owner — wipe target if non-zero. */
  currentOwner: Address
  /** Block where the most recent NewOwner event for this label landed. */
  lastSeenBlock: bigint
}

const REGISTRY_EVENTS_ABI = [
  {
    name: "NewOwner",
    type: "event",
    inputs: [
      { name: "node", type: "bytes32", indexed: true },
      { name: "label", type: "bytes32", indexed: true },
      { name: "owner", type: "address", indexed: false },
    ],
  },
] as const

const REGISTRY_OWNER_ABI = [
  {
    name: "owner",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ name: "", type: "address" }],
  },
] as const

async function collectSubnames(fromBlock: bigint, toBlock: bigint): Promise<Subname[]> {
  const parentNode = namehash(PARENT_DOMAIN)
  console.log(`Scanning NewOwner events for parent ${PARENT_DOMAIN}`)
  console.log(`  parentNode = ${parentNode}`)
  console.log(`  blocks ${fromBlock} → ${toBlock}`)

  // Chunked log queries via the public RPC (bypasses Alchemy free-tier 10-block
  // cap). publicnode allows ~5000-10000 blocks per call; 5000 is comfortable.
  const CHUNK = 5_000n
  const labelHashByLabelHash = new Map<Hex, { lastSeenBlock: bigint }>()
  let scanned = 0n
  for (let start = fromBlock; start <= toBlock; start += CHUNK) {
    const end = start + CHUNK - 1n > toBlock ? toBlock : start + CHUNK - 1n
    const logs = await logClient.getLogs({
      address: ENS_REGISTRY,
      event: REGISTRY_EVENTS_ABI[0],
      args: { node: parentNode },
      fromBlock: start,
      toBlock: end,
    })
    const parsed = parseEventLogs({
      abi: REGISTRY_EVENTS_ABI,
      logs,
      eventName: "NewOwner",
    })
    for (const ev of parsed) {
      const labelHash = ev.args.label as Hex
      const existing = labelHashByLabelHash.get(labelHash)
      if (!existing || ev.blockNumber > existing.lastSeenBlock) {
        labelHashByLabelHash.set(labelHash, { lastSeenBlock: ev.blockNumber })
      }
    }
    scanned += end - start + 1n
    if (logs.length > 0) {
      console.log(`  ${start}..${end} → ${logs.length} events`)
    }
  }
  console.log(`Scanned ${scanned} blocks. Found ${labelHashByLabelHash.size} unique labelHashes.`)

  // Resolve current owner for each labelHash. Skip already-zeroed ones —
  // they were either never finalized or already wiped in a prior run.
  const out: Subname[] = []
  for (const [labelHash, meta] of labelHashByLabelHash) {
    const node = keccak256(concat([parentNode, labelHash]))
    let currentOwner: Address
    try {
      currentOwner = await sepoliaClient.readContract({
        address: ENS_REGISTRY,
        abi: REGISTRY_OWNER_ABI,
        functionName: "owner",
        args: [node],
      })
    } catch {
      currentOwner = "0x0000000000000000000000000000000000000000"
    }
    if (currentOwner.toLowerCase() === "0x0000000000000000000000000000000000000000") continue
    out.push({ node, labelHash, currentOwner, lastSeenBlock: meta.lastSeenBlock })
  }
  return out
}

async function wipeOne(labelHash: Hex, nonce: number): Promise<Hash> {
  const { account } = getDevWalletClient()
  const parentNode = namehash(PARENT_DOMAIN)

  const data = encodeFunctionData({
    abi: ensRegistryAbi,
    functionName: "setSubnodeRecord",
    args: [parentNode, labelHash, ZERO_ADDRESS, ZERO_ADDRESS, 0n],
  })

  const signed = await account.signTransaction({
    chainId: sepolia.id,
    type: "eip1559",
    to: ENS_REGISTRY,
    data,
    nonce,
    gas: SET_SUBNODE_GAS,
    maxFeePerGas: SEPOLIA_MAX_FEE_PER_GAS,
    maxPriorityFeePerGas: SEPOLIA_MAX_PRIORITY_FEE_PER_GAS,
    value: 0n,
  })
  return sepoliaClient.sendRawTransaction({ serializedTransaction: signed })
}

async function clearAgentsDirectory(nonce: number): Promise<Hash> {
  const { account } = getDevWalletClient()
  const parentNode = namehash(PARENT_DOMAIN)
  const data = encodeFunctionData({
    abi: ensResolverAbi,
    functionName: "setText",
    args: [parentNode, "agents.directory", "[]"],
  })
  const signed = await account.signTransaction({
    chainId: sepolia.id,
    type: "eip1559",
    to: PARENT_RESOLVER,
    data,
    nonce,
    gas: SET_TEXT_GAS,
    maxFeePerGas: SEPOLIA_MAX_FEE_PER_GAS,
    maxPriorityFeePerGas: SEPOLIA_MAX_PRIORITY_FEE_PER_GAS,
    value: 0n,
  })
  return sepoliaClient.sendRawTransaction({ serializedTransaction: signed })
}

function argValue(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined
}

async function main() {
  const execute = process.argv.includes("--execute")
  const keepDirectory = process.argv.includes("--keep-directory")
  const fromBlockArg = argValue("--from-block")
  // Default lookback: 200k Sepolia blocks ≈ 28 days. Bump if your project is older.
  const DEFAULT_LOOKBACK = 200_000n

  console.log(`\nMode: ${execute ? "EXECUTE (txs will land on Sepolia)" : "DRY RUN"}`)
  console.log(`Parent domain: ${PARENT_DOMAIN}\n`)

  // Sanity: dev wallet must own the parent.
  const parentOwner = await readSubnameOwner(PARENT_DOMAIN)
  const { account } = getDevWalletClient()
  if (parentOwner.toLowerCase() !== account.address.toLowerCase()) {
    console.error(
      `❌ Dev wallet ${account.address} is not the owner of ${PARENT_DOMAIN} ` +
        `(actual owner: ${parentOwner}). Cannot wipe.`,
    )
    process.exit(1)
  }
  const balance = await sepoliaClient.getBalance({ address: account.address })
  console.log(`Dev wallet: ${account.address}  (${formatEther(balance)} ETH)\n`)

  const tip = await sepoliaClient.getBlockNumber()
  const fromBlock = fromBlockArg
    ? BigInt(fromBlockArg)
    : tip > DEFAULT_LOOKBACK
      ? tip - DEFAULT_LOOKBACK
      : 0n

  const subnames = await collectSubnames(fromBlock, tip)
  console.log(`\nFound ${subnames.length} subnames currently owned and wipeable:`)
  for (const s of subnames) {
    console.log(
      `  labelHash=${s.labelHash}  owner=${s.currentOwner}  lastSeenBlock=${s.lastSeenBlock}`,
    )
  }

  if (subnames.length === 0) {
    console.log(`\nNothing to do.`)
    return
  }

  const estGas = subnames.length * Number(SET_SUBNODE_GAS) + Number(SET_TEXT_GAS)
  const estCost = BigInt(estGas) * SEPOLIA_MAX_FEE_PER_GAS
  console.log(`\nEstimated worst-case gas cost: ${formatEther(estCost)} ETH`)

  if (!execute) {
    console.log(`\n[dry-run] re-run with --execute to actually wipe.`)
    return
  }

  let nonce = await sepoliaClient.getTransactionCount({
    address: account.address,
    blockTag: "pending",
  })
  console.log(`\nStarting wipe at nonce ${nonce}…\n`)

  const txs: { id: string; hash: Hash }[] = []
  for (const s of subnames) {
    try {
      const hash = await wipeOne(s.labelHash, nonce)
      console.log(`  ${nonce}  ${s.labelHash}  →  ${hash}`)
      txs.push({ id: s.labelHash, hash })
      nonce += 1
    } catch (err) {
      console.error(
        `  ${nonce}  ${s.labelHash}  →  FAILED to broadcast: ${err instanceof Error ? err.message : err}`,
      )
      break
    }
  }

  if (!keepDirectory) {
    try {
      const hash = await clearAgentsDirectory(nonce)
      console.log(`  ${nonce}  agents.directory → []  →  ${hash}`)
      txs.push({ id: "agents.directory", hash })
    } catch (err) {
      console.error(
        `  ${nonce}  agents.directory  →  FAILED to broadcast: ${err instanceof Error ? err.message : err}`,
      )
    }
  }

  console.log(`\nBroadcast ${txs.length} txs. Waiting for receipts…`)
  let success = 0
  let reverted = 0
  for (const { id, hash } of txs) {
    try {
      const receipt = await sepoliaClient.waitForTransactionReceipt({
        hash,
        timeout: 120_000,
        pollingInterval: 2_000,
      })
      if (receipt.status === "success") {
        console.log(`  ✓  ${id}  block ${receipt.blockNumber}`)
        success += 1
      } else {
        console.log(`  ✗  ${id}  REVERTED  block ${receipt.blockNumber}`)
        reverted += 1
      }
    } catch (err) {
      console.log(
        `  ?  ${id}  receipt timeout: ${err instanceof Error ? err.message : err}`,
      )
    }
  }

  console.log(`\nDone. ${success} succeeded, ${reverted} reverted.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
