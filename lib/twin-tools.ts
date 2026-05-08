import { tool } from "ai"
import { z } from "zod"
import { type Address, type Hex } from "viem"
import { callApifyX402 } from "./x402-client"
import { generatePrivateAddress } from "./stealth"
import {
  ERC8004_REGISTRY,
  CHAIN_REFERENCE,
  verifyAgentRegistration,
} from "./ensip25"
import { readTwinRecords } from "./ens"
<<<<<<< HEAD
import { describeTx } from "./tx-decoder"
import { sendStealthUSDC } from "./payments"
=======
import { getWalletSummary } from "./wallet-summary"
>>>>>>> fcd697cc67b018f9b9a5e0e6858009dc80ea45ec

export const twinTools = {
  getWalletSummary: tool({
    description:
      "Get a concise summary of a wallet, including balances and ENS reverse resolution. Use when the user asks what the Twin knows about their wallet.",
    inputSchema: z.object({
      address: z.string().describe("Ethereum wallet address to summarize"),
    }),
    execute: async ({ address }) => {
      const summary = await getWalletSummary(address)
      return {
        ok: true,
        ...summary,
      }
    },
  }),

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
      "Translate a raw transaction (to/value/data) into plain English so the user can decide whether to sign. Recognizes ENS, ERC-20, ERC-721, and USDC transfers.",
    inputSchema: z.object({
      to: z.string().describe("Contract address or recipient EOA"),
      value: z.string().optional().describe("Wei amount as string, e.g. '1000000000000000000' for 1 ETH"),
      data: z.string().optional().describe("Calldata hex string starting with 0x"),
    }),
    execute: async ({ to, value, data }) => {
      const result = await describeTx({
        to: to as Address,
        value: value ? BigInt(value) : undefined,
        data: (data ?? "0x") as Hex,
      })
      return {
        plainEnglish: result.english,
        contractName: result.decoded.contractName,
        functionName: result.decoded.functionName,
        args: result.decoded.args.map((a) => ({
          name: a.name,
          type: a.type,
          value: typeof a.value === "bigint" ? a.value.toString() : a.value,
        })),
        matched: result.decoded.matched,
      }
    },
  }),

  sendStealthUsdc: tool({
    description:
      "Send USDC on Base Sepolia to an ENS recipient via a one-time stealth address (EIP-5564). The recipient must have a stealth-meta-address text record. Returns the stealth address, on-chain tx hash, and a block-explorer link.",
    inputSchema: z.object({
      recipientEnsName: z.string().describe("e.g. 'alice.ethtwin.eth'"),
      amountUsdc: z
        .union([z.string(), z.number()])
        .describe("Human-readable USDC amount, e.g. 0.5 or '0.01'"),
    }),
    execute: async ({ recipientEnsName, amountUsdc }) => {
      try {
        const result = await sendStealthUSDC({ recipientEnsName, amountUsdc })
        return {
          ok: true,
          recipientEnsName: result.recipient.ens,
          stealthAddress: result.stealth.stealthAddress,
          ephemeralPublicKey: result.stealth.ephemeralPublicKey,
          viewTag: result.stealth.viewTag,
          cosmicSeeded: result.stealth.cosmicSeeded,
          amount: result.amountHuman + " USDC",
          txHash: result.txHash,
          blockNumber: result.blockNumber.toString(),
          blockExplorerUrl: result.blockExplorerUrl,
        }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
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
