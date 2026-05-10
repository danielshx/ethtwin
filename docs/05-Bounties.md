# 05 — Bounty-Stack (Final, 2026-05-10)

> **Status:** Software shipped. The bounty story below describes what's actually in the repo on submission day. Apify x402 was removed from scope; SpaceComputer is now KMS-only (cTRNG was dropped because the gateway didn't sign samples).

## 🎭 Pitch-Frame

**Tagline:** *"Crypto for everyone — even my grandma."*
**Sub-line:** *"The first crypto interface built for humans, not engineers."*

Maria (67, Stuttgart) sends Tom 1 USDC by voice in 60 s. She sees no hex, no seed phrase, no gas. The reveal beat exposes every advanced primitive that ran silently underneath: KMS-signed twin key, EIP-5564 stealth address, ENSIP-25 + ERC-8004 verification, Sourcify-decoded plain-English tx, twin-to-twin x402.

Full skript: `docs/06-Demo-Skript.md`. Slides: `docs/14-Pitch-Slides.md`.

## 📊 Bounty Status

| # | Bounty | Status | What's live |
|---|---|---|---|
| 1 | Umia — Agentic Venture | 🟢 ready to pitch | Code + Maria-story locked. Slides in `docs/14-Pitch-Slides.md`. |
| 2 | **ENS for AI Agents** | 🟢 LIVE | ENSIP-25 + ERC-8004 IdentityRegistry text record set on every twin during onboarding. `findAgents` + `hireAgent` exercise discovery. Verified on every onboarded twin. |
| 3 | **ENS Most Creative** | 🟢 LIVE | Three creative ENS patterns: `stealth-meta-address`, `twin.kms-key-id` + `twin.kms-public-key` (the KMS-keyed gate for messaging), and `chat.<peer>.msg.<i>` text-records-as-messenger. |
| 4 | **SpaceComputer (KMS)** | 🟢 LIVE | Every twin's signing key is satellite-attested in Orbitport KMS. `lib/kms.ts` is a viem `LocalAccount` adapter; onboarding mints per-twin keys, transfers/messages/sends all sign via KMS. Live KMS verify panel in agent profile. |
| 5 | **Best UX Flow** | 🟢 LIVE | Voice + chat both shipped. Demo mode (Maria-Mode) with postcard reveal + Etherscan CTA. Light-mode-only consumer-grade palette. |
| 6 | **Best Privacy by Design** | 🟢 LIVE | End-to-end stealth send → inbox → claim. `stealth-meta-address` text record is the canonical recipient handle. |
| 7 | **Sourcify Contract Intelligence** | 🟢 LIVE | Inspect → Decode → Decide flow on every approval. Risky-Approval demo button in send tab. |
| 8 | **x402 (Coinbase)** | 🟢 LIVE | `analyst.ethtwin.eth` paywalled with `@x402/next`; `hireAgent` auto-pays via `@x402/fetch`. Twin-to-twin only. |

**Solid floor:** ENS×2 + KMS + Privacy + UX + Sourcify + x402 = realistic $7-10k.
**Stretch:** Umia pitch lands strong.

**Apify x402:** ❌ **DROPPED.** Removed end-to-end (`requestDataViaX402` tool, `callApifyX402` helper, `app/api/x402/route.ts`, scripts, env vars). The Apify story didn't justify the demo math ($1 minimum) and pulled focus from the twin-to-twin x402 angle which is more on-narrative.

**Orbitport cTRNG:** ❌ **DROPPED.** Probed live with `scripts/diag-orbitport.ts` — the gateway returns unsigned samples with no signature/attestation chain, so "cosmic-seeded" would have been a label without provenance. The KMS track carries the SpaceComputer story end-to-end (every twin's signing key IS satellite-attested).

---

## 🥇 1. Umia — Best Agentic Venture

**Pitch:** EthTwin is the wallet for the next billion users — the people who rejected crypto so far because it was built for engineers. Maria is the proof that the tooling is finally there.

| Criterion | Our answer |
|---|---|
| Agentic Workflows | Twin is the core agent. Hires sub-agents via x402 (`analyst.ethtwin.eth`) |
| Path to Revenue | Subscriptions (Privacy Premium, Pro Voice, Multi-Twin), x402 service fees on agent-to-agent calls, B2B Twin-as-API for fintechs |
| Token Story | $TWIN governance + service credits + premium-tier unlock |
| Crowdfunding-Palatable | Demoable, accessible market, clear product |

---

## 🥈 2. ENS — Best ENS Integration for AI Agents ($1.25k)

**Status: 🟢 LIVE.** Every twin on Sepolia ENS gets `agent-registration[<interopAddr>][<agentId>]` set during onboarding via `lib/ensip25.ts:encodeInteropAddress()`. `verifyAgentRegistration()` reads it back. `findAgents` + `hireAgent` exercise the discovery flow.

### ENSIP-25 + ERC-8004 verified

```
ERC-8004 IdentityRegistry
- Mainnet:       0x8004A169FB4a3325136EB29fA0ceB6D2e539a432
- Base Sepolia:  0x8004A818BFB912233c491871b3d84c89A494BD9e
- Sepolia:       0x8004A818BFB912233c491871b3d84c89A494BD9e
```

Text record key format:
```
agent-registration[<registry>][<agentId>] = "1"
```

`<registry>` = ERC-7930 interoperable address of the agent registry; `<agentId>` = unique ID; value `"1"` = registered.

### Use-case checklist

| Requirement | Where in our build |
|---|---|
| Naming individual agents with ENS | Every twin = `<name>.ethtwin.eth` |
| Subname registry for an agent fleet | `*.ethtwin.eth` minted on Sepolia ENS, agents.directory text record on the parent |
| Capabilities, endpoints in text records | `twin.capabilities`, `twin.endpoint` |
| Agent-to-agent discovery via ENS | Twin finds `analyst.ethtwin.eth` live |
| ENS + verifiable credentials/attestations | **ENSIP-25 + ERC-8004 implementation** |
| Delegation: agent acts on behalf of human | Twin signs via KMS-derived address bound to the user's ENS |

**ENS-removal test:** every demo beat breaks if you remove ENS. ENSIP-25 makes us the showcase.

---

## 🥉 3. ENS — Most Creative Use of ENS ($1.25k)

**Status: 🟢 LIVE — three creative ENS patterns shipping on-chain.**

### Pattern 1 — `stealth-meta-address` text record

No official ENSIP exists for stealth meta-addresses in ENS. We define the pattern:

```
stealth-meta-address = "st:eth:0x04<x32><y32><x32><y32>"  // 132 hex chars
                                ↑ spending pubkey  ↑ viewing pubkey
```

Compatible with EIP-5564 stealth-address derivation; ENS Text Records replace ERC-6538's onchain registry for better UX. Live on every onboarded twin.

### Pattern 2 — KMS handle as ENS text record (`twin.kms-key-id` + `twin.kms-public-key`)

The twin's signing identity is published as ENS text records:
- `twin.kms-key-id` — the SpaceComputer Orbitport KMS handle.
- `twin.kms-public-key` — 65-byte uncompressed secp256k1 pubkey (`0x04 || x || y`).

This is the gate for the on-chain messenger (Path C-lite, see `lib/messages.ts`): every message carries a KMS-EIP-191 signature, and readers verify it against the sender's published pubkey. ENS becomes the canonical KMS handle directory.

### Pattern 3 — ENS-as-messenger (text-records-on-twin)

Every conversation lives directly on each twin's subname as `chat.<peer>.msg.<i>`, `chat.<peer>.count`, `chat.<peer>.participants` text records. No separate chat subname — messages live in your existing twin record, alongside `stealth-meta-address`, `twin.kms-key-id`, etc. Open the twin in the ENS app and you see the conversations as records.

This is exactly "creative use of ENS that goes beyond name → address resolution."

---

## 4. SpaceComputer Orbitport — Best Use of Space-Powered Tech

**Status: 🟢 LIVE — KMS is load-bearing for every twin.**

Each twin's signing key is a satellite-attested ETHEREUM secp256k1 key in SpaceComputer Orbitport KMS. We never see the private key; we send signing intents over JSON-RPC and get back signatures.

### Where KMS shows up in the build

| File / Route | KMS-signed action |
|---|---|
| `app/api/onboarding/route.ts` | `createTwinKey(label)` mints a new ETHEREUM key per twin during mint. The keyId + uncompressed pubkey are published as ENS text records (`twin.kms-key-id`, `twin.kms-public-key`). |
| `lib/kms.ts:kmsAccount({ keyId, address })` | viem-compatible `LocalAccount`. Plug it into any `WalletClient`; `signTransaction` / `signMessage` / `signTypedData` all proxy to KMS. |
| `lib/transfers.ts:sendToken` | When the twin has funds + a published `twin.kms-key-id`, `sendToken` signs with the twin's KMS key (not the dev wallet). |
| `lib/payments.ts:sendStealthUSDC` | Same — KMS-signed when the twin can pay; dev wallet relays otherwise. |
| `lib/messages.ts:sendMessage` | Each on-chain message body is KMS-signed via EIP-191. |
| `app/api/kms/verify/route.ts` | Live KMS proof endpoint — signs a fresh nonce with the twin's key, recovers the signer locally, confirms it matches the twin's `addr` text record. The agent profile dialog has a "Verify" button that calls this. |
| `scripts/diag-orbitport.ts` | Live KMS + cTRNG capability probe (used during development). |

### Why cTRNG was dropped

The diagnostic confirmed that Orbitport's `ctrng.random` returns bytes but no `signature` field — there is no provenance chain a verifier can check. Without verifiability, "cosmic-seeded" would have been a label, not a claim. The KMS track stays — every twin's key actually IS in the satellite-attested HSM.

> *"The grandma's wallet is signed by a key that lives in space. She never sees it. But every byte of every transaction has been through orbital infrastructure."*

---

## 5. ETHPrague — Best UX Flow

**Status: 🟢 LIVE.**

| Checklist | Where in the build |
|---|---|
| Anti-blind-signing | `lib/tx-decoder.ts` + `components/tx-approval-modal.tsx` — Sourcify ABI decode + plain-English risk |
| Gradual disclosure | Recovery code is the only secret; KMS holds the actual signing key |
| Gas / chain abstraction | Dev wallet relays gas top-ups for stealth claims; KMS twin handles its own funds when funded |
| ENS over hex | `withEnsName()`, `useEnsName`, `AvatarImage` everywhere; `0x...` is short-form fallback only |
| Voice-first | `components/voice-twin.tsx` over WebRTC + background reply watcher |
| Demo Mode | `?demoMode=1` toggles Maria-Shell (single-view phone shell + quick-send cards + receipt postcards with space-themed reveal) |

---

## 6. ETHPrague — Best Privacy by Design

**Status: 🟢 LIVE.** End-to-end stealth send works in the **Stealth Send** tab.

- `lib/payments.ts:sendStealthUSDC()` → `lib/stealth.ts:generatePrivateAddress()` (real ScopeLift SDK) → on-chain USDC.transfer to a one-time stealth address + ERC-5564 Announcement.
- `app/api/stealth/inbox/route.ts` scans Announcer logs and re-derives stealth addresses with the recipient's viewing key, so the receiver can find their incoming payments.
- `app/api/stealth/claim/route.ts` sweeps the stealth address into the recipient's twin wallet (gas top-up from dev wallet, sweep tx signed by the locally-derived stealth private key).
- `stealth-meta-address` is the canonical recipient handle on ENS — no separate registry needed.

> *"Maria doesn't know what 'stealth' means — and that's exactly why she's protected. Privacy isn't a feature in EthTwin. Privacy IS the default."*

---

## 7. Sourcify — Contract Intelligence / Anti-Blind-Signing

**Status: 🟢 LIVE.** Sourcify is the contract-intelligence layer in the send flow. Base-Sepolia sends open the **Sourcify Contract Intelligence** review before execution (Inspect → Decode → Decide). The send tab also has a non-executable **Try risky approval demo** button that simulates `approve(spender, maxUint256)` and marks it HIGH risk.

| Risk pattern | Risk level | UX message |
|---|---|---|
| Unverified contract + calldata | HIGH | "Twin cannot inspect verified source" |
| Unknown selector | HIGH | "Function could not be mapped to verified ABI" |
| Unlimited ERC20 approval | HIGH | "Common wallet-drain risk" |
| `setApprovalForAll(true)` | HIGH | "Collection-wide operator access" |
| `transferFrom` | MEDIUM | "Check from/to/amount carefully" |
| Sourcify partial match | MEDIUM | "Inspectable, but needs extra caution" |
| Verified decoded transfer | LOW | "Understandable action; confirm recipient and amount" |

> *"Sourcify makes the code inspectable. EthTwin turns that inspectability into a safety decision Maria can understand."*

---

## 8. x402 (Coinbase) — Twin-to-Twin Micropayments

**Status: 🟢 LIVE.** Twin-to-twin only (Apify path was dropped).

- `lib/x402-client.ts` wraps `@x402/fetch` v2 with both v1 (chain slugs) and v2 (CAIP-2) namespace registration so the wrapper picks whichever the server requests.
- `paidFetch()` / `paidFetchWithReceipt()` auto-pay HTTP 402 challenges and parse the `X-PAYMENT-RESPONSE` header into a typed receipt with tx hash + Basescan URL.
- `app/api/agents/analyst/route.ts` is paywalled with `@x402/next` middleware (`@coinbase/x402` facilitator); when `X402_ANALYST_PAY_TO` is set, calls require x402 settlement.
- `lib/twin-tools.ts:hireAgent` runs ENSIP-25 verify → `paidFetch` → settled receipt with tx hash mirrored into server history.

Mock test (no real money) lives at `scripts/test-x402-mock.ts` (`pnpm test:x402-mock`) — spins up a local server speaking the x402 wire protocol to exercise the client end-to-end.

---

## ⚠️ Multi-Bounty Submissions

ETHPrague allows the same project to enter multiple bounty tracks. In Devfolio:
- Tick every relevant bounty
- Devote a paragraph in the project description to each
- Mention sponsor mentors before pitch day
- **Lead with ENSIP-25 + ERC-8004 + KMS-keyed-ENS** — that's the differentiator

## Sources

- ENSIP-25 spec: https://ens.domains/blog/post/ensip-25
- ERC-8004: https://eips.ethereum.org/EIPS/eip-8004
- ERC-8004 contracts: https://github.com/erc-8004/erc-8004-contracts
- EIP-5564: https://eips.ethereum.org/EIPS/eip-5564
- x402 protocol: https://docs.cdp.coinbase.com/x402/welcome
- Sourcify repository: https://repo.sourcify.dev/
- SpaceComputer Orbitport KMS: https://docs.spacecomputer.io/docs/how-to/kms
