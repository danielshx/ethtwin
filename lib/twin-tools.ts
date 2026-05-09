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
import { readInbox } from "./messages"
import { baseSepoliaClient, sepoliaClient } from "./viem"

const TX_EXPLORERS = {
  sepolia: "https://sepolia.etherscan.io",
  "base-sepolia": "https://sepolia.basescan.org",
} as const

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

  checkTransactionStatus: tool({
    description:
      "Check whether a transaction hash is pending, confirmed, or failed on Sepolia or Base Sepolia. Use when the user asks if a token transfer, stealth send, message, or ENS transaction went through.",
    inputSchema: z.object({
      chain: z.enum(["sepolia", "base-sepolia"]),
      txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/).describe("Transaction hash to check"),
    }),
    execute: async ({ chain, txHash }) => {
      try {
        const client = chain === "sepolia" ? sepoliaClient : baseSepoliaClient
        const explorer = TX_EXPLORERS[chain]
        const hash = txHash as `0x${string}`
        const [receipt, currentBlock] = await Promise.all([
          client.getTransactionReceipt({ hash }).catch(() => null),
          client.getBlockNumber().catch(() => null),
        ])
        if (!receipt) {
          return {
            ok: true,
            chain,
            txHash: hash,
            status: "pending_or_not_found",
            confirmed: false,
            success: null,
            confirmations: 0,
            blockNumber: null,
            blockExplorerUrl: `${explorer}/tx/${hash}`,
            plainEnglish:
              "I could not find a mined receipt yet. The transaction may still be pending, or it may not have propagated to this RPC/indexer.",
          }
        }
        const confirmations =
          currentBlock && receipt.blockNumber
            ? Number(currentBlock - receipt.blockNumber + 1n)
            : null
        const success = receipt.status === "success"
        return {
          ok: true,
          chain,
          txHash: hash,
          status: success ? "confirmed" : "failed",
          confirmed: true,
          success,
          confirmations,
          blockNumber: receipt.blockNumber.toString(),
          gasUsed: receipt.gasUsed.toString(),
          from: receipt.from,
          to: receipt.to,
          blockExplorerUrl: `${explorer}/tx/${hash}`,
          plainEnglish: success
            ? `The transaction is confirmed on ${chain}${confirmations !== null ? ` with ${confirmations} confirmation${confirmations === 1 ? "" : "s"}` : ""}.`
            : `The transaction was mined on ${chain}, but it failed/reverted.`,
        }
      } catch (err) {
        return {
          ok: false,
          chain,
          txHash,
          error: err instanceof Error ? err.message : String(err),
        }
      }
    },
  }),

  sendToken: tool({
    description:
      "Send native ETH or USDC on Sepolia or Base Sepolia. Recipient can be an ENS name (e.g. alice.ethtwin.eth) or a 0x address. Returns the on-chain tx hash + block-explorer link. Use this immediately when the user explicitly asks to send, transfer, or pay a token and provides chain, token, recipient, and amount. Do not stop after getBalance in that case.",
    inputSchema: z.object({
      chain: z
        .enum(["sepolia", "base-sepolia"])
        .describe(
          "Which chain to send on. **DEFAULT: sepolia** for both ETH and USDC. Only switch to base-sepolia when the user explicitly says 'Base' or 'Base Sepolia'.",
        ),
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
      "Read an address's native ETH or USDC balance on Sepolia or Base Sepolia. Use before proposing a transfer, or when the user only asks to check/view a balance. Do not use this as the final step when the user explicitly asked to send a token and already provided chain, token, recipient, and amount.",
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
      "Send USDC on Base Sepolia to an ENS recipient via a one-time stealth address (EIP-5564). The recipient must have a stealth-meta-address text record. Seeded by Orbitport cTRNG when configured (cosmicSeeded=true) — falls back to local randomness with cosmicSeeded=false. Returns the stealth address, ephemeral key, view tag, on-chain tx hash, block-explorer link, and the cosmic attestation hash so callers can label the receipt with verifiable provenance.",
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
          // Surface the cTRNG attestation up to the chat receipt so anyone
          // looking at the conversation can cross-check provenance.
          cosmicAttestation: result.stealth.attestation,
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
  /** The on-chain address bound to fromEns (its `addr` text record). When set,
   *  parameter-less tools like `inspectMyWallet` can summarize the user's
   *  wallet without forcing the model to first resolve the ENS. */
  fromAddress?: Address
  /** Auto-reply chain depth. 0 (or undefined) = top-level user-driven turn.
   *  1+ = a recipient twin is autonomously responding via the auto-reply route.
   *  Used by `sendMessage` to cap runaway twin↔twin auto-reply chains. */
  chainDepth?: number
}

/** Hard cap on how many nested twin↔twin auto-reply hops we allow.
 *  Maria→Tom counts as 1; if Tom's auto-reply messages Alice, that's 2. */
const MAX_AUTO_REPLY_CHAIN_DEPTH = 2

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

    // Override the static sendToken so the sender's twin ENS is forwarded.
    // When the twin has a `twin.kms-key-id` text record on chain, the
    // transfers layer signs via SpaceComputer KMS — funds come out of the
    // twin's satellite-attested address instead of the dev wallet.
    sendToken: tool({
      description:
        "Send native ETH or USDC on Sepolia or Base Sepolia. Recipient can be an ENS name (e.g. alice.ethtwin.eth) or a 0x address. Returns the on-chain tx hash + block-explorer link. Use this immediately when the user explicitly asks to send, transfer, or pay a token and provides chain, token, recipient, and amount. Default chain is **sepolia** for both ETH and USDC unless the user explicitly says Base / Base Sepolia.",
      inputSchema: z.object({
        chain: z
          .enum(["sepolia", "base-sepolia"])
          .describe("DEFAULT: sepolia. Switch only when the user says 'Base' or 'Base Sepolia'."),
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
          const result = await sendToken({
            ...input,
            ...(ctx.fromEns ? { fromEns: ctx.fromEns } : {}),
          })
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
            viaKms: result.viaKms,
          }
        } catch (err) {
          return { ok: false, error: err instanceof Error ? err.message : String(err) }
        }
      },
    }),

    // Override the static sendStealthUsdc so a successful send to another
    // ethtwin.eth twin triggers a deterministic thank-you reply. Demo-payoff
    // for Maria→Tom; in production this is harmless (capped to twins under
    // our parent, fire-and-forget, never blocks the response).
    sendStealthUsdc: tool({
      description:
        "Send USDC on Base Sepolia to an ENS recipient via a one-time stealth address (EIP-5564). The recipient must have a stealth-meta-address text record. Returns the stealth address, on-chain tx hash, and a block-explorer link. The recipient twin will auto-reply with a short thank-you when both are under ethtwin.eth.",
      inputSchema: z.object({
        recipientEnsName: z.string().describe("e.g. 'tom.ethtwin.eth'"),
        amountUsdc: z
          .union([z.string(), z.number()])
          .describe("Human-readable USDC amount, e.g. 0.5 or '0.01'"),
      }),
      execute: async ({ recipientEnsName, amountUsdc }) => {
        try {
          const result = await sendStealthUSDC({ recipientEnsName, amountUsdc })
          if (ctx.fromEns) {
            triggerThankYou({
              fromEns: ctx.fromEns,
              toEns: result.recipient.ens,
              amount: `${result.amountHuman} USDC`,
            })
          }
          return {
            ok: true,
            fromEns: ctx.fromEns ?? null,
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

    inspectMyWallet: tool({
      description:
        "Read the user's own twin wallet on-chain: ETH balances on Sepolia + Base Sepolia, ENS reverse-resolution, and a plain-English summary. Use IMMEDIATELY whenever the user asks about 'my wallet', 'my balance', 'what you know about me/my account', or any first-person on-chain question. Takes no arguments — uses the twin's session identity.",
      inputSchema: z.object({}),
      execute: async () => {
        if (!ctx.fromAddress) {
          return {
            ok: false,
            error:
              "No wallet address resolved for this twin yet. Try again in a moment, or ask me to look up a specific address.",
          }
        }
        try {
          const summary = await getWalletSummary(ctx.fromAddress)
          return {
            ok: true,
            ensName: ctx.fromEns ?? null,
            address: summary.address,
            shortAddress: summary.shortAddress,
            sepoliaEth: summary.sepoliaEth,
            baseSepoliaEth: summary.baseSepoliaEth,
            reverseEnsName: summary.reverseEnsName,
            plainEnglish: summary.plainEnglish,
          }
        } catch (err) {
          return {
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          }
        }
      },
    }),

    readMyEnsRecords: tool({
      description:
        "Read the user's own twin ENS text records: avatar, description (bio), persona, declared capabilities, twin endpoint, version, stealth-meta-address. Use when the user asks about their own profile, identity, or what's stored in their ENS.",
      inputSchema: z.object({}),
      execute: async () => {
        if (!ctx.fromEns) {
          return { ok: false, error: "No twin ENS in this session." }
        }
        try {
          const records = await readTwinRecords(ctx.fromEns)
          return {
            ok: true,
            ensName: ctx.fromEns,
            avatar: records["avatar"] ?? null,
            description: records["description"] ?? null,
            url: records["url"] ?? null,
            persona: records["twin.persona"] ?? null,
            capabilities: records["twin.capabilities"] ?? null,
            endpoint: records["twin.endpoint"] ?? null,
            version: records["twin.version"] ?? null,
            stealthMetaAddress: records["stealth-meta-address"] ?? null,
          }
        } catch (err) {
          return { ok: false, error: err instanceof Error ? err.message : String(err) }
        }
      },
    }),

    readMyMessages: tool({
      description:
        "Read recent on-chain messages addressed to the user's own twin (their ENS inbox). Each message is a sub-subname under the twin's ENS with from/body/at text records on Sepolia. Use when the user asks about their messages, who has contacted them, or recent inbox activity.",
      inputSchema: z.object({
        limit: z
          .number()
          .int()
          .min(1)
          .max(10)
          .optional()
          .describe("Max messages to return (default 5, capped at 10)."),
      }),
      execute: async ({ limit }) => {
        if (!ctx.fromEns) {
          return { ok: false, error: "No twin ENS in this session." }
        }
        try {
          const messages = await readInbox(ctx.fromEns, limit ?? 5)
          return {
            ok: true,
            ensName: ctx.fromEns,
            count: messages.length,
            messages: messages.map((m) => ({
              from: m.from,
              body: m.body,
              at: m.at,
            })),
          }
        } catch (err) {
          return { ok: false, error: err instanceof Error ? err.message : String(err) }
        }
      },
    }),

    listAgentDirectory: tool({
      description:
        "List all peer twins currently registered under ethtwin.eth. Use when the user asks who else is around, who they can message, or who they can hire. Lighter than findAgents — does not run ENSIP-25 verification per-agent.",
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const directory = await readAgentDirectory()
          return {
            ok: true,
            count: directory.length,
            agents: directory.map((d) => ({
              ens: d.ens,
              addedAt: d.addedAt,
            })),
          }
        } catch (err) {
          return { ok: false, error: err instanceof Error ? err.message : String(err) }
        }
      },
    }),

    sendMessage: tool({
      description:
        "Send an on-chain ENS message to another twin. The body is stealth-encrypted with AES-256-GCM and a Orbitport-cTRNG-seeded nonce before being written to the message subname's `body` text record, so plaintext never lands on chain. The cosmic attestation hash is also written on-chain (`stealth.cosmic-attestation` text record) so anyone can verify the seed's provenance. Use when the user asks the Twin to message, ping, or write to another agent. The recipient's twin will auto-respond shortly — pair this with `waitForReply` if the user expects an answer.",
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
          // Fire-and-forget: kick the recipient twin to auto-reply in their
          // persona. We don't await this — the user's agent will see the
          // reply via waitForReply / readMyMessages once it lands on-chain.
          // Cap nested chains so Tom→Alice→Bob→… can't run away.
          const currentDepth = ctx.chainDepth ?? 0
          const autoReplyExpected =
            toEns.toLowerCase().endsWith(".ethtwin.eth") &&
            currentDepth < MAX_AUTO_REPLY_CHAIN_DEPTH
          if (autoReplyExpected) {
            triggerAutoReply({
              fromEns: toEns, // recipient becomes the auto-replier
              toEns: ctx.fromEns,
              incomingBody: body,
              chainDepth: currentDepth + 1,
            })
          }
          return {
            ok: true,
            fromEns: ctx.fromEns,
            toEns,
            chatEns: result.mineChatEns,
            mirrorChatEns: result.theirsChatEns,
            messageIndex: result.message.index,
            createdChat: result.createdChat,
            at: result.message.at,
            txHash: result.recordsMulticallTx,
            blockExplorerUrl: result.blockExplorerUrl,
            autoReplyExpected,
            stealth: true,
            cosmicSeeded: result.cosmicSeeded,
            cosmicAttestation: result.cosmicAttestation,
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

    waitForReply: tool({
      description:
        "Poll the user's on-chain inbox for a NEW message from a specific peer twin and return it when it arrives. Use IMMEDIATELY after `sendMessage` whenever the user expects an answer (scheduling, asking a question, coordinating). Returns the reply, a `timedOut` flag, or 'no new message' if nothing new arrived in the window.",
      inputSchema: z.object({
        fromEns: z
          .string()
          .describe(
            "ENS name of the peer you're waiting on, e.g. 'daniel.ethtwin.eth'.",
          ),
        sinceUnixSec: z
          .number()
          .int()
          .optional()
          .describe(
            "Only consider messages strictly newer than this unix timestamp. Defaults to ~30s before the call so we ignore historical messages.",
          ),
        timeoutMs: z
          .number()
          .int()
          .min(2_000)
          .max(45_000)
          .optional()
          .describe("How long to poll (ms). Defaults to 25 000."),
      }),
      execute: async ({ fromEns, sinceUnixSec, timeoutMs }) => {
        if (!ctx.fromEns) {
          return { ok: false, error: "No twin ENS in this session." }
        }
        const since =
          typeof sinceUnixSec === "number"
            ? sinceUnixSec
            : Math.floor(Date.now() / 1000) - 30
        const deadline = Date.now() + (timeoutMs ?? 25_000)
        const peerLower = fromEns.toLowerCase()
        // Poll inbox every ~3s. The auto-reply tx usually lands in ~12-24s
        // on Sepolia, so the default 25s window covers it.
        while (Date.now() < deadline) {
          try {
            const inbox = await readInbox(ctx.fromEns, 5)
            const match = inbox.find(
              (m) =>
                m.from.toLowerCase() === peerLower && m.at > since,
            )
            if (match) {
              return {
                ok: true,
                from: match.from,
                body: match.body,
                at: match.at,
              }
            }
          } catch {
            // keep polling — transient RPC blips shouldn't kill the loop
          }
          await new Promise((res) => setTimeout(res, 3_000))
        }
        return {
          ok: true,
          timedOut: true,
          message:
            "No reply landed in the polling window. The recipient may still be drafting — try again in a moment or check the inbox manually.",
        }
      },
    }),
  } as const
}

// Fire-and-forget thank-you message after a successful send. Deterministic
// (no LLM in the loop) so the demo always lands the same emotional payoff —
// "thanks oma! 💜" lands on Maria's phone right after she sends to Tom.
// Scoped to recipients under `.ethtwin.eth` (parent we control via dev wallet).
function triggerThankYou(payload: {
  fromEns: string
  toEns: string
  amount: string
}) {
  const { fromEns, toEns, amount } = payload
  if (!toEns.toLowerCase().endsWith(".ethtwin.eth")) return
  if (!fromEns.toLowerCase().endsWith(".ethtwin.eth")) return
  const senderHandle = fromEns.split(".")[0]
  const body = `thanks ${senderHandle}! 💜 just got the ${amount}.`
  // 2-second delay so the receipt-postcard lands first; then notification fires.
  void (async () => {
    await new Promise((r) => setTimeout(r, 2000))
    try {
      await sendEnsMessage({ fromEns: toEns, toEns: fromEns, body })
    } catch {
      // Best-effort — if the dev wallet can't sign or the recipient parent
      // doesn't resolve, just skip; the demo still works without the reply.
    }
  })()
}

// Fire-and-forget call to the auto-reply route. Building the URL from
// VERCEL_URL / NEXT_PUBLIC_APP_URL keeps it correct in every deploy environment.
function triggerAutoReply(payload: {
  fromEns: string
  toEns: string
  incomingBody: string
  chainDepth?: number
}) {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ??
    "http://localhost:3000"
  void fetch(`${base}/api/twin/auto-reply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(() => {
    // Best-effort — if the auto-reply fails, the user's agent will simply
    // see no reply via waitForReply and report that back.
  })
}
