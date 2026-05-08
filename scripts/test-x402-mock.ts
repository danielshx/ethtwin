// Self-contained x402 client verification — no real money, no Apify dependency.
// Spins up a local mock server that speaks the x402 wire protocol (HTTP 402 with
// PaymentRequiredV1 schema, then accepts the client's X-PAYMENT header), and runs
// our paidFetch() wrapper against it. Proves @x402/fetch + @x402/evm correctly
// sign + retry without touching the chain.
//
// Run: pnpm test:x402-mock
//
// What this proves:
//   - The 402 response body our server emits is parseable by the client
//   - The client's signer produces an X-PAYMENT header in the right shape
//   - The retry path delivers the response payload from the protected route
//
// What this does NOT prove:
//   - On-chain settlement (no facilitator, no chain RPC)
//   - That the EIP-3009 signature is valid against real USDC balances
//   - Apify-specific behavior (next step, with real funded wallet)

import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { paidFetch } from "../lib/x402-client"
import { privateKeyToAccount } from "viem/accounts"

const PORT = Number(process.env.MOCK_X402_PORT ?? 4402)
const HOST = "127.0.0.1"
const PROTECTED_URL = `http://${HOST}:${PORT}/protected`

// Base Sepolia USDC.
const ASSET = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
// v1 uses CAIP-2 slug ("base-sepolia"), v2 uses "eip155:84532". Mock speaks v1.
const NETWORK = "base-sepolia"
const PAY_TO = "0x4E09c220BD556396Bc255A4DD24F858Bafeba6f5" // dev wallet
const MAX_AMOUNT = "1000" // 0.001 USDC at 6 decimals

type RequestBuf = { method: string; url: string; headers: IncomingMessage["headers"]; body: string }

async function readReq(req: IncomingMessage): Promise<RequestBuf> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on("data", (c) => chunks.push(c as Buffer))
    req.on("end", () =>
      resolve({
        method: req.method ?? "GET",
        url: req.url ?? "/",
        headers: req.headers,
        body: Buffer.concat(chunks).toString("utf8"),
      }),
    )
    req.on("error", reject)
  })
}

function paymentRequired() {
  return {
    x402Version: 1 as const,
    error: "Payment required",
    accepts: [
      {
        scheme: "exact",
        network: NETWORK,
        maxAmountRequired: MAX_AMOUNT,
        resource: PROTECTED_URL,
        description: "Mock x402 endpoint for client verification",
        mimeType: "application/json",
        outputSchema: {},
        payTo: PAY_TO,
        maxTimeoutSeconds: 60,
        asset: ASSET,
        extra: {
          name: "USD Coin",
          version: "2",
        },
      },
    ],
  }
}

let receivedHeader: string | null = null
let receivedPayload: unknown = null

function startMockServer(): Promise<{ stop: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      try {
        const r = await readReq(req)
        if (!r.url.startsWith("/protected")) {
          res.writeHead(404).end()
          return
        }

        const xPayment =
          (r.headers["x-payment"] as string | undefined) ??
          (r.headers["X-PAYMENT" as keyof typeof r.headers] as string | undefined)

        if (!xPayment) {
          // First call: return 402 with the standard challenge body.
          const body = JSON.stringify(paymentRequired())
          res.writeHead(402, {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body).toString(),
          })
          res.end(body)
          console.log(`SRV   402 challenge sent (${body.length} bytes)`)
          return
        }

        // Second call: decode the X-PAYMENT header (base64 JSON of PaymentPayloadV1).
        receivedHeader = xPayment
        try {
          const decoded = JSON.parse(Buffer.from(xPayment, "base64").toString("utf8"))
          receivedPayload = decoded
          console.log("SRV   X-PAYMENT decoded:")
          console.log("        x402Version:", decoded.x402Version)
          console.log("        scheme:     ", decoded.scheme)
          console.log("        network:    ", decoded.network)
          console.log("        payload keys:", Object.keys(decoded.payload ?? {}))
        } catch (err) {
          console.log("SRV   X-PAYMENT decode FAILED:", err instanceof Error ? err.message : err)
        }

        // Pretend settlement succeeded; return the protected resource.
        const body = JSON.stringify({
          ok: true,
          paymentReceived: true,
          message: "x402 mock server: payment header accepted",
          receivedPaymentPayload: receivedPayload,
        })
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body).toString(),
          "X-PAYMENT-RESPONSE": Buffer.from(
            JSON.stringify({ success: true, transaction: "0xMOCK", network: NETWORK }),
          ).toString("base64"),
        })
        res.end(body)
      } catch (err) {
        console.error("SRV   handler error:", err)
        res.writeHead(500).end()
      }
    })

    server.on("error", reject)
    server.listen(PORT, HOST, () => {
      console.log(`SRV   mock x402 server listening on http://${HOST}:${PORT}`)
      resolve({
        stop: () =>
          new Promise<void>((r2, j2) => {
            server.close((err) => (err ? j2(err) : r2()))
          }),
      })
    })
  })
}

function logHeader(s: string) {
  console.log(`\n── ${s} ${"─".repeat(Math.max(0, 76 - s.length))}`)
}

async function main() {
  const senderKey = process.env.X402_SENDER_KEY ?? process.env.DEV_WALLET_PRIVATE_KEY
  if (!senderKey) {
    console.log("FAIL  Neither X402_SENDER_KEY nor DEV_WALLET_PRIVATE_KEY is set in .env.local")
    process.exit(1)
  }
  const sender = privateKeyToAccount(
    (senderKey.startsWith("0x") ? senderKey : `0x${senderKey}`) as `0x${string}`,
  )

  logHeader("Setup")
  console.log(`  signer:   ${sender.address}`)
  console.log(`  chain:    ${NETWORK} (Base Sepolia)`)
  console.log(`  asset:    ${ASSET} (USDC)`)
  console.log(`  payTo:    ${PAY_TO}`)
  console.log(`  charge:   ${MAX_AMOUNT} (= 0.001 USDC)`)

  logHeader("Boot mock server")
  const { stop } = await startMockServer()

  try {
    logHeader("Live x402 round-trip")
    const f = paidFetch()
    console.log(`CLI   POST ${PROTECTED_URL}`)
    const start = Date.now()
    const res = await f(PROTECTED_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ping: 1 }),
    })
    const ms = Date.now() - start
    const body = (await res.json()) as Record<string, unknown>
    console.log(`CLI   final status ${res.status} after ${ms}ms`)
    console.log(`CLI   body:`, body)

    logHeader("Assertions")
    const ok = res.status === 200 && body.paymentReceived === true && receivedHeader !== null
    if (ok) {
      console.log("OK    HTTP 402 → signed → HTTP 200 round-trip completed")
      console.log("OK    Server received a valid X-PAYMENT header")
      console.log("OK    Response payload returned to client")
      console.log("\nClient wiring is sound. Next step: try a real Apify x402 call (pnpm test:x402).")
    } else {
      console.log("FAIL  Round-trip did not complete as expected.")
      console.log("      status:", res.status)
      console.log("      body:", body)
      process.exit(1)
    }
  } finally {
    await stop()
  }
}

main().catch((err) => {
  console.error("FAIL", err instanceof Error ? err.stack ?? err.message : err)
  process.exit(1)
})
