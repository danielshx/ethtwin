// Tx decoder — pure viem, no LLM dependency.
// The "plain English" layer is a stub interface today; an LLM provider can replace it later
// without touching call sites.

import {
  decodeFunctionData,
  formatUnits,
  getAddress,
  type Abi,
  type Address,
  type Hex,
} from "viem"
import { FALLBACK_ABIS, KNOWN_CONTRACTS, lookupContract } from "./abis"
import { getSourcifyVerification } from "./sourcify"
import { assessContractRisk, type ContractRisk } from "./contract-risk"

export type TxInput = {
  to: Address
  data?: Hex
  value?: bigint
  chainId?: number
}

export type DecodedArg = {
  name: string
  type: string
  value: unknown
}

export type DecodedTx = {
  to: Address
  contractName: string
  functionName: string
  args: DecodedArg[]
  value: bigint
  selector: Hex
  /** True if we found a typed ABI match; false if we fell back to selector-only. */
  matched: boolean
  /** Human-readable summary built from the structured decode. Becomes the LLM input. */
  summary: string
}

export type SourceVerification = {
  sourceVerified: boolean
  sourceProvider: "local-abi" | "sourcify" | "none"
  match?: "full" | "partial"
  contractName?: string
  sourceUrl?: string
  metadataUrl?: string
  warning?: string
}

export type TxDescription = {
  decoded: DecodedTx
  english: string
  verification: SourceVerification
  risk: ContractRisk
}

const EMPTY_DATA: Hex = "0x"

export function decodeTx(tx: TxInput): DecodedTx {
  const to = getAddress(tx.to)
  const data = (tx.data ?? EMPTY_DATA) as Hex
  const value = tx.value ?? 0n
  const selector = (data.length >= 10 ? data.slice(0, 10) : EMPTY_DATA) as Hex

  // Pure ETH transfer — no calldata.
  if (data === EMPTY_DATA || data === "0x" || data.length < 10) {
    return {
      to,
      contractName: "EOA / contract",
      functionName: "transfer",
      args: [{ name: "value", type: "uint256", value }],
      value,
      selector,
      matched: true,
      summary: `Send ${formatEth(value)} ETH to ${to}.`,
    }
  }

  // Try the known contract's ABI first, then fall back to common ABIs.
  const known = lookupContract(to)
  const abisToTry: { name: string; abi: Abi }[] = []
  if (known) abisToTry.push({ name: known.name, abi: known.abi })
  for (const abi of FALLBACK_ABIS) {
    if (!known || abi !== known.abi) abisToTry.push({ name: "(unknown contract)", abi })
  }

  for (const { name: contractName, abi } of abisToTry) {
    const decoded = decodeWithAbi({ to, data, value, selector, contractName, abi })
    if (decoded) return decoded
  }

  // No ABI matched — selector-only fallback.
  return selectorOnlyFallback({ to, value, selector, knownName: known?.name })
}

/**
 * Decode a tx and enrich unknown contracts with Sourcify source verification.
 * Existing local ABI matches remain deterministic and do not call the network.
 */
export async function describeTxWithVerification(tx: TxInput): Promise<TxDescription> {
  const local = decodeTx(tx)
  if (local.matched) {
    const verification: SourceVerification = {
      sourceVerified: true,
      sourceProvider: lookupContract(local.to) ? "local-abi" : "none",
      contractName: local.contractName,
    }
    const risk = assessContractRisk({ decoded: local, verification })
    const english = await provider(local)
    return {
      decoded: local,
      english: withRiskSummary(withVerificationSummary(english, verification), risk),
      verification,
      risk,
    }
  }

  const data = (tx.data ?? EMPTY_DATA) as Hex
  const value = tx.value ?? 0n
  const selector = (data.length >= 10 ? data.slice(0, 10) : EMPTY_DATA) as Hex
  const verification = await getSourcifyVerification({
    chainId: tx.chainId,
    address: local.to,
  })

  if (verification.verified && verification.abi) {
    const sourcifyDecoded = decodeWithAbi({
      to: local.to,
      data,
      value,
      selector,
      contractName: verification.contractName ?? "Sourcify-verified contract",
      abi: verification.abi,
    })
    if (sourcifyDecoded) {
      const sourceVerification: SourceVerification = {
        sourceVerified: true,
        sourceProvider: "sourcify",
        match: verification.match,
        contractName: verification.contractName ?? sourcifyDecoded.contractName,
        sourceUrl: verification.sourceUrl,
        metadataUrl: verification.metadataUrl,
        ...(verification.match === "partial"
          ? { warning: "Contract has a partial Sourcify match; review with extra care." }
          : {}),
      }
      const risk = assessContractRisk({ decoded: sourcifyDecoded, verification: sourceVerification })
      const english = await provider(sourcifyDecoded)
      return {
        decoded: sourcifyDecoded,
        english: withRiskSummary(withVerificationSummary(english, sourceVerification), risk),
        verification: sourceVerification,
        risk,
      }
    }
  }

  const sourceVerification: SourceVerification = {
    sourceVerified: false,
    sourceProvider: "sourcify",
    warning:
      verification.error ??
      "Contract source could not be verified on Sourcify, so calldata could not be decoded from verified source.",
  }
  const risk = assessContractRisk({ decoded: local, verification: sourceVerification })
  const english = await provider(local)
  return {
    decoded: local,
    english: withRiskSummary(withVerificationSummary(english, sourceVerification), risk),
    verification: sourceVerification,
    risk,
  }
}

// ── Plain-English layer ──────────────────────────────────────────────────────
// Today: deterministic, template-based. Tomorrow: pluggable LLM provider.

export type PlainEnglishProvider = (decoded: DecodedTx) => Promise<string> | string

let provider: PlainEnglishProvider = (d) => d.summary

export function setPlainEnglishProvider(fn: PlainEnglishProvider) {
  provider = fn
}

export async function describeTx(tx: TxInput): Promise<TxDescription> {
  // Browser calls route through the server so Sourcify lookups happen in the
  // Node runtime and do not depend on client CORS/bundle/network behavior.
  if (typeof window !== "undefined") {
    const res = await fetch("/api/decode-transaction", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: tx.to,
        data: tx.data ?? "0x",
        value: tx.value?.toString(),
        chainId: tx.chainId,
      }),
    })
    const payload = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      decoded?: TxDescription
      error?: string
    }
    if (!res.ok || !payload.ok || !payload.decoded) {
      throw new Error(payload.error ?? `Failed to decode transaction (${res.status})`)
    }
    return payload.decoded
  }

  return describeTxWithVerification(tx)
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function decodeWithAbi(args: {
  to: Address
  data: Hex
  value: bigint
  selector: Hex
  contractName: string
  abi: Abi
}): DecodedTx | null {
  try {
    const decoded = decodeFunctionData({ abi: args.abi, data: args.data })
    const fnDef = args.abi.find(
      (item) => item.type === "function" && item.name === decoded.functionName,
    )
    const inputs =
      fnDef && fnDef.type === "function" && Array.isArray(fnDef.inputs) ? fnDef.inputs : []
    const decodedArgs: DecodedArg[] = (decoded.args ?? []).map((value, i) => ({
      name: inputs[i]?.name ?? `arg${i}`,
      type: inputs[i]?.type ?? "unknown",
      value,
    }))
    return {
      to: args.to,
      contractName: args.contractName,
      functionName: decoded.functionName,
      args: decodedArgs,
      value: args.value,
      selector: args.selector,
      matched: true,
      summary: buildSummary({
        to: args.to,
        contractName: args.contractName,
        functionName: decoded.functionName,
        args: decodedArgs,
        value: args.value,
      }),
    }
  } catch {
    return null
  }
}

function selectorOnlyFallback(args: {
  to: Address
  value: bigint
  selector: Hex
  knownName?: string
}): DecodedTx {
  return {
    to: args.to,
    contractName: args.knownName ?? "(unknown contract)",
    functionName: `unknown(${args.selector})`,
    args: [],
    value: args.value,
    selector: args.selector,
    matched: false,
    summary: `Call ${args.selector} on ${args.to}${args.value > 0n ? ` with ${formatEth(args.value)} ETH` : ""}. (Calldata not recognized.)`,
  }
}

function withVerificationSummary(english: string, verification: SourceVerification): string {
  if (verification.sourceVerified) {
    if (verification.sourceProvider === "sourcify") {
      const match = verification.match === "partial" ? "partial Sourcify match" : "Sourcify-verified source"
      return `${english}\n\nSource check: ${match}${verification.contractName ? ` (${verification.contractName})` : ""}.`
    }
    if (verification.sourceProvider === "local-abi") {
      return `${english}\n\nSource check: known local ABI.`
    }
    return `${english}\n\nSource check: no calldata contract verification needed.`
  }
  return `${english}\n\nSource check: unverified contract source. ${verification.warning ?? "Review carefully before signing."}`
}

function withRiskSummary(english: string, risk: ContractRisk): string {
  const reasons = risk.reasons.length > 0 ? ` Reason: ${risk.reasons[0]}` : ""
  return `${english}\n\nSafety check: ${risk.level.toUpperCase()} — ${risk.label}.${reasons} Recommendation: ${risk.recommendation}`
}

function buildSummary(args: {
  to: Address
  contractName: string
  functionName: string
  args: DecodedArg[]
  value: bigint
}): string {
  const argMap = Object.fromEntries(args.args.map((a) => [a.name, a.value]))
  const known = lookupContract(args.to)

  switch (args.functionName) {
    case "transfer": {
      const amount = formatTokenAmount(argMap.amount as bigint, known)
      return `Transfer ${amount} to ${argMap.to as string}.`
    }
    case "approve": {
      const amount = formatTokenAmount(argMap.amount as bigint, known)
      return `Approve ${argMap.spender as string} to spend ${amount}.`
    }
    case "transferFrom": {
      const amount = formatTokenAmount(argMap.amount as bigint, known)
      return `Move ${amount} from ${argMap.from as string} to ${argMap.to as string}.`
    }
    case "setSubnodeRecord":
      return `Create ENS subname under node ${shortHash(argMap.node as string)}, owner ${argMap.owner as string}.`
    case "setText":
      return `Set ENS text record "${argMap.key as string}" = "${argMap.value as string}" on node ${shortHash(argMap.node as string)}.`
    case "setAddr":
      return `Set ENS forward address to ${argMap.a as string} on node ${shortHash(argMap.node as string)}.`
    case "setResolver":
      return `Point ENS node ${shortHash(argMap.node as string)} at resolver ${argMap.resolver as string}.`
    case "setOwner":
      return `Transfer ENS node ${shortHash(argMap.node as string)} to ${argMap.owner as string}.`
    default: {
      const pretty = args.args.map((a) => `${a.name}=${formatArg(a)}`).join(", ")
      return `Call ${args.contractName}.${args.functionName}(${pretty}).`
    }
  }
}

function formatTokenAmount(amount: bigint, known: ReturnType<typeof lookupContract>): string {
  if (known?.decimals !== undefined) {
    return `${formatUnits(amount, known.decimals)} ${known.symbol ?? ""}`.trim()
  }
  return amount.toString()
}

function formatEth(wei: bigint): string {
  return formatUnits(wei, 18)
}

function formatArg(arg: DecodedArg): string {
  if (typeof arg.value === "bigint") return arg.value.toString()
  if (typeof arg.value === "string" && arg.value.startsWith("0x") && arg.value.length === 66) {
    return shortHash(arg.value)
  }
  return JSON.stringify(arg.value, (_k, v) => (typeof v === "bigint" ? v.toString() : v))
}

function shortHash(hash: string, head = 10, tail = 6): string {
  if (hash.length <= head + tail + 2) return hash
  return `${hash.slice(0, head)}…${hash.slice(-tail)}`
}
