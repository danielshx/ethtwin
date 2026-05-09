// EIP-5564 stealth inbox scanner — finds inbound stealth payments addressed
// to a twin by scanning the canonical Announcer's logs and matching each
// announcement against the recipient's deterministic viewing key.
//
// Flow:
//   1. Derive recipient's spending+viewing keys from their ENS via
//      deriveTwinStealthKeys (HMAC of the dev master + twin ENS — the same
//      function used at mint, so the keys round-trip without anyone having
//      to publish the private viewing key).
//   2. Read all `Announcement` events from ERC-5564 Announcer in the
//      requested block window on the requested chain (Sepolia / Base Sepolia).
//   3. For each Announcement, run `checkStealthAddress` (ScopeLift SDK):
//      that uses the ephemeralPubKey + recipient's viewingPrivateKey to
//      derive the same stealth address the sender computed. If the derived
//      address matches the event's `stealthAddress`, it's our payment.
//   4. Filter the metadata for ERC-20 transfers (selector 0xa9059cbb) and
//      surface amount + token. Cross-check the on-chain balance at the
//      stealth address as a final sanity check.
//
// GET /api/stealth/inbox?ens=<twin>[&chain=base-sepolia][&fromBlock=N]

import { z } from "zod"
import {
  createPublicClient,
  http,
  parseEventLogs,
  type Address,
  type Hex,
} from "viem"
import { baseSepolia, sepolia } from "viem/chains"
import { deriveTwinStealthKeys, isAnnouncementForMe } from "@/lib/stealth"
import { erc5564AnnouncerAbi } from "@/lib/abis"
import {
  ERC5564_ANNOUNCER,
  USDC_BASE_SEPOLIA,
  USDC_SEPOLIA,
  USDC_DECIMALS,
} from "@/lib/payments"
import { jsonError } from "@/lib/api-guard"

export const runtime = "nodejs"
export const maxDuration = 30
export const dynamic = "force-dynamic"

const ERC20_TRANSFER_SELECTOR = "0xa9059cbb"

// Use a public RPC for log scanning — Alchemy free tier caps eth_getLogs
// at 10 blocks per call which can't cover the lookback we need.
const LOG_RPCS: Record<"sepolia" | "base-sepolia", string> = {
  sepolia:
    process.env.SEPOLIA_LOG_RPC ?? "https://ethereum-sepolia-rpc.publicnode.com",
  "base-sepolia":
    process.env.BASE_SEPOLIA_LOG_RPC ?? "https://base-sepolia-rpc.publicnode.com",
}

const USDC: Record<"sepolia" | "base-sepolia", Address> = {
  sepolia: USDC_SEPOLIA,
  "base-sepolia": USDC_BASE_SEPOLIA,
}

const querySchema = z.object({
  ens: z.string().min(3),
  chain: z.enum(["sepolia", "base-sepolia"]).optional(),
  fromBlock: z.string().optional(),
})

const usdcAbi = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const

type StealthInboxItem = {
  chain: "sepolia" | "base-sepolia"
  stealthAddress: Address
  ephemeralPublicKey: Hex
  /** ERC-20 token contract embedded in the announcement metadata, if any. */
  token: Address | null
  /** Token amount embedded in the announcement metadata (as decimal-6 USDC if it matches Circle's deployment). */
  amount: string | null
  amountHuman: string | null
  /** Live balance read at the stealth address — confirms funds actually landed. */
  balanceRaw: string
  balanceHuman: string
  blockNumber: string
  txHash: Hex
  caller: Address
  explorerUrl: string
}

function parseErc20Metadata(metadata: Hex): {
  token: Address | null
  amount: bigint | null
} {
  // Expected layout (57 bytes / 114 hex chars after 0x):
  //   byte 0:        view tag
  //   bytes 1-4:     ERC-20 transfer selector (0xa9059cbb)
  //   bytes 5-24:    token contract address (20 bytes)
  //   bytes 25-56:   amount (uint256, big-endian, 32 bytes)
  const hex = metadata.startsWith("0x") ? metadata.slice(2) : metadata
  if (hex.length < 114) return { token: null, amount: null }
  const selector = "0x" + hex.slice(2, 10)
  if (selector.toLowerCase() !== ERC20_TRANSFER_SELECTOR) {
    return { token: null, amount: null }
  }
  const token = ("0x" + hex.slice(10, 50)) as Address
  const amount = BigInt("0x" + hex.slice(50, 114))
  return { token, amount }
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const parsed = querySchema.safeParse({
    ens: url.searchParams.get("ens") ?? "",
    chain: url.searchParams.get("chain") ?? undefined,
    fromBlock: url.searchParams.get("fromBlock") ?? undefined,
  })
  if (!parsed.success) {
    return jsonError("Invalid query: provide ?ens=<twin>[&chain=...]", 400)
  }
  const { ens } = parsed.data
  const chain = parsed.data.chain ?? "base-sepolia"

  // Derive the recipient's viewing key. With the deterministic-derivation
  // model used at mint, the server can do this without the recipient ever
  // exposing their key. Production would scope viewing keys to the user's
  // own KMS-managed key instead of a shared dev master — see the caveat
  // note in lib/stealth.ts.
  let viewingPrivateKey: Hex
  let spendingPublicKey: Hex
  try {
    const keys = deriveTwinStealthKeys(ens)
    viewingPrivateKey = keys.viewingPrivateKey
    spendingPublicKey = keys.spendingPublicKey
  } catch (err) {
    return jsonError(
      `Could not derive stealth viewing key for ${ens}: ${
        err instanceof Error ? err.message : String(err)
      }`,
      400,
    )
  }

  const chainConfig = chain === "sepolia" ? sepolia : baseSepolia
  const explorerBase =
    chain === "sepolia"
      ? "https://sepolia.etherscan.io"
      : "https://sepolia.basescan.org"
  const logClient = createPublicClient({
    chain: chainConfig,
    transport: http(LOG_RPCS[chain]),
  })

  const tip = await logClient.getBlockNumber()
  const fromBlock = parsed.data.fromBlock
    ? BigInt(parsed.data.fromBlock)
    : tip > 50_000n
      ? tip - 50_000n
      : 0n

  // Chunked log scan — publicnode allows ~5000 blocks per request.
  const CHUNK = 5_000n
  const announcements: ReturnType<
    typeof parseEventLogs<typeof erc5564AnnouncerAbi, true, "Announcement">
  > = []
  for (let start = fromBlock; start <= tip; start += CHUNK) {
    const end = start + CHUNK - 1n > tip ? tip : start + CHUNK - 1n
    const logs = await logClient.getLogs({
      address: ERC5564_ANNOUNCER,
      event: erc5564AnnouncerAbi.find(
        (a) => a.type === "event" && a.name === "Announcement",
      ) as (typeof erc5564AnnouncerAbi)[number] & { type: "event" },
      fromBlock: start,
      toBlock: end,
    })
    const parsedLogs = parseEventLogs({
      abi: erc5564AnnouncerAbi,
      logs,
      eventName: "Announcement",
    })
    announcements.push(...parsedLogs)
    // Light throttle to avoid publicnode rate limits.
    await new Promise((r) => setTimeout(r, 100))
  }

  // Filter to the recipient's stealth payments by re-deriving each
  // announcement's stealth address with the recipient's viewing key.
  const matches: StealthInboxItem[] = []
  const usdcAddress = USDC[chain]
  for (const ev of announcements) {
    const stealthAddress = ev.args.stealthAddress as Address
    const ephemeralPublicKey = ev.args.ephemeralPubKey as Hex
    const metadata = ev.args.metadata as Hex

    // First-byte view-tag check + full secp256k1 derivation. The SDK does
    // both internally (cheap pre-filter then proof). False positives only
    // happen with probability 1/256 per announcement, which is fine.
    let isMine = false
    try {
      const viewTag = ("0x" +
        (metadata.startsWith("0x")
          ? metadata.slice(2, 4)
          : metadata.slice(0, 2))) as Hex
      isMine = isAnnouncementForMe({
        userStealthAddress: stealthAddress,
        ephemeralPublicKey,
        viewTag,
        spendingPublicKey,
        viewingPrivateKey,
      })
    } catch {
      isMine = false
    }
    if (!isMine) continue

    // Decode metadata; if it's an ERC-20 transfer, surface token + amount.
    const { token, amount } = parseErc20Metadata(metadata)

    // Live balance check — confirms funds actually landed at this stealth
    // address. Without this we'd surface phantom announcements where the
    // transfer reverted or never happened.
    let balance = 0n
    if (token && token.toLowerCase() === usdcAddress.toLowerCase()) {
      balance = await logClient
        .readContract({
          address: usdcAddress,
          abi: usdcAbi,
          functionName: "balanceOf",
          args: [stealthAddress],
        })
        .catch(() => 0n)
    }

    matches.push({
      chain,
      stealthAddress,
      ephemeralPublicKey,
      token,
      amount: amount?.toString() ?? null,
      amountHuman: amount
        ? formatUsdcUnits(amount)
        : null,
      balanceRaw: balance.toString(),
      balanceHuman: formatUsdcUnits(balance),
      blockNumber: ev.blockNumber.toString(),
      txHash: ev.transactionHash as Hex,
      caller: ev.args.caller as Address,
      explorerUrl: `${explorerBase}/tx/${ev.transactionHash}`,
    })
  }

  // Newest-first.
  matches.sort((a, b) => Number(BigInt(b.blockNumber) - BigInt(a.blockNumber)))

  return Response.json({
    ok: true,
    ens,
    chain,
    fromBlock: fromBlock.toString(),
    toBlock: tip.toString(),
    scanned: announcements.length,
    matches,
  })
}

function formatUsdcUnits(raw: bigint): string {
  // 6-decimal USDC → "1.234567" style
  const divisor = 10n ** BigInt(USDC_DECIMALS)
  const whole = raw / divisor
  const frac = raw % divisor
  if (frac === 0n) return whole.toString()
  const fracStr = frac.toString().padStart(USDC_DECIMALS, "0").replace(/0+$/, "")
  return fracStr.length ? `${whole}.${fracStr}` : whole.toString()
}
