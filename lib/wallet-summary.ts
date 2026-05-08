import { formatEther, getAddress, type Address } from "viem"
import { baseSepoliaClient, sepoliaClient } from "./viem"
import { reverseResolve, shortenAddress } from "./ens"

export type WalletSummary = {
  address: Address
  shortAddress: string
  baseSepoliaEth: string
  sepoliaEth: string
  reverseEnsName: string | null
  plainEnglish: string
}

export async function getWalletSummary(address: string): Promise<WalletSummary> {
  const checksummed = getAddress(address)

  const [baseSepoliaBalance, sepoliaBalance, reverseEnsName] = await Promise.all([
    baseSepoliaClient.getBalance({ address: checksummed }),
    sepoliaClient.getBalance({ address: checksummed }),
    reverseResolve(checksummed).catch(() => null),
  ])

  const baseSepoliaEth = formatEther(baseSepoliaBalance)
  const sepoliaEth = formatEther(sepoliaBalance)
  const shortAddress = shortenAddress(checksummed)

  return {
    address: checksummed,
    shortAddress,
    baseSepoliaEth,
    sepoliaEth,
    reverseEnsName,
    plainEnglish: [
      `Wallet ${reverseEnsName ?? shortAddress} is ready for Twinpilot.`,
      `It currently holds ${baseSepoliaEth} ETH on Base Sepolia and ${sepoliaEth} ETH on Ethereum Sepolia.`,
      "Base Sepolia is used for the smart-wallet app flow; Ethereum Sepolia is used for ENS identity records.",
    ].join(" "),
  }
}
