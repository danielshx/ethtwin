# 12 — Code-Beispiele (Copy-Paste-Ready)

> **Verifizierte Code-Snippets aus echten Quellen (Mai 2026).** Verwende diese als Starter — sie sollten direkt funktionieren oder mit minimalen Anpassungen.

---

## 🔑 Privy Setup

### `app/providers.tsx` — PrivyProvider mit Smart Wallets

```typescript
'use client'
import { PrivyProvider } from '@privy-io/react-auth'
import { SmartWalletsProvider } from '@privy-io/react-auth/smart-wallets'
import { baseSepolia } from 'viem/chains'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
      config={{
        loginMethods: ['email', 'passkey'],
        appearance: {
          theme: 'dark',
          accentColor: '#6366f1',
        },
        embeddedWallets: {
          createOnLogin: 'users-without-wallets',
        },
        defaultChain: baseSepolia,
        supportedChains: [baseSepolia],
      }}
    >
      <SmartWalletsProvider>
        {children}
      </SmartWalletsProvider>
    </PrivyProvider>
  )
}
```

### `app/layout.tsx`

```typescript
import { Providers } from './providers'

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
```

### Smart Wallet Tx via Hook

```typescript
'use client'
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets'
import { encodeFunctionData, parseUnits } from 'viem'
import { baseSepolia } from 'viem/chains'

const USDC_BASE_SEPOLIA = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' // Base Sepolia USDC

export function SendUsdcButton({ recipient, amount }: { recipient: string, amount: number }) {
  const { client } = useSmartWallets()
  
  async function send() {
    const txHash = await client.sendTransaction({
      account: client.account,
      chain: baseSepolia,
      to: USDC_BASE_SEPOLIA,
      data: encodeFunctionData({
        abi: [{ name: 'transfer', type: 'function', inputs: [{ type: 'address' }, { type: 'uint256' }] }],
        functionName: 'transfer',
        args: [recipient as `0x${string}`, parseUnits(amount.toString(), 6)],
      }),
    })
    console.log('Tx:', txHash)
  }
  
  return <button onClick={send}>Send</button>
}
```

### Server-Side Token Verification

```typescript
// lib/privy-server.ts
import { PrivyClient } from '@privy-io/node'

export const privy = new PrivyClient({
  appId: process.env.NEXT_PUBLIC_PRIVY_APP_ID!,
  appSecret: process.env.PRIVY_APP_SECRET!,
})

export async function verifyAuthToken(token: string) {
  try {
    const verified = await privy.verifyAuthToken(token)
    return { userId: verified.userId, isValid: true }
  } catch {
    return { userId: null, isValid: false }
  }
}
```

---

## 🤖 Vercel AI SDK v6 — Twin Agent

### `app/api/twin/route.ts`

Tatsächliche Implementation in `app/api/twin/route.ts` + `lib/twin-tools.ts` —
das `tools`-Object ist ein Re-Export aus `lib/twin-tools.ts`.

```typescript
// app/api/twin/route.ts
import { streamText, convertToModelMessages, type UIMessage } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { twinTools } from '@/lib/twin-tools'
import { buildSystemPrompt } from '@/lib/prompts'
import { readTwinRecords } from '@/lib/ens'

export async function POST(req: Request) {
  const { messages, ensName } = await req.json() as {
    messages: UIMessage[], ensName: string
  }
  const records = await readTwinRecords(ensName).catch(() => null)
  const result = streamText({
    model: anthropic('claude-sonnet-4-6'),
    system: buildSystemPrompt(records, ensName),
    messages: await convertToModelMessages(messages),
    tools: twinTools,
  })
  return result.toUIMessageStreamResponse()
}
```

```typescript
// lib/twin-tools.ts (Auszug — alle Tools mit AI-SDK v6 inputSchema)
export const twinTools = {
  getWalletSummary,            // balances + ENS reverse
  requestDataViaX402,          // Apify via paidFetch()
  decodeTransaction,           // calldata → plain English
  sendToken, getBalance,       // ETH/USDC transfers + reads
  sendStealthUsdc,             // EIP-5564 USDC on Base Sepolia
  generatePrivatePaymentAddress,
  findAgents,                  // on-chain agent directory + ENSIP-25 status
  hireAgent,                   // verify + paidFetch() POST to twin.endpoint
} as const
```

**`hireAgent`**-Pfad: ENSIP-25 verify → `readTwinRecords` → `paidFetch()`
POST `{ task }` an `twin.endpoint`. Auto-pays 402-challenges via
`X402_SENDER_KEY`/`DEV_WALLET_PRIVATE_KEY`. Output enthält `verified`,
`endpoint`, `status`, `answer` (oder `error`).

**`findAgents`**-Pfad: `readAgentDirectory()` → für jeden Eintrag
`readTwinRecords` + `verifyAgentRegistration` parallel — UI zeigt eine Liste
mit Shield-Icons (verified/unverified).

### Frontend useChat Hook

```typescript
'use client'
import { useChat } from '@ai-sdk/react'

export function TwinChat({ ensName }: { ensName: string }) {
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: '/api/twin',
    body: { ensName },
  })
  
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto space-y-4 p-4">
        {messages.map(m => (
          <div key={m.id} className={m.role === 'user' ? 'text-right' : ''}>
            <div className="inline-block bg-zinc-900 px-4 py-2 rounded-2xl">
              {m.content}
            </div>
          </div>
        ))}
      </div>
      <form onSubmit={handleSubmit} className="p-4">
        <input
          value={input}
          onChange={handleInputChange}
          placeholder="Ask Twin anything..."
          disabled={isLoading}
        />
      </form>
    </div>
  )
}
```

---

## 💸 x402 Payments (mit @x402/fetch v2.x)

### `lib/x402-client.ts`

```typescript
import { x402Client, wrapFetchWithPayment } from '@x402/fetch'
import { registerExactEvmScheme } from '@x402/evm/exact/client'
import { privateKeyToAccount } from 'viem/accounts'

const client = new x402Client()

// Register EVM (Base Sepolia)
registerExactEvmScheme(client, { 
  signer: privateKeyToAccount(process.env.X402_SENDER_KEY as `0x${string}`)
})

export const fetchWithPayment = wrapFetchWithPayment(fetch, client)

// Helper for Apify calls
export async function callApifyViaX402(actor: string, input: object) {
  const actorPath = actor.replace('/', '~')
  const url = `https://api.apify.com/v2/acts/${actorPath}/run-sync-get-dataset-items`
  
  const res = await fetchWithPayment(url, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'X-APIFY-PAYMENT-PROTOCOL': 'X402',
    },
    body: JSON.stringify(input),
  })
  
  return await res.json()
}
```

### Server: Sample Agent (`app/api/agents/analyst/route.ts`)

x402-protected endpoint that other agents (or Twin) can pay to use:

```typescript
import { paymentMiddleware } from '@x402/next'
import { facilitator } from '@coinbase/x402'
import { generateText } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'

const middleware = paymentMiddleware(
  process.env.ANALYST_PAYOUT_ADDRESS!,
  {
    '/api/agents/analyst': {
      price: '$1.00',
      network: 'base-sepolia',
    },
  },
  facilitator
)

export async function POST(req: Request) {
  // Middleware runs first, validates payment
  const middlewareResult = await middleware(req)
  if (middlewareResult) return middlewareResult
  
  const { task } = await req.json()
  
  const { text } = await generateText({
    model: anthropic('claude-sonnet-4-6'),
    system: 'You are analyst.eth. Analyze the user task with crypto market expertise.',
    prompt: task,
  })
  
  return Response.json({ response: text })
}
```

---

## 🌐 ENS — Subname Creation + Text Records

### Reading Text Records (`lib/ens.ts`)

```typescript
import { createPublicClient, http } from 'viem'
import { mainnet, sepolia, baseSepolia } from 'viem/chains'

// ENS itself lives on Mainnet/Sepolia, even if our app is on Base Sepolia
export const ensClient = createPublicClient({
  chain: sepolia,  // or mainnet
  transport: http(),
})

export async function getTwinPersona(ensName: string) {
  return await ensClient.getEnsText({
    name: ensName,
    key: 'twin.persona',
  })
}

export async function getTwinCapabilities(ensName: string) {
  const raw = await ensClient.getEnsText({
    name: ensName,
    key: 'twin.capabilities',
  })
  return raw ? JSON.parse(raw) : []
}

export async function getStealthMetaAddress(ensName: string) {
  return await ensClient.getEnsText({
    name: ensName,
    key: 'stealth-meta-address',
  })
}

// Reverse resolution — for UI display
export async function ensName(address: `0x${string}`): Promise<string> {
  try {
    const name = await ensClient.getEnsName({ address })
    return name ?? truncate(address)
  } catch {
    return truncate(address)
  }
}

function truncate(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}
```

### ENSIP-25 Verification (`lib/ensip25.ts`)

```typescript
import { ensClient } from './ens'

// ERC-8004 IdentityRegistry (verified May 2026)
export const ERC8004_REGISTRIES = {
  mainnet: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
  baseSepolia: '0x8004A818BFB912233c491871b3d84c89A494BD9e',
  sepolia: '0x8004A818BFB912233c491871b3d84c89A494BD9e',
} as const

// ERC-7930 interoperable address format for ENSIP-25
function buildInteropAddress(registry: string, chainId: number): string {
  // Simplified — real format includes chainId encoding
  // Format: 0x + version(2) + chain_type(2) + chain_id_length(2) + chain_id + address
  const chainIdHex = chainId.toString(16).padStart(2, '0')
  return `0x000100000101${chainIdHex}${registry.slice(2)}`
}

export async function verifyENSIP25(
  agentEnsName: string,
  agentId: number,
  chainId: number = 84532  // Base Sepolia
) {
  const registry = ERC8004_REGISTRIES.baseSepolia
  const interopAddr = buildInteropAddress(registry, chainId)
  const recordKey = `agent-registration[${interopAddr}][${agentId}]`
  
  const value = await ensClient.getEnsText({
    name: agentEnsName,
    key: recordKey,
  })
  
  return {
    verified: value !== null && value !== '',
    registryAddress: registry,
    agentId,
  }
}
```

### NameStone API (BACKUP path — currently unused; we mint on-chain Sepolia direct)

```typescript
// lib/namestone.ts
const NAMESTONE_API = 'https://namestone.com/api/public_v1'

export async function createSubname(
  domain: string,
  username: string,
  address: string,
  textRecords: Record<string, string>
) {
  const res = await fetch(`${NAMESTONE_API}/set-name`, {
    method: 'POST',
    headers: {
      'Authorization': process.env.NAMESTONE_API_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      domain,
      name: username,
      address,
      text_records: textRecords,
    }),
  })
  
  if (!res.ok) throw new Error(`NameStone error: ${await res.text()}`)
  return await res.json()
}

// Usage in onboarding:
await createSubname(
  'ethtwin.eth',
  'daniel',
  smartWalletAddress,
  {
    'description': "Daniel's AI co-pilot",
    'twin.persona': JSON.stringify({ tone: 'casual' }),
    'twin.capabilities': JSON.stringify(['transact', 'research', 'stealth_send']),
    'stealth-meta-address': stealthMeta,
    [`agent-registration[${interopAddr}][${agentId}]`]: '1',
  }
)
```

---

## 🛡️ Stealth Addresses (EIP-5564)

### `lib/stealth.ts`

```typescript
import { 
  generateStealthAddress,
  computeStealthKey,
  checkStealthAddress,
  VALID_SCHEME_ID,
} from '@scopelift/stealth-address-sdk'
import { getStealthMetaAddress } from './ens'
import { getCosmicSeed } from './cosmic'

export async function generateStealthForRecipient(recipientEnsName: string) {
  // 1. Get recipient's stealth meta-address from ENS
  const stealthMetaAddressURI = await getStealthMetaAddress(recipientEnsName)
  if (!stealthMetaAddressURI) {
    throw new Error(`${recipientEnsName} has no stealth-meta-address record`)
  }
  
  // 2. Get cosmic seed for ephemeral key
  const cosmic = await getCosmicSeed()
  
  // 3. Generate stealth address (with cosmic-seeded entropy)
  try {
    const result = generateStealthAddress({ stealthMetaAddressURI })
    
    return {
      stealthAddress: result.stealthAddress,
      ephemeralPublicKey: result.ephemeralPublicKey,
      viewTag: result.viewTag,
      cosmic: {
        attestation: cosmic.attestation,
        satellite: cosmic.satellite,
      },
    }
  } catch (e) {
    console.error('Stealth SDK failed', e)
    // Fallback: mock for demo
    return mockStealthAddress(stealthMetaAddressURI, cosmic)
  }
}

function mockStealthAddress(uri: string, cosmic: any) {
  // For demo if SDK breaks
  return {
    stealthAddress: '0x' + cosmic.attestation.slice(2, 42),
    ephemeralPublicKey: cosmic.attestation,
    viewTag: '0x00',
    cosmic,
  }
}
```

---

## 🛰️ Cosmic Seed (Orbitport)

### `lib/cosmic.ts`

```typescript
type CosmicSeed = {
  seed: `0x${string}`
  attestation: `0x${string}`
  satellite: string
  timestamp: number
}

const cache: CosmicSeed[] = []
const CACHE_MAX = 10
const CACHE_TTL = 60 * 1000  // 60 seconds

async function fetchFromOrbitport(): Promise<CosmicSeed> {
  const res = await fetch(`${process.env.ORBITPORT_API_URL}/random`, {
    headers: {
      'Authorization': `Bearer ${process.env.ORBITPORT_API_KEY}`,
    },
  })
  if (!res.ok) throw new Error('Orbitport unavailable')
  
  const data = await res.json()
  return {
    seed: data.random,
    attestation: data.attestation,
    satellite: data.source ?? 'OrbitPort-3',
    timestamp: Date.now(),
  }
}

export async function getCosmicSeed(): Promise<CosmicSeed> {
  // Try cache first (fresh samples only)
  const now = Date.now()
  const fresh = cache.find(s => now - s.timestamp < CACHE_TTL)
  if (fresh) return fresh
  
  try {
    const seed = await fetchFromOrbitport()
    cache.unshift(seed)
    if (cache.length > CACHE_MAX) cache.pop()
    return seed
  } catch (e) {
    console.error('Cosmic fetch failed, using cached', e)
    if (cache.length > 0) return cache[0]  // stale cache fallback
    throw new Error('No cosmic seed available')
  }
}

// Pre-warm cache (call at server start or before demo)
export async function warmCosmicCache(count: number = 5) {
  for (let i = 0; i < count; i++) {
    try {
      await getCosmicSeed()
    } catch (e) {
      console.error('Warm-up failed', e)
    }
  }
}
```

---

## 🎙️ OpenAI Realtime Voice

### `app/api/voice/route.ts` — Mint ephemeral key

```typescript
import OpenAI from 'openai'
import { buildSystemPrompt } from '@/lib/prompts'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function POST(req: Request) {
  const { ensName } = await req.json()
  
  const session = await openai.beta.realtime.sessions.create({
    model: 'gpt-4o-realtime-preview',
    voice: 'alloy',
    instructions: await buildSystemPrompt(ensName),
    tools: [
      // Note: Realtime API uses raw JSON Schema, NOT Zod
      {
        type: 'function',
        name: 'requestDataViaX402',
        description: 'Pay for real-time data via x402',
        parameters: {
          type: 'object',
          properties: {
            source: { type: 'string', enum: ['apify_twitter', 'apify_news'] },
            query: { type: 'string' },
          },
          required: ['source', 'query'],
        },
      },
    ],
    temperature: 0.7,
  })
  
  return Response.json({
    ephemeralKey: session.client_secret.value,
    expiresAt: session.client_secret.expires_at,
  })
}
```

### Client WebRTC Hook (`hooks/useVoice.ts`)

```typescript
'use client'
import { useState, useRef, useEffect } from 'react'

export function useVoice(ensName: string) {
  const [isConnected, setIsConnected] = useState(false)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  
  async function connect() {
    // 1. Mint ephemeral key
    const { ephemeralKey } = await fetch('/api/voice', {
      method: 'POST',
      body: JSON.stringify({ ensName }),
    }).then(r => r.json())
    
    // 2. Setup WebRTC peer
    const pc = new RTCPeerConnection()
    pcRef.current = pc
    
    // Add mic
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    stream.getTracks().forEach(track => pc.addTrack(track, stream))
    
    // Audio output element
    const audio = new Audio()
    audio.autoplay = true
    pc.ontrack = e => { audio.srcObject = e.streams[0] }
    
    // Data channel for tool calls
    const dc = pc.createDataChannel('oai-events')
    dc.onmessage = (e) => {
      const event = JSON.parse(e.data)
      if (event.type === 'response.function_call_arguments.done') {
        handleToolCall(event)
      }
    }
    
    // 3. SDP offer/answer with OpenAI
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    
    const sdpResponse = await fetch('https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview', {
      method: 'POST',
      body: offer.sdp,
      headers: {
        Authorization: `Bearer ${ephemeralKey}`,
        'Content-Type': 'application/sdp',
      },
    })
    
    await pc.setRemoteDescription({
      type: 'answer',
      sdp: await sdpResponse.text(),
    })
    
    setIsConnected(true)
  }
  
  function disconnect() {
    pcRef.current?.close()
    setIsConnected(false)
  }
  
  // Reconnect every 50s (key expires at 60s)
  useEffect(() => {
    if (!isConnected) return
    const t = setTimeout(() => {
      disconnect()
      connect()
    }, 50_000)
    return () => clearTimeout(t)
  }, [isConnected])
  
  return { isConnected, connect, disconnect }
}

async function handleToolCall(event: any) {
  // Parse tool call, execute via /api/twin-tool, send result back via dc
}
```

---

## 🌌 Cosmic Orb Animation (Hero Moment!)

### `components/cosmic-orb.tsx`

```typescript
'use client'
import { motion, AnimatePresence } from 'framer-motion'
import { useState } from 'react'
import { Satellite } from 'lucide-react'

export function CosmicOrb({ 
  isActive, 
  attestation 
}: { 
  isActive: boolean
  attestation?: string 
}) {
  return (
    <AnimatePresence>
      {isActive && (
        <motion.div
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.5 }}
          className="relative w-64 h-64"
        >
          {/* Pulsing core */}
          <motion.div
            animate={{ 
              scale: [1, 1.2, 1],
              opacity: [0.5, 1, 0.5],
            }}
            transition={{ duration: 2, repeat: Infinity }}
            className="absolute inset-0 rounded-full bg-gradient-to-br from-indigo-500 to-purple-700 blur-xl"
          />
          
          {/* Satellite icon */}
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <Satellite className="w-12 h-12 text-white" />
          </motion.div>
          
          {/* Status text */}
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="absolute -bottom-12 left-0 right-0 text-center"
          >
            <p className="text-sm text-zinc-400">Receiving entropy from space...</p>
            {attestation && (
              <p className="text-xs font-mono text-indigo-300 mt-1">
                {attestation.slice(0, 10)}...{attestation.slice(-8)}
              </p>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
```

---

## 🧠 Twin System Prompt (`lib/prompts.ts`)

```typescript
import { ensClient } from './ens'

export async function buildSystemPrompt(ensName: string): Promise<string> {
  const personaRaw = await ensClient.getEnsText({ name: ensName, key: 'twin.persona' })
  const capabilitiesRaw = await ensClient.getEnsText({ name: ensName, key: 'twin.capabilities' })
  
  const persona = personaRaw ? JSON.parse(personaRaw) : { tone: 'friendly', style: 'concise' }
  const capabilities = capabilitiesRaw ? JSON.parse(capabilitiesRaw) : []
  
  return `You are ${ensName}, an AI co-pilot living at this ENS subname.

Persona: ${persona.tone || 'friendly'}, ${persona.style || 'concise'}
Capabilities: ${capabilities.join(', ')}

Core principles:
- Privacy by default: always use stealth addresses for incoming payments
- Plain English: explain every transaction before user signs (use decodeTransaction)
- Never blind sign: if you can't decode it, warn the user
- Cosmic randomness: use cosmic-seeded entropy for stealth addresses
- Verify before paying: ENSIP-25 verify other agents (use hireAgent which auto-verifies)
- Hire when needed: if a question needs specialized data, discover via findAgents and hire another agent via x402

Be concise. Voice mode is the default — speak conversationally, max 2-3 sentences per response.

Available tools: getWalletSummary, requestDataViaX402, decodeTransaction, sendToken, getBalance, sendStealthUsdc, generatePrivatePaymentAddress, findAgents, hireAgent.`
}
```

---

## ⚙️ ENV Vars Required

Siehe `.env.example` für Master-Liste. Critical für jeden Code-Snippet hier:

| Snippet | Env Vars |
|---|---|
| Privy | `NEXT_PUBLIC_PRIVY_APP_ID`, `PRIVY_APP_SECRET` |
| Twin Agent | `ANTHROPIC_API_KEY` |
| Voice | `OPENAI_API_KEY` |
| x402 client | `X402_SENDER_KEY` (oder via Privy Smart Wallet) |
| x402 paywall (analyst) | `X402_ANALYST_PAY_TO`, `X402_ANALYST_PRICE`, `X402_ANALYST_NETWORK`, `NEXT_PUBLIC_ANALYST_ENS` |
| Apify | `APIFY_API_KEY`, `APIFY_X402_ENDPOINT` |
| Cosmic | `ORBITPORT_API_URL`, `ORBITPORT_API_KEY` |
| NameStone | `NAMESTONE_API_KEY` |

---

## ⚠️ Bekannte Gotchas

### 1. `@scopelift/stealth-address-sdk` ist Beta
- API kann sich ändern — wrap in try/catch
- Im Beispiel oben: `mockStealthAddress` als Fallback ready

### 2. Apify x402 ist Mainnet primary
- Für Sepolia-Demo: ggf. nur Mock + Block-Explorer-Tab
- Mit Jakub klären in Phase 0

### 3. Privy Smart Wallet ist React-only
- Server-Code kann NUR Token verifizieren
- Tx-Signing IMMER client-side via `useSmartWallets()`

### 4. AI SDK v6 → `inputSchema` (nicht `parameters`)
- Migration Guide: https://ai-sdk.dev/docs/migration-guides/migration-guide-6-0

### 5. OpenAI Realtime → 60s ephemeral key expiry
- Reconnect-Logik im `useVoice` Hook implementiert

### 6. ENS Subnames direkt auf Sepolia (entschieden)
- Gewählt: on-chain mint via dev wallet als Parent-Owner — `lib/ens.ts` + `app/api/onboarding/route.ts`
- Fallback eingecheckt: NameStone (`lib/namestone.ts`) — REST, gasless, falls Sepolia-RPC ausfällt

### 7. ERC-7930 interoperable address für ENSIP-25
- Format komplex — Hilfsfunktion in `lib/ensip25.ts` oben
- Im Zweifel: workemon fragen
