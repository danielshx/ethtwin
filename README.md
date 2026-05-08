# 🚀 Twinpilot

> AI co-pilot for your on-chain life. Voice-first. Privacy by default. Lives in ENS.

Built at **ETHPrague 2026** in 48 hours

## What it does

You spawn your AI Twin in 60 seconds (email + passkey, no seed phrase). The Twin:

- Lives at your ENS subname (`yourname.twinpilot.eth`)
- Stores its persona, capabilities, and stealth meta-key in ENS Text Records
- Talks to you via voice
- Hires other AI agents via x402 micropayments when it needs help (`analyst.twinpilot.eth`)
- Uses cosmic true randomness from satellites (Orbitport cTRNG) to seed stealth addresses for private payments
- Translates every transaction into plain English before you sign

## Tech (verified May 2026)

- **Frontend:** Next.js 15, Tailwind 4, shadcn/ui, Framer Motion 11
- **Auth:** Privy (`@privy-io/react-auth` + `@privy-io/node`) — Passkey + Embedded Smart Wallet
- **AI:** Vercel AI SDK v6 + Claude Sonnet 4.6 (text), OpenAI Realtime API (voice)
- **Chain:** Base Sepolia, viem 2.48, `@ensdomains/ensjs` 4.2
- **ENS Standards:** ENSIP-5 (Text Records), ENSIP-25 (AI Agent Identity), EIP-5564 (Stealth)
- **Payments:** Coinbase x402 (`@x402/fetch` + `@coinbase/x402` facilitator)
- **Randomness:** SpaceComputer Orbitport cTRNG (Track 3 — API only, no hardware)
- **Data:** Apify (via x402, $1 USDC min per call)

## Quick start

The Next.js scaffold + all verified deps are already installed (state of 2026-05-08). To boot:

```bash
pnpm install                  # restore deps from pnpm-lock.yaml
cp .env.example .env.local    # fill in API keys (Privy, Anthropic, OpenAI, NameStone, Orbitport, Apify)
pnpm dev                      # → http://localhost:3000
```

Smoke tests:

```bash
pnpm typecheck                # tsc --noEmit
pnpm test:chain               # viem + Sepolia/Base Sepolia + ENS resolve
pnpm test:claude              # Claude Sonnet 4.6 reachability
```

What ships with the scaffold:
- `app/api/{twin,voice,twin-tool,x402,ens,stealth,cosmic-seed,onboarding,agents/analyst}/route.ts`
- `lib/{viem,ens,ensip25,namestone,cosmic,stealth,x402-client,twin-tools,privy-server,prompts,utils}.ts`
- `app/{layout,providers,page,globals.css}` — auth-gated state machine (landing → onboarding → twin chat) on Base Sepolia
- `components/ui/` — shadcn primitives (button, card, input, dialog, badge, sonner, scroll-area, separator, label)
- `components/{cosmic-orb,twin-chat,tx-approval-modal,onboarding-flow}.tsx` — Tier-1 feature components, all wired
- `scripts/{test-chain,test-claude,warm-cosmic-cache}.ts`

Set `NEXT_PUBLIC_PRIVY_APP_ID` in `.env.local` to unlock the Privy login flow — without it the homepage renders a friendly missing-env screen instead of the auth UI.

See [docs/09-Setup.md](./docs/09-Setup.md) for the full setup guide, [docs/03-Backlog.md](./docs/03-Backlog.md#-infra-status-2026-05-08) for the current Infra-Status, and [docs/02-Phasen.md](./docs/02-Phasen.md) for the 48h plan.

## Documentation

- [01-Vision.md](./docs/01-Vision.md) — Why we're building this
- [02-Phasen.md](./docs/02-Phasen.md) — 48h plan in phases
- [03-Backlog.md](./docs/03-Backlog.md) — All tasks (Tier 1/2/3)
- [04-Architektur.md](./docs/04-Architektur.md) — System architecture
- [05-Bounties.md](./docs/05-Bounties.md) — Which bounties we hit
- [06-Demo-Skript.md](./docs/06-Demo-Skript.md) — 3-minute pitch script
- [07-Mentoren.md](./docs/07-Mentoren.md) — Mentor contacts
- [08-Drop-Regeln.md](./docs/08-Drop-Regeln.md) — Risk management
- [09-Setup.md](./docs/09-Setup.md) — Dev setup
- [10-Agents.md](./docs/10-Agents.md) — Claude Code sub-agents
- [11-Tech-Verifikation.md](./docs/11-Tech-Verifikation.md) — Verified deps + known risks
- [12-Code-Beispiele.md](./docs/12-Code-Beispiele.md) — Copy-paste-ready code snippets

## Verified key facts

- **Models:** `claude-sonnet-4-6` (text), `gpt-4o-realtime-preview` (voice)
- **ENS:** ENSIP-25 + ERC-8004 IdentityRegistry on Base Sepolia (`0x8004A818BFB912233c491871b3d84c89A494BD9e`)
- **Subnames:** NameStone offchain (default) — gasless via REST API
- **x402:** `@x402/fetch` v2.11.0 (NOT `x402-fetch` v1.x) + `@coinbase/x402` facilitator
- **Apify:** $1 USDC min per x402 call, Pay-Per-Event Actors only
- **Privy:** `@privy-io/react-auth` (client) + `@privy-io/node` (server, NOT deprecated server-auth)
- **Stealth:** `@scopelift/stealth-address-sdk` 1.0.0-beta.5 — beta, has fallback strategy
