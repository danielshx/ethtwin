// Atomic-ish rotation of the dev wallet:
//   1. Validate OLD has funds + owns the parent + NEW key is set
//   2. For each subname (parent + all agents in directory): transfer registry ownership OLD → NEW
//   3. For each subname whose `addr` record points at OLD: update it to NEW (so email-fallback users stay coherent)
//   4. Sweep funds on Sepolia (ETH), Base Sepolia (ETH + USDC) from OLD → NEW
//   5. Promote NEW into DEV_WALLET_PRIVATE_KEY in .env.local + update NEXT_PUBLIC_DEV_WALLET_ADDRESS
//
// Sub-subnames (msg-*.<recipient>.<parent>) are NOT transferred. Their ownership is on-chain forever
// regardless; new mails after rotation create fresh sub-subnames under the new owner. Old messages stay
// readable, just immutable from the new wallet's perspective. Acceptable trade-off: rotation does ~5 txs
// instead of 50+.
//
// Run: pnpm wallet:rotate
// Run --dry-run to see what would happen without sending anything.
//
// Pre-req: pnpm wallet:generate (writes NEW_DEV_WALLET_PRIVATE_KEY into .env.local)

import { promises as fs } from "node:fs"
import path from "node:path"
import {
  encodeFunctionData,
  formatEther,
  formatUnits,
  getAddress,
  parseEther,
  type Address,
  type Hash,
} from "viem"
import { baseSepolia, sepolia } from "viem/chains"
import { privateKeyToAccount } from "viem/accounts"
import {
  baseSepoliaClient,
  getDevWalletClient,
  PARENT_DOMAIN,
  sepoliaClient,
} from "../lib/viem"
import {
  ENS_REGISTRY,
  readResolver,
  readSubnameOwner,
  resolveEnsAddress,
} from "../lib/ens"
import { ensRegistryAbi, ensResolverAbi } from "../lib/abis"
import { readAgentDirectory } from "../lib/agents"

const ENV_FILE = path.resolve(process.cwd(), ".env.local")
const DRY = process.argv.includes("--dry-run")
const ZERO = "0x0000000000000000000000000000000000000000"

const USDC_BASE_SEPOLIA: Address = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
const erc20MinAbi = [
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const

function logHeader(s: string) {
  console.log(`\n── ${s} ${"─".repeat(Math.max(0, 76 - s.length))}`)
}

async function readEnv(): Promise<string> {
  return fs.readFile(ENV_FILE, "utf8")
}

function getEnvVar(env: string, name: string): string | null {
  const m = env.match(new RegExp(`^${name}=(.*)$`, "m"))
  return m ? m[1].trim() : null
}

function setEnvVar(content: string, name: string, value: string): string {
  const line = `${name}=${value}`
  const re = new RegExp(`^${name}=.*$`, "m")
  if (re.test(content)) return content.replace(re, line)
  if (!content.endsWith("\n") && content.length > 0) content += "\n"
  return `${content}${line}\n`
}

function removeEnvVar(content: string, name: string): string {
  return content.replace(new RegExp(`^${name}=.*\\n?`, "m"), "")
}

function pretty(label: string, value: unknown) {
  console.log(`  ${label.padEnd(28)} ${typeof value === "string" ? value : JSON.stringify(value)}`)
}

async function main() {
  // 1. Load old + new keys from .env.local
  const env = await readEnv()
  const oldKey = getEnvVar(env, "DEV_WALLET_PRIVATE_KEY")
  const newKey = getEnvVar(env, "NEW_DEV_WALLET_PRIVATE_KEY")
  if (!oldKey || !oldKey.startsWith("0x")) {
    console.log("FAIL  DEV_WALLET_PRIVATE_KEY missing in .env.local")
    process.exit(1)
  }
  if (!newKey || !newKey.startsWith("0x")) {
    console.log("FAIL  NEW_DEV_WALLET_PRIVATE_KEY missing — run pnpm wallet:generate first")
    process.exit(1)
  }
  const oldAccount = privateKeyToAccount(oldKey as `0x${string}`)
  const newAccount = privateKeyToAccount(newKey as `0x${string}`)
  if (oldAccount.address === newAccount.address) {
    console.log("FAIL  OLD and NEW addresses are identical — abort.")
    process.exit(1)
  }

  logHeader("Rotation plan")
  pretty("dry run", DRY)
  pretty("OLD address", oldAccount.address)
  pretty("NEW address", newAccount.address)
  pretty("parent ENS", PARENT_DOMAIN)

  // 2. Sanity: OLD must own the parent
  const parentOwner = await readSubnameOwner(PARENT_DOMAIN)
  if (getAddress(parentOwner) !== getAddress(oldAccount.address)) {
    console.log(`FAIL  ${PARENT_DOMAIN} owner is ${parentOwner}, not OLD ${oldAccount.address}`)
    process.exit(1)
  }
  pretty("parent owner check", "OK")

  // 3. Build the list of subnames OLD owns (parent + every registered agent).
  const directory = await readAgentDirectory()
  const allNames = [PARENT_DOMAIN, ...directory.map((d) => d.ens)]
  console.log(`\n  ${allNames.length} ENS names to transfer:`)
  for (const name of allNames) console.log(`    - ${name}`)

  // 4. Build the multicall on the resolver: setText(addr-record-of-X) for any X whose addr=OLD.
  const parentResolver = await readResolver(PARENT_DOMAIN)
  const addrFlips: { name: string; node: `0x${string}` }[] = []
  for (const name of allNames) {
    const addr = await resolveEnsAddress(name).catch(() => null)
    if (addr && getAddress(addr) === getAddress(oldAccount.address)) {
      addrFlips.push({ name, node: nameToNode(name) })
    }
  }
  if (addrFlips.length > 0) {
    console.log(`\n  ${addrFlips.length} addr records currently point at OLD — will flip to NEW:`)
    for (const a of addrFlips) console.log(`    - ${a.name}`)
  }

  // 5. Pre-flight balances
  const [oldEthSep, oldEthBase, oldUsdc] = await Promise.all([
    sepoliaClient.getBalance({ address: oldAccount.address }),
    baseSepoliaClient.getBalance({ address: oldAccount.address }),
    baseSepoliaClient.readContract({
      address: USDC_BASE_SEPOLIA,
      abi: erc20MinAbi,
      functionName: "balanceOf",
      args: [oldAccount.address],
    }),
  ])
  logHeader("OLD wallet balances")
  pretty("Sepolia ETH", formatEther(oldEthSep))
  pretty("Base Sepolia ETH", formatEther(oldEthBase))
  pretty("Base Sepolia USDC", formatUnits(oldUsdc, 6))

  if (DRY) {
    logHeader("Dry run — exiting without sending any txs")
    return
  }

  // 6. Transfer ownership. setSubnodeOwner(parentNode, label, NEW) for non-root, setOwner(node, NEW) for root.
  // For simplicity, we use Registry.setOwner(node, NEW) on every name. This works because OLD owns each.
  const { wallet: oldWalletSepolia } = getDevWalletClient(sepolia)
  logHeader("Transferring ENS ownership (Sepolia)")
  for (const name of allNames) {
    const node = nameToNode(name)
    const tx = await oldWalletSepolia.writeContract({
      account: oldAccount,
      chain: sepolia,
      address: ENS_REGISTRY,
      abi: ensRegistryAbi,
      functionName: "setOwner",
      args: [node, newAccount.address],
    })
    console.log(`  → ${name} : tx ${tx}`)
    await sepoliaClient.waitForTransactionReceipt({ hash: tx })
  }

  // 7. Flip addr records that pointed at OLD → NEW (multicall on the resolver).
  if (addrFlips.length > 0 && parentResolver !== ZERO) {
    logHeader("Flipping addr records OLD → NEW (multicall)")
    const calls = addrFlips.map((a) =>
      encodeFunctionData({
        abi: ensResolverAbi,
        functionName: "setAddr",
        args: [a.node, newAccount.address],
      }),
    )
    const tx = await oldWalletSepolia.writeContract({
      account: oldAccount,
      chain: sepolia,
      address: parentResolver as Address,
      abi: ensResolverAbi,
      functionName: "multicall",
      args: [calls],
    })
    console.log(`  → multicall tx ${tx}`)
    await sepoliaClient.waitForTransactionReceipt({ hash: tx })
  }

  // 8. Sweep funds. Reserve a small amount for gas headroom on each chain to avoid revert.
  const reserveSepolia = parseEther("0.0005")
  const reserveBase = parseEther("0.0001")

  logHeader("Sweeping funds OLD → NEW")
  if (oldUsdc > 0n) {
    const { wallet: oldWalletBase } = getDevWalletClient(baseSepolia)
    const tx = await oldWalletBase.writeContract({
      account: oldAccount,
      chain: baseSepolia,
      address: USDC_BASE_SEPOLIA,
      abi: erc20MinAbi,
      functionName: "transfer",
      args: [newAccount.address, oldUsdc],
    })
    console.log(`  → ${formatUnits(oldUsdc, 6)} USDC : tx ${tx}`)
    await baseSepoliaClient.waitForTransactionReceipt({ hash: tx })
  } else {
    console.log("  USDC balance is 0 — skipping")
  }

  // Re-read ETH balances after the USDC tx to account for gas spent.
  const ethSep = await sepoliaClient.getBalance({ address: oldAccount.address })
  if (ethSep > reserveSepolia) {
    const send = ethSep - reserveSepolia
    const tx = await oldWalletSepolia.sendTransaction({
      account: oldAccount,
      chain: sepolia,
      to: newAccount.address,
      value: send,
    })
    console.log(`  → ${formatEther(send)} ETH on Sepolia : tx ${tx}`)
    await sepoliaClient.waitForTransactionReceipt({ hash: tx })
  } else {
    console.log("  Sepolia ETH below reserve — skipping")
  }

  const ethBase = await baseSepoliaClient.getBalance({ address: oldAccount.address })
  if (ethBase > reserveBase) {
    const { wallet: oldWalletBase } = getDevWalletClient(baseSepolia)
    const send = ethBase - reserveBase
    const tx = await oldWalletBase.sendTransaction({
      account: oldAccount,
      chain: baseSepolia,
      to: newAccount.address,
      value: send,
    })
    console.log(`  → ${formatEther(send)} ETH on Base Sepolia : tx ${tx}`)
    await baseSepoliaClient.waitForTransactionReceipt({ hash: tx })
  } else {
    console.log("  Base Sepolia ETH below reserve — skipping")
  }

  // 9. Promote new key into .env.local; clear old artifacts.
  let updated = await readEnv()
  updated = setEnvVar(updated, "DEV_WALLET_PRIVATE_KEY", newKey)
  updated = setEnvVar(
    updated,
    "NEXT_PUBLIC_DEV_WALLET_ADDRESS",
    newAccount.address,
  )
  updated = removeEnvVar(updated, "NEW_DEV_WALLET_PRIVATE_KEY")
  await fs.writeFile(ENV_FILE, updated, "utf8")

  logHeader("Done")
  console.log(`  NEW dev wallet: ${newAccount.address}`)
  console.log(`  .env.local promoted — restart the dev server (Ctrl+C then pnpm dev) to pick up the new key.`)
  console.log(`  For Vercel deploy: paste the same DEV_WALLET_PRIVATE_KEY value into the project's encrypted env vars.`)
}

// ENS namehash helper, inline to avoid a cycle with lib/ens.ts.
function nameToNode(name: string): `0x${string}` {
  // viem's namehash is what we want.
  // Importing inline rather than at top to keep the script's deps tight.
  const { namehash } = require("viem")
  return namehash(name)
}

main().catch((err) => {
  console.error("FAIL", err instanceof Error ? err.message : err)
  process.exit(1)
})
