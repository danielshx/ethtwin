# 03 — Backlog (Tier 1 / 2 / 3)

> **Tier 1 = MUST. Ohne das gibt's keine Demo.**
> **Tier 2 = SHOULD. Macht den Wow.**
> **Tier 3 = NICE. Nur wenn Tier 1+2 zu 100% stehen.**
>
> **Verifiziert May 2026** — alle Annahmen via npm + Web-Recherche bestätigt.

---

## ✅ Infra-Status (2026-05-09, fortlaufend)

Onboarding ist live, Stealth-Send-Hero steht, Voice ist zurück (T1-12), Agent-Discovery + on-chain Messaging + Wallet-History + Live-Notifications funktionieren end-to-end.

- [x] Next.js 15 + Turbopack + Tailwind 4 + TS strict scaffold (`pnpm dev`, `pnpm build`, `pnpm typecheck` alle clean)
- [x] Alle verifizierten Deps installed (siehe `docs/11-Tech-Verifikation.md`) inkl. `permissionless`, `@x402/core`
- [x] `lib/`: `viem`, `ens`, `ensip25`, `namestone` (ungenutzt — Pfad gewechselt), `cosmic` (Cache + Mock-Fallback), `stealth` (Beta-SDK in try/catch), `x402-client`, `twin-tools` (**14 Tools** — siehe T1-08), `voice-tools` (Realtime-spezifisches Tool-Bundle), `agents` (on-chain directory), `messages` (ENS-Subname-Messenger), `transfers`, `payments` (Stealth-USDC), `wallet-summary`, `tx-decoder`, `history` + `history-server` (hybrid client/server store), `twin-profile` (Pollinations-Avatar), `privy-server`, `prompts`, `abis`, `api-guard`, `utils`, plus React-Hooks `use-ens-name`, `use-ens-avatar`, `use-notifications`
- [x] API-Routen: `/api/{twin,voice,twin-tool,x402,ens,stealth,stealth/send,cosmic-seed,onboarding,profile,agents,agents/analyst,agent/[ens],messages,transfer,wallet-summary,wallet-history,history,check-username}/route.ts`
- [x] App-Shell: `layout.tsx`, `providers.tsx` (Privy + SmartWallets, Base Sepolia), `page.tsx` (auth-gated state machine mit **6 Tabs**: Chat / **Voice** / Messenger / Send Tokens / **Stealth Send** / History) plus globaler `NotificationPanel` (bottom-right, 30s-Polling auf `/api/messages` + `/api/wallet-history`), `globals.css`
- [x] Smoke-Test-Scripts: `pnpm test:{chain,claude,decoder,x402,x402-mock,x402-apify,privy-key}`, `pnpm ens:{check-parent,provision,provision-analyst,read,set-text,stealth-provision}`, `pnpm send:{token,stealth-usdc}`, `pnpm wallet:{generate,rotate}`, `pnpm twins:backfill`
- [x] shadcn/ui Komponenten (button, card, input, dialog, badge, sonner, scroll-area, separator, label)
- [x] **Frontend-Komponenten:**
  - `components/cosmic-orb.tsx` — Framer-Motion-Hero + Phasen
  - `components/twin-chat.tsx` — AI-SDK-v6 useChat + ENSIP-25-Verified-Badge + sendMessage-Tool-Rendering + Profile-Dialog
  - `components/voice-twin.tsx` — OpenAI Realtime über WebRTC, Listening / Thinking / Speaking Orb-States, Tool-Calls via `lib/voice-tools.ts` → `/api/twin-tool`, graceful 503-Fallback auf Chat
  - `components/messenger.tsx` — On-chain ENS messenger (Subname-pro-Message)
  - `components/token-transfer.tsx` — Multichain ETH/USDC Send mit hard caps
  - `components/stealth-send.tsx` — **Hero-Tab**: CosmicOrb-Animation während EIP-5564 USDC-Stealth-Send
  - `components/history.tsx` — Hybrid localStorage + server-side history pro ENS, plus Wallet-Activity-Pull über `/api/wallet-history` (Alchemy `alchemy_getAssetTransfers`, Etherscan-Fallback)
  - `components/agent-profile.tsx` — Avatar + Persona + Capabilities + Stealth-Meta-Preview Dialog inkl. Editor (Avatar/Description) der via `/api/profile` Multicall-Updates schickt
  - `components/notification-panel.tsx` — pinned bottom-right Activity-Feed über `useNotifications`, Unread-Badge, Toast-Spawn auf neue Items
  - `components/x402-flow.tsx` — Twin → analyst Flow-Animation während `hireAgent`
  - `components/onboarding-flow.tsx` — 4-Step Wizard (intro → username → cosmic → done)
  - `components/tx-approval-modal.tsx` — Plain-English-Modal (used opportunistically)
- [x] **Onboarding live:** Privy → ENS-Subname auf Sepolia → addr-Record + 7 Twin Text Records + ENSIP-25 + stealth-meta-address + Eintrag in `agents.directory` (alles via dev-wallet, der `ethtwin.eth` Parent-Subname besitzt)

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
- [x] **T1-01** Privy Login mit Email + Passkey (`@privy-io/react-auth`) — `app/page.tsx` `handleAuthenticate` mit method-Switch (any/passkey/wallet)
- [x] **T1-02** Smart Wallet Embedded — `useSmartWallets()` + `useWallets()`, fällt auf shared dev wallet zurück wenn kein embedded wallet existiert (siehe `DEV_WALLET_FALLBACK` in `app/page.tsx`)
- [x] **T1-03** ENS Subname-Erstellung — **Pfad geändert von NameStone zu on-chain Sepolia ENS**. `app/api/onboarding/route.ts` mintet `{username}.ethtwin.eth` direkt via dev wallet (parent owner). NameStone-lib bleibt als Backup.
- [x] **T1-04** addr-Record zeigt auf Smart Wallet (ENS-Subname-Registry-Owner = dev wallet, addr-record = user wallet — so kann der dev wallet weiter Records schreiben)
- [x] **T1-05** Twin-Persona-Default in ENS Text Records: avatar (Pollinations.ai, deterministic), description, url, twin.persona, twin.capabilities, twin.endpoint, twin.version — alle in `app/api/onboarding/route.ts` + `lib/twin-profile.ts`
- [x] **T1-05b** **ENSIP-25 Text Record** gesetzt: `agent-registration[<ERC-7930>][<twinAgentId>] = "1"` ✓
  - Registry-Address Base Sepolia: `0x8004A818BFB912233c491871b3d84c89A494BD9e`
  - ERC-7930 Helper in `lib/ensip25.ts`
- [x] **T1-05c** **`stealth-meta-address`** Text Record gesetzt (EIP-5564 format `st:eth:0x...`) — derived aus cosmicAttestation während Onboarding

### Twin Agent
- [x] **T1-06** `/api/twin/route.ts` mit Vercel AI SDK v6 + Claude Sonnet 4.6 (`claude-sonnet-4-6`) — Stub-Code steht, braucht ANTHROPIC_API_KEY für Live
- [x] **T1-07** System Prompt aus ENS Text Records hydriert (`lib/prompts.ts` + `readTwinRecords`)
- [x] **T1-08** Tools verfügbar (AI SDK v6 `inputSchema`) — **15 Tools über `buildTwinTools({ fromEns, fromAddress })` Factory** (`lib/twin-tools.ts`):
  - **Statisch (9):** `getWalletSummary`, `requestDataViaX402`, `decodeTransaction`, `checkTransactionStatus`, `sendToken`, `getBalance`, `sendStealthUsdc`, `generatePrivatePaymentAddress`, `findAgents`
  - **Context-aware (6):** `hireAgent`, `inspectMyWallet`, `readMyEnsRecords`, `readMyMessages`, `listAgentDirectory`, `sendMessage` — bekommen `fromEns`/`fromAddress` aus dem Twin's Session-Identity, sodass parameter-lose Fragen wie "what's in my wallet?" sofort funktionieren
- [x] **T1-09** Streaming-Responses ans Frontend (`useChat` + `DefaultChatTransport` in `components/twin-chat.tsx`)
- [x] **T1-10** Multi-Turn Konversation funktioniert (Context bleibt) — `useChat` standard, ungeprüft live

### Voice (oder Chat-Fallback)
- [x] **T1-11** Chat-Interface 100% funktional (immer als Fallback) — `components/twin-chat.tsx` ist primary path; `components/voice-twin.tsx` zeigt explizites "Voice unavailable — using chat" Card mit Switch-Button wenn `/api/voice` 503 zurückgibt.
- [x] **T1-12** Voice-Mode (OpenAI Realtime mit `gpt-4o-realtime-preview`) — neuer **Voice-Tab** (#7 in `app/page.tsx`), `components/voice-twin.tsx` öffnet `RTCPeerConnection` zu `https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview` über Mic + Datenkanal, sendet `session.update` mit Tools aus `lib/voice-tools.ts`, executes Function-Calls via `/api/twin-tool` und re-injects results als `function_call_output`. Renders Listening / Thinking / Speaking Orb-States + inline transcripts.
- [x] **T1-12b** Ephemeral Key Minting Endpoint (`/api/voice/route.ts`) — POST mintet `client_secret` mit hydriertem System-Prompt aus ENS Records, optional Privy-Auth-Verify, returned `{ client_secret, model, expires_at }`. Bei fehlendem `OPENAI_API_KEY` 503 mit `{ error: "voice-unavailable" }` für graceful degrade. Frontend renewt 10s vor Ablauf. Voice ist auf Englisch gepinnt: Server-Instructions enthalten ein `# Language`-Block ("always speak and respond in English") und Whisper-Transcription ist mit `language: "en"` konfiguriert (server + client `session.update`).

### Tx-Approval-Flow
- [x] **T1-13** Tx-Approval-Modal mit Plain English Summary (`components/tx-approval-modal.tsx`) — Calldata-Drawer + Explorer-Link inklusive
- [x] **T1-14** ENS-Reverse-Resolution-Helper im Modal (`toEnsName`/`fromEnsName` Props) — Caller-Wiring fertig: neuer `useEnsName` Hook in `lib/use-ens-name.ts` (Sepolia public client + module-Cache) ist die kanonische Brücke; aktuell rendert noch keine Komponente die Modal-JSX (folgt mit T1-15), Hook ist drop-in ready.
- [x] **T1-15** Send-Tokens-Tab signiert jetzt user-side: `components/token-transfer.tsx` mountet `TxApprovalModal` (mit `useEnsName` für `to`/`from`) und ruft `useSmartWallets().client.sendTransaction({ to, value, data })` auf Base Sepolia. Calldata wird client-side via `encodeFunctionData` (USDC) gebaut. Wenn kein Embedded Smart Wallet existiert oder Chain ≠ Base Sepolia, fällt der Flow auf den bestehenden `/api/transfer` dev-wallet-Pfad zurück. Demo-Caps (0.01 ETH / 1 USDC) gespiegelt.

### x402
- [x] **T1-16** `@x402/fetch` v2 (x402-foundation, NOT v1 Coinbase) komplett verkabelt — `lib/x402-client.ts` registriert `ExactEvmScheme` für Base Sepolia (eip155:84532) **und** Base Mainnet (eip155:8453), v2 + v1 Schema parallel. `paidFetch({ chain? })` chain-switchable per call. `paidFetchWithReceipt()` parst zusätzlich den `X-PAYMENT-RESPONSE` Header → `{ txHash, chain, payer, explorerUrl }`. `X402SenderKeyMissingError` mit klarer Hinweis-Message wenn weder `X402_SENDER_KEY` noch `DEV_WALLET_PRIVATE_KEY` gesetzt sind.
- [x] **T1-17** **Code ready, awaits funded `X402_SENDER_KEY`** — Neues Smoke-Script `scripts/x402-apify.ts` (`pnpm test:x402-apify`) targetet **Base Mainnet** Apify x402 Endpoint (`apify~instagram-post-scraper` als sicherer Default, `APIFY_X402_ACTOR`/`APIFY_X402_PAYLOAD`/`APIFY_X402_ENDPOINT` overridable). Pre-flight liest USDC-Balance auf Base Mainnet via viem, abortet wenn < $1.10 (1 USDC Apify-Min + Buffer). Bei Erfolg loggt es Apify-Output + on-chain Tx-Hash + basescan.org Link. Ungetestet live, weil Wallet noch nicht mit Mainnet-USDC gefundet — sobald gefundet ist die Tx einen Befehl entfernt.
- [x] **T1-18** Block-Explorer-Link wandert vom x402-Receipt durch alle Schichten zur UI: `hireAgent` Tool (jetzt via `buildHireAgentTool(ctx)` Factory) und `requestDataViaX402` returnen `txHash` + `chain` + `payer` + `blockExplorerUrl`. Bei Erfolg appendet `hireAgent` automatisch eine `kind: "other"` Entry über `appendServerHistory(ctx.fromEns, …)` — damit zeigt der Explorer-Tab x402-Tx-Hashes neben Stealth-Sends + Token-Transfers.

### Demo-Polish
- [x] **T1-19** Onboarding-Animation: 4-Step Wizard mit StepIndicator + CosmicOrb-Hero, smooth Transitions via Framer Motion
- [x] **T1-20** Twin-Chat-UI mit gestreamten Responses, Thinking-Dots, Tool-Call-Pills, Empty-State-Prompt-Vorschläge
- [x] **T1-21** ~~Block-Explorer-Tab~~ — entfernt (Commit `9ee3af1`, 2026-05-09). Stattdessen liefert der **History-Tab** (`components/history.tsx`) jetzt einen vollständigen Wallet-Activity-Feed über `/api/wallet-history` (Alchemy `alchemy_getAssetTransfers`, Etherscan-Fallback) mit Block-Explorer-Links pro Tx — selber Demo-Wert ohne iframe-Risiko.

### 🎭 Demo-Pivot — Maria/Tom Story (added 2026-05-09)

> **Pitch-Frame:** *"Crypto for everyone — even my grandma."* Hauptszene: Maria (67, Stuttgart) sendet ihrem Enkel Tom 100 USDC per Voice. Tech-Tiefen (Stealth, cTRNG, ENSIP-25, x402) kommen erst im Reveal. Volles Skript in `docs/06-Demo-Skript.md`. Diese Tasks sind **must-have für die Demo**, blockieren aber nicht das Bounty-Submission-Code-Set (alles drumherum bleibt im Repo).

- [x] **T1-22** **DONE** — `pnpm twins:seed-demo` Script (`scripts/seed-demo-twins.ts`): provisioniert `maria.ethtwin.eth` + `tom.ethtwin.eth` mit DiceBear-Avataren, persona/capabilities/endpoint, ENSIP-25 agent-registration, frische `stealth-meta-address` per `generateStealthMetaKeys()`, beide in `agents.directory`. Idempotent.
- [x] **T1-23** **DONE (then reverted)** — `lib/prompts.ts` patch shipped Stealth-Default + Verify-Auto-Trigger 2026-05-09 nachmittags. **Reverted commit später am Tag**: `sendToken` ist jetzt wieder Default, `sendStealthUsdc` ist OPT-IN (nur wenn User explizit "private" / "stealth" sagt). Reason: stealth-Default brach den Smoke-Path wenn Recipient kein `stealth-meta-address` Record hatte. Demo-Implication: Marias normaler "Send Tom 100" geht über sendToken → der "Private" Badge auf der Postcard zeigt nur wenn User explizit Stealth wählt; die Stealth-Send-Tab demo bleibt der Hero für Privacy-Bounty.
- [x] **T1-24** **DONE** — Verify-Auto-Trigger sektion in `lib/prompts.ts` aktiv: Phrasen wie "is this safe?" / "scam?" triggern automatisch `findAgents` + `hireAgent('analyst.ethtwin.eth')` mit Few-Shot-Beispielen aus dem Demo-Skript.
- [x] **T1-25** **DONE** — Demo-Mode-Toggle in `app/page.tsx` + `lib/use-demo-mode.ts`: env-flag `NEXT_PUBLIC_DEMO_MODE=1` ODER URL-Param `?demoMode=1` setzt `html.maria-mode` Klasse. Versteckt 6 Tabs, rendert MariaShell statt SignedInTabs, blendet ENS-Badge im Header aus. `?demoMode=0` overridet env. Notification-Panel ebenfalls versteckt — Toaster bleibt für Tom-Reply.
- [ ] **T1-26** Cosmic-Mikro-Pulse-Overlay direkt in `voice-twin.tsx` während sendStealthUsdc-Tool-Call. **Hinweis:** Confetti + Cosmic-Pulse sind als allgemeines Send-Celebration jetzt via `components/send-celebration.tsx` umgesetzt (siehe T1-39) — feuert generell bei jedem Postcard-Mount. Voice-Tab-spezifischer Pulse ist Optional / Polish.
- [ ] **T1-27** Tom-Receiver-View-Setup: zweites Browser-Profil als `tom.ethtwin.eth` eingeloggt für split-screen "Toms Phone"-Cut. Maria + Tom existieren on-chain (T1-22 done) — Setup ist jetzt: zweiten Tab/Browser öffnen, sign in mit dev wallet, localStorage-Session manipulieren. Runbook noch offen.

### 🎨 10/10 Polish-Sprint (added 2026-05-09)

> Demo wirkt aktuell zu techie — diese Items lassen das Frontend so aussehen wie ein fertiges Consumer-Produkt für Maria, nicht wie ein Hackathon-Prototyp.

- [x] **T1-28** **DONE** — Maria-Mode UI: warme Cream/Coral/Sage-Palette als **Default** (alle User, nicht nur demo). `app/globals.css` rebuilt mit OKLCH-Werten, body-radial-Gradients, `.dark` Variant für Future-Toggle. `html.maria-mode` Klasse bumpt zusätzlich Sizing (17px base, 56-80px buttons). Hardcoded Dark-Patterns (`border-white/10`, `bg-card/80`) komplett ersetzt. Onboarding-Copy entjargonisiert ("Set up your twin", "Use Face ID", "I have a wallet"). Tab-Bar: animierter `SegmentedTabs` mit `layoutId`. Logo: gradient rounded-2xl.
- [x] **T1-29** **DONE** — Receipt-as-Postcard (`components/receipt-postcard.tsx`): großer Recipient-Avatar mit ✓-Badge, "100 dollars · sent to Tom · just now", optionaler "Private" Badge. Auto-fired done-Sound on mount. Wired in `twin-chat.tsx` AgentDetail wenn `useDemoMode()`.
- [x] **T1-30** **DONE** — Tom-Auto-Reply via `triggerThankYou()` in `lib/twin-tools.ts`: 2s nach erfolgreichem `sendStealthUsdc` (oder `sendToken` analog) feuert ein deterministisches `sendEnsMessage()` von Recipient → Sender mit body `"thanks {sender}! 💜 just got the X USDC"`. Scoped auf `.ethtwin.eth` Recipients (parent owned by dev wallet). Fire-and-forget.
- [x] **T1-31** **DONE** — Twin-Avatar (`components/twin-avatar.tsx`): state-driven breathing animation (idle: 2.4s subtle / listening: 1.6s warm pulse / thinking: 1.1s wirbel / speaking: 0.9s active). Soft radial glow ring, ring-2 primary border, conic-gradient fallback wenn kein Avatar. Verwendet in MariaShell hero.
- [x] **T1-32** **DONE (stub)** — Sound-Hook (`lib/use-twin-sound.ts`) wired für `listening` / `done` / `receive`; gecached pro Audio-Element; silent-fail wenn Files fehlen. Dropbox-Verzeichnis `public/sounds/` mit README + Quellen-Hinweisen (freesound, pixabay). **Files selbst noch zu droppen** (3× MP3, ~50-100KB Total).
- [x] **T1-33** **DONE** — X-ray Reveal-Layer in `components/receipt-postcard.tsx`: "Show what really happened"-Toggle. Postcard fadet auf 40% scale 0.97, darunter peelt eine Blueprint-Pattern-Card hoch mit 6 Tag-Reihen (Privy · ERC-4337, ENS Sepolia, EIP-5564, Orbitport cTRNG, ENSIP-25, Base Sepolia). Each row staggered fade-in, einzeln per Framer-Motion delay.
- [x] **T1-34** **DONE** — Side-by-Side-Contrast in `components/contrast-card.tsx`: Metamask-style "Confirm transaction" mit hex calldata + gas + nonce + "blind sign" warning links, ArrowRight + EthTwin-Tag in der Mitte, Maria-Postcard rechts. Stagger-on-scroll-in (links 0.5s, mitte 0.5s+0.5delay, rechts 0.55s+0.25delay). Eingebaut auf Landing-Page als "Same transaction. Two worlds." Sektion.
- [ ] **T1-35** Hero-Image für README + Devfolio. Maria-Phone-Mockup mit Tom-Avatar + Cosmic-Pulse als `public/hero.png`. Blocker: braucht Visual-Designer / Screenshot.
- [ ] **T1-36** Twin spricht Deutsch (optional Toggle). Voice-Tab lang=de Param. Default bleibt Englisch.

### 🎮 Intuitiv-für-Oma + Gamification (added 2026-05-09)

- [x] **T1-37** **Quick-Send-Cards in MariaShell**: 3 große Avatar-Tap-Cards (Tom / Daniel / Alice) mit vor-konfigurierten Beträgen ($5/$25/$100). Tap → injectet Phrase in TwinChat via neue `seedPrompt`/`onSeedConsumed` Props. Oma muss kein Voice nutzen — nur tippen.
- [x] **T1-38** **Gamification-Strip**: 3 Pills oben in der MariaShell — "100% private" (ShieldCheck), "Level N · {title}" (Sparkles), "{N} transactions". State in `localStorage.ethtwin.maria.stats`, levelt mit jedem ack hoch (Just Started → Comfy User → Twin Believer → Crypto Pro).
- [x] **T1-39** **Confetti + Cosmic-Pulse beim Send-Erfolg**: neuer `components/send-celebration.tsx` Component, fires bei Postcard-Mount. `canvas-confetti` (warme Coral/Sage/Amber Farben) + radial cosmic mikro-pulse (1.5s overlay). Respektiert reduced-motion.
- [x] **T1-40** **Side-by-Side-Contrast-Card**: neuer `components/contrast-card.tsx` Component zeigt Metamask-style "Confirm transaction" mit hex calldata + gas + nonce links, EthTwin-Postcard "100 dollars to Tom · Confirm with Face ID" rechts. Auto-staggered scroll-in animation. Eingebaut auf Landing-Page als "Same transaction. Two worlds." Sektion.
- [x] **T1-41** **`pnpm twins:seed-demo`** — neues Script `scripts/seed-demo-twins.ts` mintet `maria.ethtwin.eth` + `tom.ethtwin.eth` mit DiceBear-Avatars, vollständigen Persona-Records, ENSIP-25 agent-registration, frische `stealth-meta-address` per `generateStealthMetaKeys()`, beide eingetragen in `agents.directory`. Idempotent — re-runs überspringen existierende Subnames.

---

## 🟨 Tier 2 — SHOULD HAVE (Wow-Layer)

### Cosmic Privacy
- [x] **T2-01** Orbitport cTRNG API integration mit Caching — `lib/cosmic.ts` mit Rolling-Cache + Mock-Fallback bei fehlendem `ORBITPORT_API_KEY`
- [x] **T2-02** Stealth Address Generation mit cTRNG-Seed (EIP-5564 via `@scopelift/stealth-address-sdk`) — `lib/stealth.ts` `generatePrivateAddress` injiziert cosmic bytes als `ephemeralPrivateKey`
- [x] **T2-03** Stealth Meta-Key Standard-konformes Format — `st:eth:0x...` (EIP-5564), gesetzt im Onboarding + via `pnpm ens:stealth-provision`
- [x] **T2-04** Live On-Chain Stealth-Send: USDC.transfer auf Base Sepolia → one-time stealth address. `lib/payments.ts` + `pnpm send:stealth-usdc` Script + jetzt **UI-Tab "Stealth Send"** (`components/stealth-send.tsx`) + `/api/stealth/send` Route mit Privy-Auth + 1 USDC Cap
- [x] **T2-05** **Cosmic-Orb-Animation** beim Stealth-Send (Hero-Moment!) — Stealth-Send-Tab fährt CosmicOrb durch idle → fetching → revealed → sending → done; PhaseLabel zeigt aktuellen Schritt
- [x] **T2-06** Attestation-Hash + Stealth-Adresse + viewTag im Result-Card sichtbar; basescan-Link auf die Tx

### Agent-zu-Agent x402 mit ENSIP-25
- [x] **T2-07** `analyst.ethtwin.eth` als Sample-Agent deployed — Route `/api/agents/analyst` mit `@x402/next` `withX402` paywall (env-driven via `X402_ANALYST_PAY_TO`; unset = free in dev). Subname provisioniert via `pnpm ens:provision-analyst` Script.
- [x] **T2-08** `analyst.ethtwin.eth` Capabilities + ENSIP-25 Record + endpoint in Text Records — `scripts/provision-analyst.ts` setzt avatar, description, twin.persona, twin.capabilities, twin.endpoint, twin.version, ENSIP-25 agent-registration und addet zu `agents.directory`. Ausführung erfordert Sepolia-Gas auf dev wallet.
- [x] **T2-09** Twin findet `analyst.eth` über ENS-Discovery — neuer `findAgents` Tool liest die `agents.directory` Text-Record-Liste auf `ethtwin.eth` und resolvt jeden Eintrag
- [x] **T2-09b** **ENSIP-25 Verification:** `findAgents` + `hireAgent` rufen `verifyAgentRegistration()` auf; Chat zeigt "✓ ENSIP-25 verified" / "unverified" Badges (`components/twin-chat.tsx` `AgentBadges`)
- [x] **T2-10** Twin macht x402-Tx an Analyst, Analyst antwortet, Twin synthetisiert — `hireAgent` Tool ruft jetzt `paidFetch()` POST auf `twin.endpoint` und gibt `answer` zurück (ungetestet live, braucht funded `X402_SENDER_KEY` + paywalled endpoint)
- [x] **T2-11** UI-Visualisierung: Tool-Call-Pill zeigt Agent-ENS + Verified-Badge + grünen Antwort-Block (`AgentDetail` in `components/twin-chat.tsx`); **Flow-Animation live** — neue `components/x402-flow.tsx` rendert Twin-Node → x402-Wire (animierter "$1 USDC"-Pill outbound + Emerald-Dot return) → Analyst-Node mit Pulse-Ring während `hireAgent` läuft, settled auf "paid · $1 USDC"-Pill mit Verified-Shield wenn output-available.

### Demo-Story
- [x] **T2-12** Pitch-Slides (3-4 Slides max, eine ist Token/Revenue für Umia) — see `docs/14-Pitch-Slides.md`
- [x] **T2-13** Demo-Video als Backup — Recording-Skript steht in `docs/16-Recording-Script.md` (shot list, VO en/de, failure-mode table); Aufnahme-Schritt am Vorabend erforderlich
- [x] **T2-14** Edge-Case-Antworten vorbereitet (cTRNG vs VRF, ENSIP-25, $1 USDC, Skalierung, Geschäftsmodell, Token-Distribution + 4 anticipated follow-ups) — see `docs/15-Edge-Case-QnA.md`

---

## 🟩 Tier 3 — NICE TO HAVE

### Apify-Power-Use
- [ ] **T3-01** Apify scrapes Twitter/LinkedIn beim Onboarding für Twin-Persona-Auto-Generation (>$1 USDC pro call)
- [ ] **T3-02** Twin nutzt mehrere Apify-Actors für verschiedene Use-Cases

### ENS Creative Stretch
- [ ] **T3-03** Reputation-Score in ENS Text Records (signed by `ethtwin.eth`)
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

> **Pitch-Frame seit 2026-05-09:** Maria-Story als Lead. Bounties werden im Reveal-Beat eingelöst (siehe `docs/06-Demo-Skript.md` + `docs/14-Pitch-Slides.md`).

Vor Devfolio-Submission durch:

- [ ] Umia: Maria-Story-Slide + "first crypto interface for the next 1B users" Revenue-Frame
- [ ] ENS for AI Agents: ENSIP-25 verification von `tom.ethtwin.eth` + Twin-zu-analyst-Hire im Demo-Reveal
- [ ] ENS Most Creative: `stealth-meta-address` Text Record + Send-an-tom-Demo (silent stealth)
- [ ] Apify x402: live $1+ USDC Tx wenn Wallet gefundet — sonst pre-signed Receipt im Reveal
- [ ] SpaceComputer (KMS): KMS-Signatur-Badge im Reveal — "Every twin signed in orbit" (Twin-Mint via `lib/kms.ts`)
- [ ] Best UX Flow: Maria-Story IST der Hit — Plain English + Passkey + ENS reverse resolution + Voice in einem Beat
- [ ] Best Privacy by Design: Stealth-by-default — Maria weiß nicht mal dass sie es nutzt
