# 04 — Architektur (Verified May 2026)

> **Verifiziert:** Alle Lib-Versionen + API-Patterns aus echter Recherche. Code-Beispiele in `docs/12-Code-Beispiele.md`.
>
> **Stand 2026-05-08, abends:** Backend-Stack komplett gestubbt, Frontend-Komponenten + Auth-gated Homepage stehen, `pnpm build` clean. Live-Wiring (Privy-Login, NameStone-Mint, x402-Tx) hängt nur noch an gesetzten API-Keys.

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
   ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────┐ ┌──────────┐
   │ Anthropic│ │  OpenAI  │ │  Apify   │ │Orbitport │ │  Privy  │ │NameStone │
   │ Sonnet 4.6│ │(Realtime)│ │  (x402)  │ │ (cTRNG)  │ │(Wallets)│ │ (ENS)    │
   └──────────┘ └──────────┘ └──────────┘ └──────────┘ └─────────┘ └──────────┘
                     │
                     ▼
   ┌──────────────────────────────────────────────────────────┐
   │                     CHAIN LAYER                           │
   │  Mainnet/Sepolia ENS · NameStone offchain Resolver        │
   │  Base Sepolia Smart Wallet (Privy + Kernel/ZeroDev)       │
   │  ERC-8004 IdentityRegistry (0x8004A818...) on Base Sep    │
   │  EIP-5564 Stealth Address Send (Announcer + ERC-6538)     │
   │  x402 Payment Settlement (USDC via EIP-3009)              │
   └──────────────────────────────────────────────────────────┘
```

## ENS Strategy Decision Tree

We need to decide in **Phase 0 (Stunde 0-3)** with workemon:

```
                    ENS Subnames Strategy
                            │
      ┌─────────────┬───────┼───────┬─────────────┐
      ▼             ▼       ▼       ▼             ▼
  NameStone ⭐  Sepolia  Mainnet  Durin (Base)
  ──────────   ──────────  ────────  ────────────
  REST API     Free        ETH cost  30-min setup
  Gasless      Less authentic Real ENS  L2-native
  Fast         Easy        Real Subnames Cool narrative
  Centralized  No tx       Mature        Solidity req
  
  PICK if:     PICK if:    PICK if:   PICK if:
  Demo focus,  Backup +    >$50 ETH   ETH-Dev
  no ETH       authentic   budget     Solidity
                                      confident
```

**Default decision:** **NameStone** for offchain subnames unless workemon strongly recommends another path. NameStone uses CCIP-Read (ERC-3668) so subnames resolve via standard ENS resolvers worldwide.

## Datenfluss-Beispiele

### Flow 1: Onboarding (Stunde 0-1 in Demo)

```
1. User clicks "Get Started"
2. @privy-io/react-auth: Email Magic Link → Email verified
3. @privy-io/react-auth: Passkey creation prompt (FaceID/TouchID)
4. Privy creates Embedded Smart Wallet on Base Sepolia
   (Kernel/ZeroDev provider via SmartWalletsProvider)
5. /api/onboarding (server):
   - Verify Privy token via @privy-io/node
   - Call NameStone API: POST /set-name
     - Domain: twinpilot.eth
     - Name: daniel
     - Address: <smartWalletAddress>
     - Text records:
       - description, twin.persona, twin.capabilities, twin.endpoint
       - stealth-meta-address (EIP-5564 format) ← our innovation
       - agent-registration[<registry>][<agentId>] = "1" ← ENSIP-25
6. Frontend: Welcome animation, "Welcome, daniel.twinpilot.eth"
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

```
1. User: "Twin, ask analyst.eth for DeFi yields"
2. Twin tool: hireAgent({ agentEnsName: "analyst.twinpilot.eth", task: "..." })
3. Backend:
   a. ENSIP-25 verification:
      - Build interopAddr = ERC-7930(ERC-8004 IdentityRegistry, Base Sepolia)
      - viem.getEnsText({ 
          name: "analyst.twinpilot.eth", 
          key: `agent-registration[${interopAddr}][${analystId}]` 
        })
      - If non-empty → ✓ ENSIP-25 verified
   b. Read endpoint from twin.endpoint Text Record
   c. @x402/fetch POST to analyst's endpoint
      - Pay >$1 USDC via x402 protocol
4. Analyst.eth endpoint:
   - @x402/next paymentMiddleware validates payment
   - Runs its own logic (Apify x402 sub-call possible!)
   - Returns response
5. Twin synthesizes answer with own context
6. UI shows:
   - "Twin → analyst.eth ✓ ENSIP-25 verified"
   - "x402 payment: $1.00 USDC" (with tx link)
   - Streamed response
```

## Datei-Struktur

```
twinpilot/
├── app/
│   ├── (auth)/
│   │   ├── onboarding/page.tsx
│   │   └── login/page.tsx
│   ├── (twin)/
│   │   ├── page.tsx                # Main chat / voice UI
│   │   └── settings/page.tsx
│   ├── api/
│   │   ├── twin/route.ts           # AI agent loop (Claude 4.6 + tools)
│   │   ├── voice/route.ts          # OpenAI Realtime ephemeral key minter
│   │   ├── twin-tool/route.ts      # Tool execution proxy from voice
│   │   ├── x402/route.ts           # x402 client wrapper for Apify
│   │   ├── ens/route.ts            # ENS read/write helpers
│   │   ├── stealth/route.ts        # EIP-5564 helpers
│   │   ├── cosmic-seed/route.ts    # Orbitport proxy + caching
│   │   ├── onboarding/route.ts     # Privy verify + NameStone subname creation
│   │   └── agents/
│   │       └── analyst/route.ts    # x402-enabled sample agent (with @x402/next)
│   ├── providers.tsx               # PrivyProvider + SmartWalletsProvider wrapper
│   ├── layout.tsx
│   └── globals.css
├── components/
│   ├── ui/                         # shadcn components (button, card, input,
│   │                               # dialog, badge, sonner, scroll-area,
│   │                               # separator, label) — installed
│   ├── twin-chat.tsx               # ✅ useChat from @ai-sdk/react v6 +
│   │                               #    DefaultChatTransport, tool-call pills,
│   │                               #    empty-state prompts
│   ├── twin-voice.tsx              # ⏳ useVoice WebRTC hook usage (Phase 2)
│   ├── cosmic-orb.tsx              # ✅ Hero animation (Framer Motion) +
│   │                               #    useCosmicSeed() hook
│   ├── tx-approval-modal.tsx       # ✅ Plain-English summary, ENS-aware,
│   │                               #    calldata drawer, explorer link
│   ├── ens-name-display.tsx        # ⏳ inline reverse-resolve helper (Phase 1)
│   └── onboarding-flow.tsx         # ✅ 4-step wizard wraps CosmicOrb hero
├── hooks/
│   └── useVoice.ts                 # WebRTC + ephemeral key reconnect
├── lib/
│   ├── ens.ts                      # ENS read (viem)
│   ├── ensip25.ts                  # ENSIP-25 verification + ERC-7930 helper
│   ├── namestone.ts                # NameStone API client
│   ├── stealth.ts                  # EIP-5564 + cosmic seed injection
│   ├── cosmic.ts                   # Orbitport client with cache
│   ├── x402-client.ts              # @x402/fetch wrapper
│   ├── twin-tools.ts               # AI SDK tool implementations
│   ├── viem.ts                     # viem clients (Sepolia, Base Sepolia)
│   ├── privy-server.ts             # @privy-io/node token verification
│   └── prompts.ts                  # System prompts (loaded from ENS)
├── public/
│   └── (sounds, satellite icons)
├── scripts/
│   ├── test-chain.ts               # Smoke test
│   ├── test-claude.ts              # LLM test
│   ├── test-stealth.ts             # Stealth SDK spike
│   └── warm-cosmic-cache.ts        # Pre-demo cache fill
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
│   ENS (Sepolia/Mainnet/NameStone)        │
│   daniel.twinpilot.eth                   │
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
| API Keys (Anthropic, OpenAI, Apify, Orbitport, NameStone) | ❌ | ✅ Vercel env vars only |
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
| ENS subname creation (NameStone) | <2s | ✅ REST API, gasless |
| ENS subname creation (on-chain) | <30s | ✅ one-time onboarding cost |
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
| ENS Durin (if chosen) | h40 | Pivot to NameStone or Sepolia ENS |
| Privy Smart Wallet | NEVER | If broken, hackathon over |
| ENS Text Records read | NEVER | If broken, hackathon over |
