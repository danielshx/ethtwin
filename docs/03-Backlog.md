# 03 — Backlog (Tier 1 / 2 / 3)

> **Tier 1 = MUST. Ohne das gibt's keine Demo.**
> **Tier 2 = SHOULD. Macht den Wow.**
> **Tier 3 = NICE. Nur wenn Tier 1+2 zu 100% stehen.**
>
> **Verifiziert May 2026** — alle Annahmen via npm + Web-Recherche bestätigt.

---

## ✅ Infra-Status (2026-05-08, abends)

Vor den Tier-Tasks: das Repo ist gescaffolded, Deps installed, Routen + lib/ gestubbt, Frontend-Shell steht.

- [x] Next.js 15 + Turbopack + Tailwind 4 + TS strict scaffold (`pnpm dev`, `pnpm build`, `pnpm typecheck` alle clean)
- [x] Alle verifizierten Deps installed (siehe `docs/11-Tech-Verifikation.md`) inkl. `permissionless` (Privy SmartWallets peer)
- [x] `lib/` komplett gestubbt: `viem`, `ens`, `ensip25` (ERC-7930 + agent-registration verify), `namestone`, `cosmic` (mit Mock-Fallback), `stealth` (Beta-SDK in try/catch), `x402-client` (`x402Client` + `ExactEvmScheme`), `twin-tools` (4 AI-SDK-v6 tools), `privy-server`, `prompts`, `utils`
- [x] API-Routen gestubbt: `/api/{twin,voice,twin-tool,x402,ens,stealth,cosmic-seed,onboarding,agents/analyst}` — `/api/cosmic-seed` live getestet
- [x] App-Shell: `layout.tsx`, `providers.tsx` (Privy + SmartWallets, Base Sepolia), `page.tsx` (auth-gated state machine), `globals.css` (cosmic dark theme)
- [x] `.env.example`, `.gitignore`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`
- [x] Smoke-Test-Scripts: `pnpm test:chain`, `pnpm test:claude`, `scripts/warm-cosmic-cache.ts`
- [x] **shadcn/ui initialisiert** (Tailwind 4, neutral base, cosmic-purple Override) — Komponenten in `components/ui/`: `button`, `card`, `input`, `dialog`, `badge`, `sonner`, `scroll-area`, `separator`, `label`
- [x] **Frontend-Komponenten gebaut:**
  - `components/cosmic-orb.tsx` — Framer-Motion-Hero + `useCosmicSeed()` Hook (idle / fetching / revealed Phasen)
  - `components/twin-chat.tsx` — `useChat` (AI SDK v6) Streaming-UI mit Tool-Call-Rendering, Empty-State-Prompts
  - `components/tx-approval-modal.tsx` — Plain-English-Modal mit ENS-Reverse, Calldata-Drawer, Block-Explorer-Link
  - `components/onboarding-flow.tsx` — 4-Step Wizard (intro → username → cosmic → done), nutzt `CosmicOrb` als Hero
- [x] **Homepage** verbindet alles: Privy-Auth → OnboardingFlow → TwinChat (Session in localStorage), mit Missing-Env-Fallback wenn `NEXT_PUBLIC_PRIVY_APP_ID` fehlt

---

## 🟦 Tier 0 — PHASE 0 SPIKE-TESTS (Stunde 0-3, vor Tier 1)

Diese Spikes klären Annahmen bevor wir bauen — falls ein Spike fehlschlägt, scope cutten:

- [ ] **T0-01** ENS-Strategie mit workemon entscheiden (NameStone vs Sepolia vs Mainnet vs Durin)
- [ ] **T0-02** ScopeLift Stealth SDK 1h spike-test — funktioniert die API wie dokumentiert?
- [ ] **T0-03** `@x402/fetch` v2 + Apify x402 1h spike-test — Tx geht durch auf Base Sepolia oder müssen wir Mainnet?
- [ ] **T0-04** Orbitport cTRNG erste Calls mit Pedro (`@zkpedro`)
- [ ] **T0-05** Privy Smart Wallet Erstellung auf Base Sepolia (5 Min Test)
- [ ] **T0-06** OpenAI Realtime Ephemeral Key + 1 Tool Call (1h spike — wenn nicht trivial → Voice raus)
- [ ] **T0-07** ERC-8004 IdentityRegistry lookup auf Base Sepolia (`0x8004A818BFB912233c491871b3d84c89A494BD9e`) testen

## 🟥 Tier 1 — MUST HAVE

### Onboarding
- [ ] **T1-01** Privy Login mit Email + Passkey (`@privy-io/react-auth`)
- [ ] **T1-02** Smart Wallet Embedded (Privy + Kernel/ZeroDev provider)
- [ ] **T1-03** ENS Subname-Erstellung während Onboarding via NameStone REST API (`{username}.twinpilot.eth`)
- [ ] **T1-04** Smart Wallet wird Owner des ENS Subname Records
- [ ] **T1-05** Twin-Persona-Default in ENS Text Records gespeichert (description, avatar, twin.persona)
- [ ] **T1-05b** **ENSIP-25 Text Record** gesetzt: `agent-registration[<ERC-7930-encoded-registry>][<agentId>] = "1"`
  - Registry-Address Base Sepolia: `0x8004A818BFB912233c491871b3d84c89A494BD9e`
  - ERC-7930 Helper in `lib/ensip25.ts`
- [ ] **T1-05c** **`stealth-meta-address`** Text Record gesetzt (EIP-5564 format `st:eth:0x...`)

### Twin Agent
- [x] **T1-06** `/api/twin/route.ts` mit Vercel AI SDK v6 + Claude Sonnet 4.6 (`claude-sonnet-4-6`) — Stub-Code steht, braucht ANTHROPIC_API_KEY für Live
- [x] **T1-07** System Prompt aus ENS Text Records hydriert (`lib/prompts.ts` + `readTwinRecords`)
- [x] **T1-08** 4 Tools verfügbar (AI SDK v6 `inputSchema`):
  - `requestDataViaX402`, `decodeTransaction`, `generatePrivatePaymentAddress`, `hireAgent`
- [x] **T1-09** Streaming-Responses ans Frontend (`useChat` + `DefaultChatTransport` in `components/twin-chat.tsx`)
- [x] **T1-10** Multi-Turn Konversation funktioniert (Context bleibt) — `useChat` standard, ungeprüft live

### Voice (oder Chat-Fallback)
- [ ] **T1-11** Chat-Interface 100% funktional (immer als Fallback)
- [ ] **T1-12** Voice-Mode (OpenAI Realtime mit `gpt-4o-realtime-preview`) wenn möglich, sonst Chat-only
- [ ] **T1-12b** Ephemeral Key Minting Endpoint (`/api/voice/route.ts`) für WebRTC

### Tx-Approval-Flow
- [x] **T1-13** Tx-Approval-Modal mit Plain English Summary (`components/tx-approval-modal.tsx`) — Calldata-Drawer + Explorer-Link inklusive
- [x] **T1-14** ENS-Reverse-Resolution-Helper im Modal (`toEnsName`/`fromEnsName` Props) — Caller-Wiring zu `viem.getEnsName` ausstehend
- [ ] **T1-15** Mindestens 1 Tx live signiert mit Privy Smart Wallet auf Base Sepolia (Modal ruft `onApprove` Callback — Privy `client.sendTransaction`-Wiring noch zu tun)

### x402
- [ ] **T1-16** `@x402/fetch` SDK eingebaut
- [ ] **T1-17** Mindestens 1 echte x402-Tx an Apify-Endpoint ($1 USDC min), on-chain visible
- [ ] **T1-18** Block-Explorer-Link in der Demo zeigbar (basescan.org)

### Demo-Polish
- [x] **T1-19** Onboarding-Animation: 4-Step Wizard mit StepIndicator + CosmicOrb-Hero, smooth Transitions via Framer Motion
- [x] **T1-20** Twin-Chat-UI mit gestreamten Responses, Thinking-Dots, Tool-Call-Pills, Empty-State-Prompt-Vorschläge
- [ ] **T1-21** Block-Explorer-Tab vorbereitet für Demo (Modal hat bereits `${explorerBase}${hash}`-Link, Live-Tx fehlt)

---

## 🟨 Tier 2 — SHOULD HAVE (Wow-Layer)

### Cosmic Privacy
- [ ] **T2-01** Orbitport cTRNG API integration mit Caching
- [ ] **T2-02** Stealth Address Generation mit cTRNG-Seed (EIP-5564 via `@scopelift/stealth-address-sdk`)
- [ ] **T2-03** Stealth Meta-Key Standard-konformes Format (EIP-5564 spec)
- [ ] **T2-04** Live On-Chain Stealth-Send: Sender → Stealth-Adresse → Recipient sieht Funds
- [ ] **T2-05** **Cosmic-Orb-Animation** beim Stealth-Generate (Hero-Moment!)
- [ ] **T2-06** Attestation-Hash anklickbar → Block-Explorer

### Agent-zu-Agent x402 mit ENSIP-25
- [ ] **T2-07** `analyst.twinpilot.eth` als Sample-Agent deployed
- [ ] **T2-08** `analyst.twinpilot.eth` Capabilities + ENSIP-25 Record + endpoint in Text Records
- [ ] **T2-09** Twin findet `analyst.eth` über ENS-Discovery
- [ ] **T2-09b** **ENSIP-25 Verification:** Twin liest `agent-registration[...]` → zeigt "✓ Verified Agent" Badge
- [ ] **T2-10** Twin macht x402-Tx an Analyst, Analyst antwortet, Twin synthetisiert
- [ ] **T2-11** UI-Visualisierung: "Twin asks analyst.eth ✓ ENSIP-25" mit Flow-Animation

### Demo-Story
- [ ] **T2-12** Pitch-Slides (3-4 Slides max, eine ist Token/Revenue für Umia)
- [ ] **T2-13** Demo-Video als Backup aufgenommen
- [ ] **T2-14** Edge-Case-Antworten vorbereitet:
  - Warum cTRNG statt VRF?
  - Was ist ENSIP-25?
  - Warum $1 USDC pro Apify-Call?
  - Wie skalierbar ist das?
  - Was ist das Geschäftsmodell?
  - Token-Distribution?

---

## 🟩 Tier 3 — NICE TO HAVE

### Apify-Power-Use
- [ ] **T3-01** Apify scrapes Twitter/LinkedIn beim Onboarding für Twin-Persona-Auto-Generation (>$1 USDC pro call)
- [ ] **T3-02** Twin nutzt mehrere Apify-Actors für verschiedene Use-Cases

### ENS Creative Stretch
- [ ] **T3-03** Reputation-Score in ENS Text Records (signed by `twinpilot.eth`)
- [ ] **T3-04** Multi-Agent-Discovery (3+ Sample-Agents mit ENSIP-25 records)
- [ ] **T3-05** ERC-8004 IdentityRegistry mock deployed (für volle ENSIP-25 demo)

### Polish Extra
- [ ] **T3-06** Sound-Design (Twin-Thinking, Tx-Confirmed, Cosmic-Reveal)
- [ ] **T3-07** Mobile-Responsive (PWA mit Add-to-Homescreen)
- [ ] **T3-08** Dark/Light Mode Toggle
- [ ] **T3-09** Onboarding-Avatar-Generation aus Apify-Profile

### Operations
- [ ] **T3-10** Token-Smart-Contract als Pitch-Asset (nicht deployed, nur als Code)
- [ ] **T3-11** Subscription-Tiers in UI angedeutet

---

## ❌ Out of Scope (bewusst)

Diese Dinge sind verlockend aber **wir bauen sie NICHT**:

- ❌ **Sourcify Integration** — 8h Aufwand, niedriger Marginal-Gain
- ❌ **Eigenes Smart Contract Deployment** außer Sample-Agent (oder Durin-Templates wenn Pfad C gewählt)
- ❌ **Multi-Chain** — nur Base Sepolia
- ❌ **Mobile Native App** — PWA reicht
- ❌ **Echter Marketplace UI** — 1-2 Sample-Agents reichen für Demo
- ❌ **Eigener LLM-Stack / Fine-Tuning**
- ❌ **Token-Launch / Airdrop**
- ❌ **DAO-Governance**
- ❌ **Kollaborative Twin-Sessions**
- ❌ **Mainnet ENS Subnames** (Sepolia ENS oder Durin reicht)

---

## Status-Tracking

Während der Hackathon läuft, **immer den Status hier updaten:**

```
Stunde 3 — Phase 0 Status:    [ ] Done
Stunde 12 — Phase 1 Status:   [ ] Done
Stunde 24 — Phase 2 Status:   [ ] Done
Stunde 36 — Phase 3 Status:   [ ] Done
Stunde 44 — Phase 4 Status:   [ ] Done
Stunde 48 — SUBMITTED         [ ] Done
```

## Bounty-Hit-Tracker (Submission-Vorbereitung)

Vor Devfolio-Submission durch:

- [ ] Umia: Pitch-Slide für Token + Revenue ready
- [ ] ENS for AI Agents: ENSIP-25 implementation in Demo + Description
- [ ] ENS Most Creative: stealth-meta-address Text Record + EIP-5564 demo
- [ ] Apify x402: live $1+ USDC tx in demo, blockexplorer link
- [ ] SpaceComputer Track 3: cTRNG live attestation in demo
- [ ] Best UX Flow: Plain English + Passkey + ENS reverse resolution
- [ ] Best Privacy by Design: Stealth-by-default + cosmic seed
