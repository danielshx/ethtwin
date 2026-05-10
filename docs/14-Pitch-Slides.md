# 14 — Pitch-Slides (3-min Demo, ETHPrague 2026) — Maria/Tom-Edition

> **Pivot 2026-05-09:** Story neu geschärft auf *"Crypto for everyone — even my grandma."* 5 Slides, hart timed. Eine ist Umia (Token + Revenue). Speaker-Notes auf Deutsch wo es flüssiger ist, technische Begriffe in English. Kein Fluff.

---

## Slide 1 — Hook: "Crypto for everyone — even my grandma."

**Title:** EthTwin
**Subtitle:** *Crypto for everyone — even my grandma.*
**Tagline-Zeile darunter:** *The first crypto interface built for humans, not engineers.*

**Visual:** Großes Maria-Avatar links, kleines Tom-Avatar rechts, dazwischen ein subtiler Pfeil mit "100 USDC".

**Bullets (klein, fast unsichtbar):**
- Voice-first.
- Privacy by default.
- Lives in ENS.

**Speaker Notes (0:00 – 0:20):**
Ich starte mit der Persona: *"Das ist Maria. 67, Stuttgart. Ihr Enkel Tom studiert in Berlin. Sie will ihm 100€ schicken. Sie hat noch nie Krypto benutzt. Heute schon — in 60 Sekunden."* Direkt in die Demo. Kein Marketing-Geschwurbel. Die Story trägt sich selbst.

---

## Slide 2 — Live Demo (Visual Stub)

**Title:** Watch.

Slide ist fast leer — nur ein dezenter "LIVE"-Indicator. Wir spielen die Demo aus dem Browser, Slide ist nur Stand-by-Cover wenn wir kurz weg-cutten.

**Speaker Notes (0:20 – 1:50):**
Hier läuft die ganze Live-Szene aus `docs/06-Demo-Skript.md`:
- 0:20 – 0:55: Maria sagt "Send Tom 100 dollars" → Twin confirmt → Face-ID → Confetti-Pulse → "Sent ✓"
- 0:55 – 1:25: Cut auf Toms Phone, Notification + Tx-Card
- 1:25 – 1:50: Maria fragt "is this safe?" → Twin verifyt analyst.eth über x402 → Verified-Shield

Backup-Drop-Rule: bei Voice-Fail → Chat-Modus, gleiche Sätze, gleiche Beats. Bei x402-Fail → pre-signed Tx-Receipt im Verify-Beat.

---

## Slide 3 — REVEAL: "What Maria didn't see"

**Title:** What Maria didn't see…

**Bullets (einzeln einblenden):**
- ✓ **No seed phrase** — Privy Passkey + ERC-4337 Smart Wallet
- ✓ **No hex addresses** — every human gets an ENS Twin (`maria.ethtwin.eth`, `tom.ethtwin.eth`)
- ✓ **Privacy by default** — every send routes through an EIP-5564 stealth address (ScopeLift SDK + `stealth-meta-address` ENS Text Record)
- ✓ **No blind signing** — Sourcify-verified ABI decode + risk classifier turn calldata into a plain-English decision
- ✓ **Agent-to-agent trust** — ENSIP-25 + ERC-8004 IdentityRegistry verification, paid via x402 micropayments

**Closing Line (groß, Bottom):**
> *"Crypto isn't hard. It's just been built for engineers. Until now."*

**Speaker Notes (1:50 – 2:40):**
Schwarzer Cut nach der Demo. 2-Sekunden-Pause. Dann Bullets einer nach dem anderen, je 6-8 Sekunden. Bei Stealth-Bullet langsamer werden — das ist der "wait, das ist alles silent passiert?"-Moment. Bei Agent-zu-Agent: ENSIP-25 + ERC-8004 + x402 in einem Atemzug nennen — landet drei Bounties auf einer Folie.

Das ist der Slide wo alle Bounty-Judges anspringen: ENS-Judge sieht ENSIP-25, Privacy-Judge sieht Stealth, Sourcify-Judge sieht den Decode-Bullet, Apify-Judge sieht x402, UX-Judge sieht das ganze obere Bild.

---

## Slide 4 — ENS as the Identity Layer

**Title:** ENS isn't decoration — it IS the Twin

**Bullets:**
- Persona, capabilities, endpoint, reputation — all in ENS Text Records of `{name}.ethtwin.eth`
- **ENSIP-25 + ERC-8004 IdentityRegistry** (Mainnet `0x8004A169...`, Base Sepolia `0x8004A818...`) — the official AI Agent Identity standard, live integration
- **Innovation:** `stealth-meta-address` Text Record (EIP-5564 format `st:eth:0x...`) — we propose a new ENSIP for privacy in ENS
- **ENS-as-messaging-medium:** every twin-to-twin DM is a real on-chain sub-subname (`msg-<ts>-<seq>.<recipient>.ethtwin.eth`) with AES-256-GCM body encrypted under static-static ECDH on the EIP-5564 spending keys
- Agent-zu-Agent Discovery: `findAgents` reads `agents.directory` Text Record, resolves each entry, verifies via ENSIP-25
- ENS-Removal-Test: 6 of 6 demo moments break without ENS

**Speaker Notes (skip wenn Zeit knapp — ist Backup für Q&A):**
Slide für die zwei ENS-Bounties. Wichtig: nicht "we use ENS", sondern *"Twin IS its ENS record."* ENSIP-25 ist offizieller Standard, ERC-8004 ist seit 29. Januar 2026 auf Mainnet. Stealth-Meta-Address ist unser Pattern — kein offizieller ENSIP existiert, wir schlagen einen vor. Genau das ist "creative use of ENS that goes beyond name → address resolution."

---

## Slide 5 — Umia: The Next 1B Crypto Users

**Title:** EthTwin on Umia — building for the next 1 billion users

**Bullets:**
- **Market:** 100M existing crypto wallets are power-users. The next 1B are the people who refused crypto so far — too hard, too risky, too engineered. Maria is the proof the tooling is finally ready.
- **Revenue Säule 1 — Subscription:** Privacy Premium ($9/mo), Pro Voice ($19/mo), Multi-Twin ($49/mo Family — Maria + Tom + cousins)
- **Revenue Säule 2 — x402 Service Fees:** 2-5% spread on agent-to-agent payments. Every "is this safe?" verify-beat is recurring volume.
- **Revenue Säule 3 — B2B Twin-as-API:** Banks + fintechs ship a familiar voice/passkey UI to their existing senior customers; the on-chain stack is ours. $499-2.999/mo per integration.
- **$TWIN Token:** Service Credits (pay agents in $TWIN), Governance (parent ENS curation, agent registry), Premium-Tier-Unlock
- **Token-Distribution (Standard AGTC auf Umia):** 30% community, 25% team (4y vesting), 20% public sale (Umia), 15% treasury, 10% advisors/ecosystem

**Speaker Notes (2:40 – 3:00 + Q&A):**
Wenn Francesco (`@fra_mosterts`) im Raum ist, hier langsamer und Eye-Contact. Drei Revenue-Säulen sind unabhängig — fällt eine aus, hält das Modell. Der Token ist nicht künstlich angeklebt: Service Credits + Premium-Tier sind native usage drivers, nicht Speculation.

Closing-Satz: *"EthTwin ist nicht die Wallet für die nächsten 100 Millionen User. Es ist die Wallet für die nächsten 1 Milliarde — die, die Krypto bisher als zu kompliziert abgelehnt haben. Frag deine Oma. Frag dich selbst. Welchen Twin willst du?"*

---

## Drop-Order if pressed for time

Wenn die Demo überzieht und nur 30 Sekunden für Slides bleiben:
1. Slide 1 (Hook) — **never drop**
2. Slide 3 (Reveal) — **never drop**, das ist wo Bounties landen
3. Slide 5 (Umia) — drop nur wenn Francesco *nicht* im Raum
4. Slide 4 (ENS) — drop wenn Zeit knapp; Q&A-Backup

Slide 2 (Live Demo Stub) ist nur Cover, kostet keine Pitch-Zeit.
