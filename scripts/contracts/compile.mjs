// Compile the on-chain contracts in `contracts/` to JSON artifacts in
// `contracts/artifacts/`. Runs via `pnpm contracts:build`. The artifacts
// (ABI + bytecode) are checked into the repo so the runtime can deploy
// vaults at onboarding without depending on a build step on Vercel.
//
// Usage: `node scripts/contracts/compile.mjs`

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import solc from "solc"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROOT = resolve(__dirname, "..", "..")
const CONTRACTS_DIR = join(ROOT, "contracts")
const ARTIFACTS_DIR = join(CONTRACTS_DIR, "artifacts")

mkdirSync(ARTIFACTS_DIR, { recursive: true })

// Pull every .sol in contracts/ as a source — solc's import resolver is
// satisfied by `findImports` below using the same dir.
const solSources = readdirSync(CONTRACTS_DIR).filter((f) => f.endsWith(".sol"))
const sources = {}
for (const f of solSources) {
  sources[f] = { content: readFileSync(join(CONTRACTS_DIR, f), "utf8") }
}

const input = {
  language: "Solidity",
  sources,
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: "paris",
    outputSelection: {
      "*": {
        "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"],
      },
    },
  },
}

function findImports(path) {
  const candidate = join(CONTRACTS_DIR, path)
  try {
    return { contents: readFileSync(candidate, "utf8") }
  } catch (err) {
    return { error: `Not found: ${path} (${err.message})` }
  }
}

const out = JSON.parse(
  solc.compile(JSON.stringify(input), { import: findImports }),
)

if (out.errors) {
  let hasError = false
  for (const e of out.errors) {
    if (e.severity === "error") {
      hasError = true
      console.error(e.formattedMessage)
    } else {
      console.warn(e.formattedMessage)
    }
  }
  if (hasError) {
    console.error("\nCompilation failed.")
    process.exit(1)
  }
}

let written = 0
for (const file of Object.keys(out.contracts ?? {})) {
  for (const contractName of Object.keys(out.contracts[file])) {
    const c = out.contracts[file][contractName]
    const artifact = {
      contractName,
      sourceName: file,
      abi: c.abi,
      bytecode: "0x" + c.evm.bytecode.object,
      deployedBytecode: "0x" + c.evm.deployedBytecode.object,
      compiler: { version: solc.version() },
    }
    const outPath = join(ARTIFACTS_DIR, `${contractName}.json`)
    writeFileSync(outPath, JSON.stringify(artifact, null, 2))
    console.log(`  ✓ ${contractName} → ${outPath}`)
    written += 1
  }
}

if (written === 0) {
  console.error("No contracts compiled.")
  process.exit(1)
}

console.log(`\nDone. ${written} artifact(s) written.`)
