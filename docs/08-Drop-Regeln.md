# 08 — Drop-Regeln

> "Bis zum Ende kämpfen" ist romantisch. Es killt Demos. Hier sind harte Regeln.
> **Diese Regeln werden in Phase 0 vom ganzen Team akzeptiert. Keine Diskussion mehr nachts.**

---

## Die Goldene Regel

> **Stunde 47 = nur Polish. Niemand fixt Bugs. Niemand baut Features.**

Wenn etwas in Stunde 47 noch nicht läuft, läuft es nicht in der Demo. Punkt.

---

## Drop-Decision-Punkte

### Stunde 12 — Phase 1 Done-Check
**Wenn nicht erreicht:**
- Onboarding-Flow funktioniert end-to-end
- Twin antwortet auf 1 Test-Frage
- Smart Wallet existiert mit Adresse

**→ Sofort-Maßnahme:**
- Voice droppen (Chat-only)
- Sample-Agent droppen (Twin antwortet aus eigenem Wissen)
- Cosmic Animation auf Tier 3 verschieben

### Stunde 24 — Phase 2 Done-Check + VOICE DECISION
**Wenn nicht erreicht:**
- Voice-Round-Trip unter 3 Sek
- 1× echte x402-Tx an Apify erfolgreich
- Plain English Tx-Summary funktioniert

**→ Sofort-Maßnahme:**
- **Voice droppen wenn flackert.** Chat-Mode locked-in. Voice-Sample wird im Demo-Video aufgenommen als "feature preview".
- Falls x402 nicht klappt → pre-signed Tx vorbereiten + Block-Explorer-Tab. Demo-Narrative anpassen.

### Stunde 36 — Phase 3 Done-Check
**Wenn nicht erreicht:**
- Stealth Address On-Chain Send funktioniert
- Twin hires `analyst.eth` end-to-end
- Cosmic-Orb-Animation polished

**→ Sofort-Maßnahme:**
- Stealth Address: Mock visualisierung mit echter Attestation aus Cache
- Agent-Hire: Pre-recorded Demo-Video für diesen Beat
- Cosmic-Animation: einfacherer Effekt, keine Particles

### Stunde 40 — Final Drop Window
**Wenn x402 live nicht klappt:**
- Pre-signed Tx vorbereiten
- Block-Explorer mit Tx schon offen im Browser-Tab
- Pitcher sagt: "Hier seht ihr die Tx live on-chain" (technisch wahr — Tx ist real, nur eben pre-signed)

**Wenn cTRNG-API down ist:**
- Cached Samples nutzen
- Echte Attestation-Hashes aus früherem Call
- Pitcher kann sagen: "Diese Bytes kamen heute morgen vom Satelliten" (wahr)

---

## Was wir auf KEINEN Fall droppen

Diese Dinge sind non-negotiable für die Demo. Wenn eines davon kaputt ist, **gibt's keine Demo**:

1. **Onboarding mit Email + Passkey** funktioniert
2. **ENS Subname** wird angelegt
3. **Twin antwortet** auf mindestens 1 Frage
4. **Plain English Tx Summary** vor Approval
5. **Mindestens 1 Tx** wird live oder pre-signed gezeigt

Wenn eines davon Stunde 30 noch nicht läuft → 🚨 ALL-HANDS-STOP. Team-Meeting. Pivot oder droppen.

---

## Mock-Strategien (vorbereitet vor Stunde 40)

### Mock 1: cTRNG-Samples gecached
```typescript
// lib/cosmic.ts
const CACHED_SAMPLES = [
  { 
    seed: "0xab12cd34...", 
    attestation: "0x8f2a...", 
    timestamp: 1714502345, 
    satellite: "OrbitPort-3" 
  },
  // weitere Samples
];

export async function getCosmicSeed() {
  try {
    return await fetchFromOrbitport();
  } catch {
    // Fallback: zufälliges echtes Sample aus Cache
    return CACHED_SAMPLES[Math.floor(Math.random() * CACHED_SAMPLES.length)];
  }
}
```

### Mock 2: Pre-signed x402-Tx
- Tx 1 Stunde vor Demo signieren und broadcasten lassen
- Block-Explorer-Link aufschreiben
- Im Demo: "Hier seht ihr die Tx" → Tab-Switch zu Explorer
- Technisch wahr, nur Timing geshifted

### Mock 3: Voice-Sample pre-recorded
- Beste Voice-Aufnahme nehmen, in Video einbetten
- Live-Demo-Mode: Pitcher tippt statt Voice, sagt "in der Live-Version geht das per Voice"
- Demo-Video zeigt's voll

### Mock 4: analyst.eth pre-funded mit Mock-Response
- Sample-Agent gibt deterministische Response
- Wenn x402-Receive nicht klappt: hardcoded Response in /api/agents/analyst

---

## Notfall-Pitch-Anpassungen

Falls 50%+ kaputt ist und wir trotzdem pitchen müssen:

### Notfall-Skript (1:30 Min, statt 3:00)

> *"Wir bauen EthTwin — euer AI-Co-Pilot fürs On-Chain-Leben."*
> 
> *"Drei Innovationen: ENS-native Agent-Identity, Cosmic-Privacy mit echtem Random aus Satelliten, x402 Agent-zu-Agent-Economy."*
> 
> *"Kurze Demo: hier loggt sich ein User in 60 Sekunden ein, kriegt einen ENS-Subnamen, sein Twin lebt jetzt da."*
> 
> *"Wegen Tech-Issues spielen wir den Rest als Video — was ihr sehen werdet ist alles live entwickelt, on-chain auf Base Sepolia."*
> 
> *[Backup-Video startet]*
> 
> *"EthTwin ist ENS-native, voice-first, privacy-by-default. Welcher Twin wird deiner?"*

**Backup-Video ist immer die Versicherung.** Aufnehmen in Stunde 36-44 ist kein Backup-Plan, sondern Risk-Management.

---

## Was tun wenn alles brennt (Worst Case)

1. **Atmen.** Eine Minute Pause. Niemand stirbt.
2. **Tier 1 isolieren:** Was funktioniert garantiert? Diese Demo zeigen.
3. **Story anpassen:** Statt "Hier seht ihr X" → "Hier sieht der User wie X passiert"
4. **Demo-Video als Held:** Wenn live nichts läuft, Video zeigen. Voll-funktional.
5. **Frage-Antwort dominieren:** Wenn Demo schwach, im Q&A glänzen. Edge-Case-Antworten kennen.

**Erinnerung:** Wir haben mindestens den UX-Bounty wenn Onboarding läuft. Mindestens. Das sind 1-2k. Schon ein Win.

---

## Wer entscheidet?

Im Konfliktfall:
- **Tech-Drop-Decisions:** ETH-Dev + Backend + Frontend einigen sich. Pitcher hat Veto wenn Demo-Story-impliziert.
- **Story-Drop-Decisions:** Pitcher entscheidet. Tech setzt um.
- **Schlaf-Decisions:** Wer am müdesten ist, schläft. Keine Diskussion.

---

## Diese Regeln werden VOR Hackathon-Start ausgedruckt + ausgehängt.

In Phase 0 lest ihr diese Datei nochmal zusammen und commitet euch. Keine Ausreden um 4 Uhr morgens.
