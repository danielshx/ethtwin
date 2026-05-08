# 09 — Setup-Anleitung (Verified May 2026)

> Stunde 0-1 Setup. Wenn du das gemacht hast, kann jeder im Team `pnpm dev` ausführen und es läuft.
> 
> **Alle Versionen + Package-Namen wurden via npm + Web-Recherche verifiziert.**

---

## ✅ Status (2026-05-08, abends)

Die "Initial Setup" + "Init-Script"-Schritte unten sind **bereits ausgeführt**, plus shadcn-Init und Frontend-Komponenten. Was noch zu tun ist:

1. `cp .env.example .env.local` und Keys eintragen (mind. `NEXT_PUBLIC_PRIVY_APP_ID` damit die Login-UI greift — sonst zeigt die Homepage einen Missing-Env-Hinweis).
2. Privy-Dashboard konfigurieren (Login-Methods, Smart Wallets, Domains) — siehe Privy-Abschnitt.
3. NameStone-Domain claimen + API-Key eintragen (oder ENS-Pfad B/C wählen).
4. Vercel-Link + Env-Vars setzen (Schritte unten gelten unverändert).

Was schon installiert ist (siehe `pnpm-lock.yaml`):
`next 15.5`, `react 19`, `tailwindcss 4`, `ai 6.0.176`, `@ai-sdk/{anthropic@3.0.76, openai@3.0.63, react@3.0.178}`,
`viem 2.48.11`, `@ensdomains/ensjs 4.2.2`, `@scopelift/stealth-address-sdk 1.0.0-beta.5`,
`@x402/{fetch,next,evm}@2.11.0`, `@coinbase/x402 2.1.0`,
`@privy-io/react-auth 3.23.1`, `@privy-io/node 0.18.0`, `permissionless` (Privy SmartWallets peer dep — extra installed),
`framer-motion 11.18.2`, `zod`, `sonner`, `lucide-react`, `clsx`, `tailwind-merge`, `class-variance-authority`, `tsx`.

Frontend-Komponenten (alle in `components/`):
- `ui/` — shadcn primitives: `button`, `card`, `input`, `dialog`, `badge`, `sonner`, `scroll-area`, `separator`, `label`
- `cosmic-orb.tsx` — Framer-Motion Hero + `useCosmicSeed()` Hook
- `twin-chat.tsx` — AI-SDK-v6 `useChat` Streaming-UI
- `tx-approval-modal.tsx` — Plain-English Tx Approval mit ENS + Calldata
- `onboarding-flow.tsx` — 4-Step Wizard (intro / username / cosmic / done)

---

## Voraussetzungen

- **Node.js** ≥ 20 (LTS, ideally 22)
- **pnpm** ≥ 9 (`npm install -g pnpm`)
- **Git** ≥ 2.40
- **macOS / Linux** (Windows mit WSL2)

---

## Initial Setup (einmal pro Repo) — ✅ bereits ausgeführt am 2026-05-08

```bash
# Clone
git clone https://github.com/[org]/ethtwin.git
cd ethtwin

# Scaffold wurde manuell angelegt (NICHT via create-next-app, da
# bestehende CLAUDE.md/README.md im Repo waren). Resultat ist äquivalent
# zu `pnpm create next-app@latest . --ts --tailwind --app --no-eslint`.

# Restore deps
pnpm install

# Env vars
cp .env.example .env.local
# → ALLE Keys ausfüllen (siehe nächster Abschnitt)

# Run dev
pnpm dev
# → http://localhost:3000
```

---

## .env.local — Alle Keys

```bash
# === CHAIN ===
NEXT_PUBLIC_CHAIN_ID=84532                              # Base Sepolia
NEXT_PUBLIC_BASE_RPC=https://sepolia.base.org
NEXT_PUBLIC_PARENT_DOMAIN=ethtwin.eth                 # workemon checken!

# === PRIVY ===
NEXT_PUBLIC_PRIVY_APP_ID=clxxxxx
PRIVY_APP_SECRET=xxx                                    # Server only
PRIVY_VERIFICATION_KEY=                                 # Public key from Privy Dashboard → API Keys (used by @privy-io/node verifyAuthToken)

# === LLM ===
ANTHROPIC_API_KEY=sk-ant-xxx                            # Claude Sonnet 4.6
OPENAI_API_KEY=sk-xxx                                   # Realtime Voice

# === APIFY ===
APIFY_API_KEY=apify_api_xxx
APIFY_X402_ENDPOINT=https://api.apify.com/v2/acts/{actor}/run-sync-get-dataset-items

# === ORBITPORT (cTRNG) ===
ORBITPORT_API_URL=https://api.orbitport.spacecomputer.io/v1
ORBITPORT_API_KEY=xxx                                   # von Pedro

# === NAMESTONE (für offchain ENS) ===
NAMESTONE_API_KEY=xxx                                   # https://namestone.com

# === x402 (Twin's spending key for Apify calls) ===
# Privy Smart Wallet wird typischerweise client-side genutzt für x402
# Server-side optional für Backend-Calls:
X402_SENDER_KEY=0xxxxxx                                 # nur wenn Backend selbst payt

# === DEPLOYMENT ===
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## Init-Script (parallel ausführen, 4 Personen)

### ETH-Dev — Chain Stack

```bash
# Verified packages (May 2026)
pnpm add viem@2.48.11
pnpm add @ensdomains/ensjs@4.2.2
pnpm add @scopelift/stealth-address-sdk@1.0.0-beta.5  # ⚠️ Beta!

# Test viem ENS
mkdir -p scripts
cat > scripts/test-chain.ts << 'EOF'
import { createPublicClient, http } from "viem"
import { sepolia, baseSepolia } from "viem/chains"

const sepoliaClient = createPublicClient({ chain: sepolia, transport: http() })
const baseClient = createPublicClient({ chain: baseSepolia, transport: http() })

console.log('Sepolia block:', await sepoliaClient.getBlockNumber())
console.log('Base Sepolia block:', await baseClient.getBlockNumber())

// ENS test
const addr = await sepoliaClient.getEnsAddress({ name: 'vitalik.eth' })
console.log('vitalik.eth →', addr)
EOF

pnpm tsx scripts/test-chain.ts
```

### Backend (TS) — AI + APIs + x402

> ✅ Bereits installiert. Befehle hier für Doku-Vollständigkeit.

```bash
# AI SDK v6 + Anthropic + OpenAI
pnpm add ai@6.0.176
pnpm add @ai-sdk/react@3.0.178
pnpm add @ai-sdk/anthropic@3.0.76
pnpm add @ai-sdk/openai@3.0.63
pnpm add zod

# x402 (use SCOPED v2.x, NOT unscoped v1.x!)
pnpm add @x402/fetch@2.11.0
pnpm add @x402/next@2.11.0
pnpm add @x402/evm@2.11.0
pnpm add @coinbase/x402@2.1.0

# Privy server-side (NOT server-auth — that's deprecated!)
pnpm add @privy-io/node@0.18.0

# OpenAI for Realtime
pnpm add openai

# Test Claude 4.6
cat > scripts/test-claude.ts << 'EOF'
import { generateText } from "ai"
import { anthropic } from "@ai-sdk/anthropic"

const r = await generateText({
  model: anthropic("claude-sonnet-4-6"),
  prompt: "Say 'Twin online' if you can read this."
})
console.log(r.text)
EOF

pnpm tsx scripts/test-claude.ts
```

### Frontend — UI Stack

> ✅ Privy + Framer Motion + lucide-react + sonner sind installiert.
> ✅ shadcn/ui ist initialisiert (Tailwind 4, neutral base, cosmic-purple Override in `app/globals.css`).
> ✅ Alle Tier-1 Komponenten sind gebaut.
> ⚠️ `permissionless` ist als Privy-SmartWallets-peer extra installiert.

```bash
# Privy client + Smart Wallets (+ permissionless peer) — installiert
pnpm add @privy-io/react-auth@3.23.1 permissionless

# UI deps — installiert
pnpm add framer-motion@11.18.2 lucide-react sonner clsx tailwind-merge class-variance-authority

# shadcn init + base components — bereits ausgeführt
pnpm dlx shadcn@latest init -d -f -y --no-monorepo
pnpm dlx shadcn@latest add card input dialog badge sonner scroll-area separator label -y
# (button.tsx wird vom init bereits angelegt)

# Falls weitere Komponenten gebraucht werden:
pnpm dlx shadcn@latest add tabs avatar form -y

# Dev server start
pnpm dev
```

### Pitcher / Generalist — Submission

```bash
# Devfolio Account einrichten
# https://devfolio.co/

# Repo public oder Team-Mitglieder einladen

# Vercel link
pnpm dlx vercel link
```

---

## Vercel Deployment

```bash
# Login
pnpm dlx vercel login

# Link project
pnpm dlx vercel link

# Add env vars (alle ausser NEXT_PUBLIC_*)
pnpm dlx vercel env add ANTHROPIC_API_KEY
pnpm dlx vercel env add OPENAI_API_KEY
pnpm dlx vercel env add PRIVY_APP_SECRET
pnpm dlx vercel env add APIFY_API_KEY
pnpm dlx vercel env add APIFY_X402_ENDPOINT
pnpm dlx vercel env add ORBITPORT_API_URL
pnpm dlx vercel env add ORBITPORT_API_KEY
pnpm dlx vercel env add NAMESTONE_API_KEY
pnpm dlx vercel env add X402_SENDER_KEY  # optional

# Deploy
pnpm dlx vercel --prod
```

**Recommendation:** Setup auto-deploy from `main` Branch in Vercel UI.

---

## Privy Setup (privy.io) — Step-by-Step

1. Account bei [privy.io](https://privy.io) erstellen
2. **New App → EthTwin**
3. **Settings → Login Methods:**
   - ✅ Email
   - ✅ Passkey
   - ❌ Alle anderen deaktivieren
4. **Settings → Embedded Wallets:**
   - "Create on login" → Aktiviert für "users-without-wallets"
5. **Settings → Smart Wallets:**
   - Aktivieren
   - **Provider: Kernel (ZeroDev)** ⭐ empfohlen für DX
   - Alternative: Safe (mehr Features, mehr Gas)
6. **Settings → Default Chain:** Base Sepolia
7. **Settings → Domains:** localhost:3000 + Vercel-URL hinzufügen
8. **Settings → Paymaster (optional):** Wenn Gas-Sponsoring gewünscht
9. App-ID + App-Secret in `.env.local` und Vercel kopieren

### Privy Smart Wallet Hinweis

⚠️ **Privy Smart Wallets sind NUR client-side (React/RN SDK).** Server-Logic via `@privy-io/node` ist nur für Token-Verification — Tx-Signing passiert immer client-side via Privy SDK + User's Passkey.

Code-Beispiele in `docs/12-Code-Beispiele.md`.

---

## ENS Setup — Strategie-Entscheidung in Phase 0

Workemon (`@workemon`) entscheidet mit uns in den ersten 2h welcher Pfad:

### Pfad A: NameStone offchain Subnames ⭐ EMPFOHLEN

**Pro:**
- REST API, gasless, super-fast
- Funktioniert mit Mainnet ENS Resolver (real ENS)
- Kostenlos für Hackathon-Use
- 30 Min Setup

**Con:**
- Centralized service (für Privacy/Decentralization-Story leichter Bruch)

**Setup:**
1. Account bei [namestone.com](https://namestone.com)
2. Parent-Domain registrieren oder claim (z.B. `ethtwin.eth`)
3. API-Key holen
4. POST `/api/public_v1/set-name` für jeden Subname

### Pfad B: Sepolia ENS (on-chain testnet)

**Pro:**
- Full on-chain ENS auf Sepolia
- Kostenlos
- Echter Resolver

**Con:**
- Less authentic für Demo (Sepolia statt Mainnet)
- ETH für Gas auf Sepolia (Faucet-supported)

### Pfad C: Mainnet ENS

**Pro:**
- Real ENS, real subnames, höchste Demo-Authentizität

**Con:**
- ETH-Cost (~$15-50 für Parent Domain)
- Mainnet-Tx-Signing für jede Subname-Mint

### Pfad D: Durin auf Base (L2 Subnames)

**Pro:**
- Coolest narrative — L2-native
- 30-Min Setup mit Templates
- ERC-721 Subnames

**Con:**
- 3 Smart Contracts deployen + verifizieren
- Höchstes Tech-Risiko
- Solidity-Knowledge erforderlich

### Empfehlung für 48h ohne Solidity-Erfahrung
1. **NameStone** als primary (gasless, REST, easy)
2. **Sepolia ENS** als Fallback wenn NameStone nicht klappt
3. Durin nur wenn workemon strongly empfiehlt + ETH-Dev confident

---

## Smoke-Test nach Setup

Vor Phase 1 sollte das funktionieren:

- [x] `pnpm dev` startet ohne Fehler (✅ HTTP 200 auf `/`, 2026-05-08)
- [x] `pnpm typecheck` clean (✅ tsc --noEmit, 2026-05-08 abends)
- [x] `pnpm build` clean (✅ Next.js compiled successfully in 21.2s, 13 Routes, 2026-05-08 abends)
- [x] `/api/cosmic-seed` liefert JSON (✅ HTTP 200 mit Mock-Bytes ohne Orbitport-Key)
- [x] Homepage rendert Onboarding/Chat oder Missing-Env-Hinweis je nach `NEXT_PUBLIC_PRIVY_APP_ID`
- [ ] Privy Login funktioniert (Email-Magic-Link minimal) — braucht `NEXT_PUBLIC_PRIVY_APP_ID`
- [ ] Privy Smart Wallet wird erstellt (Address sichtbar in UI)
- [ ] Claude 4.6 API-Call gibt Response zurück (`pnpm test:claude`)
- [ ] Base Sepolia + Sepolia RPC erreichbar (`pnpm test:chain`)
- [ ] viem ENS-Resolution für `vitalik.eth` klappt (Sepolia/Mainnet)
- [ ] Vercel Deploy ist live

Wenn alles ✅ → Phase 1 starten.

---

## Häufige Probleme + Fixes

| Problem | Fix |
|---|---|
| `pnpm install` Fehler | Node-Version prüfen (≥20), `rm -rf node_modules .next && pnpm install` |
| Privy "Invalid origin" | Localhost & Vercel-URL in Privy Dashboard hinzufügen |
| Claude 401 | API-Key ohne quotes, Anthropic Account Credit prüfen |
| viem fetch errors | RPC-URL korrekt? Für public RPC `https://sepolia.base.org` reicht meist |
| ENS resolve null | Domain existiert nicht oder anderer Network |
| `@privy-io/server-auth` import error | DEPRECATED — wechseln zu `@privy-io/node` |
| `parameters` not recognized in tool | AI SDK v6 nutzt `inputSchema` statt `parameters` |
| Stealth SDK throws | Beta SDK — wrap in try/catch, fallback to mock |
| x402 PAYMENT-REQUIRED loop | Erste Anfrage muss `X-APIFY-PAYMENT-PROTOCOL: X402` Header haben |
| `x402-fetch` not found | Use `@x402/fetch` (v2.x scoped), not `x402-fetch` (v1.x unscoped) |
| Realtime ephemeral key expired | Reconnect every 50s before 60s expiry |
| NameStone 401 | API key in `Authorization` header (NOT `Bearer xxx`) |
| Privy Smart Wallet not created | Enable in Dashboard → Smart Wallets, also enable embedded wallets |

---

## Tech-Stack-Quick-Reference (verified)

```
Layer            Tool                                Version       Wofür
──────────────────────────────────────────────────────────────────────────
Framework        Next.js                             15+           Frontend + API
Lang             TypeScript                          5+            alles
Style            Tailwind CSS                        4+            UI
Components       shadcn/ui                           4.7.0 (CLI)   UI components
Animation        Framer Motion                       11.18.2       Cosmic + Onboarding
Auth             @privy-io/react-auth                3.23.1        Passkey + Wallet
Auth Server      @privy-io/node                      0.18.0        Token verification
LLM              ai (Vercel AI SDK)                  6.0.176       Agent loops
LLM React        @ai-sdk/react                       3.0.178       useChat hook
LLM Provider     @ai-sdk/anthropic                   3.0.76        Claude 4.6
LLM Provider     @ai-sdk/openai                      3.0.63        Realtime Voice
Voice Direct     openai                              latest        Realtime sessions
Chain Lib        viem                                2.48.11       ETH lib
ENS              @ensdomains/ensjs                   4.2.2         Subnames + Records
Stealth          @scopelift/stealth-address-sdk      1.0.0-beta.5  EIP-5564 ⚠️ beta
x402 Client      @x402/fetch                         2.11.0        x402 client
x402 Server      @x402/next                          2.11.0        Next.js middleware
x402 EVM         @x402/evm                           2.11.0        EVM scheme
x402 Facilitator @coinbase/x402                      2.1.0         Settlement
Hosting          Vercel                              -             Frontend + APIs
```

## Verified Model IDs

```
Claude Text:     claude-sonnet-4-6                  (Anthropic API + AI SDK)
Voice:           gpt-4o-realtime-preview            (OpenAI Realtime)
Fallback Text:   claude-sonnet-4-5-20250929         (Wenn 4.6 rate-limited)
```

## Verified Smart Contract Addresses

### ERC-8004 IdentityRegistry
- **Mainnet:** `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`
- **Base Sepolia:** `0x8004A818BFB912233c491871b3d84c89A494BD9e`
- **Sepolia:** `0x8004A818BFB912233c491871b3d84c89A494BD9e`

### USDC Base Sepolia
- `0x036CbD53842c5426634e7929541eC2318f3dCF7e`

### USDC Base Mainnet  
- `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
