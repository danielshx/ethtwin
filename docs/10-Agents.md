# 10 — Claude Code Sub-Agents & Skills

> Sub-Agents in `.claude/agents/` werden von Claude Code automatisch aufgerufen wenn ihre Spezialität passt. Sie laufen in eigenen Context-Windows — heißt: spezielles Domänen-Wissen ohne den Haupt-Context vollzustopfen.

---

## Strategie

Wir setzen auf **4 fokussierte Sub-Agents** plus Standard-Skills die Claude Code mitbringt. **Keine Over-Engineering** — jeder Sub-Agent hat eine klare, einzelne Verantwortung.

---

## Unsere Sub-Agents

### 1. `ens-expert` 
**Wofür:** Alles ENS-related — Subname-Trees, Text Records, Resolver, EIP-Standards.

**Wann nutzen:**
- "Setze Text Records für Twin"
- "Implementiere ENS Subname-Erstellung"
- "Wie funktioniert CCIP-Read?"
- "Welcher ENSIP ist für Multichain?"

**Definition:** `.claude/agents/ens-expert.md`

---

### 2. `stealth-architect`
**Wofür:** EIP-5564 Stealth Addresses, Meta-Key-Management, Privacy-Patterns.

**Wann nutzen:**
- "Implementiere Stealth-Address-Generation"
- "Wie speichern wir den Meta-Key in ENS?"
- "Stealth-Send mit cTRNG-Seed"

**Definition:** `.claude/agents/stealth-architect.md`

---

### 3. `twin-agent-builder`
**Wofür:** Vercel AI SDK Agent-Loops, Tool-Calling, Twin's Personality, Multi-Turn Conversations.

**Wann nutzen:**
- "Schreibe Twin's System Prompt"
- "Implementiere Tool für x402-Aufruf"
- "Wie struktiere ich den Agent-Loop für Voice + Tools?"

**Definition:** `.claude/agents/twin-agent-builder.md`

---

### 4. `demo-coach`
**Wofür:** Demo-Flow optimieren, Pitch-Skript, Story-Bogen, Edge-Case-Antworten.

**Wann nutzen:**
- "Review unser Demo-Skript"
- "Welche Beats fehlen für 3 Min?"
- "Wie würde ein Judge fragen XYZ beantworten?"

**Definition:** `.claude/agents/demo-coach.md`

---

## Built-in Skills wir nutzen

Claude Code hat eingebaute Skills die wir frei nutzen können. Hier die für uns relevanten:

| Skill | Wofür |
|---|---|
| **nextjs-app-router-patterns** | App Router, Server Components, Streaming |
| **typescript-best-practices** | Type-safe Patterns, kein `any` |
| **tailwind-css** | Utility-first Styling |
| **shadcn-ui** | Component-Library für unsere UI |
| **react-performance-optimization** | Wenn Re-Renders zum Problem werden |
| **framer-motion-animator** | Cosmic-Animation, Onboarding-Flow |
| **api-design** | API-Routes klar struktieren |
| **react-hook-form-zod** | Forms in Onboarding |
| **web-accessibility** | A11y für UX-Bounty |
| **vercel:ai-sdk** | LLM-Integration mit AI SDK |
| **vercel:nextjs** | Next.js Best Practices |
| **vercel:deploy** | Deployment |
| **vercel:env-vars** | Environment-Variable-Management |
| **error-tracking** | Sentry-Integration falls Zeit |
| **logging-best-practices** | Structured Logs |

---

## Wie Sub-Agents im Hackathon nutzen

### Pattern A: Direkter Aufruf
```
User → Claude Code: "Bau die Stealth-Address-Generation"
Claude Code → ruft `stealth-architect` Sub-Agent auf
Sub-Agent → liefert spezifische Implementation mit EIP-5564 Knowledge
Claude Code → integriert Output in Hauptprojekt
```

### Pattern B: Multi-Agent-Parallel
Wenn mehrere unabhängige Tasks gleichzeitig:
```
"Setze gleichzeitig:
- ENS Text Records (ens-expert)
- Stealth Generator (stealth-architect)
- Twin Tool für x402 (twin-agent-builder)"

Claude Code spawnt alle 3 parallel.
```

### Pattern C: Review/Validate
```
"Review unsere ENS-Implementation gegen Bounty-Anforderungen"
→ ens-expert prüft Code gegen ENS-Standards
→ demo-coach prüft Demo-Beat
```

---

## Wichtige Regeln für Sub-Agent-Nutzung

1. **Sub-Agent-Output ist Input für Hauptkontext.** Der Sub-Agent sieht nicht eure Konversations-History.
2. **Klar abgrenzte Tasks geben.** Sub-Agents arbeiten am besten wenn die Anfrage scope-limited ist.
3. **Prüf den Output.** Sub-Agents können falsch liegen — vor allem bei spezifischen API-Versionen oder Library-Quirks. Immer Code lesen.
4. **Nicht für triviale Tasks.** "Füge ein Button hinzu" → Hauptkontext. "Implementiere EIP-5564 Stealth-Send mit cTRNG-Seed" → `stealth-architect`.

---

## Fallback wenn Sub-Agent stuck ist

Wenn ein Sub-Agent generischen Output liefert oder Hallucinations zeigt:

1. **Prompt schärfen:** Mehr Context geben (Lib-Versionen, gewünschtes Pattern)
2. **Neues Sub-Agent-Call mit explizitem Code-Kontext:** "Hier ist meine aktuelle Implementation, fix Punkt X"
3. **Direkt im Haupt-Kontext arbeiten** mit der Web-Search-Skill für aktuelle Docs
4. **Mentor fragen** wenn API-spezifisch (Pedro für Orbitport, workemon für ENS, etc.)

---

## Agent-Configs werden hier gepflegt

`.claude/agents/` enthält die System-Prompts für jeden Sub-Agent. Wenn ein Agent generisch wird, schärfen wir seinen Prompt in der Datei.

**Pflege-Routine:** Jede Phase einmal kurz die Agents updaten wenn neue Patterns auftauchen.
