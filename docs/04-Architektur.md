# 04 — Architektur (Verified May 2026)

> **Verifiziert:** Alle Lib-Versionen + API-Patterns aus echter Recherche. Code-Beispiele in `docs/12-Code-Beispiele.md`.
>
> **Stand 2026-05-09:** Onboarding live (mintet Sepolia-ENS-Subname + 7 Text Records + ENSIP-25 + agents.directory in 1 multicall), 5-Tab-UI (Chat / Messenger / Send Tokens / Stealth Send / History), Cosmic-Orb-Hero im Stealth-Send-Tab, `pnpm ens:provision-analyst` für den Sample-Agent. `pnpm build` clean. Live-Wiring (Privy-Login, x402-Tx) hängt nur noch an gesetzten API-Keys + funded dev wallet.

## High-Level Diagramm

```
┌──────────────────────────────────────────────────────────┐
│                      USER (Browser PWA)                   │
│  ┌────────────────────────────────────────────────────┐  │
│  │  Next.js 15 App Router · Tailwind 4 · shadcn/ui    │  │
│  │  @privy-io/react-auth + SmartWalletsProvider       │  │
│  │  Framer Motion 11 (CosmicOrb hero animation)       │  │
│  │  ┌─ Auth-gated state machine (app/page.tsx) ────┐  │  │
│  │  │ landing → OnboardingFlow → TwinChat          │  │  │
│  │  │ (session persisted in localStorage)           │  │  │
│  │  └───────────────────────────────────────────────┘  │  │
│  │  WebRTC peer to OpenAI Realtime (Phase 2)          │  │
│  │  @ai-sdk/react useChat + DefaultChatTransport      │  │
│  └────────────────────────────────────────────────────┘  │
└────────────────────┬─────────────────────────────────────┘
                     │ HTTPS / WSS / WebRTC
                     ▼
┌──────────────────────────────────────────────────────────┐
│              VERCEL API ROUTES (Edge / Node)              │
│  @privy-io/node (token verification)                      │
│  ai 6.0.176 + @ai-sdk/anthropic 3.0.76 (Claude 4.6)       │
│  @x402/fetch (client) + @coinbase/x402 (facilitator)      │
│  viem + @ensdomains/ensjs (ENS Text Records)              │
│  openai (Realtime ephemeral key minting)                  │
└────────────────────┬─────────────────────────────────────┘
                     │
        ┌────────────┼────────────┬──────────┬─────────────┬──────────────┐
        ▼            ▼            ▼          ▼             ▼              ▼
   ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────┐
   │ Anthropic│ │  OpenAI  │ │  Apify   │ │Orbitport │ │  Privy  │
   │ Sonnet 4.6│ │(Realtime)│ │  (x402)  │ │ (cTRNG)  │ │(Wallets)│
   └──────────┘ └──────────┘ └──────────┘ └──────────┘ └─────────┘
                     │
                     ▼
   ┌──────────────────────────────────────────────────────────┐
   │                     CHAIN LAYER                           │
   │  Sepolia ENS direct (ethtwin.eth + every twin as subname) │
   │  Base Sepolia (USDC stealth sends + x402 settlement)      │
   │  Privy Embedded Smart Wallet (Kernel/ZeroDev)             │
   │  ERC-8004 IdentityRegistry (0x8004A818...) on Base Sep    │
   │  EIP-5564 Stealth Address Send (cosmic-seeded ephemerals) │
   │  x402 Payment Settlement (USDC via EIP-3009)              │
   └──────────────────────────────────────────────────────────┘
```

## ENS Strategy Decision (entschieden 2026-05-08)

**Gewählt: on-chain Sepolia ENS direkt.** Wir besitzen `ethtwin.eth` auf Sepolia
mit der dev wallet als Registry-Owner und mintet jeden Twin als echten
Sub-NFT-Subname. Das gibt uns:

- ✅ Echtes ENS, keine CCIP-Read-Abhängigkeit
- ✅ Volle Multicall-Kontrolle über den Resolver (1 Tx für addr + 7 Text-Records + agents.directory)
- ✅ Subnames sind selber wieder Parents — daher der ENS-Messenger:
  jede Nachricht ist `msg-<ts>-<seq>.<recipient>.ethtwin.eth` mit `from/body/at` Records
- ⚠ Kostet Sepolia-Gas (kostenlos, aber rate-limited)

**NameStone (`lib/namestone.ts`)** bleibt als Backup-Pfad eingecheckt, ist aber
aktuell ungenutzt — falls Sepolia-RPCs während des Hackathons rumzicken,
können wir notfalls dorthin pivotieren.

Andere Optionen die wir verworfen haben: Mainnet (zu teuer), Durin (Solidity-Effort
für 48h zu hoch), reine NameStone (kein on-chain Messenger möglich).

## Datenfluss-Beispiele

### Flow 1: Onboarding (Stunde 0-1 in Demo)

```
1. User clicks "Get Started"
2. @privy-io/react-auth: Email Magic Link → Email verified
3. @privy-io/react-auth: Passkey creation prompt (FaceID/TouchID)
4. Privy creates Embedded Smart Wallet on Base Sepolia
   (Kernel/ZeroDev provider via SmartWalletsProvider)
5. /api/onboarding (server, maxDuration=60s):
   - Verify Privy token via @privy-io/node
   - createSubname on Sepolia ENS Registry (1 tx, dev wallet = registry owner)
   - setRecordsMulticall on PublicResolver — batches addr + all text records
     into ONE multicall tx instead of 9 sequential calls (critical for fitting
     under Vercel Hobby's 60s function timeout):
       - addr → smartWalletAddress
       - description, twin.persona, twin.capabilities, twin.endpoint, twin.version
       - stealth-meta-address (EIP-5564 format) ← our innovation
       - agent-registration[<registry>][<agentId>] = "1" ← ENSIP-25
   - addAgentToDirectory (1 tx, idempotent)
   Total: 3 txs on Sepolia (~30–40s) instead of ~10 (~1–2 min).
6. Frontend: Welcome animation, "Welcome, daniel.ethtwin.eth"
```

### Flow 2: Voice → x402 → Twin Response

```
1. User holds button, speaks: "Was ist sentiment auf $XYZ?"
2. Frontend: useVoice hook
   - POST /api/voice → mints OpenAI ephemeral key (60s TTL)
   - Establish WebRTC peer to api.openai.com/v1/realtime
3. OpenAI Realtime detects intent → calls registered tool 'requestDataViaX402'
4. Frontend dispatches tool_call event to /api/twin-tool
5. Backend tool execution:
   - @x402/fetch wraps fetch with payment ability
   - Apify endpoint returns 402 + PAYMENT-REQUIRED
   - SDK auto-signs payload, resends with PAYMENT-SIGNATURE
   - Apify settles tx on Base via EIP-3009 transferWithAuthorization
   - Returns scraped data ($1 USDC charged)
6. Tool result sent back via WebRTC data channel
7. Twin's LLM (Claude 4.6 — used in OpenAI's Realtime context) synthesizes
8. OpenAI Realtime TTS streams response back to Frontend audio
9. UI shows transcript + Block-Explorer link to x402 tx
```

### Flow 3: Stealth Address Generation (Demo Hero-Moment)

```
1. User: "Send 50 USDC to mom.eth privately"
2. Twin tool: generatePrivatePaymentAddress({ recipientEnsName: "mom.eth" })
3. Backend (/api/stealth):
   - viem.getEnsText({ name: "mom.eth", key: "stealth-meta-address" })
   - getCosmicSeed() → Orbitport API → fresh cTRNG bytes + attestation
   - @scopelift/stealth-address-sdk:
     generateStealthAddress({ stealthMetaAddressURI: metaKey })
     → { stealthAddress, ephemeralPublicKey, viewTag }
4. Frontend (parallel):
   - <CosmicOrb /> Animation triggered
   - "Requesting entropy from OrbitPort-3..."
   - Live byte stream visualization
   - Attestation hash, clickable
5. Backend returns:
   - Stealth address, ephemeral pub key
   - Plain English summary (LLM-decoded)
6. Tx Approval Modal (shadcn Dialog) → 
   Privy Passkey signing via useSmartWallets().client.sendTransaction
7. Smart Wallet sends Tx via Privy → broadcast on Base Sepolia
8. UI: success toast + Block-Explorer link
9. Recipient detection: mocked for demo (real ERC-5564 Announcer scan)
```

### Flow 4: Agent-to-Agent x402 with ENSIP-25 Verification

Implementiert als zwei zusammenarbeitende AI-SDK-v6-Tools (`lib/twin-tools.ts`)
plus paywalled Sample-Agent (`app/api/agents/analyst/route.ts`).

```
1. User: "Twin, find an analyst that can summarise this address"
2. Twin tool: findAgents({ agentId: 1 })
   - lib/agents.ts → readAgentDirectory() liest agents.directory text record
     auf ethtwin.eth (JSON-Liste { ens, addedAt }, max 100 Einträge)
   - Pro Eintrag: readTwinRecords(ens) + verifyAgentRegistration(...)
   - UI: Tool-Call-Pill zeigt "N agents · K verified" + Liste mit Shield-Icons
3. User pickt einen — Twin tool: hireAgent({ agentEnsName, agentId, task })
   a. ENSIP-25 verify:
      - encodeInteropAddress(ERC-8004 IdentityRegistry, Base Sepolia 84532)
      - readTextRecord(name, `agent-registration[${interopAddr}][${agentId}]`)
      - "1" → ✓ verified, sonst unverified-Badge
   b. Read twin.endpoint Text Record
   c. paidFetch() POST { task } an endpoint (auto-pays HTTP 402 challenge,
      X402_SENDER_KEY/DEV_WALLET_PRIVATE_KEY signs)
4. /api/agents/analyst:
   - withX402(handler, routeConfig, x402ResourceServer) wenn
     X402_ANALYST_PAY_TO gesetzt — sonst free in dev
   - facilitator: Coinbase x402 facilitator (@coinbase/x402)
   - Nach erfolgreicher Settlement: Claude Sonnet 4.6 generiert Antwort
   - Response: { agent, answer }
5. UI rendert:
   - Tool-Call-Pill mit Agent-ENS + ✓ ENSIP-25 verified Badge
   - Grünen "agent replied" Block mit der Antwort (AgentDetail in twin-chat.tsx)
6. Twin synthesisiert eigene Antwort im weiteren Verlauf
```

### Tool-Surface (`lib/twin-tools.ts`)

| Tool | Zweck |
|---|---|
| `getWalletSummary` | Balances + ENS-Reverse für eine Adresse |
| `requestDataViaX402` | Apify-Actor via `paidFetch()` aufrufen |
| `decodeTransaction` | Calldata → Plain-English |
| `sendToken` / `getBalance` | Native ETH / USDC senden bzw. lesen |
| `sendStealthUsdc` | EIP-5564-USDC-Transfer auf Base Sepolia |
| `generatePrivatePaymentAddress` | One-time Stealth-Adresse aus Recipient-Meta-Key |
| **`findAgents`** | On-chain Agent-Directory + ENSIP-25-Status |
| **`hireAgent`** | ENSIP-25 verify → `paidFetch()` an `twin.endpoint` |

## Datei-Struktur

```
ethtwin/
├── app/
│   ├── (auth)/
│   │   ├── onboarding/page.tsx
│   │   └── login/page.tsx
│   ├── (twin)/
│   │   ├── page.tsx                # Main chat / voice UI
│   │   └── settings/page.tsx
│   ├── api/
│   │   ├── twin/route.ts           # AI agent loop (Claude 4.6 + buildTwinTools factory)
│   │   ├── voice/route.ts          # OpenAI Realtime ephemeral key minter
│   │   ├── twin-tool/route.ts      # Tool execution proxy (legacy voice path)
│   │   ├── x402/route.ts           # x402 client wrapper for Apify
│   │   ├── ens/route.ts            # ENS read/write helpers
│   │   ├── stealth/route.ts        # EIP-5564 stealth-address generator
│   │   ├── stealth/send/route.ts   # Privy-gated USDC stealth send (1 USDC cap)
│   │   ├── cosmic-seed/route.ts    # Orbitport proxy + caching
│   │   ├── onboarding/route.ts     # Privy verify → 1 multicall (subname + 7 records + ENSIP-25 + agents.directory)
│   │   ├── messages/route.ts       # ENS-Subname-Messenger (POST send + GET inbox)
│   │   ├── transfer/route.ts       # Privy-gated multichain ETH/USDC transfer
│   │   ├── wallet-summary/route.ts # Read balances + ENS reverse for an address
│   │   ├── history/route.ts        # Server-side history per ENS
│   │   ├── check-username/route.ts # Polled by frontend after onboarding
│   │   ├── agent/[ens]/route.ts    # Full agent profile (avatar, persona, capabilities)
│   │   └── agents/
│   │       ├── route.ts            # GET on-chain agent directory (enriched with avatar/description)
│   │       └── analyst/route.ts    # x402-paywalled sample agent (withX402 + Coinbase facilitator)
│   ├── providers.tsx               # PrivyProvider + SmartWalletsProvider wrapper
│   ├── layout.tsx
│   └── globals.css
├── components/
│   ├── ui/                         # shadcn primitives
│   ├── twin-chat.tsx               # ✅ useChat + ENSIP-25 verified-badge + sendMessage rendering
│   ├── messenger.tsx               # ✅ ENS-Subname-Messenger UI (one subname per message)
│   ├── token-transfer.tsx          # ✅ Multichain ETH/USDC send w/ hard caps
│   ├── stealth-send.tsx            # ✅ HERO TAB: CosmicOrb during EIP-5564 USDC send
│   ├── history.tsx                 # ✅ Hybrid local + server history viewer
│   ├── agent-profile.tsx           # ✅ Avatar + Persona + Capabilities + Stealth-Meta dialog
│   ├── cosmic-orb.tsx              # ✅ Framer-Motion hero (idle/fetching/revealed phases)
│   ├── tx-approval-modal.tsx       # ✅ Plain-English summary, ENS-aware
│   └── onboarding-flow.tsx         # ✅ 4-step wizard wraps CosmicOrb hero
├── lib/
│   ├── agents.ts                   # On-chain agent directory (read/add via ENS text record)
│   ├── ens.ts                      # ENS read/write (viem) — direct Sepolia
│   ├── ensip25.ts                  # ENSIP-25 verification + ERC-7930 helper
│   ├── namestone.ts                # ⏸ Backup path — currently unused
│   ├── messages.ts                 # ENS-Subname-Messenger primitives
│   ├── transfers.ts                # Multichain ETH/USDC transfers
│   ├── payments.ts                 # Stealth USDC on Base Sepolia
│   ├── stealth.ts                  # EIP-5564 + cosmic seed injection
│   ├── cosmic.ts                   # Orbitport client with rolling cache + mock fallback
│   ├── x402-client.ts              # @x402/fetch (v2) wrapper + paidFetch()
│   ├── twin-tools.ts               # AI SDK tool surface + buildTwinTools({ fromEns }) factory
│   ├── tx-decoder.ts               # Calldata → plain English (LLM-augmented)
│   ├── wallet-summary.ts           # Address summary helper
│   ├── twin-profile.ts             # Default profile records (Pollinations.ai avatar)
│   ├── history.ts                  # Client-side history (localStorage + sync)
│   ├── history-server.ts           # File-based server history per ENS
│   ├── viem.ts                     # viem clients (Sepolia, Base Sepolia, dev wallet)
│   ├── privy-server.ts             # @privy-io/node token verification
│   ├── prompts.ts                  # System prompts (hydrated from ENS records)
│   ├── api-guard.ts                # Zod request parsing + env guards
│   └── abis.ts                     # ENS Registry / Resolver / ERC-20
├── scripts/
│   ├── test-{chain,claude,decoder,x402,x402-mock,privy-key}.ts
│   ├── ens:{check-parent,provision,provision-analyst,read,set-text,stealth-provision}
│   ├── send:{token,stealth-usdc}
│   ├── wallet:{generate,rotate}
│   ├── twins:backfill (backfill-twin-profiles.ts)
│   └── warm-cosmic-cache.ts
├── docs/
│   └── (alle .md hier)
├── .claude/
│   └── agents/
│       └── (sub-agent configs)
├── CLAUDE.md
├── README.md
├── .env.example
├── package.json
├── tsconfig.json
└── tailwind.config.ts
```

## ENS Text Records Schema (ENSIP-25 compliant)

| Key | Standard | Type | Beschreibung |
|---|---|---|---|
| `description` | ENSIP-5 | string | "Daniel's AI co-pilot" |
| `avatar` | ENSIP-12 | string | URL or NFT URI |
| `url` | ENSIP-5 | string | Twin's web profile |
| `agent-registration[<registry>][<agentId>]` | **ENSIP-25** | "1" | Links to ERC-8004 registry |
| `twin.persona` | custom | JSON-string | { tone, style, expertise } |
| `twin.capabilities` | custom | JSON-string | ["transact", "research", "stealth_send"] |
| `twin.endpoint` | custom | URL | Agent API for x402 |
| `stealth-meta-address` | **our innovation** | string | EIP-5564 format `st:eth:0x...` |
| `twin.version` | custom | string | Twin protocol version |

**For ENS Most Creative Bounty:** Our `stealth-meta-address` Text Record is novel — no official ENSIP exists yet for stealth meta-addresses in ENS. We're effectively proposing a pattern.

## ERC-8004 IdentityRegistry Integration

```
┌─────────────────────────────────────────┐
│   ENS (Sepolia, owned by ethtwin.eth)    │
│   daniel.ethtwin.eth                     │
│   Text Records:                          │
│   - agent-registration[<reg>][42] = "1"  │
└─────────────────┬────────────────────────┘
                  │ verifies
                  ▼
┌─────────────────────────────────────────┐
│   ERC-8004 IdentityRegistry              │
│   Base Sepolia: 0x8004A818BFB91...       │
│   Agent ID 42 →                          │
│   - registrationURI: ipfs://...          │
│   - owner: smartWalletAddress            │
└─────────────────────────────────────────┘
```

For 48h hackathon: We can mock the ERC-8004 entry (use a known-existing Agent ID from the registry) without minting our own. Demo just needs to show that the verification check works.

## Sicherheits-Boundaries

| Layer | Public | Server-only |
|---|---|---|
| API Keys (Anthropic, OpenAI, Apify, Orbitport) | ❌ | ✅ Vercel env vars only |
| Dev wallet private key (mints subnames + signs server-side txs) | ❌ | ✅ `DEV_WALLET_PRIVATE_KEY` env only |
| Privy App Secret | ❌ | ✅ `@privy-io/node` server validation |
| User Wallet Private Keys | ❌ | ✅ Privy custodied (TEE + sharding) |
| ENS Text Records | ✅ | (public chain data) |
| Stealth Meta-Keys | ✅ public meta only | spending key NEVER leaves Privy |
| Stealth viewing key | recipient-side | recipient-only access |

**WICHTIG:** Privy Smart Wallets sind nur in React/React Native SDKs verfügbar. Server-Logic ist nur Token-Verification, kein Wallet-Signing serverseitig.

## Performance-Ziele

| Operation | Target Latency | Status |
|---|---|---|
| Twin text response (first token) | <1s | ✅ Claude 4.6 streamText typical |
| Voice round-trip (speak → response start) | <2s | ⚠️ depends on user network + WebRTC negotiation |
| x402 Tx confirmation on Base Sepolia | <5s | ✅ Base Sepolia ~2s blocks |
| cTRNG seed delivery (with cache) | <500ms | ⚠️ to verify with Pedro |
| ENS subname creation (Sepolia, single multicall) | <30s | ✅ live: 1 createSubname + 1 multicall (addr + 7 records + agents.directory) |
| Stealth address generation | <2s | ✅ client-side compute |
| OpenAI Realtime ephemeral key mint | <500ms | ✅ |

Cache aggressively: cTRNG samples in 60s rolling window (cache 10 fresh), ENS Text Records cached 30s.

## Drop-Strategy Map

| Component | Drop time | Replacement |
|---|---|---|
| Voice (OpenAI Realtime) | h24 | Chat-only via @ai-sdk/react useChat |
| Cosmic seed (Orbitport) | h30 | Cached samples + real attestations |
| Stealth on-chain | h36 | Client-side gen only + mock visualization |
| x402 live tx | h40 | Pre-signed tx + Block-Explorer tab |
| Sepolia RPC outage | h40 | Pivot to NameStone (`lib/namestone.ts` is wired but unused) |
| Privy Smart Wallet | NEVER | If broken, hackathon over |
| ENS Text Records read | NEVER | If broken, hackathon over |
