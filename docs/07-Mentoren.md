# 07 — Mentoren

> Mentor-Calls in Phase 0 sind nicht optional. Mentoren sind Tiebreakers für Bounty-Entscheidungen.

---

## 🎯 Critical Mentors (in dieser Reihenfolge anpingen)

### 1. Pedro Sousa — SpaceComputer
- **Telegram:** `@zkpedro`
- **Expertise:** SW, ZK, cTRNG APIs
- **Was wir brauchen:**
  - Orbitport API Access + Auth
  - cTRNG Endpoint URL + Beispiel-Calls
  - KMS-Integration (optional für Twin-Signing)
  - Rate Limits + Caching Best Practices
- **Wann ansprechen:** Phase 0 (Stunde 0-2)
- **Erwartetes Outcome:** API Keys + 1-Pager-Doc

### 2. workemon — ENS
- **Telegram:** `workemon`
- **Expertise:** ENS for AI, Subnames, Resolver
- **Was wir brauchen:**
  - ENS Domain-Frage geklärt (`ethtwin.eth` verfügbar?)
  - Subname-Tree-Setup auf Sepolia
  - Best Practices für AI-Agent-Records
  - CCIP-Read falls offchain Subnames sinnvoll
- **Wann ansprechen:** Phase 0 (Stunde 0-3, ENS-Booth besuchen)
- **Erwartetes Outcome:** Funktionierende Subname-Architektur

### 3. Jakub Kopecky — Apify x402
- **Telegram:** `@themq37`
- **Email:** jakub.kopecky@apify.com
- **Expertise:** AI Engineer, x402 Protocol
- **Was wir brauchen:**
  - x402 SDK Walkthrough (15 Min ist genug)
  - Sandbox/Test-Endpoint
  - Apify-Actor-Liste die für Twin sinnvoll sind (Sentiment, Twitter-Scrape, etc.)
- **Wann ansprechen:** Phase 0 (Stunde 1-2)
- **Erwartetes Outcome:** Test-Tx erfolgreich + Apify-API-Key

### 4. Francesco Mosterts — Umia
- **Telegram:** `@fra_mosterts`
- **Twitter:** `@fra_mosterts`
- **Expertise:** Protocol Design, Venture, Token-Strategie
- **Was wir brauchen:**
  - 5-Min-Pitch-Feedback (Phase 3 oder 4)
  - Token-Story Sanity-Check
  - Venture-Tauglichkeit-Validation
- **Wann ansprechen:** Phase 0 (kurzes Hi) + Phase 3/4 (Pitch-Feedback)
- **Erwartetes Outcome:** Pitch-Feedback + Mention bei Judging

---

## 🟡 Optional Mentors (wenn Zeit)

### Sameh Jarour — Apify (Marketing/Business)
- **Telegram:** `@samehjarour`
- **Phone:** +420 771 152 600
- **Verfügbar:** Freitag + Sonntagnachmittag
- **Use Case:** Pitch-Feedback aus Business-Sicht

### Filip Rezabek — SpaceComputer (TEEs)
- **Telegram:** `@elrondjr`
- **Use Case:** Hardware-Track Backup (wir nutzen Track 3 aber falls Pivot...)

### Manuel Wedler — Sourcify
- **Telegram:** `@manuelwedler`
- **Use Case:** Falls Tier-3-Sourcify-Integration doch noch Sinn ergibt (eher nicht)

### Nicolas (Umia, Co-Mentor)
- **Telegram:** `@Nicolas_993`
- **Twitter:** `@merklefruit`
- **Expertise:** Protocol Development, DeFi, Rust
- **Use Case:** Backup für Francesco

### Oxytocin (Umia, Tokenomics)
- **Telegram:** `@Ox_ytocin`
- **Use Case:** Wenn Token-Story-Detail-Frage

---

## 📨 Erstes Mentor-Ping Template

Hier ein Copy-Paste-Template für Telegram. **Anpassen pro Mentor:**

```
Hi [Name]! 👋

Wir sind ein Team beim ETHPrague Hackathon und bauen "EthTwin" — ein AI-Co-Pilot fürs On-Chain-Leben mit ENS-Identity, Voice-UX, und [SPECIFIC TO MENTOR].

Wir hätten Lust auf einen kurzen Sync (10-15 Min) um:
- [SPEZIFISCHE FRAGE 1]
- [SPEZIFISCHE FRAGE 2]

Wann passt es dir? Sind aktuell am [LOCATION] / online erreichbar.

Danke!
[Dein Name]
```

### Beispiel für Pedro (SpaceComputer):
```
Hi Pedro! 👋

Wir bauen EthTwin beim Hackathon — ein AI-Twin der bei einer ENS-Subdomain wohnt und Privacy-by-default per Stealth Addresses macht. Wir wollen cTRNG aus Orbitport für die Stealth-Seeds nutzen (Track 3, kein Hardware).

Hätten Lust auf 10-15 Min:
- API-Access für cTRNG bekommen
- Beispiel-Call sehen
- Caching/Rate-Limits klären

Wann passt's dir? Sind im Hauptraum.

Danke!
```

---

## 🧠 Mentor-Etiquette

1. **Nicht zu früh ohne Plan kommen.** Erst eigenen Code-Plan haben, dann gezielte Frage.
2. **Konkrete Fragen, keine offenen "wie macht ihr das"-Fragen.** Mentoren haben begrenzte Zeit.
3. **Gibt Update wenn was klappt:** "Hey Pedro, cTRNG läuft! Danke 🙏" — Mentoren mögen das, erinnern sich beim Judging.
4. **Vor Pitch-Tag noch ein letztes Update** mit Demo-Link/Video. Das macht oft den Unterschied.
5. **Nicht nervös sein.** Sie sind hier um zu helfen.

---

## 📱 Mentor-Update-Routine

### Phase 1 Done (Stunde 12)
- Pedro: "cTRNG läuft im Backend"
- workemon: "ENS Subname läuft, hier ein Screenshot"
- Jakub: "Erste x402-Tx erfolgreich"

### Phase 3 Done (Stunde 36)
- Francesco: "Hier ein 60-Sek-Demo-Video, Feedback?"
- Pedro: "Cosmic-Animation läuft mit echter Attestation"
- workemon: "Stealth Meta-Key in Text Records funktioniert"

### Vor Pitch (Sonntag morgen)
- Alle 4: "Pitch ist um X Uhr. Würden uns freuen wenn ihr da seid 🙏"
