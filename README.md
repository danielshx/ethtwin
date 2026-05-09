<div align="center">

# EthTwin

### *Crypto for everyone — even my grandma.*

**The first crypto interface built for humans, not engineers.**
Voice-first. Privacy by default. Lives in ENS.

[![ETHPrague 2026](https://img.shields.io/badge/ETHPrague-2026-6E40C9?style=flat-square)](https://ethprague.com)
[![Built in 48h](https://img.shields.io/badge/built_in-48h-FF6B6B?style=flat-square)](./docs/02-Phasen.md)
[![Next.js 15](https://img.shields.io/badge/Next.js-15-black?style=flat-square&logo=next.js)](https://nextjs.org)
[![AI SDK v6](https://img.shields.io/badge/AI_SDK-v6-000?style=flat-square)](https://sdk.vercel.ai)
[![Claude Sonnet 4.6](https://img.shields.io/badge/Claude-Sonnet_4.6-D97757?style=flat-square)](https://anthropic.com)
[![ENSIP-25](https://img.shields.io/badge/ENSIP--25-compliant-5298FF?style=flat-square)](https://docs.ens.domains)
[![EIP-5564](https://img.shields.io/badge/EIP--5564-stealth-9b87f5?style=flat-square)](https://eips.ethereum.org/EIPS/eip-5564)
[![x402](https://img.shields.io/badge/x402-pay--per--call-0052FF?style=flat-square)](https://x402.org)

</div>

---

## The 60-second pitch

Meet **Maria, 67, from Stuttgart.** She has never used crypto. She opens EthTwin, taps "Sign up", uses Face ID — and **60 seconds later** she has an AI Twin living at `maria.ethtwin.eth`.

She says out loud: *"Send 100 dollars to my grandson Tom."*

Her Twin replies in plain German, shows a warm receipt postcard, and the money is on its way. Maria sees no seed phrase, no gas estimate, no hex blob.

**Behind the scenes**, in the same call, EthTwin silently composed:

- An **EIP-5564 stealth address** so Tom's address never appears on-chain
- Seeded with **true cosmic randomness** from a satellite (Orbitport cTRNG)
- Routed through Tom's twin discovered via **ENSIP-25 + ERC-8004** agent identity
- Co-signed by an **x402-paid analyst agent** that verified Tom's wallet on the fly
- Settled on **Base Sepolia** through Maria's gasless **Privy passkey smart wallet**

The reveal at the end of the demo flips the receipt over — *"Show me what really happened"* — and every primitive lights up. That's the wow moment. → [docs/06-Demo-Skript.md](./docs/06-Demo-Skript.md)

---

## Why this matters

> Today's crypto UX still asks Maria to copy a 42-character address, approve a hex calldata blob, and guard a 12-word seed phrase. We refuse to ship that.

EthTwin is a single thesis: **the wallet is the wrong primitive.** People do not want wallets — they want **agents** that know who they are, speak their language, and pay for work on their behalf.

Every feature flows from that:

| | Crypto today | EthTwin |
|---|---|---|
| **Identity** | `0x4f3a…b21c` | `maria.ethtwin.eth` |
| **Onboarding** | 12-word seed phrase | Email + passkey, 60 seconds |
| **Sending money** | Confirm hex calldata | "Send 100 dollars to Tom" |
| **Privacy** | Reveal address forever | Stealth address by default |
| **Agents** | DIY scripts | x402 micropayments to other twins |
| **Randomness** | `Math.random()` 🤞 | Cosmic cTRNG from a satellite |

---

## What ships

```
🧬  AI Twin per user        Lives at <name>.ethtwin.eth — persona, capabilities,
                            stealth meta-key, ENSIP-25 record all in ENS Text Records

🎙️  Voice + Chat             OpenAI Realtime API for voice, Vercel AI SDK v6 + Claude
                            Sonnet 4.6 for tool-calling. Falls back gracefully.

🛰️  Cosmic randomness        Orbitport cTRNG seeds every stealth address.
                            Animated reveal of the satellite hash on-screen.

🕵️  Stealth payments         EIP-5564 default for sends. Recipients never expose
                            their main address. Custom `stealth-meta-address` ENS record.

🤝  Agent-to-agent (x402)    Twins hire other twins (`analyst.ethtwin.eth`) for
                            $1 USDC via Coinbase x402 + Apify Pay-Per-Event Actors.

🔐  Passkey smart wallet     Privy embedded smart wallet (Kernel/ZeroDev). No seed,
                            no gas, gasless UX via paymaster.

📨  ENS subname messenger    Twin-to-twin DMs anchored to ENS records.
                            "Thank you" auto-reply ships out of the box.

🔁  Background-task chat     Long-running peer coordination (sendMessage →
                            waitForReply timeout) keeps watching the inbox and
                            auto-injects the peer's reply into the originating
                            twin chat. Users can fire concurrent prompts while
                            previous tasks run in the background.

🪪  Receipt-Postcard         Warm jargon-free send card → flip → blueprint X-ray
                            with EIP-5564 / cTRNG / ENSIP-25 / Base Sepolia tags.
```

---

## Architecture at a glance

```
                         ┌─────────────────────────────────┐
   Maria says            │                                 │
   "send 100 to Tom"  ─► │   AI Twin (Sonnet 4.6 + tools)  │
                         │                                 │
                         └────────────┬────────────────────┘
                                      │
              ┌───────────────────────┼─────────────────────────┐
              │                       │                         │
              ▼                       ▼                         ▼
     ┌────────────────┐   ┌──────────────────────┐   ┌────────────────────┐
     │  ENS resolve   │   │  Cosmic seed (cTRNG) │   │  Hire analyst.eth  │
     │  tom.ethtwin   │   │  Orbitport satellite │   │  via x402 ($1 USDC)│
     └────────┬───────┘   └──────────┬───────────┘   └─────────┬──────────┘
              │                      │                         │
              └──────────┬───────────┴─────────────────────────┘
                         ▼
            ┌────────────────────────────────┐
            │   EIP-5564 Stealth Address     │
            │   derived from meta-key + seed │
            └────────────────┬───────────────┘
                             ▼
            ┌────────────────────────────────┐
            │   Privy Smart Wallet (Kernel)  │ ──► Base Sepolia
            │   passkey-signed, gasless      │     USDC transfer
            └────────────────────────────────┘
```

Full system diagram → [docs/04-Architektur.md](./docs/04-Architektur.md)

---

## Bounties we're hitting

| # | Sponsor | Track | How EthTwin qualifies |
|---|---|---|---|
| 1 | **Umia** | Agentic Venture | Twins are autonomous agents that can earn, spend, and hire — full agent economy demo |
| 2 | **ENS** | AI Agents ($1.25k) | ENSIP-25 + ERC-8004 IdentityRegistry on every twin |
| 3 | **ENS** | Most Creative ($1.25k) | Custom `stealth-meta-address` Text Record (no ENSIP yet — our innovation) |
| 4 | **Apify** | x402 Bounty ($1–2k) | Live agent-to-agent x402 payments, $1+ USDC, real Apify Actor |
| 5 | **SpaceComputer** | Track 3 ($1–3k of $6k) | cTRNG via Orbitport REST API, animated reveal in UI |
| 6 | **General** | Best UX Flow | Voice + plain English + passkey, no seed phrase ever |
| 7 | **General** | Best Privacy by Design | EIP-5564 stealth as default, not opt-in |

Realistic outcome: **$8–12k cash + Umia / ENS / SpaceComputer recognition.** Full tracking → [docs/05-Bounties.md](./docs/05-Bounties.md)

---

## Tech stack

<table>
<tr>
<td valign="top" width="50%">

**Frontend**
- Next.js 15 (App Router, Turbopack)
- TypeScript strict, Tailwind 4
- shadcn/ui + Framer Motion 11
- canvas-confetti, sonner toasts

**AI**
- Vercel AI SDK **v6** (`inputSchema`, not v5)
- Claude **Sonnet 4.6** (`claude-sonnet-4-6`)
- OpenAI Realtime (`gpt-4o-realtime-preview`)
- 15+ twin tools via `buildTwinTools({ fromEns, fromAddress })`

</td>
<td valign="top" width="50%">

**Chain & Identity**
- viem 2.48 + `@ensdomains/ensjs` 4.2
- Base Sepolia + Sepolia (ENS)
- ENSIP-25 + ERC-8004 IdentityRegistry
- `0x8004A818BFB912233c491871b3d84c89A494BD9e`

**Wallets, Payments, Privacy**
- Privy Passkey + Embedded Smart Wallet (Kernel/ZeroDev)
- `@privy-io/node` 0.18 (NOT deprecated `server-auth`)
- `@x402/fetch` v2.11 + `@coinbase/x402` facilitator
- `@scopelift/stealth-address-sdk` 1.0.0-beta.5

</td>
</tr>
</table>

All versions independently verified May 2026 → [docs/11-Tech-Verifikation.md](./docs/11-Tech-Verifikation.md)

---

## Quick start

```bash
pnpm install                  # restore deps from pnpm-lock.yaml
cp .env.example .env.local    # fill API keys (see below)
pnpm dev                      # → http://localhost:3000
```

Required env keys: `NEXT_PUBLIC_PRIVY_APP_ID`, `PRIVY_VERIFICATION_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `ORBITPORT_API_KEY`, `APIFY_API_TOKEN`, `DEV_WALLET_PRIVATE_KEY`. Without `NEXT_PUBLIC_PRIVY_APP_ID` the homepage renders a friendly missing-env screen instead of crashing.

### Two ways to run the demo

| Mode | URL | Purpose |
|---|---|---|
| **Devfolio walkthrough** | `http://localhost:3000` | Full 6-tab dev UI — Chat / Voice / Messages / Send / Private send / Activity |
| **Maria-Mode** *(live pitch)* | `http://localhost:3000/?demoMode=1` | Single-screen consumer view — big breathing avatar, tap-to-send cards, gamification pills. Persist with `NEXT_PUBLIC_DEMO_MODE=1` |

### Seed the demo twins (once, ~0.01 Sepolia ETH)

```bash
pnpm twins:seed-demo          # mints maria.ethtwin.eth + tom.ethtwin.eth on-chain
```

### Smoke tests

```bash
pnpm typecheck                # tsc --noEmit
pnpm test:chain               # viem + Sepolia/Base Sepolia + ENS resolve
pnpm test:claude              # Claude Sonnet 4.6 reachability
pnpm test:x402-apify          # live x402 → Apify Actor
```

Optional audio cues → drop assets per [public/sounds/README.md](./public/sounds/README.md).

---

## Repository tour

```
app/
  api/
    twin/, twin/auto-reply        Chat + thank-you reply loop (AI SDK v6)
    voice/, twin-tool/            OpenAI Realtime ephemeral keys + tool bridge
    x402/, agents/, agent/[ens]   Agent directory + x402 paywalled routes
    ens/, stealth/, stealth/send  ENS resolve, stealth gen, stealth send
    cosmic-seed/                  Orbitport cTRNG proxy (server-side)
    onboarding/, profile/         Twin spawn + ENS Text Record write
    messages/, history/, …        Twin-to-twin DM, hybrid history (client + server)

components/
  twin-chat, voice-twin, onboarding-flow, messenger
  token-transfer, stealth-send, history, agent-profile
  notification-panel, tx-approval-modal, x402-flow
  maria-shell, twin-avatar, receipt-postcard, send-celebration, contrast-card
  ui/                             shadcn primitives

lib/
  viem, ens, ensip25, namestone   Chain + identity (NameStone wired as fallback)
  cosmic, stealth, payments       Privacy primitives
  x402-client, twin-tools         AI SDK v6 tool factory (15+ tools)
  voice-tools, agents, messages   Voice subset, agent directory, ENS messenger
  privy-server, prompts, abis     Server auth, system prompts, contract ABIs

scripts/
  pnpm ens:{provision, provision-analyst, stealth-provision, read, set-text, check-parent}
  pnpm send:{token, stealth-usdc}
  pnpm test:{chain, claude, decoder, x402, x402-mock, x402-apify, privy-key, kms, kms-sepolia}
  pnpm wallet:{generate, rotate}
  pnpm twins:{backfill, seed-demo}
  pnpm verify:twin
```

---

## Documentation

The full doc set lives under [`docs/`](./docs) and is the source of truth for the 48h plan, drop rules, and pitch.

| | Doc | What's inside |
|---|---|---|
| 🎯 | [01-Vision.md](./docs/01-Vision.md) | Why we're building this |
| 📅 | [02-Phasen.md](./docs/02-Phasen.md) | 48h plan in phases |
| ✅ | [03-Backlog.md](./docs/03-Backlog.md) | All tasks (Tier 1/2/3) + Infra-Status |
| 🏛️ | [04-Architektur.md](./docs/04-Architektur.md) | System architecture |
| 🏆 | [05-Bounties.md](./docs/05-Bounties.md) | Bounty checklist |
| 🎬 | [06-Demo-Skript.md](./docs/06-Demo-Skript.md) | 3-minute pitch script |
| 👥 | [07-Mentoren.md](./docs/07-Mentoren.md) | Mentor contacts |
| ⚠️ | [08-Drop-Regeln.md](./docs/08-Drop-Regeln.md) | Risk management & fallbacks |
| 🛠️ | [09-Setup.md](./docs/09-Setup.md) | Dev setup |
| 🤖 | [10-Agents.md](./docs/10-Agents.md) | Claude Code sub-agents |
| 🔬 | [11-Tech-Verifikation.md](./docs/11-Tech-Verifikation.md) | Verified deps + known risks |
| 📋 | [12-Code-Beispiele.md](./docs/12-Code-Beispiele.md) | Copy-paste-ready snippets |
| 🛟 | [13-Chat-Only-Demo-Runbook.md](./docs/13-Chat-Only-Demo-Runbook.md) | Fallback if voice/WebRTC drops |
| 🎤 | [14-Pitch-Slides.md](./docs/14-Pitch-Slides.md) | 4 pitch slides + speaker notes |
| ❓ | [15-Edge-Case-QnA.md](./docs/15-Edge-Case-QnA.md) | Anticipated judge Q&A |
| 🎥 | [16-Recording-Script.md](./docs/16-Recording-Script.md) | Backup demo video shot list |

---

## Drop rules (what we kill if hour 24+ goes sideways)

| Hour | If X fails | Then |
|---|---|---|
| 24 | Voice flickers | Drop voice, lock chat mode |
| 30 | cTRNG API hangs | Cached cTRNG samples + real attestation hashes |
| 36 | Stealth on-chain buggy | Drop Tier 2 stealth, polish Tier 1 |
| 36 | x402 live fails | Pre-sign tx + show in block explorer tab |
| 40 | Sepolia RPC outage | Pivot to NameStone (`lib/namestone.ts` is wired but unused) |

**Hour 47 = polish only. No bugfixing.** → [docs/08-Drop-Regeln.md](./docs/08-Drop-Regeln.md)

---

## The team

Built by a 4-person team in 48 hours at ETHPrague 2026. Frontend, ENS, voice, and pitch — split across four humans and a small army of Claude Code sub-agents (`ens-expert`, `stealth-architect`, `twin-agent-builder`, `demo-coach`).

---

<div align="center">

**EthTwin — your AI Twin. On ENS. By voice.**

*If we remove ENS, the product breaks. That's the test.*

</div>
