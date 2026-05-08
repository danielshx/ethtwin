// Generate a fresh dev-wallet keypair and write it directly to .env.local
// under a TEMPORARY variable name (NEW_DEV_WALLET_PRIVATE_KEY) so it never
// has to be pasted into terminal output, IDE diffs, or chat.
//
// Only the public ADDRESS is printed to stdout — that's safe to share.
//
// Run: pnpm wallet:generate
//      → prints the new address (and existing OLD address if any)
//      → fund the new address from a Sepolia + Base Sepolia faucet
//      → then run: pnpm wallet:rotate

import { promises as fs } from "node:fs"
import path from "node:path"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { sepoliaClient } from "../lib/viem"

const ENV_FILE = path.resolve(process.cwd(), ".env.local")
const PENDING_KEY_NAME = "NEW_DEV_WALLET_PRIVATE_KEY"
const CURRENT_KEY_NAME = "DEV_WALLET_PRIVATE_KEY"

function logHeader(s: string) {
  console.log(`\n── ${s} ${"─".repeat(Math.max(0, 76 - s.length))}`)
}

async function readEnv(): Promise<string> {
  try {
    return await fs.readFile(ENV_FILE, "utf8")
  } catch {
    return ""
  }
}

function setEnvVar(content: string, name: string, value: string): string {
  const line = `${name}=${value}`
  const re = new RegExp(`^${name}=.*$`, "m")
  if (re.test(content)) {
    return content.replace(re, line)
  }
  // Append at end, preserving trailing newline.
  if (!content.endsWith("\n") && content.length > 0) content += "\n"
  return `${content}${line}\n`
}

async function main() {
  const env = await readEnv()
  const currentKeyMatch = env.match(/^DEV_WALLET_PRIVATE_KEY=(0x[a-fA-F0-9]+)/m)
  const currentAddr = currentKeyMatch
    ? privateKeyToAccount(currentKeyMatch[1] as `0x${string}`).address
    : null

  logHeader("Current dev wallet")
  if (currentAddr) {
    const bal = await sepoliaClient.getBalance({ address: currentAddr })
    console.log(`  address     ${currentAddr}`)
    console.log(`  Sepolia ETH ${Number(bal) / 1e18}`)
  } else {
    console.log("  (none configured)")
  }

  // Generate fresh keypair
  const newKey = generatePrivateKey()
  const newAddr = privateKeyToAccount(newKey).address

  logHeader("New dev wallet")
  console.log(`  address     ${newAddr}`)
  console.log(`  private key (written to .env.local as ${PENDING_KEY_NAME} — never printed here)`)

  // Persist to .env.local under a temp name. The rotation script will promote it.
  const updated = setEnvVar(env, PENDING_KEY_NAME, newKey)
  await fs.writeFile(ENV_FILE, updated, "utf8")

  logHeader("Next steps")
  console.log(`  1. Fund the new address with a small amount of ETH on:`)
  console.log(`     - Sepolia:       https://sepoliafaucet.com or https://www.alchemy.com/faucets/ethereum-sepolia`)
  console.log(`     - Base Sepolia:  https://www.alchemy.com/faucets/base-sepolia`)
  console.log(`     (just enough for gas — ~0.005 ETH each chain is plenty)`)
  console.log(``)
  console.log(`  2. Run rotation (transfers ENS ownership + all funds + USDC from old → new):`)
  console.log(`     pnpm wallet:rotate`)
  console.log(``)
  console.log(`  3. After rotation succeeds, the new key is promoted into ${CURRENT_KEY_NAME}`)
  console.log(`     and the old key + temp ${PENDING_KEY_NAME} are removed from .env.local.`)
  console.log(`     Restart the dev server to pick up the new key.`)
}

main().catch((err) => {
  console.error("FAIL", err instanceof Error ? err.message : err)
  process.exit(1)
})
