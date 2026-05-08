import { keccak256, namehash, toBytes, type Address, type Hash } from "viem"
import { mainnetClient, sepoliaClient, getDevWalletClient } from "./viem"

export type TwinTextRecords = {
  description?: string
  avatar?: string
  url?: string
  "twin.persona"?: string
  "twin.capabilities"?: string
  "twin.endpoint"?: string
  "twin.version"?: string
  "stealth-meta-address"?: string
}

const KNOWN_TEXT_KEYS: (keyof TwinTextRecords)[] = [
  "description",
  "avatar",
  "url",
  "twin.persona",
  "twin.capabilities",
  "twin.endpoint",
  "twin.version",
  "stealth-meta-address",
]

const isSepolia = process.env.NEXT_PUBLIC_ENS_NETWORK === "sepolia"
const client = isSepolia ? sepoliaClient : mainnetClient

// ENS Registry — same address on mainnet + Sepolia.
export const ENS_REGISTRY: Address = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e"

const REGISTRY_ABI = [
  {
    name: "owner",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "resolver",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ name: "", type: "address" }],
  },
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
] as const

const RESOLVER_ABI = [
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
] as const

// ── Read helpers ─────────────────────────────────────────────────────────────

export async function resolveEnsAddress(name: string) {
  return client.getEnsAddress({ name })
}

export async function reverseResolve(address: `0x${string}`) {
  return client.getEnsName({ address })
}

export async function readTwinRecords(name: string): Promise<TwinTextRecords> {
  const entries = await Promise.all(
    KNOWN_TEXT_KEYS.map(async (key) => {
      try {
        const value = await client.getEnsText({ name, key })
        return [key, value ?? undefined] as const
      } catch {
        return [key, undefined] as const
      }
    }),
  )
  return Object.fromEntries(entries.filter(([, v]) => v !== undefined)) as TwinTextRecords
}

export async function readTextRecord(name: string, key: string) {
  return client.getEnsText({ name, key })
}

export async function readSubnameOwner(name: string): Promise<Address> {
  return client.readContract({
    address: ENS_REGISTRY,
    abi: REGISTRY_ABI,
    functionName: "owner",
    args: [namehash(name)],
  })
}

export async function readResolver(name: string): Promise<Address> {
  return client.readContract({
    address: ENS_REGISTRY,
    abi: REGISTRY_ABI,
    functionName: "resolver",
    args: [namehash(name)],
  })
}

// ── Write helpers (server-side only — uses DEV_WALLET_PRIVATE_KEY) ──────────

/**
 * Creates a subname `<label>.<parent>` on the ENS Registry, owned by `owner`,
 * pointed at `resolver`. Requires the dev wallet to control the parent.
 *
 * Returns the transaction hash.
 */
export async function createSubname(args: {
  parent: string
  label: string
  owner: Address
  resolver: Address
}): Promise<Hash> {
  const { wallet, account } = getDevWalletClient()
  const parentNode = namehash(args.parent)
  const labelHash = keccak256(toBytes(args.label))
  return wallet.writeContract({
    account,
    chain: wallet.chain,
    address: ENS_REGISTRY,
    abi: REGISTRY_ABI,
    functionName: "setSubnodeRecord",
    args: [parentNode, labelHash, args.owner, args.resolver, 0n],
  })
}

/**
 * Sets a text record on the resolver currently bound to `name`.
 * The dev wallet must be the owner of `name` (or an approved operator).
 */
export async function setTextRecord(name: string, key: string, value: string): Promise<Hash> {
  const { wallet, account } = getDevWalletClient()
  const resolverAddr = await readResolver(name)
  if (resolverAddr === "0x0000000000000000000000000000000000000000") {
    throw new Error(`No resolver set for ${name}. Set one before writing text records.`)
  }
  return wallet.writeContract({
    account,
    chain: wallet.chain,
    address: resolverAddr,
    abi: RESOLVER_ABI,
    functionName: "setText",
    args: [namehash(name), key, value],
  })
}

/**
 * Sets the forward address record on the resolver bound to `name`.
 * Useful so `daniel.twinpilot.eth` resolves to the user's wallet.
 */
export async function setAddressRecord(name: string, addr: Address): Promise<Hash> {
  const { wallet, account } = getDevWalletClient()
  const resolverAddr = await readResolver(name)
  if (resolverAddr === "0x0000000000000000000000000000000000000000") {
    throw new Error(`No resolver set for ${name}. Set one before writing address records.`)
  }
  return wallet.writeContract({
    account,
    chain: wallet.chain,
    address: resolverAddr,
    abi: RESOLVER_ABI,
    functionName: "setAddr",
    args: [namehash(name), addr],
  })
}

// ── Stealth meta-address (EIP-5564) ──────────────────────────────────────────

const STEALTH_META_KEY = "stealth-meta-address"

/** Read the stealth meta-address URI stored in the ENS text record. */
export async function readStealthMetaAddress(name: string): Promise<string | null> {
  return readTextRecord(name, STEALTH_META_KEY)
}

/** Write a stealth meta-address URI to the ENS text record. Requires owner key. */
export async function setStealthMetaAddress(name: string, uri: string): Promise<Hash> {
  return setTextRecord(name, STEALTH_META_KEY, uri)
}

// ── UI helpers ───────────────────────────────────────────────────────────────

/**
 * Returns the ENS name for `address` if one resolves, else a shortened 0x… form.
 * Read-only; safe to import from server components.
 */
export async function withEnsName(address: Address): Promise<string> {
  try {
    const name = await reverseResolve(address)
    if (name) return name
  } catch {
    // fall through to short form
  }
  return shortenAddress(address)
}

export function shortenAddress(address: string, head = 6, tail = 4): string {
  if (address.length <= head + tail + 2) return address
  return `${address.slice(0, head)}…${address.slice(-tail)}`
}
