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
import { describeTx } from "./tx-decoder"
import { sendStealthUSDC } from "./payments"
import { getWalletSummary } from "./wallet-summary"
import { sendToken, getTokenBalance, parseRecipient } from "./transfers"

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

  sendToken: tool({
    description:
      "Send native ETH or USDC on Sepolia or Base Sepolia. Recipient can be an ENS name (e.g. alice.ethtwin.eth) or a 0x address. Returns the on-chain tx hash + block-explorer link.",
    inputSchema: z.object({
      chain: z
        .enum(["sepolia", "base-sepolia"])
        .describe("Which chain to send on. Pick base-sepolia for fast cheap transfers, sepolia for ENS-aligned demos."),
      token: z.enum(["ETH", "USDC"]).describe("Native ETH or USDC ERC-20"),
      to: z
        .string()
        .describe("Recipient ENS name (resolved on Sepolia) or 0x... address"),
      amount: z
        .union([z.string(), z.number()])
        .describe("Human-readable amount, e.g. 0.001 (ETH) or 0.5 (USDC)"),
    }),
    execute: async (input) => {
      try {
        const result = await sendToken(input)
        return {
          ok: true,
          chain: result.chain,
          token: result.token,
          from: result.from,
          to: result.to,
          recipientInput: result.recipientInput,
          amount: `${result.amountHuman} ${result.token}`,
          txHash: result.txHash,
          blockNumber: result.blockNumber.toString(),
          blockExplorerUrl: result.blockExplorerUrl,
        }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    },
  }),

  getBalance: tool({
    description:
      "Read an address's native ETH or USDC balance on Sepolia or Base Sepolia. Use before proposing a transfer.",
    inputSchema: z.object({
      chain: z.enum(["sepolia", "base-sepolia"]),
      token: z.enum(["ETH", "USDC"]),
      address: z.string().describe("0x... address or ENS name"),
    }),
    execute: async ({ chain, token, address }) => {
      try {
        const resolved = await parseRecipient(address)
        const balance = await getTokenBalance({ chain, token, address: resolved })
        return {
          ok: true,
          chain,
          token,
          address: resolved,
          balance: `${balance.human} ${token}`,
          raw: balance.raw.toString(),
        }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
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
