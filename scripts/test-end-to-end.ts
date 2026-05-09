// End-to-end self-test for the KMS-only stack.
//
// Verifies, against real Sepolia + the real Orbitport KMS API:
//   1. KMS createKey actually mints a SECP256K1 key (proves we hit the API
//      and didn't fall through to a mock).
//   2. The KMS-derived address can sign a tx that lands on Sepolia.
//   3. Two twins can be minted, exchange messages, and BOTH sides can
//      decrypt the chat thread.
//   4. The chat-subname architecture writes chats.list on both twins so
//      readInbox returns the conversation for either side.
//
// Run with:  pnpm tsx scripts/test-end-to-end.ts <usernameA> <usernameB>
//
// The test is destructive in the sense that it mints two real ENS subnames
// + KMS keys, but those are demo artefacts (cheap on Sepolia, free in KMS).

// Load .env.local (Next.js convention) before anything else imports
// process.env. dotenv/config only reads .env, not .env.local.
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })
loadEnv() // also pick up plain .env if present
import { encodeFunctionData, formatEther, keccak256, namehash, toBytes } from "viem"
import { sepolia } from "viem/chains"
import { ENS_REGISTRY, readSubnameOwner } from "../lib/ens"
import { ensRegistryAbi, ensResolverAbi } from "../lib/abis"
import { PARENT_DOMAIN, getDevWalletClient, sepoliaClient } from "../lib/viem"
import { createTwinKey, isKmsConfigured } from "../lib/kms"
import { deriveTwinStealthKeys } from "../lib/stealth"
import {
  LOGIN_HASH_TEXT_KEY,
  generateRecoveryCode,
  hashRecoveryCode,
  verifyRecoveryCode,
} from "../lib/recovery"
import {
  chatSubnameFor,
  readChatThread,
  readInbox,
  sendMessage,
} from "../lib/messages"

const PARENT_RESOLVER = "0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5" as const
const SEPOLIA_MAX_FEE_PER_GAS = 5_000_000_000n
const SEPOLIA_MAX_PRIORITY_FEE_PER_GAS = 1_500_000_000n

function log(label: string, payload?: unknown) {
  if (payload === undefined) {
    console.log(`\n=== ${label} ===`)
  } else {
    console.log(`  ${label}:`, payload)
  }
}

function fail(reason: string): never {
  console.error(`\n❌ FAIL: ${reason}`)
  process.exit(1)
}

async function mintTwin(username: string) {
  log(`Minting ${username}.${PARENT_DOMAIN}`)

  if (!isKmsConfigured()) {
    fail("ORBITPORT_CLIENT_ID / ORBITPORT_CLIENT_SECRET not set — KMS unreachable")
  }

  const kms = await createTwinKey(username)
  log("kms key created", { keyId: kms.keyId, address: kms.address })

  const ensName = `${username}.${PARENT_DOMAIN}`
  const existingOwner = await readSubnameOwner(ensName)
  if (existingOwner.toLowerCase() !== "0x0000000000000000000000000000000000000000") {
    log("subname already exists — skipping mint", existingOwner)
    return { ensName, kmsKeyId: kms.keyId, address: kms.address, recoveryCode: null }
  }

  const recoveryCode = generateRecoveryCode()
  const loginHash = hashRecoveryCode(recoveryCode)
  if (!verifyRecoveryCode(recoveryCode, loginHash)) {
    fail("Recovery code verification roundtrip failed (bug in lib/recovery)")
  }

  const stealth = deriveTwinStealthKeys(ensName)
  if (!stealth.stealthMetaAddressURI.startsWith("st:eth:0x")) {
    fail(`Stealth meta-address URI shape wrong: ${stealth.stealthMetaAddressURI}`)
  }
  // Two compressed pubkeys = 132 hex chars (excluding "0x"); the SDK rejects anything else.
  const hexLen = stealth.stealthMetaAddressURI.replace("st:eth:0x", "").length
  if (hexLen !== 132) {
    fail(`Stealth meta-address payload is ${hexLen} hex chars; need 132 (= 2× 33-byte compressed pubkeys)`)
  }
  log("stealth meta-address derived", { uri: stealth.stealthMetaAddressURI.slice(0, 30) + "…" })

  const { account: devAccount } = getDevWalletClient()
  const startingNonce = await sepoliaClient.getTransactionCount({
    address: devAccount.address,
    blockTag: "pending",
  })

  const labelHash = keccak256(toBytes(username))
  const parentNode = namehash(PARENT_DOMAIN)
  const ensNode = namehash(ensName)

  // Tx 1: setSubnodeRecord — owner = dev wallet, resolver = parent resolver.
  const createData = encodeFunctionData({
    abi: ensRegistryAbi,
    functionName: "setSubnodeRecord",
    args: [parentNode, labelHash, devAccount.address, PARENT_RESOLVER, 0n],
  })
  const signedCreate = await devAccount.signTransaction({
    chainId: sepolia.id,
    type: "eip1559",
    to: ENS_REGISTRY,
    data: createData,
    nonce: startingNonce,
    gas: 200_000n,
    maxFeePerGas: SEPOLIA_MAX_FEE_PER_GAS,
    maxPriorityFeePerGas: SEPOLIA_MAX_PRIORITY_FEE_PER_GAS,
    value: 0n,
  })
  const createTx = await sepoliaClient.sendRawTransaction({
    serializedTransaction: signedCreate,
  })
  log("createSubname broadcast", createTx)

  // Tx 2: multicall — addr + text records.
  const calls: `0x${string}`[] = [
    encodeFunctionData({
      abi: ensResolverAbi,
      functionName: "setAddr",
      args: [ensNode, kms.address],
    }),
    encodeFunctionData({
      abi: ensResolverAbi,
      functionName: "setText",
      args: [ensNode, "twin.kms-key-id", kms.keyId],
    }),
    encodeFunctionData({
      abi: ensResolverAbi,
      functionName: "setText",
      args: [ensNode, "stealth-meta-address", stealth.stealthMetaAddressURI],
    }),
    encodeFunctionData({
      abi: ensResolverAbi,
      functionName: "setText",
      args: [ensNode, LOGIN_HASH_TEXT_KEY, loginHash],
    }),
  ]
  const recordsData = encodeFunctionData({
    abi: ensResolverAbi,
    functionName: "multicall",
    args: [calls],
  })
  const signedRecords = await devAccount.signTransaction({
    chainId: sepolia.id,
    type: "eip1559",
    to: PARENT_RESOLVER,
    data: recordsData,
    nonce: startingNonce + 1,
    gas: 1_500_000n,
    maxFeePerGas: SEPOLIA_MAX_FEE_PER_GAS,
    maxPriorityFeePerGas: SEPOLIA_MAX_PRIORITY_FEE_PER_GAS,
    value: 0n,
  })
  const recordsTx = await sepoliaClient.sendRawTransaction({
    serializedTransaction: signedRecords,
  })
  log("recordsMulticall broadcast", recordsTx)

  const receipt = await sepoliaClient.waitForTransactionReceipt({
    hash: recordsTx,
    timeout: 60_000,
  })
  if (receipt.status !== "success") {
    fail(`recordsMulticall reverted (status=${receipt.status})`)
  }
  log("records multicall mined", `block ${receipt.blockNumber}`)

  // Verify that the twin's ENS subname is readable via the registry from
  // the same RPC. If this returns 0x0 immediately after minting, the bug
  // is in our read path, not in the chat-subname-specific logic.
  const postMintOwner = await readSubnameOwner(ensName).catch(() => "<err>")
  log("post-mint owner read", postMintOwner)

  return { ensName, kmsKeyId: kms.keyId, address: kms.address, recoveryCode }
}

async function main() {
  const usernameA = process.argv[2] ?? `e2e-a-${Date.now().toString(36).slice(-6)}`
  const usernameB = process.argv[3] ?? `e2e-b-${Date.now().toString(36).slice(-6)}`

  log(`E2E test: ${usernameA} ↔ ${usernameB}`)

  // --- Phase 0: prove the registry read path works at all. ---
  // If the parent domain's owner returns 0x0 here, every subsequent owner
  // read is going to fail and the bug is in our read code, not in the
  // mint sequence.
  const parentOwner = await readSubnameOwner(PARENT_DOMAIN).catch(() => "<err>")
  log(`registry sanity — owner(${PARENT_DOMAIN})`, parentOwner)
  if (parentOwner === "0x0000000000000000000000000000000000000000" || parentOwner === "<err>") {
    fail(
      `Registry read returns 0x0 for ${PARENT_DOMAIN}. ` +
        `The registry contract / namehash / RPC chain is broken at a level deeper than the test.`,
    )
  }

  // --- Phase 1: confirm dev wallet has gas. ---
  const { account: devAccount } = getDevWalletClient()
  const devBalance = await sepoliaClient.getBalance({ address: devAccount.address })
  log("dev wallet", { address: devAccount.address, eth: formatEther(devBalance) })
  if (devBalance < 10_000_000_000_000_000n) {
    fail(`Dev wallet has < 0.01 ETH on Sepolia; mint will run out of gas`)
  }

  // --- Phase 2: mint two twins. ---
  const a = await mintTwin(usernameA)
  const b = await mintTwin(usernameB)

  // --- Phase 3: send messages both ways. ---
  log(`Send: ${a.ensName} → ${b.ensName}`)
  const send1 = await sendMessage({
    fromEns: a.ensName,
    toEns: b.ensName,
    body: "hello from A",
  })
  log("send1", { tx: send1.recordsMulticallTx, chat: send1.chatEns, idx: send1.message.index })

  log(`Send: ${b.ensName} → ${a.ensName}`)
  const send2 = await sendMessage({
    fromEns: b.ensName,
    toEns: a.ensName,
    body: "hi back from B",
  })
  log("send2", { tx: send2.recordsMulticallTx, idx: send2.message.index })

  // --- Phase 4: chat-subname determinism. ---
  const chatFromA = chatSubnameFor(a.ensName, b.ensName)
  const chatFromB = chatSubnameFor(b.ensName, a.ensName)
  if (chatFromA !== chatFromB) {
    fail(`chatSubnameFor not symmetric: A→B=${chatFromA} vs B→A=${chatFromB}`)
  }
  log("chat subname deterministic both ways", chatFromA)

  // --- Phase 5: read & decrypt from BOTH sides. ---
  log("Reading chat thread from A's perspective…")
  const threadA = await readChatThread(chatFromA, a.ensName)
  log("threadA length", threadA.length)
  for (const m of threadA) {
    log(`  msg ${m.index} from ${m.from}`, m.body)
  }
  if (threadA.length < 2) {
    fail(`A only sees ${threadA.length}/2 messages — chain reads or counts are off`)
  }
  const aFirst = threadA.find((m) => m.body === "hello from A")
  const aSecond = threadA.find((m) => m.body === "hi back from B")
  if (!aFirst || !aSecond) {
    fail(`A could not decrypt one or both messages: ${JSON.stringify(threadA.map((m) => m.body))}`)
  }

  log("Reading chat thread from B's perspective…")
  const threadB = await readChatThread(chatFromA, b.ensName)
  log("threadB length", threadB.length)
  for (const m of threadB) {
    log(`  msg ${m.index} from ${m.from}`, m.body)
  }
  const bFirst = threadB.find((m) => m.body === "hello from A")
  const bSecond = threadB.find((m) => m.body === "hi back from B")
  if (!bFirst || !bSecond) {
    fail(`B could not decrypt one or both messages: ${JSON.stringify(threadB.map((m) => m.body))}`)
  }

  // --- Phase 6: chats.list propagation. ---
  log("Reading inbox for A (relies on chats.list text record)…")
  const inboxA = await readInbox(a.ensName)
  if (inboxA.length === 0) {
    fail("A's inbox is empty — chats.list write didn't propagate")
  }
  log("A inbox count", inboxA.length)

  log("Reading inbox for B…")
  const inboxB = await readInbox(b.ensName)
  if (inboxB.length === 0) {
    fail("B's inbox is empty — chats.list write didn't propagate")
  }
  log("B inbox count", inboxB.length)

  console.log(`\n✅ END-TO-END PASSED`)
  console.log(`   Twin A: ${a.ensName} (kms=${a.kmsKeyId})`)
  console.log(`   Twin B: ${b.ensName} (kms=${b.kmsKeyId})`)
  console.log(`   Chat:   ${chatFromA}`)
  console.log(`   A sees ${threadA.length} messages, B sees ${threadB.length} messages.`)
  if (a.recoveryCode) console.log(`   A recovery: ${a.recoveryCode}`)
  if (b.recoveryCode) console.log(`   B recovery: ${b.recoveryCode}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
