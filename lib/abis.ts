// Minimal ABI fragments for the contracts the Twin will interact with on the demo path.
// Kept hand-rolled and small so viem can decode by selector; expand only as needed.

import type { Abi, Address } from "viem"

export const erc20Abi = [
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
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "transferFrom",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const satisfies Abi

export const erc721Abi = [
  {
    name: "transferFrom",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "tokenId", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "safeTransferFrom",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "tokenId", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "tokenId", type: "uint256" },
    ],
    outputs: [],
  },
] as const satisfies Abi

export const ensRegistryAbi = [
  {
    name: "setSubnodeRecord",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "label", type: "bytes32" },
      { name: "owner", type: "address" },
      { name: "resolver", type: "address" },
      { name: "ttl", type: "uint64" },
    ],
    outputs: [],
  },
  {
    name: "setOwner",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "owner", type: "address" },
    ],
    outputs: [],
  },
  {
    name: "setResolver",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "resolver", type: "address" },
    ],
    outputs: [],
  },
  {
    name: "setRecord",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "owner", type: "address" },
      { name: "resolver", type: "address" },
      { name: "ttl", type: "uint64" },
    ],
    outputs: [],
  },
] as const satisfies Abi

/**
 * ERC-5564 Announcer — canonical contract at 0x55649E01B5Df198D18D95b5cc5051630cfD45564
 * (deterministic deploy across mainnet, Sepolia, Base Sepolia, etc.).
 *
 * Emits the Announcement event that lets recipients scan the chain for
 * inbound stealth payments WITHOUT any off-chain coordination. Without this,
 * a stealth send is just an opaque ERC-20 transfer to a random-looking
 * address and the recipient can't find it.
 */
export const erc5564AnnouncerAbi = [
  {
    name: "announce",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "schemeId", type: "uint256" },
      { name: "stealthAddress", type: "address" },
      { name: "ephemeralPubKey", type: "bytes" },
      { name: "metadata", type: "bytes" },
    ],
    outputs: [],
  },
  {
    name: "Announcement",
    type: "event",
    inputs: [
      { name: "schemeId", type: "uint256", indexed: true },
      { name: "stealthAddress", type: "address", indexed: true },
      { name: "caller", type: "address", indexed: true },
      { name: "ephemeralPubKey", type: "bytes", indexed: false },
      { name: "metadata", type: "bytes", indexed: false },
    ],
  },
] as const satisfies Abi

export const ensResolverAbi = [
  {
    name: "text",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "key", type: "string" },
    ],
    outputs: [{ name: "", type: "string" }],
  },
  {
    name: "addr",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "setText",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "key", type: "string" },
      { name: "value", type: "string" },
    ],
    outputs: [],
  },
  {
    name: "setAddr",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "a", type: "address" },
    ],
    outputs: [],
  },
  {
    name: "multicall",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "data", type: "bytes[]" }],
    outputs: [{ name: "results", type: "bytes[]" }],
  },
] as const satisfies Abi

// Known contract registry: address (lowercase) → { name, abi }.
// Seeded with addresses we actually touch. Matched on Sepolia first, then mainnet.
export type KnownContract = {
  name: string
  abi: Abi
  decimals?: number
  symbol?: string
}

export const KNOWN_CONTRACTS: Record<Address, KnownContract> = {
  // ENS Registry — same address on mainnet + Sepolia
  "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e": {
    name: "ENS Registry",
    abi: ensRegistryAbi,
  },
  // Sepolia public resolver bound to ethtwin.eth in our setup
  "0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5": {
    name: "ENS Public Resolver (Sepolia)",
    abi: ensResolverAbi,
  },
  // USDC on Base Sepolia (x402 payments)
  "0x036CbD53842c5426634e7929541eC2318f3dCF7e": {
    name: "USDC (Base Sepolia)",
    abi: erc20Abi,
    decimals: 6,
    symbol: "USDC",
  },
  // USDC on Sepolia
  "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238": {
    name: "USDC (Sepolia)",
    abi: erc20Abi,
    decimals: 6,
    symbol: "USDC",
  },
}

// Fallback ABI to try when the address is unknown — selectors we still want to recognize.
export const FALLBACK_ABIS: Abi[] = [erc20Abi, erc721Abi, ensRegistryAbi, ensResolverAbi]

/** Case-insensitive lookup. */
export function lookupContract(address: Address): KnownContract | undefined {
  const lower = address.toLowerCase()
  for (const [k, v] of Object.entries(KNOWN_CONTRACTS)) {
    if (k.toLowerCase() === lower) return v
  }
  return undefined
}
