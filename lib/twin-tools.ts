import { tool } from "ai"
import { z } from "zod"
import { type Address, type Hex } from "viem"
import { callApifyX402, paidFetchWithReceipt } from "./x402-client"
import { appendServerHistory } from "./history-server"
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
import { readAgentDirectory } from "./agents"
import { sendMessage as sendEnsMessage } from "./messages"

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
      "Fetch live data from an Apify Pay-Per-Event actor via x402 micropayment ($1+ USDC on Base Mainnet). Returns the actor output AND the on-chain tx hash + basescan link. Use when you need fresh on-chain or web data the user is asking about.",
    inputSchema: z.object({
      actor: z
        .string()
        .describe("Apify actor path with `~` separator, e.g. 'apify~instagram-post-scraper'"),
      input: z.record(z.string(), z.unknown()).describe("Input payload for the actor"),
    }),
    execute: async ({ actor, input }) => {
      try {
        const { data, receipt } = await callApifyX402(actor, input)
        return {
          ok: true,
          actor,
          data,
          txHash: receipt.txHash,
          chain: receipt.chain,
          payer: receipt.payer,
          blockExplorerUrl: receipt.explorerUrl,
        }
      } catch (err) {
        return {
          ok: false,
          actor,
          error: err instanceof Error ? err.message : String(err),
        }
      }
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

  findAgents: tool({
    description:
      "Discover hireable peer agents from the on-chain ethtwin.eth directory. Returns each agent's ENS name, twin.endpoint, twin.persona, and ENSIP-25 verification status. Use before hireAgent to pick the right peer.",
    inputSchema: z.object({
      agentId: z
        .union([z.string(), z.number()])
        .optional()
        .describe(
          "ERC-8004 agent id used to verify ENSIP-25 registration (defaults to '1' for the sample analyst).",
        ),
    }),
    execute: async ({ agentId = 1 }) => {
      const directory = await readAgentDirectory()
      const agents = await Promise.all(
        directory.map(async (entry) => {
          const records = await readTwinRecords(entry.ens).catch(
            () => ({}) as Record<string, string | undefined>,
          )
          const verified = await verifyAgentRegistration(
            entry.ens,
            ERC8004_REGISTRY.baseSepolia,
            CHAIN_REFERENCE.baseSepolia,
            agentId,
          ).catch(() => false)
          return {
            ens: entry.ens,
            addedAt: entry.addedAt,
            endpoint: records["twin.endpoint"],
            persona: records["twin.persona"] ?? records["description"],
            ensip25Verified: verified,
          }
        }),
      )
      return { ok: true, agents }
    },
  }),

} as const

export type TwinToolContext = {
  /** ENS name of the Twin running this conversation. Used as `from` for messenger sends + history scoping. */
  fromEns?: string
}

/**
 * Build the `hireAgent` tool with optional history-context. When `fromEns` is
 * provided, successful x402 payments are appended to the server-side history
 * for that ENS so they show up in the Explorer tab.
 */
function buildHireAgentTool(ctx: TwinToolContext) {
  return tool({
    description:
      "Discover, verify (ENSIP-25), and pay another agent via x402 to perform a sub-task. Posts the task to the agent's twin.endpoint via paidFetchWithReceipt (auto-pays HTTP 402 challenges) and returns the on-chain tx hash + basescan link if the facilitator settled the payment on-chain.",
    inputSchema: z.object({
      agentEnsName: z.string(),
      agentId: z
        .union([z.string(), z.number()])
        .default(1)
        .describe("ERC-8004 agent id (defaults to 1 for the sample analyst)"),
      task: z.string(),
    }),
    execute: async ({ agentEnsName, agentId, task }) => {
      const verified = await verifyAgentRegistration(
        agentEnsName,
        ERC8004_REGISTRY.baseSepolia,
        CHAIN_REFERENCE.baseSepolia,
        agentId,
      ).catch(() => false)
      const records = await readTwinRecords(agentEnsName)
      const endpoint = records["twin.endpoint"]
      if (!endpoint) {
        return {
          ok: false,
          verified,
          agentEnsName,
          error: "agent has no twin.endpoint record",
        }
      }
      try {
        const { response: res, receipt } = await paidFetchWithReceipt(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ task }),
        })
        const text = await res.text()
        let body: unknown = text
        try {
          body = JSON.parse(text)
        } catch {
          // keep raw text — agent may stream plain text
        }
        if (!res.ok) {
          return {
            ok: false,
            verified,
            agentEnsName,
            endpoint,
            status: res.status,
            error:
              typeof body === "object" && body && "error" in body
                ? (body as { error: string }).error
                : `agent responded ${res.status}`,
          }
        }
        const answer =
          typeof body === "object" && body && "answer" in body
            ? (body as { answer: string }).answer
            : typeof body === "string"
              ? body
              : JSON.stringify(body)

        // If the facilitator returned a real on-chain settlement, mirror it
        // into server history so the Explorer tab can surface the tx.
        if (ctx.fromEns && receipt.txHash) {
          await appendServerHistory(ctx.fromEns, {
            kind: "other",
            status: "success",
            summary: `Hired ${agentEnsName} via x402`,
            description: `Task: ${task.slice(0, 140)}${task.length > 140 ? "…" : ""}`,
            txHash: receipt.txHash,
            ...(receipt.explorerUrl !== undefined && { explorerUrl: receipt.explorerUrl }),
            ...(receipt.chain !== undefined && { chain: receipt.chain }),
          }).catch(() => {
            // Best-effort: history failure must not break the tool result.
          })
        }

        return {
          ok: true,
          verified,
          agentEnsName,
          endpoint,
          status: res.status,
          answer,
          txHash: receipt.txHash,
          chain: receipt.chain,
          payer: receipt.payer,
          blockExplorerUrl: receipt.explorerUrl,
        }
      } catch (err) {
        return {
          ok: false,
          verified,
          agentEnsName,
          endpoint,
          error: err instanceof Error ? err.message : String(err),
        }
      }
    },
  })
}

/**
 * Context-aware Twin tool surface.
 * Returns the static `twinTools` plus tools that need request-scoped context
 * (e.g. `sendMessage` needs to know which Twin is sending; `hireAgent` needs
 * `fromEns` to scope x402 receipts into the right history file).
 */
export function buildTwinTools(ctx: TwinToolContext = {}) {
  return {
    ...twinTools,
    hireAgent: buildHireAgentTool(ctx),
    sendMessage: tool({
      description:
        "Send an on-chain ENS message to another twin. Each message becomes a child subname (msg-<ts>-<seq>.<recipient>) carrying from/body/at text records on Sepolia ENS. Use when the user asks the Twin to message, ping, or write to another agent.",
      inputSchema: z.object({
        toEns: z
          .string()
          .describe("Recipient ENS name, e.g. 'analyst.ethtwin.eth'"),
        body: z
          .string()
          .min(1)
          .max(1000)
          .describe("Message body (max 1000 chars)"),
      }),
      execute: async ({ toEns, body }) => {
        if (!ctx.fromEns) {
          return {
            ok: false,
            error:
              "Twin has no ENS identity in this session — cannot send messages.",
          }
        }
        try {
          const result = await sendEnsMessage({
            fromEns: ctx.fromEns,
            toEns,
            body,
          })
          return {
            ok: true,
            fromEns: ctx.fromEns,
            toEns,
            messageEns: result.message.ens,
            label: result.message.label,
            at: result.message.at,
            txHash: result.recordsMulticallTx,
            blockExplorerUrl: result.blockExplorerUrl,
          }
        } catch (err) {
          return {
            ok: false,
            fromEns: ctx.fromEns,
            toEns,
            error: err instanceof Error ? err.message : String(err),
          }
        }
      },
    }),
  } as const
}
