# 06 — Demo-Skript (3 Min, hart timed) — Maria/Tom-Story

> **Pitch-Pivot 2026-05-09:** Story neu geschärft auf *"Crypto for everyone — even my grandma."* Hauptszene: Maria (67, Stuttgart) sendet ihrem Enkel Tom 100 USDC per Voice. Tech-Tiefen (Stealth, cTRNG, ENSIP-25, x402) kommen erst im Reveal-Beat.
>
> **Verifiziert May 2026.** $1 USDC ist Apify x402 Minimum. ENSIP-25 ist offizieller Standard für AI Agent Identity in ENS.
>
> Diese Demo gewinnt das Hackathon — oder nicht. Pitcher übt 5x. Frontend-Mensch übt 5x. Synchronisiert.

---

## Tagline

**"Crypto for everyone — even my grandma."**
Sub: *"The first crypto interface built for humans, not engineers."*

## Drei-Akt-Struktur

| Akt | Zeit | Funktion |
|---|---|---|
| **Hook** | 0:00 – 0:20 | Maria-Persona einführen, Versprechen aufmachen ("60 seconds, never used crypto") |
| **Demo** | 0:20 – 1:50 | Live-Szene Maria → Tom + Verify-Beat |
| **Reveal** | 1:50 – 2:40 | Tech-Tiefen aufdecken — alle Bounties landen hier |
| **Close** | 2:40 – 3:00 | Tagline + Team + ENS |

---

## Setup vor Demo

### Browser-Tabs (in dieser Reihenfolge)
1. **Tab 1 — Maria's Phone-View:** `https://ethtwin.xyz/?demoMode=1` eingeloggt als `maria.ethtwin.eth`, Voice-Tab aktiv
2. **Tab 2 — Tom's Phone-View:** zweites Browser-Profil eingeloggt als `tom.ethtwin.eth`, Notification-Panel sichtbar (split-screen oder zweites Display)
3. **Tab 3 — Block Explorer:** `basescan.org/sepolia/` pre-loaded auf Marias Smart Wallet (für Reveal)
4. **Tab 4 — Backup-Demo-Video:** `public/demo-backup.mp4` ready für Notfall

### Pre-Demo Checks
- `pnpm twins:seed-demo` einmalig gelaufen → `maria.ethtwin.eth` + `tom.ethtwin.eth` existieren on-chain mit Avataren
- Marias Smart Wallet: ≥10 USDC + Sepolia ETH (Gas) auf Base Sepolia
- ENSIP-25 + `stealth-meta-address` Records auf BEIDEN Twins gesetzt
- cTRNG-Cache prefetched (mehrere Samples)
- `analyst.ethtwin.eth` antwortet, ENSIP-25 verified
- OpenAI Realtime API funktioniert, voice round-trip 1× durchgespielt
- `NEXT_PUBLIC_DEMO_MODE=1` aktiv → 4 Tabs versteckt, nur Voice + Chat sichtbar

### Audio
- Mikrofon getestet vorher
- Voice-Sample-Backup ready
- Maria-Voice: Pitcher spricht direkt rein (keep it simple) ODER pre-recorded (sicherer)

---

## DAS SKRIPT (2:55-3:00 Min)

### [0:00 – 0:20] Hook — Maria einführen

> *"Das ist Maria. 67 Jahre alt. Wohnt in Stuttgart. Ihr Enkel Tom studiert in Berlin. Heute will sie ihm 100 Euro für Lebensmittel schicken."*
>
> *"Maria hat noch nie Krypto benutzt. Heute schon — und zwar in 60 Sekunden. Schaut zu."*

**Bühne:** Pitcher steht, Slide 1 mit Maria-Avatar + Tagline auf Screen.

---

### [0:20 – 0:55] Send Beat — Voice → Stealth-Send

**Cut zu Tab 1 (Maria's Phone-View).**

| t | Aktion | Was sichtbar ist |
|---|---|---|
| 0:20 | Maria öffnet App, Face-ID-Touch | Login → maria.ethtwin.eth Avatar groß |
| 0:25 | Voice-Button gedrückt, Maria sagt: *"Send Tom 100 dollars"* | Listening-Orb pulst |
| 0:33 | Twin antwortet (voice + visual): *"Sending 100 USDC to tom.ethtwin.eth — that's Tom Schmidt, your grandson. Confirm?"* | Plain-English-Card mit Tom-Avatar, ENS-Name, Beziehungs-Hint |
| 0:42 | Maria Face-ID-Touch | Passkey-Approval-Toast |
| 0:45 | **Cosmic-Orb Mikro-Pulse** (1.5 s) während Stealth-Send | Subtile Animation, kein eigener Tab |
| 0:50 | "✓ Sent" Card | Tx-Hash-Pill (klickbar im Reveal), Confetti optional |

**Sprecher währenddessen:**
> *"Eine Anweisung, ein Touch, fertig. Maria sieht keine Hex-Adressen, keine Gas-Fees, keine Seed-Phrasen. Nur Tom."*

---

### [0:55 – 1:25] Receive Beat — Tom bekommt's

**Cut zu Tab 2 (Tom's Phone-View, optional split-screen).**

| t | Aktion | Was sichtbar ist |
|---|---|---|
| 0:55 | Notification-Panel poppt auf | "Maria sent you 100 USDC" + Maria-Avatar |
| 1:00 | Tom-Twin zeigt Tx-Card | from: `maria.ethtwin.eth`, amount, "Stealth received" Badge |

**Sprecher:**
> *"Auf Toms Seite: Notification, Avatar, Name. Kein 0x-Address, keine Block-Explorer-Sucherei."*

---

### [1:25 – 1:50] Verify Beat — "Is this safe?"

**Cut zurück zu Tab 1 (Maria).**

> Maria spricht: *"Twin, is this really Tom? Am I being scammed?"*

| t | Aktion | Was sichtbar ist |
|---|---|---|
| 1:30 | Twin: *"Let me verify. I'll check with the analyst agent."* | x402-Flow-Animation startet (Twin → analyst-Wire) |
| 1:35 | x402-Pill: "$1 USDC paid to analyst.ethtwin.eth" | Verified-Shield erscheint |
| 1:42 | Twin antwortet: *"Confirmed. tom.ethtwin.eth was registered by Tom Schmidt, your grandson, since March. ENSIP-25 verified."* | Green Verified-Badge in der Card |

**Sprecher:**
> *"Maria's Twin holt sich Backup von einem anderen Agent. Er bezahlt für die Antwort, on-chain. Maria muss nichts davon wissen — sie bekommt einfach: ja, sicher."*

---

### [1:50 – 2:40] **REVEAL BEAT** — alle Bounties einlösen

**Cut. Schwarzer Screen. 2-Sekunden-Pause.**

> *"Was Maria nicht gesehen hat:"*

**Slide-Bullets erscheinen einer nach dem anderen, je 6-8 Sekunden:**

> ✓ **Kein Seed-Phrase.** Marias Wallet ist ein Passkey. Privy + ERC-4337 Smart Wallet.
>
> ✓ **Keine Hex-Adressen.** Jeder Mensch hat einen ENS-Twin. `maria.ethtwin.eth`, `tom.ethtwin.eth` — auf Sepolia ENS, on-chain.
>
> ✓ **Privatsphäre by default.** Marias 100 USDC gingen an eine **EIP-5564 Stealth Address**. Niemand außer Tom kann sie auslesen.
>
> ✓ **Randomness aus dem Weltall.** Die Stealth-Adresse wurde mit echter cTRNG-Entropie aus einem Orbitport-Satelliten geseedet. Nicht VRF, nicht pseudo-random. Echtes cosmic noise.
>
> ✓ **Agent-zu-Agent Vertrauen.** Marias Twin hat den analyst-Agent über **ENSIP-25 + ERC-8004 IdentityRegistry** verifiziert und über **x402** bezahlt — alles auf Base, alles on-chain.

**Sprecher abschließend:**
> *"Crypto isn't hard. It's just been built for engineers. Until now."*

---

### [2:40 – 3:00] Closing

> *"EthTwin ist nicht die Wallet für die nächsten 100 Millionen User. Es ist die Wallet für die nächsten 1 Milliarde — die, die Krypto bisher als zu kompliziert abgelehnt haben."*
>
> *"Frag deine Oma. Frag dich selbst. Welchen Twin willst du?"*

**Final Frame:** Logo + URL `ethtwin.xyz` + Slogan + "maria.ethtwin.eth · tom.ethtwin.eth · daniel.ethtwin.eth"

---

## Edge-Case-Antworten (für Q&A nach Pitch)

### "Ist das nicht ein bisschen kitschig — Oma als Pitch?"
> *Genau das ist der Punkt. Jeder andere Krypto-Pitch heute targetet Power-User. Wir haben gemerkt: das Problem in Krypto ist nicht Skalierung, es ist Zugang. Wenn Maria es benutzen kann, kann es jeder benutzen — und dann ist der Markt 1 Mrd. groß, nicht 100 Mio.*

### "Warum cTRNG statt Chainlink VRF?"
> *VRF ist pseudorandom mit einem Operator als Trust-Anchor — der Operator könnte theoretisch Maria's Stealth-Adressen vorhersagen. cTRNG ist physikalisches cosmic random aus Satelliten. Niemand — auch wir nicht — kann es vorhersagen. Für Privacy by Default ist das ein anderes Trust-Modell.*

### "Was wenn der Satellit down ist?"
> *Wir cachen recente cTRNG-Samples auf der Server-Seite. Die Privacy-Properties bleiben stark — wir verwenden nur frische Samples für jede Tx und prüfen Attestations. Backup wäre hardware RNG mit cTRNG-Seed.*

### "Was ist ENSIP-25?"
> *Der offizielle ENS-Standard für verifizierbare AI Agent Identity. Er definiert ein Text-Record-Format, das einen Agent in einem on-chain Registry — wie ERC-8004 IdentityRegistry — mit einer ENS-Adresse verknüpft. Wir implementieren ihn nativ. Deshalb können andere Agents wie unser analyst.eth verifizieren dass sie mit einem echten Twin sprechen, nicht mit einem Imposter. Maria sieht das nie — aber Maria's Twin nutzt es bei jedem Verify.*

### "ERC-8004 — wo ist das deployed?"
> *Live auf Mainnet seit 29. Januar 2026 (`0x8004A169...`). Wir verifizieren gegen die Base Sepolia Deployment (`0x8004A818BFB912233c491871b3d84c89A494BD9e`). Der Vanity-Prefix `0x8004` ist gewollt — macht die Registry sofort erkennbar.*

### "Was ist das Geschäftsmodell?"
> *Drei Säulen: B2C-Subscription für Privacy-Premium und Pro-Voice; x402-Service-Fees auf agent-to-agent payments (jede Maria-Verify-Transaktion ist ein Stream); B2B Twin-as-API für Banken und Fintechs die ihren bestehenden Senior-Kunden Krypto-UX geben wollen, ohne dass die was lernen müssen.*

### "Was ist der Markt?"
> *Krypto hat heute ~100M aktive Wallets — Power-User. Die nächste Welle sind 1 Mrd. Menschen die Krypto bisher abgelehnt haben weil's zu hart war. Maria ist der Beweis dass das Tooling jetzt da ist. Wir sind die UX-Schicht über dem ganzen on-chain stack.*

### "Wie skalierbar ist das?"
> *Stateless Backend auf Vercel. ENS skaliert von Natur aus. cTRNG-Cache pooled. x402 fees pay for own throughput. Wir haben kein Centralized Bottleneck. Marias Twin könnte morgen Toms Twin und 999.998 weitere bedienen ohne Architektur-Änderung.*

### "Warum nicht einfach Smart Wallets + AA?"
> *Wir nutzen Smart Wallets — Privy gibt uns ERC-4337 mit Passkey-Auth. Aber Smart Wallets allein lösen nicht Privacy + Agent-Identity + Voice-UX + Multi-Agent-Coordination. EthTwin ist die Schicht darüber, in einer Sprache die Maria spricht.*

### "Warum $1 USDC pro Apify-Call? Ist das nicht teuer?"
> *Das ist Apify's x402-Minimum für Pay-Per-Event Actors. Maria sieht den Preis nie — Twin entscheidet selektiv. Plus: das ist agent-driven Payment, nicht user-driven. Jeder Verify-Beat im Demo ist ein realer x402-Mikro-Markt in Action.*

### "Token-Distribution?"
> *Standard AGTC-Setup auf Umia: 30% community, 25% team (4y vesting), 20% public sale, 15% treasury, 10% advisors/ecosystem. $TWIN nutzt Service-Credit + Governance + Premium-Tier.*

### "Could this work on mainnet?"
> *Ja — Base Mainnet ready. ENS bereits live auf Mainnet. Stealth Address EIPs sind mainnet-kompatibel. ENSIP-25 ist mainnet-spec. cTRNG via Orbitport ist mainnet-ready API. Maria-Demo könnte morgen auf Mainnet laufen mit echtem USDC.*

### "Stealth-Meta-Address in ENS — gibt's da einen Standard?"
> *Aktuell nicht. Wir haben das Pattern für diese Demo entwickelt und proposen effectively einen neuen ENSIP. Es ist kompatibel mit EIP-5564 für Stealth Addresses und ERC-6538 für Stealth Meta-Address Registry — wir nutzen ENS Text Records statt onchain Registry für bessere UX. Genau das ist die "Most Creative Use of ENS".*

---

## Demo-Checkliste vor Bühne

- [ ] Internet-Verbindung getestet
- [ ] Mikrofon getestet
- [ ] Tab 1 (Maria) + Tab 2 (Tom) geöffnet, beide eingeloggt, im Demo-Mode
- [ ] Marias Smart Wallet hat ≥10 USDC + Sepolia ETH (Gas)
- [ ] `maria.ethtwin.eth` + `tom.ethtwin.eth` existieren on-chain
- [ ] ENSIP-25 Text Record + `stealth-meta-address` Text Record auf beiden Twins
- [ ] Test-Voice-Befehl 1× durchgespielt ("Send Tom 5 dollars" + ggf. zurückrouten)
- [ ] cTRNG-Seed-Cache prefetched (für falls API langsam)
- [ ] x402-Apify-Endpoint warm (1× Test-Call)
- [ ] `analyst.ethtwin.eth` antwortet + ist ENSIP-25 verified
- [ ] Backup-Video bereit für Tab-Switch
- [ ] Slide 1 (Maria-Hook) + Slide 5 (Reveal-Bullets) als Keynote ready
- [ ] Wasser
- [ ] Atmung

---

## Die 5 Sätze die der Pitcher auswendig kann

1. *"Maria, 67, never used crypto. In 60 seconds she sends 100 dollars to Tom — by voice."*
2. *"She doesn't see hex addresses. She doesn't sign blind. She doesn't even know what stealth means."*
3. *"Her Twin verified Tom via ENSIP-25 and paid an analyst agent over x402 — silently."*
4. *"The randomness for her stealth address came from a satellite."*
5. *"Crypto isn't hard. It's just been built for engineers. Until now."*

Wenn der Pitcher unter Stress ist: einfach diese 5 Sätze. Plus Demo. Reicht.

---

## Drop-Decisions (auf der Bühne)

| Wenn… | Dann… |
|---|---|
| Voice flackert | Sofort auf Chat-Modus, Sätze gleich, Demo-Beat funktioniert auch im Chat (`docs/13-Chat-Only-Demo-Runbook.md`) |
| Tom's Browser-Profil verbindet nicht | Receive-Beat überspringen, direkt zum Verify-Beat — der ist wichtiger |
| `X402_SENDER_KEY` Wallet leer / x402 fails | Verify-Beat zeigt pre-signed Tx-Hash + Basescan-Link, Sprecher sagt "demo wallet — same flow on Mainnet" |
| Stealth-SDK crashed | try/catch fällt auf normalen USDC-Send zurück; Reveal sagt nur "EIP-5564 ready, fallback active" |
| Cosmic-Pulse rendert nicht | Egal — nur Visual-Polish, Reveal kommt trotzdem mit dem Hash |
| Komplettausfall | Tab 4 = Backup-Video |
