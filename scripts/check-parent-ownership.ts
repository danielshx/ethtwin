import { sepoliaClient } from "../lib/viem"
import { namehash, getAddress } from "viem"

// Sepolia ENS Registry (canonical, same address as mainnet ENS deployment)
const ENS_REGISTRY = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e" as const

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
] as const

const EXPECTED_OWNER = getAddress("0x4E09c220BD556396Bc255A4DD24F858Bafeba6f5")

async function main() {
  const name = process.env.NEXT_PUBLIC_PARENT_DOMAIN ?? "ethtwin.eth"
  const node = namehash(name)
  console.log(`Checking ${name} on Sepolia ENS...`)
  console.log(`  namehash: ${node}`)

  const [owner, resolver] = await Promise.all([
    sepoliaClient.readContract({
      address: ENS_REGISTRY,
      abi: REGISTRY_ABI,
      functionName: "owner",
      args: [node],
    }),
    sepoliaClient.readContract({
      address: ENS_REGISTRY,
      abi: REGISTRY_ABI,
      functionName: "resolver",
      args: [node],
    }),
  ])

  console.log(`  registry owner:    ${owner}`)
  console.log(`  resolver:          ${resolver}`)
  console.log(`  expected owner:    ${EXPECTED_OWNER}`)

  if (owner === "0x0000000000000000000000000000000000000000") {
    console.log(`\nFAIL  ${name} is NOT registered on Sepolia ENS.`)
  } else if (getAddress(owner) === EXPECTED_OWNER) {
    console.log(`\nOK    Sepolia ${name} is owned by the dev wallet.`)
  } else {
    console.log(`\nWARN  Sepolia ${name} is registered, but NOT to the expected wallet.`)
  }
}

main()
