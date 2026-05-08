import { addEnsContracts, ensPublicActions } from "@ensdomains/ensjs"
import { createPublicClient, http, getAddress } from "viem"
import { sepolia } from "viem/chains"
import { sepoliaClient } from "../lib/viem"

// vitalik.eth resolves on Sepolia ENS deployment too.
const VITALIK = getAddress("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045")

async function step<T>(label: string, fn: () => Promise<T>): Promise<void> {
  try {
    const result = await fn()
    console.log(`OK    ${label}`)
    console.log(`      →`, result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.log(`FAIL  ${label}`)
    console.log(`      →`, msg.split("\n")[0])
  }
}

async function main() {
  if (!process.env.SEPOLIA_RPC) {
    console.log("WARN  SEPOLIA_RPC is not set in .env.local — falling back to viem default.")
  }

  await step("sepolia getBlockNumber", () => sepoliaClient.getBlockNumber())
  await step("sepolia chainId", () => sepoliaClient.getChainId())

  await step("sepolia getEnsAddress(vitalik.eth)", () =>
    sepoliaClient.getEnsAddress({ name: "vitalik.eth" }),
  )
  await step("sepolia getEnsText(vitalik.eth, url)", () =>
    sepoliaClient.getEnsText({ name: "vitalik.eth", key: "url" }),
  )

  const ensjsClient = createPublicClient({
    chain: addEnsContracts(sepolia),
    transport: http(process.env.SEPOLIA_RPC ?? undefined),
  }).extend(ensPublicActions)

  await step("ensjs sepolia getName(vitalik addr)", () =>
    ensjsClient.getName({ address: VITALIK }),
  )
}

main()
