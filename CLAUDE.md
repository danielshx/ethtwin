# EthTwin — Project Context for Claude Code

> **North Star:** Build a 3-minute demo that wins ETHPrague 2026. Every decision answers: "Does this make the demo better?" If no → out.

## What we're building

**EthTwin** is an AI co-pilot for your on-chain life. Each user spawns an AI Twin that lives at their ENS subname (`daniel.ethtwin.eth`), is voice-controlled, can hire other agents via x402 micropayments, and sends payments through EIP-5564 stealth addresses by default — with the recipient's `stealth-meta-address` published as an ENS Text Record.

**One-line pitch (locked 2026-05-09):** *"Crypto for everyone — even my grandma."*
Sub-line: *"The first crypto interface built for humans, not engineers."*

**Demo persona:** Maria (67, Stuttgart) sends 100 USDC to her grandson Tom (`tom.ethtwin.eth`) via voice. The reveal at the end: every advanced primitive (EIP-5564 stealth address, ENSIP-25 + ERC-8004 agent verification, Sourcify-decoded plain-English tx, x402 micropayments) ran silently underneath. See `docs/06-Demo-Skript.md`.

## ⚠️ Critical Verified Facts (May 2026 — verified via web search + npm)

These were verified — use these EXACT values:

### Models
- **Claude Sonnet 4.6** — model ID: `claude-sonnet-4-6` (1M context, $3/$15 per M tokens)
- **OpenAI Realtime** — model: `gpt-4o-realtime-preview` (ephemeral keys expire in 60s)

### Verified npm packages (May 2026)

| Package | Version | Status |
|---|---|---|
| `next` | 15+ | ✅ |
| `ai` (Vercel AI SDK) | 6.0.176 | ✅ **v6 syntax: `inputSchema`** |
| `@ai-sdk/anthropic` | 3.0.76 | ✅ |
| `@ai-sdk/openai` | 3.0.63 | ✅ |
| `@ai-sdk/react` | 3.0.178 | ✅ (useChat hook) |
| `@privy-io/react-auth` | 3.23.1 | ✅ Client SDK |
| `@privy-io/node` | 0.18.0 | ✅ **NEW Server SDK** |
| `@privy-io/server-auth` | 1.32.5 | ⚠️ **DEPRECATED — DO NOT USE** |
| `viem` | 2.48.11 | ✅ Built-in ENS |
| `@ensdomains/ensjs` | 4.2.2 | ✅ |
| `@scopelift/stealth-address-sdk` | 1.0.0-beta.5 | ⚠️ **BETA** |
| `@x402/fetch` | 2.11.0 | ✅ **Use this (x402-foundation v2)** |
| `@x402/next` | 2.11.0 | ✅ Server middleware |
| `@x402/core` | 2.11.0 | ✅ Direct dep — used for `x402ResourceServer` / `HTTPFacilitatorClient` in paywalled routes |
| `x402-fetch` | 1.2.0 | ❌ Don't use (older v1, Coinbase) |
| `@coinbase/x402` | 2.1.0 | ✅ Facilitator (server settlement) |
| `framer-motion` | 11+ | ✅ |
| `shadcn` (CLI) | 4.7.0 | ✅ |

### x402 Reality Check
- **Apify x402 minimum:** $1 USDC per request (NOT $0.20 — this killed our original demo math)
- **Apify x402 chain:** Base Mainnet primary; Base Sepolia depends on facilitator
- **Only Pay-Per-Event Actors** are x402-enabled
- **Use `@x402/fetch` v2.x** (x402-foundation), NOT `x402-fetch` v1.x

### ENS Strategy
- **ENSIP-25** is the AI Agent Identity standard — we MUST implement
- **ERC-8004 IdentityRegistry** addresses (verified):
  - **Mainnet:** `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`
  - **Base Sepolia:** `0x8004A818BFB912233c491871b3d84c89A494BD9e`
  - **Sepolia:** `0x8004A818BFB912233c491871b3d84c89A494BD9e`
- **Subname strategy (decided 2026-05-08):** **on-chain Sepolia ENS direct.**
  - We own `ethtwin.eth` on Sepolia; dev wallet is parent registry owner; every twin is a real subname (NFT) with addr + 7 text records + ENSIP-25 + agents.directory in one multicall.
  - Backup paths checked-in but unused: `lib/namestone.ts` (REST client, would unblock if Sepolia RPC fails). Durin/Mainnet rejected — too expensive or too much Solidity for 48h.

### AI SDK v6 Tool Syntax (verified)
```typescript
import { tool } from 'ai'
import { z } from 'zod'

const myTool = tool({
  description: '...',
  inputSchema: z.object({ ... }),  // ← v6: inputSchema, NOT parameters
  execute: async ({ ... }) => { ... }
})
```

## Constraints (non-negotiable)

- **48h hackathon.** No production code. Build for the demo.
- **3-4 person team, 1 ETH-dev.** No embedded/Linux skills.
- **Single chain:** Base Sepolia (or Sepolia ENS) only.
- **No deploy of custom smart contracts** unless we go Durin route.
- **No database** unless Privy + ENS Text Records aren't sufficient.

## Tech Stack (frozen)

- **Framework:** Next.js 15 App Router, TypeScript, Tailwind 4, shadcn/ui
- **Animation:** Framer Motion 11 (Receipt-Postcard X-ray reveal + Stealth-Send card are the hero moments)
- **Auth + Wallet:** Privy (`@privy-io/react-auth` for client, `@privy-io/node` for server)
- **Smart Wallet:** Privy Embedded Smart Wallet via Kernel/ZeroDev (configure in dashboard)
- **AI:** Vercel AI SDK v6 + Claude Sonnet 4.6 (text), OpenAI Realtime API (voice)
- **Chain:** viem 2.48 + `@ensdomains/ensjs` 4.2 + `@scopelift/stealth-address-sdk` (beta)
- **x402:** `@x402/fetch` (client) + `@coinbase/x402` (facilitator on Base Sepolia)
- **APIs:** Apify x402 endpoints, Sourcify (ABI lookup for tx-decode + risk classification)
- **Hosting:** Vercel

## Bounty stack we're hitting

1. **Umia** ($2k) — Agentic Venture story
2. **ENS for AI Agents** ($1.25k) — ENSIP-25 + ERC-8004 IdentityRegistry compliance
3. **ENS Most Creative** ($1.25k) — Custom `stealth-meta-address` Text Record (no ENSIP yet — our innovation)
4. **Apify x402** ($1-2k) — Live agent-to-agent x402 payments ($1+ USDC)
5. **Sourcify Contract Intelligence** — ABI decode + risk classifier turns calldata into a plain-English risk decision before sign
6. **Best UX Flow** — Voice + Plain English + No Seed Phrase (Privy passkey)
7. **Best Privacy by Design** — EIP-5564 Stealth Addresses as default

**Realistic outcome: $8-12k cash.**

## Code conventions

- TypeScript strict mode. No `any`.
- Server logic in `app/api/*/route.ts`. Never expose API keys client-side.
- ENS-related code in `lib/ens.ts` + `lib/agents.ts` (directory). Stealth in `lib/stealth.ts` + `lib/payments.ts`. Sourcify lookup + tx-decode + risk in `lib/sourcify.ts` + `lib/tx-decoder.ts` + `lib/contract-risk.ts`. x402 in `lib/x402-client.ts`. ENS-Subname-Messenger primitives in `lib/messages.ts` + `lib/message-crypto.ts`. Hybrid history (client + server) in `lib/history.ts` + `lib/history-server.ts`. React hooks in `lib/use-ens-name.ts`, `lib/use-ens-avatar.ts`, `lib/use-notifications.ts`. Voice tool subset for OpenAI Realtime in `lib/voice-tools.ts`. `lib/cosmic.ts` is a wired Orbitport wrapper but is NOT load-bearing — `lib/stealth.ts` and `lib/message-crypto.ts` no longer cosmic-seed (`cosmicSeeded: false` always).
- Components colocated with their feature. Reusable UI in `components/ui/` (shadcn).
- Use shadcn components first.
- Animations are budget. The Receipt-Postcard X-ray reveal + the **Stealth-Send-Tab** (`components/stealth-send.tsx`) are the only heavy Framer Motion / particle scenes.
- **AI SDK v6 syntax:** tools use `inputSchema` (zod), not `parameters` (v5 pattern). Twin tools live in `lib/twin-tools.ts` (15 tools total). The chat route (`app/api/twin/route.ts`) calls the `buildTwinTools({ fromEns, fromAddress })` factory so request-scoped context (the user's twin ENS + bound wallet address) reaches context-aware tools like `sendMessage`, `inspectMyWallet`, `readMyEnsRecords`, `readMyMessages`, `hireAgent`.

## ENS is central — never decorative

Every interaction with the Twin runs through ENS:
- Twin's persona, capabilities, endpoint, stealth meta-key all live in **ENS Text Records**
- **ENSIP-25 compliance:** Twin's agent registration record links to ERC-8004 IdentityRegistry entry
- Agent-to-agent discovery uses ENS subname resolution
- Tx approvals show ENS reverse-resolved names, never 0x...

If we remove ENS, the product breaks. That's the test for ENS Bounty 1.

## Drop rules (hour 24-48)

| Hour | If X fails | Then |
|---|---|---|
| 24 | Voice flickers | Drop voice, lock chat mode |
| 36 | Stealth on-chain buggy | Drop Tier 2 stealth, polish Tier 1 |
| 36 | x402 live fails | Pre-sign tx + show in block explorer tab |
| 40 | Sepolia RPC outage | Pivot to NameStone (`lib/namestone.ts` is wired but unused) |

**Hour 47 = polish only. No bugfixing.**

## When working on this project

- **Always check `docs/03-Backlog.md`** for what's Tier 1/2/3.
- **Always check `docs/05-Bounties.md`** before adding features.
- **Always update `docs/06-Demo-Skript.md`** when changing user-facing flows.
- **Reference `docs/04-Architektur.md`** for data flow questions.
- **Reference `docs/11-Tech-Verifikation.md`** for verified package versions and known risks.
- **Reference `docs/12-Code-Beispiele.md`** for copy-paste-ready code snippets.
- **If stuck, check `docs/07-Mentoren.md`** — there's a mentor for every external integration.
- **Chat-only fallback path:** `docs/13-Chat-Only-Demo-Runbook.md` describes the demo flow if voice / WebRTC drops out.

## Sub-agents available

- `ens-expert` — ENS subname trees, text records, ENSIP-25, ERC-8004, NameStone, Durin
- `stealth-architect` — EIP-5564 stealth address generation via @scopelift/stealth-address-sdk + ENS `stealth-meta-address` text record pattern
- `twin-agent-builder` — Vercel AI SDK v6 agent loops + Claude 4.6 tool calling + x402
- `demo-coach` — Demo script, pitch flow, story polish

Use them via the Agent tool when their specialty applies.

## Risks Tracker (update when something breaks)

- `@scopelift/stealth-address-sdk` is beta — wrap in try/catch, mock fallback ready
- Apify x402 may not work on Base Sepolia — Mainnet is primary, plan accordingly
- ENSIP-25 spec is fresh — implement carefully, watch for breaking changes
- Privy Smart Wallets are React-only — server logic via `@privy-io/node` (verify auth tokens, never run wallet logic server-side)
- OpenAI Realtime ephemeral keys expire in 60s — implement reconnect logic
- `@privy-io/server-auth` is deprecated — use `@privy-io/node`
- `@privy-io/node` v0.18 exports free functions (no `PrivyClient` class). Needs `PRIVY_VERIFICATION_KEY` from Privy Dashboard
- Privy v3 nested embedded-wallets config: `embeddedWallets.ethereum.createOnLogin` (NOT v2's `embeddedWallets.createOnLogin`)
- `@privy-io/react-auth/smart-wallets` needs `permissionless` peer dep (already installed)
- AI SDK v6 changed `parameters` → `inputSchema` (silent breaking change in tool definitions)
- AI SDK v6 `convertToModelMessages` returns `Promise<ModelMessage[]>` — must `await`
- `x402-fetch` (unscoped, v1.x) is older — use `@x402/fetch` (scoped, v2.x) with `x402Client` + `ExactEvmScheme`
- `@x402/next` peer-warns `next@^16`; works on 15.5 for now
- ERC-7930 byte layout in `lib/ensip25.ts` is best-effort — validate against reference impl before submission
