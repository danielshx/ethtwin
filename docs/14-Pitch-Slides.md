# 14 — Pitch-Slides (3-min Demo, ETHPrague 2026)

> 4 Slides. Hart timed. Eine ist Umia (Token + Revenue). Speaker-Notes auf Deutsch wo es flüssiger ist, technische Begriffe in English. Kein Fluff.

---

## Slide 1 — Hook: "AI co-pilot for your on-chain life"

**Title:** EthTwin — Your AI Twin lives in ENS

**Bullets:**
- 60 Sekunden vom Email-Login zu Wallet + ENS-Subname + AI-Twin
- Voice-first. Plain English statt blind signing.
- Privacy by default — kein Toggle, kein Premium.
- Cosmic randomness aus dem Weltall seedet jede private Tx.
- Lebt bei `daniel.ethtwin.eth` — komplett in ENS Text Records.

**Speaker Notes (0:00 – 0:15):**
Ich starte mit der einen Zeile: *"EthTwin ist der AI co-pilot für dein on-chain life. Voice-first. Privacy by default. Lives in ENS."* Dann ein Satz Problem: *"Crypto verlangt heute Seed-Phrasen, blind signing, manuelle Coordination. Niemand will das."* Direkt in die Demo. Kein Marketing-Geschwurbel. Die Story trägt sich selbst, wenn die Demo läuft.

---

## Slide 2 — Live Demo Callouts: Cosmic Stealth Send + Agent-zu-Agent x402

**Title:** Live: 3 things you've never seen on stage before

**Bullets:**
- **Cosmic Stealth Send** — cTRNG bytes from OrbitPort satellite seed an EIP-5564 stealth address, USDC sent on Base Sepolia, attestation hash on-chain verifiable.
- **Agent-zu-Agent x402** — Twin discovers `analyst.ethtwin.eth` via ENS, verifies ENSIP-25 badge, pays $1 USDC via `@x402/fetch`, receives synthesized answer.
- **Plain English Tx Approval** — "Du sendest 50 USDC an Aave V3. Empfänger ist anonym." → Face-ID → done.
- Block-Explorer-Tab als Beweis: jede Tx ist real, jede Tx ist on Base.
- 3 Bounties hit in einem Demo-Flow: SpaceComputer + Apify x402 + Best Privacy.

**Speaker Notes (0:50 – 2:35):**
Hauptteil der Demo. Die drei Live-Momente: Apify-Call, Agent-zu-Agent, Cosmic Stealth Send. Bei der Cosmic-Orb-Animation langsamer werden — *"Diese Bytes kommen JETZT live von einem Satelliten im Orbit. Echtes cosmic random. Niemand kann es vorhersagen. Auch wir nicht."* Das ist der Moment den die Judges nicht vergessen. Wenn `@x402/fetch` zu Apify hängt: pre-signed Tx im Block-Explorer-Tab zeigen. Drop-Rule: bei 36h x402 broken → cached x402 receipt + explorer-link.

---

## Slide 3 — ENS as Identity: ENSIP-25 + Stealth-Meta-Address

**Title:** ENS isn't decoration — it IS the Twin

**Bullets:**
- Twin's persona, capabilities, endpoint, reputation — alle in ENS Text Records von `{name}.ethtwin.eth`.
- **ENSIP-25 + ERC-8004 IdentityRegistry** (Mainnet `0x8004A169...`, Base Sepolia `0x8004A818...`) — official AI Agent Identity standard, live integration.
- **Innovation:** `stealth-meta-address` Text Record (EIP-5564 format `st:eth:0x...`) — wir proposen einen neuen ENSIP für Privacy in ENS.
- Agent-zu-Agent Discovery: `findAgents` liest `agents.directory` Text Record auf `ethtwin.eth`, resolved jeden Eintrag, verified via ENSIP-25.
- ENS-Removal-Test: 6 von 6 Demo-Momenten brechen ohne ENS.

**Speaker Notes:**
Der Slide für die zwei ENS-Bounties. Wichtig: nicht "we use ENS", sondern *"Twin IS its ENS record."* ENSIP-25 ist offizieller Standard, ERC-8004 ist seit 29. Januar 2026 auf Mainnet. Wir sind die ersten die beides auf der Bühne live demonstrieren. Stealth-Meta-Address ist unser Pattern — kein offizieller ENSIP existiert, wir schlagen einen vor. Das ist "creative use of ENS that goes beyond name → address resolution."

---

## Slide 4 — Umia: Token + Revenue Model

**Title:** EthTwin on Umia — Agentic Venture, Path to Revenue

**Bullets:**
- **Revenue Säule 1 — Subscription:** Privacy Premium ($9/mo), Pro Voice ($19/mo), Multi-Twin ($49/mo Family).
- **Revenue Säule 2 — x402 Service Fees:** 2-5% Spread auf agent-to-agent payments. Twin economy = recurring volume.
- **Revenue Säule 3 — B2B Twin-as-API:** DApps geben ihren Usern Twin-UX. $499-2.999/mo per integration.
- **$TWIN Token:** Service Credits (pay agents in $TWIN), Governance (parent ENS curation, agent registry), Premium-Tier-Unlock.
- **Token-Distribution (Standard AGTC auf Umia):** 30% community, 25% team (4y vesting), 20% public sale (Umia), 15% treasury, 10% advisors/ecosystem.
- **Market:** 100M+ crypto wallet users, Ledger macht $200M+ ARR mit Hardware-Privacy. Software-Privacy + Agent-UX = größerer TAM, niedrigere CAC.

**Speaker Notes (2:35 – 3:00 + Q&A):**
Wenn Francesco (`@fra_mosterts`) im Raum ist, hier langsamer und Eye-Contact. Die drei Revenue-Säulen sind unabhängig — fällt eine aus, hält das Modell. Der Token ist nicht künstlich angeklebt: Service Credits + Premium-Tier sind native usage drivers, nicht Speculation. Closing-Satz: *"In 3 Minuten habt ihr eine Wallet, einen ENS-Namen, einen AI-Twin gesehen — und ein klares Path-to-Revenue. Welchen Twin willst du?"*
