// End-to-end EIP-5564 demo:
//   1. Recipient (daniel.ethtwin.eth) generates a stealth meta-key + URI.
//   2. Recipient publishes the URI in the ENS `stealth-meta-address` text record.
//   3. Sender reads the URI from ENS, generates a one-time stealth address.
//   4. Recipient verifies the announcement is theirs (view-tag check + address match).
//   5. Recipient derives the stealth-address private key.
//
// Run: pnpm ens:stealth-provision
//
// Notes:
//   - The recipient's spending+viewing private keys are written to .stealth-keys.json
//     (gitignored). For the demo, this is fine — production would derive them from
//     a Privy signature or a hardware wallet, never stored in plaintext.
//   - The script is idempotent: it will reuse .stealth-keys.json if it exists, and
//     re-publish the meta-address only if the on-chain record drifts.

import { promises as fs } from "node:fs"
import path from "node:path"
import { sepoliaClient, getDevWalletClient, PARENT_DOMAIN } from "../lib/viem"
import { readStealthMetaAddress, setStealthMetaAddress } from "../lib/ens"
import {
  deriveStealthPrivateKey,
  generatePrivateAddress,
  generateStealthMetaKeys,
  isAnnouncementForMe,
  parseMetaAddress,
  type StealthMetaKeys,
} from "../lib/stealth"
import { privateKeyToAddress } from "viem/accounts"

const LABEL = process.env.TWIN_LABEL ?? "daniel"
const FQN = `${LABEL}.${PARENT_DOMAIN}`
const KEYS_FILE = path.resolve(process.cwd(), ".stealth-keys.json")

function logStep(label: string, value?: unknown) {
  if (value === undefined) console.log(`OK    ${label}`)
  else {
    console.log(`OK    ${label}`)
    console.log(`      →`, value)
  }
}

async function loadOrGenerateKeys(): Promise<{ keys: StealthMetaKeys; fresh: boolean }> {
  try {
    const raw = await fs.readFile(KEYS_FILE, "utf8")
    return { keys: JSON.parse(raw) as StealthMetaKeys, fresh: false }
  } catch {
    const keys = generateStealthMetaKeys()
    await fs.writeFile(KEYS_FILE, JSON.stringify(keys, null, 2), "utf8")
    return { keys, fresh: true }
  }
}

async function main() {
  console.log(`Stealth provisioning for ${FQN} on Sepolia ENS\n`)

  // 1. Recipient: generate (or load) the stealth meta-keypair
  const { keys, fresh } = await loadOrGenerateKeys()
  logStep(
    fresh ? "generated fresh stealth meta-keys" : "loaded stealth meta-keys from .stealth-keys.json",
    { uri: keys.stealthMetaAddressURI },
  )
  console.log(`      spending pub: ${keys.spendingPublicKey}`)
  console.log(`      viewing pub:  ${keys.viewingPublicKey}`)

  // 2. Publish to ENS if not already current
  const onChain = await readStealthMetaAddress(FQN)
  if (onChain === keys.stealthMetaAddressURI) {
    logStep(`ENS ${FQN} stealth-meta-address already up to date`)
  } else {
    console.log(`PEND  publishing stealth-meta-address to ${FQN}...`)
    const tx = await setStealthMetaAddress(FQN, keys.stealthMetaAddressURI)
    console.log(`PEND  tx: ${tx}`)
    await sepoliaClient.waitForTransactionReceipt({ hash: tx })
    logStep(`ENS ${FQN} stealth-meta-address published`, keys.stealthMetaAddressURI)
  }

  // Sanity: parse what we just published, prove the pubkeys round-trip
  const parsed = parseMetaAddress(keys.stealthMetaAddressURI)
  logStep("parsed pubkeys from URI", {
    spendingMatches: bytesToHex(parsed.spendingPublicKey) === keys.spendingPublicKey,
    viewingMatches: bytesToHex(parsed.viewingPublicKey) === keys.viewingPublicKey,
  })

  // 3. Sender side: read the URI from ENS and generate a one-time stealth address
  console.log("\n── Sender flow ──")
  const senderURI = await readStealthMetaAddress(FQN)
  if (!senderURI) {
    throw new Error("Sender could not read stealth-meta-address from ENS")
  }
  logStep(`sender resolved ${FQN} → URI`, senderURI)

  const announcement = await generatePrivateAddress(senderURI)
  logStep("sender generated stealth announcement", {
    stealthAddress: announcement.stealthAddress,
    ephemeralPublicKey: announcement.ephemeralPublicKey,
    viewTag: announcement.viewTag,
    cosmicSeeded: announcement.cosmicSeeded,
    mocked: announcement.mocked,
    attestation: announcement.attestation,
  })
  if (announcement.mocked) {
    console.log("WARN  stealth result is MOCKED — SDK call failed. Check logs above.")
  }

  // 4. Recipient side: verify this announcement is for us
  console.log("\n── Recipient flow ──")
  const isForMe = isAnnouncementForMe({
    userStealthAddress: announcement.stealthAddress,
    ephemeralPublicKey: announcement.ephemeralPublicKey,
    viewTag: announcement.viewTag,
    spendingPublicKey: keys.spendingPublicKey,
    viewingPrivateKey: keys.viewingPrivateKey,
  })
  logStep("checkStealthAddress (announcement matches)", isForMe)
  if (!isForMe && !announcement.mocked) {
    throw new Error("Announcement check failed — derivation is broken.")
  }

  // 5. Recipient derives the stealth private key + verifies it controls the address
  if (!announcement.mocked) {
    const stealthPriv = deriveStealthPrivateKey({
      ephemeralPublicKey: announcement.ephemeralPublicKey,
      spendingPrivateKey: keys.spendingPrivateKey,
      viewingPrivateKey: keys.viewingPrivateKey,
    })
    const derivedAddr = privateKeyToAddress(stealthPriv)
    logStep("derived stealth-address private key", {
      privatePrefix: stealthPriv.slice(0, 10) + "…",
      address: derivedAddr,
      controlsExpected: derivedAddr.toLowerCase() === announcement.stealthAddress.toLowerCase(),
    })
  }

  // 6. Final dev-wallet sanity (so the script also confirms ENS write path)
  const { account } = getDevWalletClient()
  logStep("dev wallet (ENS owner)", account.address)

  console.log(`\nDone. Inspect at https://sepolia.app.ens.domains/${FQN}`)
}

function bytesToHex(b: Uint8Array | `0x${string}`): `0x${string}` {
  if (typeof b === "string") return b
  return ("0x" + Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("")) as `0x${string}`
}

main().catch((err) => {
  console.error("FAIL", err instanceof Error ? err.message : err)
  process.exit(1)
})
