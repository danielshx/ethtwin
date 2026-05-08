# 11 — Tech-Verifikation (Stand May 2026)

> Diese Datei dokumentiert was wir verifiziert haben + welche Risiken bekannt sind. Bei Problemen während des Hackathons: zuerst hier reinschauen.

---

## ✅ Verifizierte Package-Versionen (npm view, Mai 2026)

| Package | Version | Status | Notes |
|---|---|---|---|
| `next` | 15+ | ✅ stable | App Router |
| `react` | 19+ | ✅ stable | with Next.js 15 |
| `tailwindcss` | 4+ | ✅ stable | latest stable |
| `framer-motion` | 11+ | ✅ stable | for animations |
| `viem` | 2.48.11 | ✅ stable | ENS helpers built-in |
| `@ensdomains/ensjs` | 4.2.2 | ✅ stable | write helpers |
| `@scopelift/stealth-address-sdk` | **1.0.0-beta.5** | ⚠️ **BETA** | EIP-5564 — handle with care |
| `ai` (Vercel AI SDK) | 6.0.176 | ✅ stable | **v6 syntax — uses `inputSchema`** |
| `@ai-sdk/anthropic` | 3.0.76 | ✅ stable | Claude provider |
| `@ai-sdk/openai` | 3.0.63 | ✅ stable | OpenAI provider |
| `@ai-sdk/react` | 3.0.178 | ✅ stable | useChat hook |
| `@privy-io/react-auth` | 3.23.1 | ✅ stable | Client SDK |
| `@privy-io/node` | 0.18.0 | ✅ stable | **Server SDK — NEW (use this)** |
| `@privy-io/server-auth` | 1.32.5 | ⚠️ **DEPRECATED** | Use `@privy-io/node` |
| `@coinbase/x402` | 2.1.0 | ✅ stable | Facilitator |
| `@x402/fetch` | 2.11.0 | ✅ stable | x402 client (USE THIS) |
| `@x402/next` | 2.11.0 | ✅ stable | x402 server middleware |
| `@x402/evm` | 2.11.0 | ✅ stable | EVM scheme |
| `x402-fetch` | 1.2.0 | ❌ **DON'T USE** | Older Coinbase v1 |
| `x402-next` | 1.2.0 | ❌ **DON'T USE** | Older Coinbase v1 |
| `openai` | latest | ✅ stable | Realtime API |
| `shadcn` (CLI) | 4.7.0 | ✅ stable | Component installer |
| `permissionless` | latest | ⚠️ extra peer dep | Privy SmartWallets braucht es (sonst Module-not-found beim `pnpm dev`) |

### Verified Model IDs

| Service | Model ID | Notes |
|---|---|---|
| Anthropic (Twin chat) | `claude-sonnet-4-6` | 1M context, $3/$15 per M tokens |
| Anthropic Fallback | `claude-sonnet-4-5-20250929` | Wenn 4.6 rate-limited |
| OpenAI Realtime (voice) | `gpt-4o-realtime-preview` | Ephemeral keys expire in 60s |

---

## 🎯 Verifizierte Smart Contract Addresses

### ERC-8004 IdentityRegistry (für ENSIP-25)
- **Mainnet:** `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`
- **Base Sepolia:** `0x8004A818BFB912233c491871b3d84c89A494BD9e`
- **Sepolia:** `0x8004A818BFB912233c491871b3d84c89A494BD9e`

### USDC
- **Base Sepolia:** `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- **Base Mainnet:** `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`

---

## 🎯 Standards Check (verified)

| Standard | Status | Implementation |
|---|---|---|
| **ENSIP-5** (Text Records) | ✅ Mature | Standard text record system |
| **ENSIP-12** (Avatar) | ✅ Mature | Use for avatar field |
| **ENSIP-25** (AI Agent Identity) | ✅ Released 2025/2026 | Implement as `agent-registration[<reg>][<id>]` text record |
| **EIP-5564** (Stealth Addresses) | ✅ Standard | Via ScopeLift SDK |
| **ERC-6538** (Stealth Meta Registry) | ✅ Standard | Reference for our ENS-stored meta-key |
| **ERC-8004** (IdentityRegistry) | ✅ **Live mainnet 29.1.2026** | Used by ENSIP-25 |
| **ERC-7930** (Interoperable Address) | ✅ Used in ENSIP-25 | Registry address format |
| **EIP-3009** (Authorize Token Transfer) | ✅ Standard | x402 USDC payments use this |
| **EIP-4337** (Account Abstraction) | ✅ Standard | Privy Smart Wallets |

---

## 🌐 ENS Strategy: NameStone empfohlen

Nach Recherche ist **NameStone** die beste Option für 48h-Hackathon:

**Pro:**
- REST API: `POST /api/public_v1/set-name`
- Gasless (CCIP-Read / ERC-3668)
- Kostenlos für Hackathon
- 30 Min Setup
- Works mit Standard ENS Resolver weltweit

**Con:**
- Centralized service (leichter Bruch für Privacy-Story, aber für Demo OK)

**Setup:**
1. Account bei [namestone.com](https://namestone.com)
2. Parent-Domain registrieren oder claim (z.B. `ethtwin.eth`)
3. API-Key holen
4. POST `/api/public_v1/set-name` für jeden Subname

**Alternative:**
- Sepolia ENS (on-chain testnet) — works but less authentic
- Mainnet ENS — costs ETH but most authentic
- Durin (L2) — coolest narrative but Solidity needed

---

## 🚨 Bekannte Risiken & Workarounds

### 1. `@scopelift/stealth-address-sdk` ist Beta
**Risiko:** API kann sich geändert haben.

**Workaround:**
- Phase 0: 1h Spike-Test mit Sample-Code aus GitHub README
- Verified API surface: `generateStealthAddress`, `computeStealthKey`, `checkStealthAddress`, `VALID_SCHEME_ID`
- Wenn API anders ist: Fork wrapping mit eigener Schnittstelle in `lib/stealth.ts`
- Backup: manuelle EIP-5564 Implementierung mit `@noble/curves/secp256k1`
- **Demo-Fallback:** mock in `lib/stealth-mock.ts`

### 2. Apify x402 Mindestbetrag $1 USDC
**Risiko:** Originale Demo-Idee war "$0.20" — funktioniert nicht.

**Workaround:**
- Demo-Skript zeigt $1+ USDC Tx
- Smart Wallet muss min $5 USDC haben (5 demo calls Buffer)

### 3. Apify x402 Chain (Sepolia vs. Mainnet)
**Risiko:** Apify x402 könnte nur auf Base Mainnet laufen, nicht Sepolia.

**Workaround:**
- **Phase 0:** Mit Jakub klären
- Falls nur Mainnet: Smart Wallet auf Mainnet provisionieren
- Falls nur Mainnet UND wir Sepolia ENS nutzen: Demo zeigt cross-chain story

### 4. Privy Smart Wallets sind nur Client-Side
**Workaround:**
- `@privy-io/node` für Token-Verification only
- Wallet-Logik (Signing, Tx) immer client-side via `@privy-io/react-auth`
- Server Routes verifizieren User Token, dann triggern Client-Side Tx

### 5. OpenAI Realtime Ephemeral Key Expiry (60s)
**Workaround:**
- Client-Side: re-fetch ephemeral key alle 50s
- WebRTC: nahtlose Renegotiation
- Demo: vorab ein frisches Key-Pair direkt vor Demo-Start ziehen

### 6. cTRNG API möglicherweise langsam
**Workaround:**
- Cache-Strategy: 5-10 frische cTRNG-Samples vor Demo prefetchen
- In `lib/cosmic.ts`: rolling cache mit 60s TTL
- Demo zeigt "live request" auch wenn cached (attestation ist trotzdem echt)

### 7. ENS Subnames Strategy
**Workaround:**
- **Phase 0 ENS-Booth Pflicht:** Mit workemon entscheiden
- Default: NameStone offchain
- Backup: Sepolia ENS
- Stretch: Durin auf Base

### 8. AI SDK v5 → v6 Syntax-Breaking-Changes
**Workaround:**
- Tools: `inputSchema` (v6) statt `parameters` (v5)
- Verifiziert mit AI SDK v6.0.176 Docs
- Tutorials online sind oft v5

### 9. x402 Package Verwirrung
**Risiko:** Zwei Generationen existieren parallel:
- `x402-fetch` v1.2.0 (alt, Coinbase)
- `@x402/fetch` v2.11.0 (neu, x402-foundation)

**Workaround:**
- **Immer @x402/fetch v2.x verwenden**
- Code-Beispiele online checken auf Generation
- Migration Guide bei Coinbase Docs

### 10. ENSIP-25 ist frischer Standard
**Risiko:** Spec könnte sich noch ändern, viele Implementierungen experimentell.

**Workaround:**
- workemon direkt fragen wenn Format unklar
- ERC-7930 Format encoding ist komplex — Hilfsfunktion in `lib/ensip25.ts`
- Implementation conservative — nur was Spec sagt

### 11. ERC-7930-Encoder in `lib/ensip25.ts` ist Best-Effort
**Risiko:** `encodeInteropAddress()` ist mein eigener Pack-Layout (`uint16+uint16+uint8+bytes4+uint8+address`). Die Bytes-Reihenfolge wurde **nicht** gegen die ENSIP-25-Reference-Impl validiert.

**Workaround:**
- Vor Bounty-Submission: Output gegen ENSIP-25-Reference oder workemon's eigene Encoder-Funktion vergleichen.
- Bei Mismatch: Layout in `lib/ensip25.ts` anpassen — alle Aufrufer (`onboarding`, `twin-tools.hireAgent`) nutzen die Funktion zentral.

### 12. Privy v3 Embedded-Wallet-Config ist nested
**Risiko:** Privy v3 hat das Config-Schema umgebaut: `embeddedWallets.createOnLogin` (v2) heißt jetzt `embeddedWallets.ethereum.createOnLogin`. Stille Type-Errors wenn man v2-Snippets pasted.

**Workaround:** `app/providers.tsx` zeigt das v3-Pattern. Beim Hinzufügen weiterer Chains: gleicher Block unter `embeddedWallets.solana` etc.

### 13. `@privy-io/node` v0.18 hat keine `PrivyClient`-Klasse mehr
**Risiko:** v0.18 exportiert freie Funktionen (`verifyAuthToken`, `verifyAccessToken`) statt `new PrivyClient()`. Tutorials für ältere Versionen schlagen fehl.

**Workaround:** `lib/privy-server.ts` nutzt das neue Pattern. Setze `PRIVY_VERIFICATION_KEY` (aus Privy-Dashboard → API Keys) — die Lib akzeptiert PEM-String, `CryptoKey` oder `JWTVerifyGetKey`.

### 14. `permissionless` ist Privy-SmartWallets-peer und muss extra installiert werden
**Risiko:** `@privy-io/react-auth/smart-wallets` importiert `permissionless`, `permissionless/accounts`, `permissionless/clients/pimlico` — fehlt in deren `dependencies`, daher beim `pnpm dev` "Module not found".

**Workaround:** `pnpm add permissionless` (bereits gemacht). Falls Privy in einer späteren Version es als hard dependency listet, kann es entfernt werden.

### 15. `@x402/next` Peer-Warning für `next@^16`
**Risiko:** Das Paket warnt `unmet peer next@^16.0.10: found 15.5.18` beim Install. Bisher kein Runtime-Bruch.

**Workaround:** Ignorieren bis Build/Dev tatsächlich kaputt geht. Falls ja: entweder Next 16 upgrade oder `@x402/next` durch direkten Aufruf der Facilitator-API ersetzen.

---

## 🔧 Quick-Verifikations-Befehle

Vor Hackathon-Start ausführen:

```bash
# Check all key packages exist + versions
npm view @scopelift/stealth-address-sdk version
npm view @coinbase/x402 version
npm view @x402/fetch version
npm view @x402/next version
npm view @x402/evm version
npm view @privy-io/node version
npm view @privy-io/react-auth version
npm view @ai-sdk/anthropic version
npm view @ai-sdk/react version
npm view ai version
npm view viem version
npm view @ensdomains/ensjs version
npm view openai version

# Quick API check — Anthropic
curl -X POST https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model":"claude-sonnet-4-6","max_tokens":50,"messages":[{"role":"user","content":"hi"}]}'

# OpenAI Realtime check (mint ephemeral key)
curl -X POST https://api.openai.com/v1/realtime/sessions \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o-realtime-preview"}'

# Base Sepolia RPC check
curl -X POST https://sepolia.base.org \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'

# ERC-8004 IdentityRegistry on Base Sepolia exists check
curl -X POST https://sepolia.base.org \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_getCode","params":["0x8004A818BFB912233c491871b3d84c89A494BD9e","latest"],"id":1}'
```

---

## 📋 Pre-Hackathon-Checkliste (1-2h vor Start)

- [ ] **ENS Domain:** `ethtwin.eth` Verfügbarkeit + Namestone-Account
- [ ] **Lib-Versionen:** `npm view` für alle 13 packages durchgelaufen
- [ ] **API-Keys beschafft:**
  - [ ] Anthropic API Key + Credit
  - [ ] OpenAI API Key + Realtime Access
  - [ ] Privy Account + App-ID/Secret + Smart Wallets enabled
  - [ ] Apify Account
  - [ ] Orbitport (von Pedro)
  - [ ] NameStone API Key
- [ ] **Mentor-Pings raus** an alle 4 (Pedro, workemon, Jakub, Francesco)
- [ ] **Voice-Spike-Test:** 1h OpenAI Realtime + Tool-Call basic getestet
- [ ] **Stealth-SDK-Spike-Test:** 1h `@scopelift/stealth-address-sdk` Beta probiert
- [ ] **x402 Spike-Test:** 1h `@x402/fetch` v2.x mit Apify Sandbox
- [ ] **Devfolio-Account** erstellt + Team-Slot gebucht
- [ ] **Drop-Regeln-Commit:** alle 4 Team-Mitglieder lesen `docs/08-Drop-Regeln.md` + sagen "ja"

---

## 🏆 Strategische Wins aus dieser Verifikation

1. **ENSIP-25** ist **offizieller** Standard für AI Agent Identity in ENS — wir implementieren ihn nativ. Riesiger ENS-Bounty-Boost.
2. **ERC-8004 IdentityRegistry** ist **live auf Mainnet seit 29.01.2026** — wir nutzen die echte deployed contract.
3. **`stealth-meta-address`** in ENS Text Records ist NICHT spezifiziert — wir können das als "creative use" für ENS Bounty 2 framen.
4. **Coinbase x402** ist **production-ready** (119M+ Tx, Stripe nutzt es seit Feb 2026).
5. **@x402/fetch v2.x** ist die korrekte Generation (nicht das ältere `x402-fetch` v1.x).
6. **Claude Sonnet 4.6** mit 1M context ist deutlich besser für Plain-English-Tx-Decoding als 4.5.
7. **NameStone offchain** ENS Subnames sind die clever-Easy Lösung für 48h.
8. **Privy Smart Wallets via Kernel** ist die fastest DX für Account Abstraction in 48h.

## 📚 Sources

Alle Findings basieren auf Web-Recherche + npm view im Mai 2026:

- [ENSIP-25 Spec](https://ens.domains/blog/post/ensip-25)
- [ERC-8004 Contracts Repo](https://github.com/erc-8004/erc-8004-contracts)
- [ERC-8004 EIP](https://eips.ethereum.org/EIPS/eip-8004)
- [ScopeLift Stealth SDK](https://github.com/ScopeLift/stealth-address-sdk)
- [Coinbase x402 Docs](https://docs.cdp.coinbase.com/x402/welcome)
- [Apify x402 Integration](https://docs.apify.com/platform/integrations/x402)
- [Privy Smart Wallets](https://docs.privy.io/wallets/using-wallets/evm-smart-wallets/overview)
- [Anthropic Claude 4.6](https://www.anthropic.com/news/claude-sonnet-4-6)
- [OpenAI Realtime WebRTC](https://platform.openai.com/docs/guides/realtime-webrtc)
- [Vercel AI SDK Tools](https://ai-sdk.dev/docs/foundations/tools)
- [AI SDK v6 Migration](https://ai-sdk.dev/docs/migration-guides/migration-guide-6-0)
- [Durin (L2 ENS Subnames)](https://durin.dev/)
- [NameStone](https://namestone.com/)
- [NameStone API Example](https://github.com/namestonehq/namestone-example)
- [OpenAI Realtime Next.js Example](https://github.com/cameronking4/openai-realtime-api-nextjs)
- [Privy + ZeroDev Example](https://github.com/privy-io/zerodev-example)
