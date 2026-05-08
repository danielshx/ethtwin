import { encodePacked, toHex, type Address } from "viem"
import { readTextRecord } from "./ens"

export const ERC8004_REGISTRY = {
  mainnet: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" as Address,
  baseSepolia: "0x8004A818BFB912233c491871b3d84c89A494BD9e" as Address,
  sepolia: "0x8004A818BFB912233c491871b3d84c89A494BD9e" as Address,
} as const

export const CHAIN_REFERENCE = {
  mainnet: 1,
  baseSepolia: 84532,
  sepolia: 11155111,
} as const

// Minimal ERC-7930 encoder for EVM addresses on a given chain.
// Format (binary): version(2) | chainType(2) | chainRefLen(1) | chainRef | addrLen(1) | addr
// We expose a hex string — the exact byte layout MUST be verified against the
// ENSIP-25 reference impl before submission.
export function encodeInteropAddress(
  registry: Address,
  chainId: number,
): `0x${string}` {
  const chainIdHex = toHex(chainId, { size: 4 })
  return encodePacked(
    ["uint16", "uint16", "uint8", "bytes4", "uint8", "address"],
    [0x0001, 0x0000, 4, chainIdHex, 20, registry],
  )
}

// Lookup the ENSIP-25 agent-registration text record on an ENS name.
// Returns true if the agent claims registration in the given registry.
export async function verifyAgentRegistration(
  name: string,
  registry: Address,
  chainId: number,
  agentId: string | number,
): Promise<boolean> {
  const interop = encodeInteropAddress(registry, chainId)
  const key = `agent-registration[${interop}][${agentId}]`
  const value = await readTextRecord(name, key)
  return value === "1"
}
