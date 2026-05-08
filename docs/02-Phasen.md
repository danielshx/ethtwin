# 02 — Phasen-Plan (48h)

> Strikt zeitlich. Jede Phase hat eindeutige Deliverables. Wenn Phase X nicht abgeschlossen ist, wird Phase X+1 nicht gestartet — wir scopen lieber Tier 2/3 raus.

> **Aktueller Vorlauf (2026-05-08, Pre-Hackathon):** Repo, Stack, Backend-Stubs, Frontend-Komponenten und Auth-gated Homepage sind fertig. Phase 0 reduziert sich am Hackathon-Tag auf API-Keys eintragen + Spike-Tests gegen echte Services. Phase 1 ist halb erledigt — Twin-Chat, Onboarding-UI und Tx-Modal stehen, fehlt Live-Verdrahtung.

---

## Phase 0 — Setup-Sprint (Stunde 0-3)

**Ziel:** Repo läuft, alle Services authentifiziert, Mentor-Pings raus.

### Parallel-Tasks pro Person

#### ETH-Dev // Done
- [x] Repo lokal klonen, pnpm install
- [x] viem + @ensdomains/ensjs Boilerplate testen (`pnpm test:chain` against Sepolia)
- [x] Sepolia RPC (Alchemy) registrieren — *Sepolia, nicht Base Sepolia per Entscheidung*
- [x] Test-Wallet mit Sepolia ETH funden (faucet) — `0x4E09…a6f5`

#### Backend
- [ ] Privy.io Account, App-ID + Secret holen
- [ ] Anthropic API Key, OpenAI API Key
- [ ] Apify Account + API Key (Mentor: Jakub `@themq37`)
- [ ] Orbitport Access (Mentor: Pedro `@zkpedro`)

#### Frontend
- [ ] Next.js Repo aufsetzen mit Tailwind + shadcn
- [ ] Framer Motion + Lucide installiert
- [ ] Dark mode default setting
- [ ] Login-Skeleton mit Privy-Provider gewrapped

#### Pitcher / Generalist
- [ ] Mentor-Pings raus (alle 4)
- [ ] Devfolio Account erstellen, Team-Submission vorbereiten
- [x] ENS-Domain klären: `twinpilot.eth` verfügbar? Backup-Optionen — *gewechselt zu `ethtwin.eth`, registriert auf Sepolia*
- [ ] Notion-Doc für Pitch-Skript erstellen

### Phase 0 — Done-Definition

- ✅ `pnpm dev` läuft mit Login-Page
- ✅ Privy Login funktioniert (auch ohne Smart Wallet noch)
- ✅ ENS-Domain entschieden + erste Subname-Tests auf Sepolia
- ✅ Mindestens 2 Mentor-Antworten

---

## Phase 1 — Vertical Slice (Stunde 3-12)

**Ziel:** Ein User durchläuft Onboarding → ENS Subname → kann Twin eine Frage stellen → Twin antwortet.

### Tasks

#### ETH-Dev //Done
- [x] ENS Subname-Erstellung on-chain testen (`daniel.ethtwin.eth`) — tx [`0xdce0…68ec`](https://sepolia.etherscan.io/tx/0xdce00e61e4a25f99280c8c8016b21109a2c137ace96f1292c898ba4ca7e868ec), `pnpm ens:provision`
- [x] Text Records setzen: `description`, `avatar`, `url`, custom `twin.persona` — gesetzt + read-back verifiziert via `pnpm ens:read`
- [x] Reverse-Resolution-Helper (`lib/ens.ts`) — `reverseResolve`, `withEnsName`, `shortenAddress`

#### Backend
- [ ] `/api/twin/route.ts` — Vercel AI SDK + Claude Sonnet 4.5
- [ ] Twin Loop: System Prompt aus ENS Text Records hydrieren
- [ ] Erste Tool-Definitions (placeholder): `get_balance`, `send_tx`

#### Frontend
- [ ] Onboarding-Flow: Email → Passkey → ENS-Subname-Reservation → Smart-Wallet-Erstellung
- [ ] Twin-Chat-UI mit Streaming-Response
- [ ] Loading-States + erste Polish-Animation

#### Pitcher
- [ ] `analyst.twinpilot.eth` Sample-Agent vorbereitet (Endpoint-Stub)
- [ ] Pitch-Skript v1 (Rohfassung, 3 Min)

### Phase 1 — Done-Definition

- ✅ User kann sich onboarden, ENS-Subname existiert on-chain
- ✅ Twin antwortet auf Texteingaben (kein Voice noch)
- ✅ Smart Wallet hat eine Adresse, kann gefundet werden

---
  
## Phase 2 — Core Features (Stunde 12-24)

**Ziel:** Voice + Live x402 Tx + Plain English Tx-Summary funktionieren.

### Tasks

#### ETH-Dev
- [x] Tx-Decoder mit `viem` + Plain-English-Layer — `lib/tx-decoder.ts` + `lib/abis.ts`, `pnpm test:decoder` gegen reale Sepolia-Txs grün; LLM-Layer als `setPlainEnglishProvider(fn)` Hook (Stub heute, LLM später drop-in)
- [x] EIP-5564 Stealth Address Helper (`lib/stealth.ts`) mit `@scopelift/stealth-address-sdk` — typed-safe rewrite, sender + recipient flow, `viewTag`-Bug gefixt
- [x] Stealth-Meta-Key in ENS Text Record speichern + lesen — published auf `daniel.ethtwin.eth` (tx [`0xbf9f…2a7e`](https://sepolia.etherscan.io/tx/0xbf9fffbedd589176c70c9fbac43a20f7cb2b10770afc33c547fd72c932782a7e)), end-to-end verifiziert via `pnpm ens:stealth-provision`

#### Backend
- [ ] OpenAI Realtime API integration (`/api/voice/route.ts`)
- [~] x402-fetch SDK eingebaut, erste Apify x402 Test-Request — *SDK eingebaut + Mock-Test grün (`pnpm test:x402-mock`); `lib/x402-client.ts` v1+v2 dispatch fixed (ExactEvmSchemeV1, CAIP-2 slugs); echte Apify-Tx noch ausstehend*
- [ ] Twin's Tool-Calling: `request_data_via_x402`, `decode_transaction`
- [ ] Orbitport cTRNG Wrapper (`lib/cosmic.ts`) mit Caching

#### Frontend
- [ ] Voice-UI mit Push-to-Talk + Realtime-Streaming-Display
- [ ] Tx-Approval-Modal mit Plain English Summary
- [ ] Toast-Notifications für x402-Payments (mit Block-Explorer-Link)
- [ ] ENS-Reverse-Resolution überall: nie 0x... zeigen

#### Pitcher
- [ ] `analyst.twinpilot.eth` deployed: Endpoint reagiert auf x402-Payment, gibt LLM-Response zurück
- [ ] Pitch-Skript v2 mit konkreten Beats
- [ ] Edge-Case-Antworten geschrieben (siehe Backlog)

### Phase 2 — Done-Definition

- ✅ Voice-Conversation läuft (oder explizit Chat-Fallback locked-in)
- ✅ Twin macht echte x402-Tx an Apify, Result kommt zurück
- ✅ Tx-Summary liest sich für Laien verständlich
- ✅ Stealth Address kann generiert werden (CLI/test ok) — *erfüllt: `pnpm ens:stealth-provision` derives stealth address + recipient verifies via checkStealthAddress + privateKeyToAddress(derivedKey) === stealthAddress*

### ⚠️ Drop-Decision Punkt 1 (Stunde 24)

**Wenn Voice nicht stable läuft → JETZT auf Chat switchen. Keine Diskussion.**
Voice-Sample wird im Demo-Video aufgenommen als Backup.

---

## Phase 3 — Wow-Layer (Stunde 24-36)

**Ziel:** Cosmic Animation + Agent-zu-Agent x402 + alles polished.

### Tasks

#### ETH-Dev
- [ ] Live-On-Chain Stealth-Send mit cTRNG-Seed
- [ ] Test-Tx auf Base Sepolia: Sender → Stealth Address → Recipient sieht Funds
- [ ] Agent-Discovery: Twin queried `analyst.twinpilot.eth`, liest Capabilities, schickt x402

#### Backend
- [ ] Cosmic Seed Endpoint mit echter Orbitport-Attestation (oder Cache-Fallback)
- [ ] Agent-Hire-Tool für Twin: gegebenes Intent, finde + bezahle passenden Agent
- [ ] Telemetry/Logging für Demo (nichts Privates, nur on-chain visible Stuff)

#### Frontend (Hero-Phase)
- [ ] **Cosmic-Orb-Animation** beim Stealth-Generate (Framer Motion + Particles)
- [ ] Satellit-Hash live anzeigbar mit Click-to-Explorer
- [ ] Agent-Hire-Animation: "Twin asks analyst.eth..." mit visualisiertem x402-Flow
- [ ] Sound-Design (subtil, nicht cringe): hmm-sound für Twin-Thinking, ping für Tx-Confirmed

#### Pitcher
- [ ] Demo-Skript final, mit Sekundenzähler
- [ ] 3x Probedurchlauf mit Frontend-Mensch
- [ ] Pitch-Slides: 3-4 Slides max (Problem → Demo → Why-Win → Token/Revenue für Umia)
- [ ] Devfolio-Submission Draft (alles außer Demo-Video)

### Phase 3 — Done-Definition

- ✅ Cosmic Animation hat Wow-Faktor (Frontend-Person stolz)
- ✅ Twin hires `analyst.eth` end-to-end on-chain
- ✅ Stealth Send funktioniert live
- ✅ Demo-Skript geprobt, sitzt unter 3 Min

### ⚠️ Drop-Decision Punkt 2 (Stunde 36)

- Wenn Stealth on-chain nicht stable → mock visualisierung, real attestation cache
- Wenn Agent-zu-Agent x402 nicht klappt → pre-signed Tx mit Block-Explorer im Tab

---

## Phase 4 — Polish + Story (Stunde 36-44)

**Ziel:** Demo crash-frei, Backup-Video aufgenommen, Devfolio-Submission ready.

### Tasks

- [ ] **Demo-Video** aufnehmen (1-3 takes, screen + face cam)
- [ ] Edge-Cases durchspielen: Internet-Loss, Voice-Drop, API-Latency
- [ ] Mocks vorbereitet für jeden Drop-Case
- [ ] README.md final, mit klaren Run-Instructions
- [ ] Devfolio-Description vollständig
- [ ] Pitch 5x geprobt, alle Beats sitzen

### Phase 4 — Done-Definition

- ✅ Demo-Video uploaded (auch wenn Live klappt — Backup ist gold)
- ✅ Devfolio-Submission ready, fehlen nur noch finale Links
- ✅ Pitcher hat Konfidenz, alle Beats unter 3 Min

---

## Phase 5 — Submission + Buffer (Stunde 44-48)

**Ziel:** Submitted. Pitcher schläft.

- [ ] Devfolio-Submission gesubmitted
- [ ] Repo public, License hinzugefügt (MIT)
- [ ] Allen wichtigen Mentoren ein Update geschickt mit Demo-Link
- [ ] **Pitcher schläft 4-6h vor Pitch-Tag**
- [ ] Restliche Team kann Bug-Fixes machen, aber nichts Neues

---

## Wichtige Sync-Punkte

| Wann | Was | Wer |
|---|---|---|
| Stunde 3 | Phase 0 Check-in: Setup-Status review | Alle, 15 Min |
| Stunde 12 | Phase 1 Demo: vertical slice live durchgespielt | Alle, 20 Min |
| Stunde 24 | Phase 2 Demo + Voice-Drop-Decision | Alle, 30 Min |
| Stunde 36 | Phase 3 Demo + finale Drop-Decisions | Alle, 30 Min |
| Stunde 44 | Pitch-Probe vor Mentor wenn möglich | Pitcher + 1 |

---

## Energie-Management

- **Samstag Abend (ca. Stunde 30):** Pause-Phase. 1h Essen, frische Luft, Reset.
- **Sonntag Nacht (ca. Stunde 40):** Pitcher schläft 4-6h. Andere können Polish machen aber NICHT alle wach bleiben.
- **Sonntag Morgen Pitch:** Energie > Tech. Lieber 90% Demo + ausgeschlafener Pitcher als 100% Demo + zerfetzter Pitcher.
