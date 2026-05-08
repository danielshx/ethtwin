# 06 — Demo-Skript (3 Min, hart timed)

> **Verifiziert May 2026.** $1 USDC ist Apify x402 Minimum. ENSIP-25 ist offizieller Standard für AI Agent Identity in ENS.

> Diese Demo gewinnt das Hackathon — oder nicht. Pitcher übt 5x. Frontend-Mensch übt 5x. Synchronisiert.

> **Stand 2026-05-08, abends:** Frontend-Flow steht Ende-zu-Ende (Landing → OnboardingFlow → TwinChat), CosmicOrb spielt mit Mock-Seed, Tx-Approval-Modal ist verdrahtbar. Alle Live-Schritte hängen nur an gesetzten API-Keys.

---

## Setup vor Demo

### Browser-Tabs (in dieser Reihenfolge)
1. Tab 1: `https://ethtwin.xyz` (Login-Page)
2. Tab 2: Block Explorer (basescan.org/sepolia/) — pre-loaded auf Smart Wallet Address
3. Tab 3: ENS App (app.ens.domains) — pre-loaded auf parent domain
4. Tab 4: Backup-Demo-Video (für Notfall)

### Pre-Demo Checks
- Privy Smart Wallet hat genug USDC (mindestens $5 USDC für Demo-Tx)
- Privy Smart Wallet hat genug Sepolia ETH (Gas) — falls Paymaster aus
- ENS Subname `daniel.ethtwin.eth` existiert
- ENSIP-25 Text Record gesetzt (`agent-registration[...]`)
- Stealth-Meta-Address Text Record gesetzt
- cTRNG-Cache prefetched (mehrere Samples)
- analyst.ethtwin.eth antwortet
- OpenAI Realtime API funktioniert

### Audio
- Mikrofon getestet vorher
- Voice-Sample-Backup ready
- Headset/Lavalier wenn möglich

---

## DAS SKRIPT (2:55-3:00 Min)

### [0:00 – 0:15] Hook
> *"Hi, ich bin Daniel. Ich hatte vor 60 Sekunden noch keine Wallet, kein Crypto, keinen ENS-Namen. Jetzt habe ich alles drei — und einen AI-Zwilling der für mich arbeitet."*

**Bühne:** Pitcher steht, EthTwin-Logo auf Screen.

---

### [0:15 – 0:50] Onboarding (60-Sek-Magic)
> *"Schaut zu — ich tippe meine Email ein, mache Face-ID, und..."*

**Aktion auf Screen:**
- Email eingeben → "Continue"
- Privy Passkey-Prompt (Face-ID-Animation auf Screen oder echtes Phone)
- Privy Smart Wallet wird auto-erstellt auf Base Sepolia
- ENS-Subname-Reservation: `daniel.ethtwin.eth` reserviert
- Text Records werden geschrieben (inkl. ENSIP-25 + Stealth-Meta-Address)
- **Twin spawnt:** Welcome-Animation

> *"Mein Twin lebt bei `daniel.ethtwin.eth`. Seine Persönlichkeit, seine Fähigkeiten, sein Stealth-Privacy-Schlüssel — alles in ENS Text Records. Plus: er ist ENSIP-25 verifiziert — der offizielle Standard für AI-Agent-Identity in ENS."*

**[Optional, 5 Sek]:** Tab 3 öffnen, ENS Records anzeigen → schnell schließen.

---

### [0:50 – 1:30] Voice + x402 zu Apify
> *"OK Twin, hör zu. Was ist heute Sentiment auf $XYZ Token?"*

**Voice Aktion:**
- Push-to-talk (oder Wake-Word)
- Twin: *"Lass mich nachsehen."*

**Auf Screen sichtbar:**
- Tx-Notification: "Twin paying Apify $1 USDC via x402..."
- Block-Explorer-Tab kurz aufpoppen
- Twin streamt Antwort: *"Sentiment ist 72% bullisch, aber Vorsicht: 4 negative Posts in den letzten 24 Stunden mit Rugpull-Mentions."*

> *"Habt ihr das gesehen? Twin hat gerade live $1 USDC an Apify bezahlt — auf Base, on-chain verifiable. x402 in Action — der HTTP-native Payment-Standard von Coinbase."*

---

### [1:30 – 2:00] Agent-zu-Agent x402 mit ENSIP-25
> *"Aber Twin weiß nicht alles. Wenn er einen Spezialisten braucht, ruft er einen anderen Agent an. Und prüft erst dass der echt ist."*

**Voice:** *"Twin, frag analyst.eth nach den besten DeFi-Yields heute."*

**Auf Screen:**
- Twin: *"Ich kontaktiere analyst.ethtwin.eth..."*
- **ENSIP-25 Verification Badge erscheint: "✓ Verified Agent"**
- Animation: Twin → analyst.eth Flow-Visualisierung
- Tx-Notification: x402-Tx an `analyst.ethtwin.eth`
- analyst.eth antwortet
- Twin synthetisiert: *"Empfehlung: 50% Aave V3 USDC, 50% halten. Risiko: niedrig."*

> *"Das ist Agent-zu-Agent-Economy. Live, on-chain, ENS-discoverable, ENSIP-25-verifiziert. Twin weiß dass er mit einem echten Agent spricht — nicht einem Spoof."*

---

### [2:00 – 2:35] Cosmic Privacy (HERO MOMENT)
> *"Jetzt der wichtigste Teil. Privatsphäre."*

**Voice:** *"Twin, mach den Aave-Trade. Aber privat."*

**Auf Screen — Cosmic-Orb-Animation startet:**
- Satellit-Icon + Pulse-Animation
- Text: *"Requesting entropy from OrbitPort-3..."*
- Live-Byte-Stream-Visualisierung
- Attestation-Hash erscheint, klickbar (Tab 2 öffnen für Beweis)

> *"Diese Bytes kommen JETZT live von einem Satelliten im Orbit. Echtes cosmic random — nicht VRF, nicht pseudo-random. Niemand kann es vorhersagen. Auch wir nicht."*

- Stealth Address generiert
- Tx-Approval-Modal mit Plain English:
  > *"Du sendest 50 USDC an Aave V3 USDC Pool. Empfangs-Adresse ist anonym. Niemand wird wissen dass es du warst. Bestätigen mit Face ID?"*
- Face-ID → Privy signs Tx → broadcast
- Success: "Done. Privacy: 10/10."

---

### [2:35 – 3:00] Closing
> *"In drei Minuten habt ihr gesehen: Onboarding ohne Seed Phrase. AI-Twin der für mich denkt. ENSIP-25-verifizierte Agent-zu-Agent-Economy. Plain-English-Approvals statt blind signing. Live x402-Payments. Echte Cosmic-Privacy aus dem Weltall."*

> *"EthTwin ist ENS-native, voice-first, privacy-by-default."*

> *"Twin lebt bei `daniel.ethtwin.eth`. Welchen Twin willst du?"*

**Final Frame:** Logo + URL `ethtwin.xyz` + Slogan.

---

## Edge-Case-Antworten (für Q&A nach Pitch)

### "Warum cTRNG statt Chainlink VRF?"
> *VRF ist pseudorandom mit einem Operator als Trust-Anchor — der Operator könnte theoretisch deine Stealth-Adressen vorhersagen. cTRNG ist physikalisches cosmic random aus Satelliten. Niemand — auch wir nicht — kann es vorhersagen. Für Privacy ist das ein anderes Trust-Modell.*

### "Was wenn der Satellit down ist?"
> *Wir cachen recente cTRNG-Samples auf der Server-Seite. Die Privacy-Properties bleiben stark — wir verwenden nur frische Samples für jede Tx und prüfen Attestations. Backup wäre hardware RNG mit cTRNG-Seed.*

### "Was ist ENSIP-25?"
> *Der offizielle ENS-Standard für verifizierbare AI Agent Identity. Er definiert ein Text-Record-Format, das einen Agent in einem on-chain Registry — wie ERC-8004 IdentityRegistry — mit einer ENS-Adresse verknüpft. Wir implementieren ihn nativ. Deshalb können andere Agents wie unser analyst.eth verifizieren dass sie mit einem echten Twin sprechen, nicht mit einem Imposter.*

### "ERC-8004 — wo ist das deployed?"
> *Live auf Mainnet seit 29. Januar 2026 (`0x8004A169...`). Wir verifizieren gegen die Base Sepolia Deployment (`0x8004A818BFB912233c491871b3d84c89A494BD9e`). Der Vanity-Prefix `0x8004` ist gewollt — macht die Registry sofort erkennbar.*

### "Was ist das Geschäftsmodell?"
> *Drei Säulen: Subscription für Privacy-Premium und Pro-Voice. x402 service fees auf agent-to-agent payments. B2B Twin-as-API für DApps die ihren Usern Twin-UX geben wollen.*

### "Was ist der Markt?"
> *100M+ Crypto-Wallet-User. Ledger macht $200M+ ARR mit Hardware-Privacy. Wir machen Software-Privacy mit Agent-UX — größerer TAM, niedrigere CAC.*

### "Wie skalierbar ist das?"
> *Stateless Backend auf Vercel. ENS skaliert von Natur aus. cTRNG-Cache pooled. x402 fees pay for own throughput. Wir haben kein Centralized Bottleneck.*

### "Warum nicht einfach Smart Wallets + AA?"
> *Wir nutzen Smart Wallets — Privy gibt uns ERC-4337 mit Passkey-Auth. Aber Smart Wallets allein lösen nicht Privacy + Agent-Identity + Voice-UX + Multi-Agent-Coordination. EthTwin ist die Schicht darüber.*

### "Warum $1 USDC pro Apify-Call? Ist das nicht teuer?"
> *Das ist Apify's x402-Minimum für Pay-Per-Event Actors. Für Real-Time-Daten ist das Standard — Twin nutzt es selektiv, nur wenn der User explizit fragt. Plus: das ist agent-driven Payment, nicht user-driven — der Twin entscheidet, das System bleibt smooth.*

### "Token-Distribution?"
> *Standard AGTC-Setup auf Umia: 30% community, 25% team (4y vesting), 20% public sale, 15% treasury, 10% advisors/ecosystem. $TWIN nutzt Service-Credit + Governance + Premium-Tier.*

### "Could this work on mainnet?"
> *Ja — Base Mainnet ready. ENS bereits live. Stealth Address EIPs sind mainnet-kompatibel. ENSIP-25 ist mainnet-spec. cTRNG via Orbitport ist mainnet-ready API.*

### "Stealth-Meta-Address in ENS — gibt's da einen Standard?"
> *Aktuell nicht. Wir haben das Pattern für diese Demo entwickelt und propose effectively einen neuen ENSIP. Es ist kompatibel mit EIP-5564 für Stealth Addresses und ERC-6538 für Stealth Meta-Address Registry — wir nutzen ENS Text Records statt onchain Registry für bessere UX.*

---

## Demo-Checkliste vor Bühne

- [ ] Internet-Verbindung getestet
- [ ] Mikrofon getestet
- [ ] Browser-Tabs in richtiger Reihenfolge
- [ ] Smart Wallet hat $5+ USDC + Sepolia-ETH (Gas)
- [ ] ENS Subname existiert
- [ ] ENSIP-25 Text Record gesetzt + verifiable
- [ ] Stealth-Meta-Address Text Record gesetzt
- [ ] Test-Voice-Befehl 1× durchgespielt
- [ ] cTRNG-Seed-Cache prefetched (für falls API langsam)
- [ ] x402-Apify-Endpoint warm (1× Test-Call)
- [ ] `analyst.ethtwin.eth` antwortet + ist ENSIP-25 verified
- [ ] Backup-Video bereit für Tab-Switch
- [ ] Wasser
- [ ] Atmung

---

## Die 5 Sätze die der Pitcher auswendig kann

1. *"Twin lebt bei `daniel.ethtwin.eth`. Komplett in ENS, ENSIP-25 verifiziert."*
2. *"Echte Cosmic-Randomness aus dem Weltall — nicht VRF."*
3. *"Plain English statt blind signing."*
4. *"Agent-zu-Agent-Economy via x402 — verifizierbar via ENSIP-25."*
5. *"Privacy ist Default, nicht Premium."*

Wenn der Pitcher unter Stress ist: einfach diese 5 Sätze. Plus Demo. Reicht.
