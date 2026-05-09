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

async function scanChildrenOf(
  parentNode: Hex,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<Map<Hex, bigint>> {
  // Returns labelHash → lastSeenBlock for every NewOwner event under
  // `parentNode`. Chunked to fit publicnode's eth_getLogs window.
  const CHUNK = 5_000n
  const out = new Map<Hex, bigint>()
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
      const existing = out.get(labelHash)
      if (!existing || ev.blockNumber > existing) {
        out.set(labelHash, ev.blockNumber)
      }
    }
  }
  return out
}

async function ownerOf(node: Hex): Promise<Address> {
  try {
    return await sepoliaClient.readContract({
      address: ENS_REGISTRY,
      abi: REGISTRY_OWNER_ABI,
      functionName: "owner",
      args: [node],
    })
  } catch {
    return "0x0000000000000000000000000000000000000000"
  }
}

type RecursiveSubnames = {
  /** Direct children of PARENT_DOMAIN currently owned (twin subdomains). */
  topLevel: Subname[]
  /** chat-* sub-subdomains (under any historical twin) currently owned. */
  children: { node: Hex; labelHash: Hex; twinNode: Hex }[]
}

async function collectSubnames(
  fromBlock: bigint,
  toBlock: bigint,
): Promise<RecursiveSubnames> {
  const parentNode = namehash(PARENT_DOMAIN)
  console.log(`Scanning NewOwner events for parent ${PARENT_DOMAIN}`)
  console.log(`  parentNode = ${parentNode}`)
  console.log(`  blocks ${fromBlock} → ${toBlock}`)

  // Layer 1: direct children of ethtwin.eth (the twin subdomains).
  const twinLabels = await scanChildrenOf(parentNode, fromBlock, toBlock)
  console.log(
    `  layer 1: ${twinLabels.size} historical twin labels under ${PARENT_DOMAIN}`,
  )

  // Layer 2: for EVERY twin we've ever seen (even orphaned ones), scan its
  // own NewOwner events to find chat-* sub-subdomains. Children persist in
  // the registry even after the parent is orphaned, and are addressable
  // directly via setRecord(childNode, ...).
  //
  // Throttled SEQUENTIAL scan to stay under publicnode's free-tier rate
  // limit (~50 reqs/10s). 67 twins × 1 chunk each = 67 reqs total when
  // the lookback is small, so this finishes in ~30s without 429s.
  const twinNodes = Array.from(twinLabels.keys()).map((labelHash) => ({
    labelHash,
    node: keccak256(concat([parentNode, labelHash])),
  }))
  const childRecords: { node: Hex; labelHash: Hex; twinNode: Hex }[] = []
  for (let i = 0; i < twinNodes.length; i++) {
    const twin = twinNodes[i]!
    const labels = await scanChildrenOf(twin.node, fromBlock, toBlock)
    for (const labelHash of labels.keys()) {
      childRecords.push({
        node: keccak256(concat([twin.node, labelHash])),
        labelHash,
        twinNode: twin.node,
      })
    }
    // 200ms throttle between twin scans = max 5 req/s. Comfortable for
    // publicnode's free tier even with multi-chunk twins.
    await new Promise((r) => setTimeout(r, 200))
  }
  console.log(`  layer 2: ${childRecords.length} historical chat sub-subdomains`)

  // Filter to currently-owned (skip already-zeroed). Owner reads go to the
  // canonical sepoliaClient (Alchemy) — those are direct contract reads
  // not eth_getLogs, so the rate limit there is much friendlier.
  const ZERO = "0x0000000000000000000000000000000000000000"
  const topLevel: Subname[] = []
  for (const t of twinNodes) {
    const owner = await ownerOf(t.node)
    if (owner.toLowerCase() !== ZERO.toLowerCase()) {
      topLevel.push({
        node: t.node,
        labelHash: t.labelHash,
        currentOwner: owner,
        lastSeenBlock: twinLabels.get(t.labelHash) ?? 0n,
      })
    }
  }
  const children: { node: Hex; labelHash: Hex; twinNode: Hex }[] = []
  for (const c of childRecords) {
    const owner = await ownerOf(c.node)
    if (owner.toLowerCase() !== ZERO.toLowerCase()) {
      children.push(c)
    }
  }
  console.log(
    `  currently-owned: ${topLevel.length} twins, ${children.length} chat sub-subdomains`,
  )

  return { topLevel, children }
}

async function wipeChildBySetRecord(node: Hex, nonce: number): Promise<Hash> {
  // Direct setRecord on the child node — works regardless of whether the
  // parent twin is still owned, because dev wallet has direct registry-level
  // ownership of the child node from when it was minted.
  const { account } = getDevWalletClient()
  const data = encodeFunctionData({
    abi: ensRegistryAbi,
    functionName: "setRecord",
    args: [node, ZERO_ADDRESS, ZERO_ADDRESS, 0n],
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

  const { topLevel, children } = await collectSubnames(fromBlock, tip)
  const totalToWipe = topLevel.length + children.length

  console.log(`\nFound ${totalToWipe} subnames currently owned and wipeable:`)
  if (children.length > 0) {
    console.log(`  ${children.length} chat sub-subdomain(s):`)
    for (const c of children.slice(0, 20)) {
      console.log(`    chat ${c.labelHash}  under twin ${c.twinNode}`)
    }
    if (children.length > 20) {
      console.log(`    … and ${children.length - 20} more`)
    }
  }
  if (topLevel.length > 0) {
    console.log(`  ${topLevel.length} top-level twin(s):`)
    for (const s of topLevel) {
      console.log(`    twin ${s.labelHash}  owner=${s.currentOwner}`)
    }
  }

  if (totalToWipe === 0) {
    console.log(`\nNothing to do.`)
    return
  }

  const estGas =
    totalToWipe * Number(SET_SUBNODE_GAS) + Number(SET_TEXT_GAS)
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
  // Phase 1: wipe chat sub-subdomains FIRST. We use setRecord (owner=0x0,
  // resolver=0x0) on each child node directly — this works even if the
  // parent twin is already orphaned, because the dev wallet still has
  // direct registry-level ownership of every child node.
  for (const c of children) {
    try {
      const hash = await wipeChildBySetRecord(c.node, nonce)
      console.log(`  ${nonce}  child ${c.labelHash}  →  ${hash}`)
      txs.push({ id: `child:${c.labelHash}`, hash })
      nonce += 1
    } catch (err) {
      console.error(
        `  ${nonce}  child ${c.labelHash}  →  FAILED: ${err instanceof Error ? err.message : err}`,
      )
      break
    }
  }
  // Phase 2: wipe top-level twins via setSubnodeRecord on the parent
  // (PARENT_DOMAIN). The parent (ethtwin.eth) is still owned by the dev
  // wallet, so this is the standard orphan path.
  for (const s of topLevel) {
    try {
      const hash = await wipeOne(s.labelHash, nonce)
      console.log(`  ${nonce}  twin  ${s.labelHash}  →  ${hash}`)
      txs.push({ id: `twin:${s.labelHash}`, hash })
      nonce += 1
    } catch (err) {
      console.error(
        `  ${nonce}  twin ${s.labelHash}  →  FAILED: ${err instanceof Error ? err.message : err}`,
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
        `  ${nonce}  agents.directory  →  FAILED: ${err instanceof Error ? err.message : err}`,
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
