import { createPublicClient, http } from "viem"
import { sepolia, baseSepolia } from "viem/chains"

const sepoliaClient = createPublicClient({
  chain: sepolia,
  transport: http(process.env.SEPOLIA_RPC),
})
const baseClient = createPublicClient({
  chain: baseSepolia,
  transport: http(process.env.NEXT_PUBLIC_BASE_RPC ?? "https://sepolia.base.org"),
})

console.log("Sepolia block:", await sepoliaClient.getBlockNumber())
console.log("Base Sepolia block:", await baseClient.getBlockNumber())

const addr = await sepoliaClient.getEnsAddress({ name: "vitalik.eth" })
console.log("vitalik.eth →", addr)
