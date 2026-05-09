# 02 — Phasen-Plan (48h)

> Strikt zeitlich. Jede Phase hat eindeutige Deliverables. Wenn Phase X nicht abgeschlossen ist, wird Phase X+1 nicht gestartet — wir scopen lieber Tier 2/3 raus.

> **Aktueller Vorlauf (2026-05-08, Pre-Hackathon):** Repo, Stack, Backend-Stubs, Frontend-Komponenten und Auth-gated Homepage sind fertig. Phase 0 reduziert sich am Hackathon-Tag auf API-Keys eintragen + Spike-Tests gegen echte Services. Phase 1 ist halb erledigt — Twin-Chat, Onboarding-UI und Tx-Modal stehen, fehlt Live-Verdrahtung.

> **Pitch-Pivot (2026-05-09):** Story neu geschärft auf **"Crypto for everyone — even my grandma."** Demo-Hauptszene: Maria (67) sendet ihrem Enkel Tom 100 USDC per Voice; Tech-Tiefen (Stealth, cTRNG, ENSIP-25, x402) kommen erst im Reveal. Phase 4 enthält die zugehörigen neuen Polish-Tasks (Demo-Twins seeden, System-Prompt-Patch, Demo-Mode-Toggle, Cosmic-Mikro-Pulse) — Details in `docs/03-Backlog.md` Abschnitt **🎭 Demo-Pivot — Maria/Tom Story** und im neuen `docs/06-Demo-Skript.md`.

> **Polish-Sprint (2026-05-09 abend):** Default-Aesthetic auf warmes Premium-Light-Konsumer-Look umgebaut (kein Dark-Cyber mehr — egal ob demo on/off). MariaShell mit Quick-Send-Tap-Cards + Gamification-Pills (Level/Privacy/Transactions). Receipt-Postcard mit X-ray Reveal und Confetti+Cosmic-Pulse-Celebration. Side-by-Side-Contrast-Card auf Landing. `pnpm twins:seed-demo` Script für Maria + Tom on-chain. Tom auto-replies "thanks oma! 💜". Demo-Mode-Toggle via `?demoMode=1`. Sound-Cues wired (Files droppable). Build clean (typecheck + production build). Status der einzelnen Items: `docs/03-Backlog.md` Abschnitte 🎭 + 🎨 + 🎮.

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
- [x] Privy.io Account, App-ID + Secret holen — App `cmowxk4e…hbs5` live; PEM verification key wired in `lib/privy-server.ts`
- [~] Anthropic API Key, OpenAI API Key — *OpenAI key in `.env.local` + Vercel; Anthropic optional fallback path in `app/api/twin/route.ts`. OpenAI quota currently throttling Twin chat — billing top-up still needed.*
- [ ] Apify Account + API Key (Mentor: Jakub `@themq37`)
- [ ] Orbitport Access (Mentor: Pedro `@zkpedro`) — *Wrapper `lib/cosmic.ts` ready with mock fallback; live API key not yet provisioned*

#### Frontend
- [x] Next.js Repo aufsetzen mit Tailwind + shadcn — `next@15`, Tailwind 4, shadcn CLI 4.7
- [x] Framer Motion + Lucide installiert — used in cosmic-orb, onboarding-flow, twin-chat, messenger
- [x] Dark mode default setting — `<Toaster theme="dark" />` + dark-themed Tailwind tokens
- [x] Login-Skeleton mit Privy-Provider gewrapped — `app/providers.tsx` (PrivyProvider + SmartWalletsProvider)

#### Pitcher / Generalist
- [ ] Mentor-Pings raus (alle 4)
- [ ] Devfolio Account erstellen, Team-Submission vorbereiten
- [x] ENS-Domain klären: `ethtwin.eth` verfügbar? Backup-Optionen — *gewechselt zu `ethtwin.eth`, registriert auf Sepolia*
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
- [x] `/api/twin/route.ts` — Vercel AI SDK v6 + auto-detect OpenAI/Anthropic (`selectModel()`); model name never exposed in responses per persona contract
- [x] Twin Loop: System Prompt aus ENS Text Records hydrieren — `buildSystemPrompt(records, ensName)` in `lib/prompts.ts`, hardened so Twin never reveals its underlying model
- [x] Tool-Definitions: live in `lib/twin-tools.ts` — 15 Tools über `buildTwinTools({ fromEns, fromAddress })` Factory inkl. `getWalletSummary`, `decodeTransaction`, `checkTransactionStatus`, `sendToken`, `getBalance`, `sendStealthUsdc`, `generatePrivatePaymentAddress`, `requestDataViaX402`, `findAgents`, `hireAgent`, `inspectMyWallet`, `readMyEnsRecords`, `readMyMessages`, `listAgentDirectory`, `sendMessage`

#### Frontend
- [x] Onboarding-Flow: Three-button intro (Create twin / Passkey / Connect wallet) → username → cosmic-orb seed → mint with on-chain polling. `components/onboarding-flow.tsx`
- [x] Twin-Chat-UI mit Streaming-Response — `components/twin-chat.tsx` via `@ai-sdk/react` `useChat`; chain badge auto-derives from env (`live on Sepolia/Base/…`)
- [x] Loading-States + Polish-Animation — Framer Motion in cosmic-orb (idle → fetching → revealed → sending), onboarding step transitions, message bubbles

#### Pitcher
- [x] `analyst.ethtwin.eth` Sample-Agent vorbereitet — `app/api/agents/analyst/route.ts` mit `withX402` paywall + Coinbase-Facilitator (env-gated; ENS-Subname-Provisioning steht noch aus)
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
- [x] OpenAI Realtime API integration (`/api/voice/route.ts`) — Ephemeral-Key-Minter, hydrierter System-Prompt aus ENS Records, 503-Fallback ohne `OPENAI_API_KEY`. (Drop-Decision Punkt 1 wurde rückgängig gemacht — Voice ist wieder Tier-1, Chat bleibt der Runbook-Fallback.)
- [~] x402-fetch SDK eingebaut, erste Apify x402 Test-Request — *SDK eingebaut + Mock-Test grün (`pnpm test:x402-mock`); `lib/x402-client.ts` v1+v2 dispatch fixed (ExactEvmSchemeV1, CAIP-2 slugs); receipt parsing inline'd; echte Apify-Tx noch ausstehend*
- [x] Twin's Tool-Calling: `requestDataViaX402` + `decodeTransaction` (real, via `lib/tx-decoder.ts`) live in `lib/twin-tools.ts`
- [x] Orbitport cTRNG Wrapper (`lib/cosmic.ts`) mit Caching — rolling cache + attestation passthrough + mock fallback when API key missing

#### Frontend
- [x] Voice-UI mit Realtime-Streaming-Display — `components/voice-twin.tsx` rendert Listening / Thinking / Speaking Orb-States, Live-Transcript-Bubbles, Tool-Call-Pills; reconnect 10 s vor Ablauf des 60 s-Ephemeral-Key.
- [x] Tx-Approval-Modal mit Plain English Summary — `components/tx-approval-modal.tsx` (used by token-transfer); decoder + ENS reverse-name wired
- [x] Toast-Notifications für Tx-Broadcasts (mit Block-Explorer-Link) — sonner-based in messenger + token-transfer; explorer URL in toast description
- [x] ENS-Reverse-Resolution überall: `withEnsName(addr)` + `useEnsName` hook + `AvatarImage` fallback to short 0x… — sidebars + tx-approval-modal show ENS

#### Pitcher
- [x] `analyst.ethtwin.eth` Endpoint reagiert auf x402-Payment, gibt LLM-Response zurück — Code-seitig fertig (`withX402` + `generateText(claude-sonnet-4-6)`); live tx-Test gegen funded `X402_SENDER_KEY` ausstehend
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
- [x] Live-On-Chain Stealth-Send mit cTRNG-Seed — `lib/payments.ts` (`sendStealthUSDC`) + `pnpm send:stealth-usdc` Script + `/api/stealth/send` Route
- [x] Test-Tx auf Base Sepolia: Sender → Stealth Address — Code-Pfad fertig, Live-Demo via UI-Tab "Stealth Send" möglich
- [x] Agent-Discovery: Twin queried Directory + ENS-Records — `findAgents` Tool nutzt `lib/agents.ts` `readAgentDirectory()` und resolved jeden Eintrag inkl. ENSIP-25-Status. `hireAgent` schickt anschließend x402 via `paidFetch()`.

#### Backend
- [x] Cosmic Seed Endpoint mit Orbitport-Cache + Mock-Fallback (`lib/cosmic.ts`, `/api/cosmic-seed`)
- [x] Agent-Hire-Tool für Twin: `findAgents` + `hireAgent` Tools in `lib/twin-tools.ts`
- [ ] Telemetry/Logging für Demo (nichts Privates, nur on-chain visible Stuff)

#### Frontend (Hero-Phase)
- [x] **Cosmic-Orb-Animation** beim Stealth-Send — `components/stealth-send.tsx` Tab fährt Orb durch idle → fetching → revealed → sending → done. Particles + Framer Motion intact.
- [x] Cosmic-Attestation-Hash + Stealth-Adresse + viewTag im Result-Card sichtbar; basescan-Link auf die Tx
- [x] Agent-Hire-Visualisierung: ENSIP-25 Verified/Unverified Badge + grüner "agent replied" Block in `components/twin-chat.tsx`
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

#### Demo-Pivot (Maria/Tom-Story) — Status 2026-05-09 abend
- [x] **T1-22 done** — `pnpm twins:seed-demo` Script existiert und ist idempotent. Muss noch laufen (braucht ~0.01 Sepolia-ETH auf dev wallet).
- [x] **T1-23 done (then partly reverted)** — sendStealthUsdc-Default-Patch wurde nachmittags geshippt, abends teilweise zurückgerollt. Verify-Auto-Trigger (T1-24) bleibt aktiv. Stealth ist jetzt OPT-IN ("private", "stealth" Keyword vom User), `sendToken` ist Default.
- [x] **T1-24 done** — Verify-Auto-Trigger Sektion in `lib/prompts.ts` aktiv.
- [x] **T1-25 done** — Demo-Mode-Toggle via `?demoMode=1` / `NEXT_PUBLIC_DEMO_MODE=1`, MariaShell rendert statt SignedInTabs.
- [ ] **T1-26 partially** — Confetti + Cosmic-Pulse als generelles Send-Celebration umgesetzt (`components/send-celebration.tsx`). Voice-Tab-spezifischer Pulse während Tool-Call-Phase noch offen.
- [ ] **T1-27 open** — Tom-Receiver-View Runbook für split-screen Pitch.

#### 10/10 Polish + Gamification — Status 2026-05-09 abend
- [x] **T1-28** Maria-Mode UI als Default-Look komplett ausgerollt
- [x] **T1-29** Receipt-Postcard
- [x] **T1-30** Tom-Auto-Reply
- [x] **T1-31** Twin-Avatar-Breathing
- [x] **T1-32** Sound-Hook gewired (MP3-Files droppen!)
- [x] **T1-33** X-ray Reveal-Layer
- [x] **T1-34** Side-by-Side Contrast-Card auf Landing
- [x] **T1-37** Quick-Send-Cards (Tap-Avatar → seedet Twin-Chat-Phrase)
- [x] **T1-38** Gamification-Strip (Privacy / Level / Transactions Pills, localStorage)
- [x] **T1-39** SendCelebration (Confetti + Cosmic-Pulse-Overlay)
- [x] **T1-40** ContrastCard
- [x] **T1-41** seed-demo-twins.ts Script
- [ ] **T1-35** Hero-PNG für README + Devfolio
- [ ] **T1-36** Deutscher Voice-Toggle

#### Allgemein
- [ ] **Demo-Video** aufnehmen (1-3 takes, screen + face cam) — Skript in `docs/16-Recording-Script.md` (Maria/Tom-Story)
- [ ] Edge-Cases durchspielen: Internet-Loss, Voice-Drop, API-Latency
- [ ] Mocks vorbereitet für jeden Drop-Case
- [ ] README.md final, mit klaren Run-Instructions
- [ ] Devfolio-Description vollständig (Maria/Tom-Frame in Lead-Absatz, Tech-Reveal danach)
- [ ] Pitch 5x geprobt, alle Beats sitzen
- [ ] **Hard-Blocker:** `pnpm twins:seed-demo` ausführen, 3 Sound-MP3s droppen, OPENAI_API_KEY-Quota OK, Voice 1× live durchgespielt

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
