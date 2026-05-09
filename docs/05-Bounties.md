# 05 — Bounty-Stack (Verified May 2026)

> Wir hitten 7+ Bounties realistisch. Realistic outcome: $8-12k cash.
>
> **Wichtigste Verifikation:** ENSIP-25 ist offizieller Standard für AI Agent Identity in ENS, ERC-8004 IdentityRegistry ist live auf Mainnet (seit 29. Jan 2026) + Base Sepolia. Wir implementieren beides = doppelter ENS-Bounty-Hit.

## 🎭 Pitch-Frame (locked 2026-05-09)

**Tagline:** *"Crypto for everyone — even my grandma."*

Die Bounties werden nicht in einer Feature-Tour eingelöst, sondern in **einem Reveal-Beat nach der Maria/Tom-Demo**:
- Maria (67) sendet Tom 100 USDC per Voice (60 s, ein Touch)
- Cut. Schwarz. Bullets erscheinen: kein Seed, kein Hex, Stealth by Default, cosmic randomness, ENSIP-25-verified agent-to-agent x402
- Closing: *"Crypto isn't hard. It's just been built for engineers. Until now."*

Das macht jeden Bounty zur natürlichen Konsequenz der Story. Volles Skript: `docs/06-Demo-Skript.md`. Slides: `docs/14-Pitch-Slides.md`.

## 📊 Live-Demo-Status (Stand 2026-05-09)

| # | Bounty | Status | Was fehlt für volle Punkte |
|---|---|---|---|
| 1 | Umia — Agentic Venture | 🟡 Code-fertig | Pitch-Skript + Slides |
| 2 | **ENS for AI Agents** | 🟢 **Live** | nichts technisch — pitch sitzt |
| 3 | **ENS Creative** | 🟢 **Live** | nichts — `stealth-meta-address` + ENS-Messenger sind on-chain demonstrable |
| 4 | Apify x402 | 🟡 Mock grün | live Apify-Tx ($1+ USDC, mainnet wallet funded) |
| 5 | SpaceComputer cTRNG | 🟡 Wrapper grün | `ORBITPORT_API_KEY` für live Attestation |
| 6 | Best UX Flow | 🟢 **Live inkl. Voice** | OpenAI Realtime über WebRTC im Voice-Tab — Listening/Thinking/Speaking-States, Function-Calls via `/api/twin-tool`. Wenn `OPENAI_API_KEY` fehlt → graceful 503 + Switch-to-Chat-Card. |
| 7 | **Best Privacy by Design** | 🟢 **Live** | nichts — Stealth-Send läuft end-to-end |
| 8 | **Sourcify — Contract Intelligence** | 🟢 **Live** | Risky-Approval-Demo im Send-Tab zeigen; optional Sourcify-first Decoder für noch stärkeren Sponsor-Claim |

**Solid-Cash-Floor:** ENS×2 + Privacy + UX = ~$3-4k einigermaßen sicher.
**Stretch-Add:** Umia + Apify + SpaceComputer + Sourcify wenn Pitch + live Tx + Orbitport-Key + Risky-Demo landen.

---

## 🥇 1. Umia — Best Agentic Venture ($2k cash)

> **Status: 🟡 Code-fertig.** Twin live auf https://ethtwin-woad.vercel.app — Mint, Messenger, Stealth-Send, Token-Transfer, Agent-Hire alle gewired. Fehlt: Pitch-Skript + Slides (`Phase 3 Pitcher` TODO).

### Anforderung
Project must classify as Agentic Venture suitable to launch on Umia. Must incorporate Agents in execution. Must have reasonable path to revenue + token.

### Wie wir hitten

| Kriterium | Unsere Antwort |
|---|---|
| Agentic Workflows | Twin ist core Agent. Hires sub-agents via x402 (`analyst.eth`) |
| Path to Revenue | Subscription tiers (Privacy Premium, Pro Voice, Multi-Twin), x402 service fees, B2B-Twin-as-API |
| Token-Story | $TWIN governance + service credits + premium-tier-unlock |
| Crowdfunding-Palatable | Klar definiertes Produkt, demoable, zugänglicher Markt |

### Pitch-Slide für Umia (Maria/Tom-Edition)
- **Slide 1:** "Crypto for everyone — even my grandma" + Maria-Avatar
- **Slide 2:** Live-Demo (Stub-Cover)
- **Slide 3:** Reveal — "What Maria didn't see" (Bullets: kein Seed, kein Hex, Stealth, cTRNG, ENSIP-25 + x402)
- **Slide 4:** ENS as identity layer (optional Q&A-Backup)
- **Slide 5:** Umia — "the next 1 billion users", drei Revenue-Säulen + $TWIN Token-Distribution

### Pitch-Sentence (Umia-spezifisch)
> *"EthTwin ist nicht die Wallet für die nächsten 100 Millionen Power-User. Es ist die Wallet für die nächsten 1 Milliarde — die, die Krypto bisher als zu kompliziert abgelehnt haben. Maria ist der Beweis dass das Tooling jetzt da ist."*

### Mentor: Francesco Mosterts (`@fra_mosterts`)

---

## 🥈 2. ENS — Best ENS Integration for AI Agents ($1.25k 1st place)

> **Status: 🟢 LIVE.** Every twin on Sepolia ENS gets `agent-registration[<interopAddr>][<agentId>]` text record set during onboarding via `lib/ensip25.ts:encodeInteropAddress()`. `verifyAgentRegistration()` reads it back. `findAgents` + `hireAgent` Twin tools exercise the discovery flow. Verified for `daniel.ethtwin.eth` + `rami.ethtwin.eth` + every onboarded twin.

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

### Pitch-Sentence (Maria-Frame)
> *"Maria sieht keine Hex-Adressen, sie sieht Tom. Hinter den Kulissen verifyt ihr Twin `tom.ethtwin.eth` über ENSIP-25 + ERC-8004 IdentityRegistry — den offiziellen Standard. Wenn du ENS killst, killst du Maria's Krypto-Erfahrung."*

### Mentor: workemon (`@workemon`)

---

## 🥉 3. ENS — Most Creative Use of ENS ($1.25k 1st)

> **Status: 🟢 LIVE — TWO creative patterns shipping on-chain.**
> 1. `stealth-meta-address` text record (proposed pattern, no ENSIP yet) — published to `daniel.ethtwin.eth` via `pnpm ens:stealth-provision` ([tx 0xbf9f…2a7e](https://sepolia.etherscan.io/tx/0xbf9fffbedd589176c70c9fbac43a20f7cb2b10770afc33c547fd72c932782a7e))
> 2. **ENS-as-messaging-medium** — every message is a sub-subname `msg-<ts>-<seq>.<recipient>.ethtwin.eth` with `from`/`body`/`at` text records, indexed via `messages.list` text record on the recipient. Live in the **ENS Messenger** tab. Reads via single direct resolver eth_call (`readTextRecordFast`).

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

### Pitch-Angle (Maria-Frame)
> *"Marias 100 USDC gingen an Toms `stealth-meta-address` Text Record — direkt aus ENS. Kein extra Registry, kein extra Onboarding für Tom. Genau das ist 'creative use of ENS': Privacy-Infrastruktur als Text-Record-Pattern. Wir proposen das als neuen ENSIP."*

---

## 4. Apify — x402 Integration ($1k Visa + $1k Credits 1st place)

> **Status: 🟡 Code-fertig, live-Tx ausstehend.**
> - `lib/x402-client.ts` mit v1+v2 SDK dispatch (ExactEvmScheme + ExactEvmSchemeV1, CAIP-2 + chain slugs), receipt-parsing inline
> - Mock-Test grün: `pnpm test:x402-mock` → 402-challenge → signed X-PAYMENT → 200
> - **Fehlt:** funded mainnet wallet (~$5 USDC on Base) + x402-enabled Apify actor slug + live tx

### ⚠️ Verified Reality Check
- **Minimum payment: $1 USDC per request**
- Only **Pay-Per-Event Actors** are x402-enabled
- Base **Mainnet** primary, Base Sepolia depends on facilitator
- **Apify MCP server supports x402** — agents pay via x402, no API token needed
- Use `@x402/fetch` v2.x (NOT `x402-fetch` v1.x)

### Wie wir hitten (Maria-Frame)

- **Demo-Beat 1 (Verify):** Maria fragt "is this safe?" → ihr Twin bezahlt $1 USDC an `analyst.ethtwin.eth` über x402 für eine Verifikations-Antwort. Live, on-chain, sichtbar als $1-USDC-Pill.
- **Demo-Beat 2 (Daten):** Twin nutzt Apify x402 (Pay-Per-Event Actor) für Real-Time-Recipient-Reputation-Lookup wenn Apify-Endpoint live ist.
- **Story:** Maria sieht den Preis nie. Twin entscheidet — das ist agent-driven payment, nicht user-driven. x402 Mikro-Markt in Action.

### Demo-Adjustment
- ❌ Old script: "Twin pays $0.20 to Apify"
- ✅ New script: "Twin pays $1 USDC to Apify via x402"

### Mentor: Jakub Kopecky (`@themq37`)
- **Klären in Phase 0:** Funktioniert x402 auf Base Sepolia oder müssen wir Mainnet nutzen?
- Sandbox-Endpoint bestätigen

---

## 5. SpaceComputer — Best Use of Space-Powered Tech ($6k Pool)

> **Status: 🟡 Wrapper grün, live API key ausstehend.** `lib/cosmic.ts` (`getCosmicSeed()`, `warmCache()`) hat rolling cache, attestation passthrough, mock fallback. Cosmic-Orb UI animiert + reveal'd Hash on stealth-send. **Fehlt:** `ORBITPORT_API_KEY` in `.env.local` + Vercel — sonst zeigt Mock-Attestation.

### Anforderung (Track 3: Space-Powered Security APIs)
"Use cTRNG and KMS in real applications. Verifiable randomness, secure signing."

### Wie wir hitten

- **Hero-Use:** cTRNG seedet jede Stealth Address. **Echte cosmic randomness, nicht VRF.**
- **Live Attestation:** Satellit-Hash anklickbar, on-chain verifiable
- **No Hardware Required:** Track 3 ist API-only

### Pitch-Differentiator (Maria-Frame)
> *"Marias Stealth-Adresse wurde mit echter cTRNG-Entropie aus einem Orbitport-Satelliten geseedet — verifizierbar via Attestation. VRF gibt dir pseudorandom mit einem Operator als Trust-Anchor. cTRNG gibt dir physikalische Entropie aus dem Weltall. Für Privacy by Default ist das relevant — niemand kann Marias Stealth-Adressen vorhersagen. Nicht mal wir."*

### Mentor: Pedro Sousa (`@zkpedro`)

---

## 6. ETHPrague — Best UX Flow

> **Status: 🟢 LIVE.** Voice wurde wieder eingebaut (Realtime über WebRTC mit Function-Calls), Chat bleibt der zuverlässige Fallback (`docs/13-Chat-Only-Demo-Runbook.md`). Alles andere live auf https://ethtwin-woad.vercel.app.

| Ihre Checkliste | Status | Wie wir's machen |
|---|---|---|
| **Anti-Blind Signing** | ✅ | Plain English Tx Summary via `lib/tx-decoder.ts` + `components/tx-approval-modal.tsx` (used by token-transfer) |
| Gradual Disclosure | ✅ | Privy Passkey + Email + Wallet, no seed phrase |
| Gas/Chain Abstraction | ✅ | Privy Smart Wallet on Base Sepolia, dev-wallet relays user txs gasless |
| ENS over hex | ✅ | `withEnsName(addr)` + `useEnsName` hook + `AvatarImage` fallback to short 0x… everywhere |
| Fear of Loss | 🟡 | Tx approval modal shows the action; no explicit "risk warning" UI yet |
| Global Accessibility | 🟢 | Voice-Tab live (`components/voice-twin.tsx`) + Chat-only Runbook als Fallback |

---

## 7. ETHPrague — Best Privacy by Design

> **Status: 🟢 LIVE.** End-to-end stealth send works in the **Stealth Send** tab. `lib/payments.ts:sendStealthUSDC()` → `lib/stealth.ts:generatePrivateAddress()` (real ScopeLift SDK, mocked-flag visible) → on-chain USDC.transfer to a one-time stealth address. Verified via `pnpm send:stealth-usdc`.

- ✅ **Stealth Addresses by Default** — Sealth Send is a top-level tab, not a hidden setting
- ✅ **No User Data Collected** — Privy custodied wallet (TEE + sharding); server only stores Privy user ID + ENS name
- 🟡 **Cosmic Randomness als Trust-Anchor** — wired through `lib/cosmic.ts`, currently mock fallback in deploy until `ORBITPORT_API_KEY` is set
- ✅ **Zero Metadata Leak on receiver side** — every send goes to a fresh stealth address derived from the recipient's `stealth-meta-address` text record; no on-chain link between sender and recipient

> *"Maria weiß nicht mal was 'stealth' heißt — und genau deshalb ist sie geschützt. Privacy ist nicht Feature in EthTwin. Privacy IST das Default."*

---

## 8. Sourcify — Contract Intelligence / Anti-Blind-Signing

> **Status: 🟢 LIVE.** Sourcify ist als Contract-Intelligence-Layer im Send-Flow sichtbar. Base-Sepolia-Sends öffnen vor der Ausführung das `Sourcify Contract Intelligence` Review: **Inspect → Decode → Decide**. Zusätzlich gibt es im Send-Tab einen non-executable **Try risky approval demo** Button, der ein `approve(spender, maxUint256)` simuliert und als HIGH risk markiert.

### Anforderung
Build a tool, platform, or application that makes meaningful use of Sourcify's open dataset of verified smart contracts. Sourcify verification means open-source / inspectable — nicht automatisch safe. Besonders relevant: AI-powered contract explainer, risk highlighting, common vulnerability / wallet-risk patterns.

### Wie wir hitten

| Kriterium | Unsere Antwort |
|---|---|
| Use of Sourcify data | `lib/sourcify.ts` liest `full_match` / `partial_match` Metadata, ABI, Contract-Name und Source-URL aus `repo.sourcify.dev` für Mainnet, Sepolia und Base Sepolia |
| Impact & usefulness | EthTwin verhindert Blind Signing für nicht-technische Nutzer: Maria sieht keine Hex-Calldata, sondern eine verständliche Sicherheitsentscheidung |
| Technical execution | `/api/decode-transaction` routet Browser-Decoding serverseitig; `lib/tx-decoder.ts` verbindet Sourcify ABI Decode + Plain-English Summary + Risk Layer |
| Novelty | Sourcify ist nicht nur Badge, sondern Schritt 1 eines agentischen Safety-Flows: **Inspect → Decode → Decide** |

### 🔥 Core Framing

> *"Sourcify does not tell Maria what is safe. It gives EthTwin verified source evidence, and EthTwin turns that evidence into a plain-English risk decision before she signs."*

### Implementation

- `lib/sourcify.ts` — Sourcify repository lookup for `metadata.json`, ABI, contract name, `full_match` / `partial_match`, source URL
- `lib/tx-decoder.ts` — decodes tx calldata, uses Sourcify as fallback for unknown contracts, attaches source verification + risk summary
- `lib/contract-risk.ts` — wallet-risk classifier on top of Sourcify-derived evidence
- `app/api/decode-transaction/route.ts` — server-side decode API so Sourcify lookup does not depend on browser/CORS behavior
- `components/tx-approval-modal.tsx` — visible UX: Sourcify Contract Intelligence, source check, risk check, high-risk acknowledgement, demo-only reviews
- `components/token-transfer.tsx` — Base Sepolia sends always run Sourcify review before execution; `Try risky approval demo` shows the HIGH-risk approval path without sending a tx

### Risk Patterns

| Pattern | Risk | User-facing behavior |
|---|---|---|
| Unverified contract + calldata | HIGH | "Twin cannot inspect verified source" |
| Unknown selector | HIGH | "Function could not be mapped to verified ABI" |
| Unlimited ERC20 approval | HIGH | "Common wallet-drain risk" |
| `setApprovalForAll(true)` | HIGH | "Collection-wide operator access" |
| `transferFrom` | MEDIUM | "Check from/to/amount carefully" |
| Sourcify partial match | MEDIUM | "Inspectable, but needs extra caution" |
| Verified decoded transfer | LOW | "Understandable action; confirm recipient and amount" |

### Demo Beat

1. Open **Send** tab on Base Sepolia.
2. Click **Try risky approval demo**.
3. Modal shows `Sourcify Contract Intelligence`:
   - Inspect: Sourcify / known ABI evidence
   - Decode: unlimited USDC approval
   - Decide: **HIGH — Unlimited token approval**
4. Point out that it is **demo-only and non-executable**.
5. Pitch line: *"Sourcify makes the code inspectable. EthTwin turns that inspectability into a safety decision Maria can understand."*

### Mentor / Sponsor Feedback Incorporated

Sourcify feedback was that verification should not be equated with safety. We changed the product accordingly: Sourcify is the open-source evidence layer, and EthTwin adds a separate wallet-risk pattern layer before presenting any recommendation.

---

## 📊 Score-Matrix für Self-Assessment (refreshed 2026-05-09)

| Bounty | Confidence | Was hochpushen würde |
|---|---|---|
| Umia | **7** | Maria-Story + Pitch-Slide-Markdown done; Slides müssen noch in Keynote/Slides gebaut werden |
| ENS for Agents | **9** | live; Maria + Tom seed-script ready (T1-22 done) |
| ENS Creative | **9** | doppelter Hit (stealth-meta-address + ENS-Messenger) — strongest claim |
| Apify x402 | **5** | live tx auf Base Mainnet muss endlich laufen — sonst nur Mock-Story |
| SpaceComputer | **5** | `ORBITPORT_API_KEY` setzen = sofort 8 |
| Best UX | **9** | komplett rebuilt zu warmem Premium-Konsumer-Look + Maria-Mode + Quick-Send-Cards + Gamification-Pills |
| Best Privacy | **8** | Stealth-Send läuft live; X-ray-Reveal-Card zeigt EIP-5564 + ENSIP-25 + cTRNG transparent |
| Sourcify Contract Intelligence | **8** | Risky-Approval-Demo live zeigen; noch stärker mit Sourcify-first Decode für normale ERC20-Sends |
| **Aesthetics** (general scoring axis) | **8.5** | warm Premium-Konsumer-Palette als Default, ContrastCard auf Landing, Receipt-Postcard mit X-ray-Reveal, Confetti+Cosmic-Pulse, Twin-Avatar-Breathing, Onboarding entjargonisiert |
| **Wow Factor** (general scoring axis) | **8** | X-ray Reveal + Tom-Auto-Reply ("thanks oma! 💜") + Confetti+Cosmic-Pulse on send + Maria-Persona-Story landen 3 emotionale Beats |

**Erwarteter Cash-Output realistic:** $5-8k floor (ENS×2 + Privacy + UX + Best UX = solid mit aktuellem Polish-Stand). $9-13k stretch (wenn Umia-Pitch + Apify-Live-Tx + Orbitport-Key am Demo-Tag landen).

**Quick wins to close the gap (zu Demo-Tag):**
1. `pnpm twins:seed-demo` laufen lassen (5 min, ~0.01 Sepolia-ETH) — sonst keine Live-Demo mit Maria/Tom
2. 3 Sound-MP3s in `public/sounds/` droppen (15 min, freesound.org) — visceral polish
3. `ORBITPORT_API_KEY` setzen (10 min) → SpaceComputer geht von 5 → 8
4. Fund Base Mainnet wallet w/ $5 USDC + pick x402-actor (30 min) → Apify geht von 5 → 7
5. Pitch 5× geprobt mit Timer (60 min) → Demo unter 3 min, sicher
6. Backup-Video aufgenommen (45 min) — Insurance für Live-Crash

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
- Sourcify repository: https://repo.sourcify.dev/
- Sourcify docs: https://docs.sourcify.dev/
