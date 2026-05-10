# 04 — Architektur (Final, 2026-05-10)

> **Status:** Software is shipped. This doc describes the architecture as it actually exists in the repo on 2026-05-10. Earlier drafts (Privy auth, Apify x402, Orbitport cTRNG-seeded stealth) have been superseded — see "What was removed" at the bottom for the historical record.

## High-Level Diagramm

```
┌──────────────────────────────────────────────────────────┐
│                      USER (Browser PWA)                   │
│  Next.js 15 App Router · Tailwind 4 · shadcn/ui          │
│  Framer Motion 11 (Receipt-Postcard reveal + StealthSend) │
│  app/page.tsx state machine:                              │
│    landing → OnboardingFlow → SignedInTabs (chat/voice/   │
│      messages/send/history) OR MariaShell in demo mode    │
│  Cookie-based session (HMAC-signed, 7-day TTL)            │
│  WebRTC peer to OpenAI Realtime (voice tab)               │
│  @ai-sdk/react useChat (chat tab)                         │
└────────────────────┬─────────────────────────────────────┘
                     │ HTTPS · WSS · WebRTC
                     ▼
┌──────────────────────────────────────────────────────────┐
│              VERCEL API ROUTES (Node)                     │
│  ai 6.0.176 + @ai-sdk/anthropic (Claude Sonnet 4.6)       │
│  @x402/fetch (twin-to-twin) + @x402/next (paywall)        │
│  viem + @ensdomains/ensjs (ENS Text Records)              │
│  @spacecomputer-io/orbitport-sdk-ts (KMS sign)            │
│  openai (Realtime ephemeral key minting)                  │
└────────────────────┬─────────────────────────────────────┘
                     │
        ┌────────────┼────────────┬──────────────┐
        ▼            ▼            ▼              ▼
   ┌──────────┐ ┌──────────┐ ┌──────────────┐ ┌──────────┐
   │ Anthropic│ │  OpenAI  │ │ SpaceComputer│ │ Sourcify │
   │ Sonnet 4.6│ │(Realtime)│ │ Orbitport KMS│ │ (verify) │
   └──────────┘ └──────────┘ └──────────────┘ └──────────┘
                     │
                     ▼
   ┌──────────────────────────────────────────────────────────┐
   │                     CHAIN LAYER                           │
   │  Sepolia ENS direct (ethtwin.eth + every twin = subname) │
   │  Base Sepolia (USDC stealth sends + x402 settlement)      │
   │  ERC-8004 IdentityRegistry on Base Sepolia (ENSIP-25)     │
   │  ERC-5564 Announcer (stealth payment discovery)           │
   └──────────────────────────────────────────────────────────┘
```

## Auth + Identity (no Privy)

Each twin's identity = its ENS subname + its **SpaceComputer Orbitport KMS key**.

- **At mint** (`app/api/onboarding/route.ts`):
  1. `createTwinKey(label)` — KMS mints an ETHEREUM-scheme secp256k1 key. Returns `{ keyId, address, publicKey }`. Address is the keccak256 of the public key (standard EVM derivation).
  2. Server generates a recovery code, hashes it (HMAC-SHA256 keyed by `SESSION_SECRET`), and includes the hash as the `twin.login-hash` text record.
  3. Multicall on the resolver writes `addr` + 11 text records in a single tx. Public records: `description`, `avatar`, `url`, `twin.persona`, `twin.capabilities`, `twin.endpoint`, `twin.version`, `stealth-meta-address`, `agent-registration[<registry>][<agentId>]` (ENSIP-25), `twin.kms-key-id`, `twin.kms-public-key`, `twin.login-hash`.
  4. Adds the twin to `agents.directory` text record on `ethtwin.eth`.
  5. Returns the recovery code to the user (shown once, then persisted in localStorage by the same browser).

- **At login** (`app/api/session/route.ts`):
  1. User types `ens` + recovery code (auto-filled from localStorage if same browser).
  2. Server reads `twin.login-hash` from ENS, HMAC-hashes the supplied code with the same `SESSION_SECRET`, compares.
  3. On match: HTTP-only cookie issued (signed JWT-style payload `{ ens, kmsKeyId, exp }`).

- **Server-side signing** (`lib/kms.ts`):
  - `kmsAccount({ keyId, address })` returns a viem `LocalAccount`. Plug it into any `WalletClient`; `signTransaction` / `signMessage` / `signTypedData` proxy to KMS.
  - `kmsAccountForEns(ens)` resolves a twin's KMS handle from its `twin.kms-key-id` + `addr` records. Used by `sendStealthUSDC`, `sendToken`, etc., to sign as the twin's own address (not the dev wallet) when the twin is funded.
  - `kmsSignEIP191(keyId, message)` for the per-message signatures bundled into on-chain chat records.

## Datenfluss-Beispiele

### Flow 1: Onboarding (≤ 30 s)

```
1. User picks a username, lands on the OnboardingFlow wizard.
2. POST /api/onboarding { username, useKms: true }
3. Server:
   - createTwinKey(username) → KMS issues ETHEREUM key, returns { keyId, address, publicKey }
   - Recovery code generated + HMAC-hashed → twin.login-hash
   - createSubname on Sepolia ENS Registry (dev wallet = parent owner)
   - setRecordsMulticall: addr + 11 text records in one multicall
   - addAgentToDirectory (idempotent)
   - Issue HMAC cookie session
4. Frontend: animation + reveal of recovery code + KMS key panel.
```

### Flow 2: Voice → Tool → Twin Response

```
1. User holds button, speaks: "Send Tom 1 USDC".
2. POST /api/voice { ensName } → mints OpenAI Realtime ephemeral key (60s TTL)
3. WebRTC peer to api.openai.com/v1/realtime with the voice system prompt
   (narrate-before-tool-call rules + background-channel guidance).
4. OpenAI Realtime detects intent → emits response.function_call_arguments.done
5. Voice client (components/voice-twin.tsx):
   - POSTs /api/twin-tool { name: "sendStealthUsdc", input, fromEns }
   - twin-tool route runs buildTwinTools({ fromEns, fromAddress }).sendStealthUsdc.execute
   - Tool: derive stealth address from recipient's stealth-meta-address →
     KMS-signed USDC.transfer on Base Sepolia → ERC-5564 Announcement
6. Result returned via WebRTC data channel; agent narrates outcome.
7. In demo mode: ReceiptPostcard renders inline in the transcript list with
   the "Show what really happened" reveal containing the Basescan CTA.
```

### Flow 3: Stealth Send → Inbox → Claim

```
SEND (sender's twin)
1. POST /api/stealth/send { recipientEnsName, amountUsdc, chain }
2. Server:
   - Resolve recipient's stealth-meta-address text record
   - generatePrivateAddress({ stealthMetaAddressURI }) — ScopeLift SDK,
     deterministic stealth keys derived from the recipient's ENS via
     deriveTwinStealthKeys (HMAC of dev master + ENS)
   - Pick sender: KMS account if funded, else dev wallet relays
   - Sign + broadcast USDC.transfer(stealthAddress, amount) on Base Sepolia
   - Sign + broadcast ERC-5564 Announcement with metadata =
     <viewTag(1)><selector(4)><tokenAddr(20)><amount(32)>
3. Response: stealth address, ephemeral pub key, tx hashes, Basescan link.

INBOX (recipient scans for incoming)
4. GET /api/stealth/inbox?ens=<recipient>&chain=<chain>
5. Server:
   - Derive recipient's spending+viewing keys via deriveTwinStealthKeys
   - Scan ERC-5564 Announcer logs in the requested block window
   - For each announcement: isAnnouncementForMe(viewTag, ephemeralPubKey,
     viewingPrivKey) — view-tag pre-filter then full secp256k1 derivation
   - Decode metadata → token + amount
   - Live balance read at the stealth address (filters phantom announcements)
   - Resolve sender ENS by reverse-lookup against agents.directory

CLAIM (sweep funds to twin's main wallet)
6. POST /api/stealth/claim { ens, stealthAddress, ephemeralPubKey, chain, senderEns }
7. Server:
   - deriveStealthPrivateKey(ephemeralPub, spendingPriv, viewingPriv) →
     the actual private key controlling the stealth address
   - Resolve recipient's twin addr (twin.kms-public-key fallback if `addr` missing)
   - Top up the stealth address with ~0.0005 ETH from dev wallet (waitForReceipt)
   - Sign + broadcast USDC.transfer(twinAddr, balance) from the stealth address
   - Return both tx hashes + explorer URLs
```

### Flow 4: Agent-to-Agent x402 with ENSIP-25 Verification

```
1. User: "find an analyst that can summarise this address"
2. Twin tool: findAgents({ agentId: 1 }) → directory + ENSIP-25 verify
3. User picks one → Twin tool: hireAgent({ agentEnsName, agentId, task })
   a. ENSIP-25 verify via verifyAgentRegistration(name, registry, chain, agentId)
   b. Read twin.endpoint text record
   c. paidFetch() POST { task } → auto-pays HTTP 402 challenge
4. /api/agents/analyst (paywalled with @x402/next when X402_ANALYST_PAY_TO set):
   - Coinbase facilitator settles the payment
   - Claude Sonnet 4.6 generates the analyst's reply
5. UI renders tool-call pill + ENSIP-25 verified badge + agent reply card.
```

### Flow 5: ENS Messenger (text-records-on-twin)

The chat between Alice and Bob lives **directly on each side's existing twin subname** — no separate chat-subname is minted. For the `alice ↔ bob` conversation:

- `alice.ethtwin.eth` text records: `chat.bob.count`, `chat.bob.msg.<i>`, `chat.bob.participants`, `chats.list`
- `bob.ethtwin.eth` text records: `chat.alice.count`, `chat.alice.msg.<i>`, `chat.alice.participants`, `chats.list`

Encryption: AES-256-GCM, key derived via static-static ECDH on the pair's EIP-5564 spending keys (`lib/message-crypto.ts:pairKey`). Authentication: per-message KMS-EIP-191 signature (best-effort). Reader verifies the signature against the sender's `twin.kms-public-key`; mismatches show no badge but still decrypt.

Why text-records-on-twin (not separate chat-subname): newly-minted `setSubnodeRecord` subnames only know their labelhash, so ENS apps display them as `[<hash>].ethtwin.eth`. Storing chats as text records on the twin's *existing* subname keeps the readable label everywhere.

### Flow 6: Autonomous Twin-to-Twin Coordination

When twin A's user invokes `sendMessage` to twin B:
1. `lib/messages.ts:sendMessage` writes `chat.<peerLabel>.msg.<i>` records on both twins atomically via a resolver multicall.
2. `lib/twin-tools.ts:sendMessage` (the tool wrapper) fires a fire-and-forget POST to `/api/twin/auto-reply { fromEns: B, toEns: A, incomingBody, chainDepth: 1 }`.
3. `/api/twin/auto-reply`:
   - Reads B's persona + bound wallet
   - `generateText({ system, prompt: incomingBody, tools: buildTwinTools({ fromEns: B, fromAddress, chainDepth: 1 }) })` with `stopWhen: stepCountIs(4)`
   - B's twin can call `sendMessage(C)` itself, but `chainDepth >= 2` disables further auto-reply triggers (capped via `MAX_AUTO_REPLY_CHAIN_DEPTH = 2`)
   - Final assistant text → on-chain message back to A
4. A's chat (or voice background watcher) sees the new inbox entry and surfaces it.

**Voice background channel:** because `waitForReply` would block the audio data channel, voice mode does NOT call it. Instead, after `sendMessage` returns ok, `components/voice-twin.tsx:startBackgroundReplyWatcher` polls `readMyMessages` for ≤ 90 s and, when a new reply lands, injects a synthetic `[Background] <peer> just replied: "..."` into the Realtime session + a `response.create`. The agent narrates the reply proactively. Mirrors the chat tab's `PendingTask` localStorage tracker.

## Tool Surface (`lib/twin-tools.ts`)

`buildTwinTools({ fromEns, fromAddress, chainDepth })` factory. The static `twinTools` map only carries context-free tools; everything that needs the caller's ENS lives behind the factory.

| Tool | Context-aware? | Purpose |
|---|---|---|
| `getWalletSummary` | no | Balances + ENS reverse for any address |
| `decodeTransaction` | no | Sourcify-backed plain-English tx decode |
| `checkTransactionStatus` | no | Receipt + confirmations on Sepolia/Base Sepolia |
| `getBalance` | no | Read ETH/USDC for any ENS or 0x address |
| `sendToken` | no in static, **yes** in factory (KMS via `fromEns`) | Native ETH / USDC send |
| `sendStealthUsdc` | no in static, **yes** in factory (KMS + auto-reply trigger) | EIP-5564 USDC on Base Sepolia |
| `generatePrivatePaymentAddress` | no | Derive stealth addr from recipient's meta-key |
| `findAgents` | no | On-chain agent directory + ENSIP-25 verify |
| `hireAgent` | **yes** | x402 payment to peer's `twin.endpoint` |
| `inspectMyWallet` | **yes** | Self-lookup via `ctx.fromAddress` |
| `readMyEnsRecords` | **yes** | Own twin records |
| `readMyMessages` | **yes** | Recent inbox |
| `listAgentDirectory` | **yes** | Lightweight directory list |
| `sendMessage` | **yes** | On-chain ENS message + auto-reply trigger (chainDepth-capped) |
| `waitForReply` | **yes** | Inbox poll (chat-mode only — voice uses background watcher instead) |

`normalizeTwinEns(input)` auto-expands bare names: `tom` → `tom.ethtwin.eth`, while passing 0x addresses unchanged.

Voice tools subset (`lib/voice-tools.ts`) mirrors the same tool list as JSON Schema for OpenAI Realtime over WebRTC. The voice client always passes `fromEns` so `/api/twin-tool` can use the same `buildTwinTools` factory.

## Datei-Struktur

```
app/
  api/
    onboarding/route.ts        # KMS createTwinKey + multicall (subname + 11 records + agents.directory)
    session/route.ts           # HMAC cookie session (login + recovery code verify)
    twin/route.ts              # Chat agent loop
    twin/auto-reply/route.ts   # Recipient twin's autonomous loop (chainDepth-capped at 2)
    twin-tool/route.ts         # Voice tool dispatcher (calls buildTwinTools(ctx))
    voice/route.ts             # OpenAI Realtime ephemeral key minter + voice prompt
    messages/route.ts          # On-chain ENS messenger (POST send + GET inbox/thread)
    stealth/send/route.ts      # USDC.transfer to one-time stealth addr + Announcement
    stealth/inbox/route.ts     # Scan announcer + re-derive stealth addresses
    stealth/claim/route.ts     # Sweep stealth funds to twin's main address
    transfer/route.ts          # Multichain ETH/USDC transfer (KMS-signed)
    profile/route.ts           # Edit avatar/description (KMS or dev wallet)
    profile/delete/route.ts    # Wipe twin's records + remove from directory
    kms/verify/route.ts        # Live KMS proof — sign nonce + recover + ENS sync check
    agents/route.ts            # Read agent directory
    agents/analyst/route.ts    # x402-paywalled sample sub-agent
    agent/[ens]/route.ts       # Full agent profile read
    decode-transaction/route.ts# Sourcify-backed calldata decode
    feedback/route.ts          # 👍/👎 history feedback
    history/route.ts           # Server-side history per ENS
    wallet-summary,wallet-history/  # Address summary helpers
    check-username/route.ts    # Polled by frontend after onboarding

components/
  twin-chat.tsx                # AI-SDK useChat + ENSIP-25 verified-badge + background reply tracker
  voice-twin.tsx               # OpenAI Realtime over WebRTC + background reply watcher
  messenger.tsx                # ENS-Subname messenger UI (text-records-on-twin)
  stealth-send.tsx             # Stealth-Send + TwinWalletCard + StealthInbox + claim flow
  receipt-postcard.tsx         # Demo-mode receipt — postcard front + space-themed reveal + Etherscan CTA
  agent-profile.tsx            # Profile + KMS verify panel + recovery code panel
  bounty-trail.tsx             # "Powered by …" chips
  notification-panel.tsx       # Pinned activity feed
  fund-twin.tsx                # EIP-1193 wallet integration (no wagmi) for self-funding the twin
  onboarding-flow.tsx          # 4-step wizard + KMS key reveal panel + recovery code
  contrast-card.tsx            # Landing-page comparison ("old crypto" vs EthTwin postcard)
  maria-shell.tsx              # Demo-mode single-view shell
  twin-avatar.tsx              # State-driven breathing avatar
  send-celebration.tsx         # Confetti shower on successful send
  tx-approval-modal.tsx        # Sourcify-decoded plain-English approval dialog
  x402-flow.tsx                # Twin → analyst flow animation during hireAgent

lib/
  kms.ts                       # SpaceComputer Orbitport KMS adapter + viem LocalAccount
  ens.ts                       # ENS read/write (viem) — direct Sepolia
  ensip25.ts                   # ENSIP-25 verification + ERC-7930 helper
  agents.ts                    # On-chain agent directory
  messages.ts                  # On-chain ENS messenger primitives
  message-crypto.ts            # AES-256-GCM with static-static ECDH on stealth keys
  stealth.ts                   # EIP-5564 derivation
  payments.ts                  # Stealth USDC on Base Sepolia (KMS-signed when funded, else dev wallet relays)
  transfers.ts                 # Multichain ETH/USDC transfers
  x402-client.ts               # @x402/fetch v2 wrapper + paidFetch / paidFetchWithReceipt
  twin-tools.ts                # AI SDK tool surface + buildTwinTools + normalizeTwinEns
  voice-tools.ts               # JSON-Schema mirror for OpenAI Realtime
  prompts.ts                   # System prompts (hydrated from ENS records)
  sourcify.ts, tx-decoder.ts, contract-risk.ts  # Sourcify lookup + risk classifier
  history.ts, history-server.ts  # Hybrid client + server history
  use-session.ts, use-demo-mode.ts, use-ens-name.ts, use-ens-avatar.ts, use-notifications.ts, use-twin-sound.ts
  api-guard.ts                 # Zod request parsing + jsonError helper
  abis.ts                      # ENS Registry / Resolver / ERC-20 / ERC-5564 Announcer

scripts/
  diag-orbitport.ts            # Live KMS + cTRNG probe (used to confirm gateway capabilities)
  test-x402-mock.ts            # Local mock x402 server (no real money)
  ens:provision-analyst, ens:read, ens:set-text, ...
  twins:seed-demo              # Mints maria.ethtwin.eth + tom.ethtwin.eth
  send:stealth-usdc, send:token
  wipe-subnames                # Cleanup helper for clean re-mints
```

## ENS Text Records Schema (final)

| Key | Standard | Type | Used for |
|---|---|---|---|
| `description`, `avatar`, `url` | ENSIP-5/12 | string | Profile basics |
| `twin.persona` | custom | JSON | { tone, style, expertise } — feeds the system prompt |
| `twin.capabilities` | custom | JSON-array | ["transact", "research", "stealth_send"] |
| `twin.endpoint` | custom | URL | Agent endpoint for x402 |
| `twin.version` | custom | string | Protocol version |
| `stealth-meta-address` | **our innovation** | string | EIP-5564 format `st:eth:0x...` (132 hex chars) |
| `twin.kms-key-id` | **our innovation** | string | SpaceComputer Orbitport KMS key handle |
| `twin.kms-public-key` | **our innovation** | string | 65-byte uncompressed secp256k1 — used to verify per-message KMS sigs |
| `twin.login-hash` | **our innovation** | string | HMAC-SHA256(SESSION_SECRET, recovery_code) — verified at login |
| `agent-registration[<registry>][<agentId>]` | **ENSIP-25** | "1" | Links to ERC-8004 entry |
| `chat.<peerLabel>.count` / `.msg.<i>` / `.participants` | **our innovation** | string / JSON | Messenger storage on each twin's own subname |
| `chats.list` | custom | JSON-array | Inbox enumeration |

**For ENS Most Creative Bounty:** the `stealth-meta-address` text record is novel (no official ENSIP) — we're effectively proposing a pattern. The KMS pubkey + chat records are additional creative uses.

## ERC-8004 IdentityRegistry

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
│   Sepolia:      0x8004A818BFB91...       │
└─────────────────────────────────────────┘
```

## Sicherheits-Boundaries

| Layer | Public | Server-only |
|---|---|---|
| API Keys (Anthropic, OpenAI) | ❌ | ✅ Vercel env vars only |
| Orbitport KMS credentials (`ORBITPORT_CLIENT_ID/SECRET`) | ❌ | ✅ Vercel env vars only |
| Dev wallet private key (mints subnames + relays gas top-ups) | ❌ | ✅ `DEV_WALLET_PRIVATE_KEY` env only |
| Session secret (`SESSION_SECRET`) | ❌ | ✅ HMAC-signed cookies |
| Twin's KMS private key | NEVER | NEVER — held inside Orbitport KMS, all ops via signed JSON-RPC |
| ENS Text Records | ✅ public chain data | — |
| Stealth meta-keys | ✅ public meta only | spending/viewing privkeys derived from dev master + ENS (deterministic, never persisted) |

## Performance-Ziele (final)

| Operation | Target | Status |
|---|---|---|
| Twin text response (first token) | <1 s | ✅ |
| Voice round-trip (speak → response start) | <2 s | ✅ |
| Stealth send confirmation on Base Sepolia | <5 s | ✅ |
| Stealth claim (top-up + sweep) | <30 s | ✅ (40 s timeout on top-up wait) |
| Onboarding multicall on Sepolia | <30 s | ✅ |
| OpenAI Realtime ephemeral key mint | <500 ms | ✅ |

## What was removed (for the record)

These were planned but cut. Code references and env wiring have been deleted unless noted otherwise.

- **Privy auth + Privy Embedded Smart Wallet** — replaced with HMAC cookie sessions + KMS-derived twin addresses.
- **Apify x402** — `requestDataViaX402` tool, `callApifyX402` helper, `app/api/x402/route.ts`, scripts and env vars all deleted. x402 is twin-to-twin only (`hireAgent` + paywalled `analyst.ethtwin.eth`).
- **Orbitport cTRNG** — gateway returned unsigned samples (no provenance). `lib/cosmic.ts` is still in the tree but `lib/stealth.ts` and `lib/message-crypto.ts` no longer cosmic-seed (`cosmicSeeded: false` always).
- **Chat-as-sub-subname messenger** — earlier prototype minted `msg-<ts>-<seq>.<recipient>.ethtwin.eth` per message. Replaced with text-records-on-twin (no new subnames per message), because ENS apps display freshly-minted `setSubnodeRecord` subnames as bracket-encoded labels.
- **NameStone backup path** — `lib/namestone.ts` is in the tree but unused; Sepolia ENS held up.
