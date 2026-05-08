# 01 — Vision

## The Problem

Crypto today asks impossible things from normal people:

1. **Memorize 24 random words** or lose everything forever.
2. **Sign hex blobs** without knowing what they do.
3. **Manage gas, networks, RPCs** like a sysadmin.
4. **Trust your wallet provider** with your privacy (every counterparty sees your balance, history, identity).
5. **Coordinate manually** with every service — no autonomous agent ever buys data, books a flight, or negotiates on your behalf.

Meanwhile, **AI agents need on-chain identities** but no infrastructure exists to give them stable, discoverable, hireable presence.

## The Vision

**Twinpilot is your AI co-pilot for the on-chain world.**

Each user spawns a personal **AI Twin** in 60 seconds. The Twin:

- **Lives in ENS:** persona, capabilities, endpoint, reputation, and stealth meta-key all in Text Records of `yourname.twinpilot.eth`.
- **Talks to you:** voice-first interface (with chat fallback). No more clicking through wallet UIs.
- **Acts for you:** plain-English transaction summaries before every signature. The Twin protects you from blind signing.
- **Coordinates with other agents:** when your Twin needs help, it discovers other agents via ENS, evaluates capabilities from their Text Records, and pays them via x402 micropayments.
- **Protects your privacy by default:** every incoming payment routes through a fresh stealth address, seeded with verifiable cosmic randomness from satellites (Orbitport cTRNG).

## The Wow Hook

> *"Twinpilot uses true randomness from satellites to protect your privacy. Not pseudo-random. Real cosmic noise. Verifiable on-chain."*

This is what no other team at the hackathon will say. It's our defensible USP.

## What makes Twinpilot defensible

| Layer | Why it sticks |
|---|---|
| **ENS-native identity** | The Twin IS its ENS record — not just "uses ENS". Removing ENS breaks the product. |
| **Stealth-by-default privacy** | Every payment is private. Not a toggle. Not a premium feature. Default. |
| **Cosmic randomness** | Verifiable, attested, unpredictable. Stronger trust property than VRF. |
| **Agent-to-agent x402 economy** | Twin can hire `analyst.eth`, `scraper.eth`, etc. Agent fleet emerges naturally. |
| **Voice-first UX** | Anti-blind-signing through plain English narration. Web2-feel without sacrificing custody. |

## Out of scope (consciously)

- ❌ Custom rollup or L2
- ❌ Token launch in 48h
- ❌ Mainnet deploy
- ❌ Mobile native app (PWA reaches phones)
- ❌ Marketplace UI for unlimited agents (1-2 sample agents are enough for the demo)
- ❌ Production-grade smart contracts (mock anything that requires audit)

## North Star metric for the build

**Does the demo flow work end-to-end in under 3 minutes?**

That's the only metric that matters. Bounty wins follow from a great demo, never from features-on-paper.
