import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })
loadEnv()

import { createPublicClient, http, namehash } from "viem"
import { sepolia } from "viem/chains"

const REG = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e" as const
const RPCS = [
  "https://eth-sepolia.g.alchemy.com/v2/VnDHq7fsAyloEY3w9oQGK",
  "https://ethereum-sepolia-rpc.publicnode.com",
  "https://sepolia.gateway.tenderly.co",
]
const ABI = [
  {
    name: "owner",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "recordExists",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
  },
] as const

const NAMES = ["eth", "ethtwin.eth"]

async function main() {
  for (const url of RPCS) {
    console.log(`\n=== RPC: ${url}`)
    const client = createPublicClient({ chain: sepolia, transport: http(url) })
    try {
      const block = await client.getBlockNumber()
      console.log(`  block: ${block}`)
    } catch (e) {
      console.log(`  block: <err>`, e instanceof Error ? e.message : e)
      continue
    }
    for (const name of NAMES) {
      const node = namehash(name)
      try {
        const owner = await client.readContract({
          address: REG,
          abi: ABI,
          functionName: "owner",
          args: [node],
        })
        console.log(`  owner(${name})  = ${owner}`)
      } catch (e) {
        console.log(`  owner(${name}) <err>`, e instanceof Error ? e.message : e)
      }
      try {
        const exists = await client.readContract({
          address: REG,
          abi: ABI,
          functionName: "recordExists",
          args: [node],
        })
        console.log(`  exists(${name}) = ${exists}`)
      } catch (e) {
        console.log(`  exists(${name}) <err>`, e instanceof Error ? e.message : e)
      }
    }
  }
}

main().catch(console.error)
