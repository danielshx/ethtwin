# 13 — Chat-only Demo Runbook

Goal: make the demo reliable even if Voice/WebRTC is dropped. The primary path is: Onboarding → Twin Chat → ENSIP-25 agent discovery → optional x402 proof → Stealth Send.

## Lock the scope

For the stage demo, treat voice as optional. Do not block the demo on OpenAI Realtime. The Twin Chat tab is the source of truth.

## Required env for chat-only

Minimum local/prod env:

```bash
NEXT_PUBLIC_PRIVY_APP_ID=...
PRIVY_APP_SECRET=...
PRIVY_VERIFICATION_KEY=...
DEV_WALLET_PRIVATE_KEY=...
NEXT_PUBLIC_DEV_WALLET_ADDRESS=...
NEXT_PUBLIC_APP_URL=https://...
OPENAI_API_KEY=...        # preferred for chat stability
# or ANTHROPIC_API_KEY=... # fallback if OpenAI unavailable
```

`/api/twin` works without a model key, but returns a mock reply. That is useful for UI testing only; not enough for the live demo.

## Pre-demo smoke test

Run these in order:

```bash
pnpm install
pnpm typecheck
pnpm build
pnpm test:chain
pnpm test:claude   # only if using ANTHROPIC_API_KEY
pnpm dev
```

Then in the browser:

1. Login with Privy.
2. Mint or load a known twin, e.g. `daniel.ethtwin.eth`.
3. Open **Twin Chat**.
4. Send the three stable prompts below.
5. Keep the best successful run open in another tab as backup.

## Stable demo prompts

### Prompt 1 — identity / ENS

```text
Who are you and what lives in my ENS records? Keep it under 4 sentences.
```

Expected result: Twin speaks as the ENS identity, mentions persona/capabilities/privacy, does not say it is ChatGPT/Claude/OpenAI.

### Prompt 2 — agent discovery / ENSIP-25

```text
Find the agents I can hire and tell me which ones are ENSIP-25 verified.
```

Expected result: `findAgents` tool runs. UI shows agent pills and verified/unverified badges.

### Prompt 3 — transaction explanation

```text
Decode this transaction before I sign it: to 0x036CbD53842c5426634e7929541eC2318f3dCF7e, value 0, data 0xa9059cbb0000000000000000000000004e09c220bd556396bc255a4dd24f858bafeba6f500000000000000000000000000000000000000000000000000000000000186a0
```

Expected result: `decodeTransaction` tool runs and explains a USDC transfer in plain English.

## Optional prompt — agent hire

Use only after x402 proof is ready:

```text
Hire analyst.ethtwin.eth to give me a one-paragraph DeFi risk summary for USDC on Base today.
```

Expected result: `hireAgent` runs. In dev mode it may be free if `X402_ANALYST_PAY_TO` is unset. For the x402 proof, set `X402_ANALYST_PAY_TO`, `X402_ANALYST_PRICE`, `X402_ANALYST_NETWORK`, and `X402_SENDER_KEY`.

## What to say if Voice is asked about

"Voice has a Realtime session endpoint ready, but for the live demo we locked the reliable path to chat. Same Twin, same ENS identity, same tools."

## Failure playbook

- If chat says model key missing: env is not loaded. Add `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` and restart.
- If ENS reads fail: continue with the same twin name; `/api/twin` falls back to defaults.
- If `findAgents` returns empty: use ENS Messenger or Stealth Send as the second beat.
- If tool call stalls: stop generation and send Prompt 3, which is deterministic and local.
- If production is flaky: switch to local `pnpm dev` with the same env.

## Demo beat under 90 seconds

1. "This twin lives at `daniel.ethtwin.eth`. Its identity and capabilities are ENS records."
2. Send Prompt 1.
3. Send Prompt 2 and point to the ENSIP-25 badge.
4. Send Prompt 3 and point to the plain-English transaction explanation.
5. Transition: "Now we prove payments with x402."
