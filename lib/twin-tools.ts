import { tool } from "ai"
import { z } from "zod"
import { callApifyX402 } from "./x402-client"
import { generatePrivateAddress } from "./stealth"
import {
  ERC8004_REGISTRY,
  CHAIN_REFERENCE,
  verifyAgentRegistration,
} from "./ensip25"
import { readTwinRecords } from "./ens"

export const twinTools = {
  requestDataViaX402: tool({
    description:
      "Fetch live data from an Apify actor via x402 micropayment. Use when you need fresh on-chain or web data the user is asking about.",
    inputSchema: z.object({
      actor: z.string().describe("Apify actor path, e.g. 'username/scraper'"),
      input: z.record(z.string(), z.unknown()).describe("Input payload for the actor"),
    }),
    execute: async ({ actor, input }) => {
      const data = await callApifyX402(actor, input)
      return { ok: true, data }
    },
  }),

  decodeTransaction: tool({
    description:
      "Translate a raw transaction or call data into plain English so the user can decide whether to sign.",
    inputSchema: z.object({
      to: z.string(),
      value: z.string().optional(),
      data: z.string().optional(),
      chain: z.enum(["base-sepolia", "sepolia", "mainnet"]).default("base-sepolia"),
    }),
    execute: async ({ to, value, data, chain }) => {
      // Stub — Phase 1 implements real decoding via ABIs + ENS reverse-resolve.
      return {
        plainEnglish: `Send ${value ?? "0"} to ${to} on ${chain}.`,
        rawData: data ?? null,
      }
    },
  }),

  generatePrivatePaymentAddress: tool({
    description:
      "Generate a one-time stealth address for a private payment to an ENS name. Uses cosmic randomness for the ephemeral key.",
    inputSchema: z.object({
      recipientEnsName: z.string(),
    }),
    execute: async ({ recipientEnsName }) => {
      const records = await readTwinRecords(recipientEnsName)
      const meta = records["stealth-meta-address"]
      if (!meta) {
        return {
          ok: false,
          error: `${recipientEnsName} has no stealth-meta-address record`,
        }
      }
      const result = await generatePrivateAddress(meta)
      return { ok: true, recipientEnsName, ...result }
    },
  }),

  hireAgent: tool({
    description:
      "Discover, verify (ENSIP-25), and pay another agent via x402 to perform a sub-task.",
    inputSchema: z.object({
      agentEnsName: z.string(),
      agentId: z.union([z.string(), z.number()]),
      task: z.string(),
    }),
    execute: async ({ agentEnsName, agentId, task }) => {
      const verified = await verifyAgentRegistration(
        agentEnsName,
        ERC8004_REGISTRY.baseSepolia,
        CHAIN_REFERENCE.baseSepolia,
        agentId,
      )
      const records = await readTwinRecords(agentEnsName)
      const endpoint = records["twin.endpoint"]
      if (!endpoint) {
        return { ok: false, verified, error: "agent has no twin.endpoint record" }
      }
      // Phase 2 wires this through paidFetch(); stub returns the call plan.
      return {
        ok: true,
        verified,
        endpoint,
        task,
      }
    },
  }),
} as const
