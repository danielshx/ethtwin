import { mainnetClient, sepoliaClient } from "./viem"

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

const client = process.env.NEXT_PUBLIC_ENS_NETWORK === "sepolia"
  ? sepoliaClient
  : mainnetClient

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
