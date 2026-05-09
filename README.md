# 🚀 EthTwin

> **Crypto for everyone — even my grandma.**
> The first crypto interface built for humans, not engineers. Voice-first. Privacy by default. Lives in ENS.

Built at **ETHPrague 2026** in 48 hours.

Demo flow: Maria (67) sends 100 USDC to her grandson Tom by voice. The reveal at the end: every advanced primitive (stealth addresses, satellite randomness, ENSIP-25 agent verification, x402 micropayments) ran silently under the hood. See [docs/06-Demo-Skript.md](./docs/06-Demo-Skript.md).

## What it does

You spawn your AI Twin in 60 seconds (email + passkey, no seed phrase). The Twin:

- Lives at your ENS subname (`yourname.ethtwin.eth`)
- Stores its persona, capabilities, and stealth meta-key in ENS Text Records
- Talks to you via voice
- Hires other AI agents via x402 micropayments when it needs help (`analyst.ethtwin.eth`)
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

```bash
pnpm install                  # restore deps from pnpm-lock.yaml
cp .env.example .env.local    # fill in API keys (Privy, Anthropic, OpenAI, Orbitport, Apify, dev wallet)
pnpm dev                      # → http://localhost:3000
```

**Two views:**
- `http://localhost:3000` — full developer view with all 6 feature tabs (for the Devfolio walkthrough)
- `http://localhost:3000/?demoMode=1` — **Maria-Mode**: single-screen consumer experience for the live pitch (big breathing avatar, tap-to-send contact cards, gamification pills, Voice + Chat fallback). Persistent via `NEXT_PUBLIC_DEMO_MODE=1` in `.env.local`.

**Seed the demo twins** (once, ~0.01 Sepolia ETH):

```bash
pnpm twins:seed-demo          # mints maria.ethtwin.eth + tom.ethtwin.eth on-chain
```

**Optional: drop sound assets** to enable audio cues — see [public/sounds/README.md](./public/sounds/README.md).

Smoke tests:

```bash
pnpm typecheck                # tsc --noEmit
pnpm test:chain               # viem + Sepolia/Base Sepolia + ENS resolve
pnpm test:claude              # Claude Sonnet 4.6 reachability
```

What ships with the scaffold:
- API: `/api/{twin,twin/auto-reply,voice,twin-tool,x402,ens,stealth,stealth/send,cosmic-seed,onboarding,profile,messages,history,wallet-history,wallet-summary,transfer,check-username}` and `/api/agents{,/analyst}` + `/api/agent/[ens]`
- `lib/{viem,ens,ensip25,namestone,cosmic,stealth,x402-client,twin-tools,voice-tools,agents,messages,transfers,payments,tx-decoder,wallet-summary,history,history-server,twin-profile,privy-server,prompts,abis,api-guard,utils,use-ens-name,use-ens-avatar,use-notifications,use-demo-mode,use-twin-sound}.ts`
- **Twin tool surface (AI SDK v6, factory-built)** — 15+ tools incl. `getWalletSummary`, `requestDataViaX402`, `decodeTransaction`, `checkTransactionStatus`, `sendToken` (default for sends), `getBalance`, `sendStealthUsdc` (opt-in privacy), `generatePrivatePaymentAddress`, `findAgents`, plus context-aware `hireAgent`, `inspectMyWallet`, `readMyEnsRecords`, `readMyMessages`, `listAgentDirectory`, `sendMessage`, `waitForReply` (via `buildTwinTools({ fromEns, fromAddress })`). Successful sends to peer twins trigger a deterministic `triggerThankYou` reply.
- **Default 6-tab dev UI:** Chat / Voice / Messages / Send / Private send / Activity, plus pinned **Notification Panel** (bottom-right, 30s poll on messages + wallet activity).
- **Demo-mode shell (`MariaShell`):** single Voice surface, big breathing twin avatar, gamification pills (Privacy / Level / Transactions), tap-to-send contact cards (Tom $5, Daniel $25, Alice $100), persistent localStorage stats, sonner-toasts forwarded from `useNotifications`.
- **Receipt-Postcard with X-ray Reveal** (`components/receipt-postcard.tsx`): warm jargon-free send card → "Show what really happened" peels back to a blueprint-pattern card with EIP-5564 / ENS Sepolia / Orbitport cTRNG / ENSIP-25 / Base Sepolia tags.
- **Send Celebration** (`components/send-celebration.tsx`): canvas-confetti shower + cosmic radial mikro-pulse on every successful send. Reduced-motion safe.
- **Side-by-Side Contrast** (`components/contrast-card.tsx`): Metamask-style "Confirm transaction" with hex calldata vs. EthTwin's "100 dollars to Tom" card. Embedded on the landing page.
- **Components:** `cosmic-orb, twin-chat, voice-twin, onboarding-flow, messenger, token-transfer, stealth-send, history, agent-profile, notification-panel, tx-approval-modal, x402-flow, maria-shell, twin-avatar, receipt-postcard, send-celebration, contrast-card` (+ shadcn primitives in `components/ui/`).
- Provisioning scripts: `pnpm ens:{provision,provision-analyst,stealth-provision,read,set-text,check-parent}`, `pnpm send:{token,stealth-usdc}`, `pnpm test:{chain,claude,decoder,x402,x402-mock,x402-apify,privy-key}`, `pnpm wallet:{generate,rotate}`, `pnpm twins:{backfill,seed-demo}`

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
- [13-Chat-Only-Demo-Runbook.md](./docs/13-Chat-Only-Demo-Runbook.md) — Fallback demo flow if voice/WebRTC drops
- [14-Pitch-Slides.md](./docs/14-Pitch-Slides.md) — 4 pitch slides w/ speaker notes
- [15-Edge-Case-QnA.md](./docs/15-Edge-Case-QnA.md) — Anticipated judge questions + answers
- [16-Recording-Script.md](./docs/16-Recording-Script.md) — Backup demo video shot list

## Verified key facts

- **Models:** `claude-sonnet-4-6` (text), `gpt-4o-realtime-preview` (voice)
- **ENS:** ENSIP-25 + ERC-8004 IdentityRegistry on Base Sepolia (`0x8004A818BFB912233c491871b3d84c89A494BD9e`)
- **Subnames:** on-chain Sepolia ENS direct — `ethtwin.eth` parent owned by dev wallet, every twin minted as a real subname (NameStone lib stays as fallback but is unused)
- **x402:** `@x402/fetch` v2.11.0 (NOT `x402-fetch` v1.x) + `@coinbase/x402` facilitator
- **Apify:** $1 USDC min per x402 call, Pay-Per-Event Actors only
- **Privy:** `@privy-io/react-auth` (client) + `@privy-io/node` (server, NOT deprecated server-auth)
- **Stealth:** `@scopelift/stealth-address-sdk` 1.0.0-beta.5 — beta, has fallback strategy
