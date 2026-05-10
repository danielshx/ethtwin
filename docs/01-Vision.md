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

**EthTwin is your AI co-pilot for the on-chain world.**

Each user spawns a personal **AI Twin** in 60 seconds. The Twin:

- **Lives in ENS:** persona, capabilities, endpoint, reputation, and stealth meta-key all in Text Records of `yourname.ethtwin.eth`.
- **Talks to you:** voice-first interface (with chat fallback). No more clicking through wallet UIs.
- **Acts for you:** plain-English transaction summaries before every signature. The Twin protects you from blind signing.
- **Coordinates with other agents:** when your Twin needs help, it discovers other agents via ENS, evaluates capabilities from their Text Records, and pays them via x402 micropayments.
- **Protects your privacy by default:** every payment routes through a fresh EIP-5564 stealth address derived from the recipient's `stealth-meta-address` ENS Text Record. Sender and recipient stay unlinkable on-chain.
- **Refuses to let you sign blind:** every transaction is decoded against Sourcify-verified ABIs and a wallet-risk classifier before the user signs.

## The Wow Hook (locked 2026-05-09)

> *"Crypto for everyone — even my grandma."*

The pitch is told through one persona: **Maria, 67, in Stuttgart, sending 100 USDC to her grandson Tom.** She uses voice. She sees ENS names, never `0x…`. She approves with a passkey. The whole flow takes 60 seconds.

Then the reveal: *"What Maria didn't see — EIP-5564 stealth address, ENSIP-25 + ERC-8004 agent verification, Sourcify-verified plain-English tx decode, x402 micropayments to a peer agent. Crypto isn't hard. It's just been built for engineers. Until now."*

The grandma framing is not just UX flavor — it is the **justification** for every advanced primitive in our stack. Stealth addresses are required because grandma has no clue what stealth means and shouldn't have to. Voice + ENS reverse + plain English exist because she can't type a hex address. Agent-to-agent x402 happens silently because she shouldn't have to research counterparties — her Twin does it.

This is what no other team at the hackathon will say. It's our defensible USP.

## What makes EthTwin defensible

| Layer | Why it sticks |
|---|---|
| **ENS-native identity** | The Twin IS its ENS record — not just "uses ENS". Removing ENS breaks the product. |
| **Stealth-by-default privacy** | Every payment is private. Not a toggle. Not a premium feature. Default. |
| **ENSIP-25 + ERC-8004 verification** | Twin discovers, verifies, and only then pays peer agents. Identity layer is on-chain, not in a config file. |
| **Agent-to-agent x402 economy** | Twin can hire `analyst.eth`, `scraper.eth`, etc. Agent fleet emerges naturally. |
| **Voice-first UX + Sourcify-decoded tx** | Anti-blind-signing through plain English narration. Web2-feel without sacrificing custody. |

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
