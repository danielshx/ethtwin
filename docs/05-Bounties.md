# 05 — Bounty-Stack (Verified May 2026)

> Wir hitten 6+ Bounties realistisch. Realistic outcome: $8-12k cash.
>
> **Wichtigste Verifikation:** ENSIP-25 ist offizieller Standard für AI Agent Identity in ENS, ERC-8004 IdentityRegistry ist live auf Mainnet (seit 29. Jan 2026) + Base Sepolia. Wir implementieren beides = doppelter ENS-Bounty-Hit.

---

## 🥇 1. Umia — Best Agentic Venture ($2k cash)

### Anforderung
Project must classify as Agentic Venture suitable to launch on Umia. Must incorporate Agents in execution. Must have reasonable path to revenue + token.

### Wie wir hitten

| Kriterium | Unsere Antwort |
|---|---|
| Agentic Workflows | Twin ist core Agent. Hires sub-agents via x402 (`analyst.eth`) |
| Path to Revenue | Subscription tiers (Privacy Premium, Pro Voice, Multi-Twin), x402 service fees, B2B-Twin-as-API |
| Token-Story | $TWIN governance + service credits + premium-tier-unlock |
| Crowdfunding-Palatable | Klar definiertes Produkt, demoable, zugänglicher Markt |

### Pitch-Slide für Umia
- **Slide 1:** "EthTwin — AI co-pilot for on-chain life"
- **Slide 2:** Demo (live)
- **Slide 3:** Revenue: Subscription + x402 fees + B2B
- **Slide 4:** Token: $TWIN for credits, governance, premium tier

### Mentor: Francesco Mosterts (`@fra_mosterts`)

---

## 🥈 2. ENS — Best ENS Integration for AI Agents ($1.25k 1st place)

### 🔥 Killer-Move: ENSIP-25 + ERC-8004 Implementation

**ENSIP-25** (offizieller Standard 2025/2026) + **ERC-8004 IdentityRegistry** (live auf Mainnet seit 29. Jan 2026).

#### Verified Contract Addresses

```
ERC-8004 IdentityRegistry:
- Mainnet:       0x8004A169FB4a3325136EB29fA0ceB6D2e539a432
- Base Sepolia:  0x8004A818BFB912233c491871b3d84c89A494BD9e
- Sepolia:       0x8004A818BFB912233c491871b3d84c89A494BD9e
```

#### What ENSIP-25 Specifies

Text Record key format:
```
agent-registration[<registry>][<agentId>]
```

- `<registry>` = ERC-7930 interoperable address of agent registry
- `<agentId>` = unique agent ID
- Value: `"1"` or any non-empty string

#### Our implementation
```typescript
// During onboarding
const registry = '0x8004A818BFB912233c491871b3d84c89A494BD9e' // Base Sepolia
const agentId = userId
const interopAddr = buildERC7930(registry, 84532) // Base Sepolia chain id
const recordKey = `agent-registration[${interopAddr}][${agentId}]`

await setEnsText({
  name: "daniel.ethtwin.eth",
  key: recordKey,
  value: "1"
})
```

#### Verification flow (in our demo!)
```typescript
// Twin verifies analyst.eth before paying
const value = await getEnsText({ 
  name: "analyst.ethtwin.eth", 
  key: `agent-registration[${interopAddr}][${analystId}]` 
})
const isVerified = value !== null && value !== ''
if (isVerified) showBadge("✓ ENSIP-25 Verified Agent")
```

### Use-Case-Hits (workemon's checklist)

| Anforderung | Status | Wo bei uns |
|---|---|---|
| Naming individual agents with ENS | ✅ | Jeder Twin = `{name}.ethtwin.eth` |
| Subname registry for fleet | ✅ | `*.ethtwin.eth` minted on Sepolia ENS (dev wallet = parent owner), agents auto-eingetragen in `agents.directory` text record |
| Capabilities, endpoints in text records | ✅ | `twin.capabilities`, `twin.endpoint` |
| Agent-to-agent discovery via ENS | ✅ | Twin findet `analyst.ethtwin.eth` live |
| **ENS + verifiable credentials/attestations** | ✅✅ | **ENSIP-25 + ERC-8004 implementation** |
| Delegation: agent acts on behalf of human | ✅ | Twin handelt für User (Smart Wallet delegation) |

**ENS-Removal-Test: 6 von 6 Demo-Momenten brechen ohne ENS. ENSIP-25 macht uns zum Showcase.**

### Pitch-Sentence
> *"Twin lebt nicht 'irgendwo deployed' — Twin IST ENS. Persönlichkeit, Capabilities, Stealth-Schlüssel, Reputation — alles in Text Records von daniel.ethtwin.eth. Plus: wir implementieren ENSIP-25 mit ERC-8004 IdentityRegistry für verifizierbare Agent-Identity. Wenn du ENS killst, killst du Twin."*

### Mentor: workemon (`@workemon`)

---

## 🥉 3. ENS — Most Creative Use of ENS ($1.25k 1st)

### 🔥 Unsere kreative Erfindung: Stealth-Meta-Address Text Record

**Es gibt KEINEN offiziellen ENSIP für stealth meta-addresses in ENS.** Wir definieren das Pattern:

```typescript
await setEnsText({
  name: "daniel.ethtwin.eth",
  key: "stealth-meta-address",  // ← Unser proposed pattern
  value: "st:eth:0x..."  // EIP-5564 standard format
})
```

**Das ist exakt "creative use that goes beyond name → address resolution"**

### Hits-Tabelle

| Ihre Anforderung | Status |
|---|---|
| **Stealth addresses (EIP-5564) in ENS** | ✅✅ **Unser hero use case** |
| Verifiable credentials via Text Records | ✅ ENSIP-25 doppelt |
| Privacy primitives | ✅ Stealth + cosmic seed |

### Pitch-Angle
> *"Wir haben gezeigt: ENS kann mehr als nur address lookup. Es kann Privacy-Infrastruktur sein. Stealth-Meta-Addresses leben in ENS Text Records — jeder Sender kann privat zahlen, ohne jemals deine Hauptadresse zu kennen. Das ist ein neuer Standard den wir hier vorschlagen."*

---

## 4. Apify — x402 Integration ($1k Visa + $1k Credits 1st place)

### ⚠️ Verified Reality Check
- **Minimum payment: $1 USDC per request**
- Only **Pay-Per-Event Actors** are x402-enabled
- Base **Mainnet** primary, Base Sepolia depends on facilitator
- **Apify MCP server supports x402** — agents pay via x402, no API token needed
- Use `@x402/fetch` v2.x (NOT `x402-fetch` v1.x)

### Wie wir hitten

- **Use Case 1:** Twin macht autonom x402-Tx an Apify ($1+ USDC) für Real-Time-Daten
- **Use Case 2 (Killer):** **Twin pays `analyst.eth` who pays Apify** — agent-to-agent x402 chaining
- **Live Demo:** x402-Tx auf Base, Block-Explorer-Tab vorbereitet

### Demo-Adjustment
- ❌ Old script: "Twin pays $0.20 to Apify"
- ✅ New script: "Twin pays $1 USDC to Apify via x402"

### Mentor: Jakub Kopecky (`@themq37`)
- **Klären in Phase 0:** Funktioniert x402 auf Base Sepolia oder müssen wir Mainnet nutzen?
- Sandbox-Endpoint bestätigen

---

## 5. SpaceComputer — Best Use of Space-Powered Tech ($6k Pool)

### Anforderung (Track 3: Space-Powered Security APIs)
"Use cTRNG and KMS in real applications. Verifiable randomness, secure signing."

### Wie wir hitten

- **Hero-Use:** cTRNG seedet jede Stealth Address. **Echte cosmic randomness, nicht VRF.**
- **Live Attestation:** Satellit-Hash anklickbar, on-chain verifiable
- **No Hardware Required:** Track 3 ist API-only

### Pitch-Differentiator
> *"VRF gibt dir pseudorandom mit einem Operator als Trust-Anchor. cTRNG gibt dir physikalische Entropie aus dem Weltall. Für Privacy ist das relevant — niemand kann unsere Stealth Addresses vorhersagen. Nicht mal wir."*

### Mentor: Pedro Sousa (`@zkpedro`)

---

## 6. ETHPrague — Best UX Flow

| Ihre Checkliste | Wie wir's machen |
|---|---|
| **Anti-Blind Signing** | Plain English Tx Summary vor jedem Sign (Claude 4.6 decoder) |
| Gradual Disclosure | Privy Passkey only, no seed phrase |
| Gas/Chain Abstraction | Privy Smart Wallet + Paymaster (gasless option) |
| ENS over hex | Niemals 0x... in UI. Immer Reverse-Resolved |
| Fear of Loss | Twin warnt bei riskantem Tx |
| Global Accessibility | Voice-Interface + Localized Plain English |

---

## 7. ETHPrague — Best Privacy by Design

- **Stealth Addresses by Default** — nicht Toggle, nicht Premium, sondern Default
- **No User Data Collected** — Privy custodied Wallet (TEE + sharding)
- **Cosmic Randomness als Trust-Anchor** — niemand kann Stealth-Source vorhersagen
- **Zero Metadata Leak** — Tx-History on-chain ist Noise auf Empfänger-Seite

> *"Privacy ist nicht Feature in EthTwin. Privacy IST das Default."*

---

## 📊 Score-Matrix für Self-Assessment

| Bounty | Confidence (1-10) | Risk |
|---|---|---|
| Umia | 7 | Pitch muss sitzen |
| ENS for Agents | **9** | ENSIP-25 + ERC-8004 = strongest claim |
| ENS Creative | **8** | stealth-meta-address Pattern = novel |
| Apify x402 | 7 | Live-Tx ($1+ USDC) muss klappen |
| SpaceComputer | 7 | cTRNG live + saubere Story |
| Best UX | 7 | Voice ist Bonus, Plain English ist must |
| Best Privacy | 8 | Stealth + cosmic = strong story |

**Erwarteter Cash-Output:** $8-12k (Median ~$10k mit ENSIP-25 boost).

---

## ⚠️ Multi-Bounty-Submissions

ETHPrague erlaubt **dasselbe Projekt für mehrere Bounties einzureichen**. Sicherstellen in Devfolio:
- Jeder Bounty wird explizit bei der Submission angekreuzt
- In der Project-Description jedem Bounty einen Absatz gewidmet
- Alle Sponsoren-Mentoren wissen vor Pitch-Tag von uns
- **ENSIP-25 + ERC-8004 prominent in Description** — das ist der Differentiator

## Sources

- ENSIP-25 spec: https://ens.domains/blog/post/ensip-25
- ERC-8004: https://eips.ethereum.org/EIPS/eip-8004
- ERC-8004 contracts: https://github.com/erc-8004/erc-8004-contracts
- EIP-5564: https://eips.ethereum.org/EIPS/eip-5564
- x402 protocol: https://docs.cdp.coinbase.com/x402/welcome
- Apify x402: https://docs.apify.com/platform/integrations/x402
