import type { DecodedArg, DecodedTx, SourceVerification } from "./tx-decoder"

const MAX_UINT256 =
  115792089237316195423570985008687907853269984665640564039457584007913129639935n

export type ContractRiskLevel = "low" | "medium" | "high" | "unknown"

export type ContractRisk = {
  level: ContractRiskLevel
  label: string
  reasons: string[]
  recommendation: string
  patternIds: string[]
}

/**
 * Lightweight wallet-risk classifier.
 *
 * Important framing for the Sourcify bounty:
 * - Sourcify verification means the contract is inspectable/open source.
 * - It does NOT mean the contract is safe.
 * - This layer uses Sourcify-derived ABI/source verification plus common
 *   wallet-risk patterns to give non-technical users an actionable warning.
 */
export function assessContractRisk(args: {
  decoded: DecodedTx
  verification: SourceVerification
}): ContractRisk {
  const { decoded, verification } = args
  const fn = normalizedFunctionName(decoded.functionName)
  const hasCalldata = decoded.selector !== "0x"

  if (hasCalldata && !verification.sourceVerified) {
    return {
      level: "high",
      label: "Unverified contract call",
      reasons: [
        "The contract source was not verified through Sourcify.",
        "Your Twin cannot inspect verified source or decode this call from verified ABI data.",
      ],
      recommendation: "Do not sign unless you fully trust where this transaction came from.",
      patternIds: ["unverified-contract-calldata"],
    }
  }

  if (!decoded.matched || fn.startsWith("unknown(")) {
    return {
      level: "high",
      label: "Unknown function selector",
      reasons: [
        "The calldata selector could not be mapped to a known verified function.",
      ],
      recommendation: "Do not sign unless another trusted tool or person explains this exact call.",
      patternIds: ["unknown-function-selector"],
    }
  }

  if (fn === "approve") {
    const amount = argValue(decoded.args, "amount")
    const spender = argValue(decoded.args, "spender")
    const unlimited = typeof amount === "bigint" && amount === MAX_UINT256
    return {
      level: unlimited ? "high" : "medium",
      label: unlimited ? "Unlimited token approval" : "Token approval",
      reasons: [
        unlimited
          ? "This appears to approve the maximum possible token amount. Unlimited approvals are a common wallet-drain risk if the spender is malicious or later compromised."
          : "This allows another address or contract to spend tokens from the wallet.",
        ...(typeof spender === "string" ? [`Spender: ${spender}`] : []),
      ],
      recommendation: unlimited
        ? "Avoid unlimited approvals unless you fully trust the spender. Prefer an exact amount approval."
        : "Only approve if this spender and amount are expected.",
      patternIds: unlimited ? ["erc20-unlimited-approval"] : ["erc20-approval"],
    }
  }

  if (fn === "setapprovalforall") {
    const approved = argValue(decoded.args, "approved")
    const operator = argValue(decoded.args, "operator")
    const grantsAccess = approved === true || approved === "true"
    return {
      level: grantsAccess ? "high" : "medium",
      label: grantsAccess ? "Collection-wide approval" : "Approval-for-all change",
      reasons: [
        grantsAccess
          ? "This may grant another operator access to all assets in a collection. This is a common NFT wallet-drain pattern when abused."
          : "This changes collection-wide operator permissions.",
        ...(typeof operator === "string" ? [`Operator: ${operator}`] : []),
      ],
      recommendation: grantsAccess
        ? "Do not sign unless you explicitly intended to grant this operator collection-wide access."
        : "Check that this operator permission change is expected.",
      patternIds: grantsAccess ? ["erc721-approval-for-all"] : ["approval-for-all-change"],
    }
  }

  if (fn === "transferfrom") {
    return {
      level: "medium",
      label: "Transfer-from action",
      reasons: [
        "This moves tokens or assets from one address to another and can be dangerous if the source address is yours or a trusted account.",
      ],
      recommendation: "Confirm the from, to, and amount fields carefully before signing.",
      patternIds: ["transfer-from"],
    }
  }

  if (verification.sourceProvider === "sourcify" && verification.match === "partial") {
    return {
      level: "medium",
      label: "Partially verified source",
      reasons: [
        "Sourcify found a partial match, not a full match. The contract is more inspectable than an unverified contract, but it deserves extra caution.",
      ],
      recommendation: "Review the decoded action carefully before signing.",
      patternIds: ["sourcify-partial-match"],
    }
  }

  if (fn === "transfer") {
    return {
      level: verification.sourceVerified ? "low" : "medium",
      label: verification.sourceVerified ? "Decoded token transfer" : "Token transfer",
      reasons: [
        verification.sourceVerified
          ? "The action was decoded from known or verified ABI data and matches a standard transfer pattern."
          : "The action looks like a transfer, but source verification was limited.",
      ],
      recommendation: "Confirm the recipient and amount before signing.",
      patternIds: ["standard-transfer"],
    }
  }

  if (!hasCalldata) {
    return {
      level: "low",
      label: "Native token transfer",
      reasons: ["No calldata is attached, so this is not an unknown smart-contract call."],
      recommendation: "Confirm the recipient and amount before sending.",
      patternIds: ["native-transfer"],
    }
  }

  if (verification.sourceVerified) {
    return {
      level: "low",
      label: "Decoded verified action",
      reasons: [
        "The call was decoded using known or Sourcify-verified ABI data.",
        "No high-risk wallet pattern matched this action.",
      ],
      recommendation: "The action is understandable. Still confirm that it matches your intent.",
      patternIds: ["decoded-verified-action"],
    }
  }

  return {
    level: "unknown",
    label: "Unknown risk",
    reasons: ["EthTwin could not classify this interaction with the current risk rules."],
    recommendation: "Review carefully before signing.",
    patternIds: ["unknown-risk"],
  }
}

function normalizedFunctionName(functionName: string): string {
  return functionName.trim().toLowerCase()
}

function argValue(args: DecodedArg[], name: string): unknown {
  return args.find((arg) => arg.name.toLowerCase() === name.toLowerCase())?.value
}
