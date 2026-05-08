// Tool definitions for OpenAI Realtime in the JSON-Schema shape it expects
// over the data channel. We hand-mirror the AI SDK v6 `twinTools` (zod) into
// plain JSON Schema so the Realtime client can call them via /api/twin-tool.
//
// Keep this in sync with `lib/twin-tools.ts`. If you add or rename a tool
// there, update the matching entry here. The shape is intentionally simple
// (object schemas, no $ref) so OpenAI Realtime accepts it without coercion.

export type RealtimeToolDef = {
  type: "function"
  name: string
  description: string
  parameters: {
    type: "object"
    properties: Record<string, unknown>
    required?: string[]
    additionalProperties?: boolean
  }
}

export const voiceTools: RealtimeToolDef[] = [
  {
    type: "function",
    name: "getWalletSummary",
    description:
      "Get a concise summary of a wallet, including balances and ENS reverse resolution.",
    parameters: {
      type: "object",
      properties: {
        address: { type: "string", description: "Ethereum wallet address" },
      },
      required: ["address"],
    },
  },
  {
    type: "function",
    name: "getBalance",
    description:
      "Read an address's native ETH or USDC balance on Sepolia or Base Sepolia.",
    parameters: {
      type: "object",
      properties: {
        chain: { type: "string", enum: ["sepolia", "base-sepolia"] },
        token: { type: "string", enum: ["ETH", "USDC"] },
        address: { type: "string", description: "0x... address or ENS name" },
      },
      required: ["chain", "token", "address"],
    },
  },
  {
    type: "function",
    name: "decodeTransaction",
    description:
      "Translate a raw transaction (to/value/data) into plain English so the user can decide whether to sign.",
    parameters: {
      type: "object",
      properties: {
        to: { type: "string", description: "Contract or recipient address" },
        value: { type: "string", description: "Wei amount as decimal string" },
        data: { type: "string", description: "Calldata hex string" },
      },
      required: ["to"],
    },
  },
  {
    type: "function",
    name: "sendToken",
    description:
      "Send native ETH or USDC on Sepolia or Base Sepolia. Recipient can be ENS or 0x...",
    parameters: {
      type: "object",
      properties: {
        chain: { type: "string", enum: ["sepolia", "base-sepolia"] },
        token: { type: "string", enum: ["ETH", "USDC"] },
        to: { type: "string", description: "ENS name or 0x address" },
        amount: { type: "string", description: "Human-readable amount" },
      },
      required: ["chain", "token", "to", "amount"],
    },
  },
  {
    type: "function",
    name: "sendStealthUsdc",
    description:
      "Send USDC on Base Sepolia to an ENS recipient via a one-time stealth address (EIP-5564).",
    parameters: {
      type: "object",
      properties: {
        recipientEnsName: { type: "string" },
        amountUsdc: { type: "string", description: "Human-readable USDC amount" },
      },
      required: ["recipientEnsName", "amountUsdc"],
    },
  },
  {
    type: "function",
    name: "generatePrivatePaymentAddress",
    description:
      "Derive a one-time stealth address for a private payment to an ENS name.",
    parameters: {
      type: "object",
      properties: {
        recipientEnsName: { type: "string" },
      },
      required: ["recipientEnsName"],
    },
  },
  {
    type: "function",
    name: "findAgents",
    description:
      "Discover hireable peer agents from the on-chain ethtwin.eth directory with ENSIP-25 verification.",
    parameters: {
      type: "object",
      properties: {
        agentId: {
          type: "string",
          description: "ERC-8004 agent id (defaults to '1' for the sample analyst)",
        },
      },
    },
  },
  {
    type: "function",
    name: "hireAgent",
    description:
      "Discover, verify (ENSIP-25), and pay another agent via x402 to perform a sub-task.",
    parameters: {
      type: "object",
      properties: {
        agentEnsName: { type: "string" },
        agentId: { type: "string", description: "ERC-8004 agent id (defaults to 1)" },
        task: { type: "string" },
      },
      required: ["agentEnsName", "task"],
    },
  },
] as const
