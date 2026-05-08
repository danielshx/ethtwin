# 13 — Deploy Guide (Vercel + dev wallet rotation)

> All on-chain state is on Sepolia + Base Sepolia testnet. No real funds.
> Keys in this doc are managed via `.env.local` (gitignored) locally and via
> Vercel's encrypted env vars in production.

---

## Architecture summary

The dev wallet (`DEV_WALLET_PRIVATE_KEY`) is the **operator** for every twin:

| Action | Signer |
|---|---|
| ENS subname creation (mint) | dev wallet |
| Text record writes | dev wallet |
| Sub-subname creation (per-message) | dev wallet |
| Send Tokens UI broadcasts | dev wallet |
| Funds source for Send Tokens | dev wallet treasury |

User wallets only sign auth (Privy login). Every twin's `addr` record points at the user's wallet for *display*; the registry owner is always the dev wallet so it can manage records on the user's behalf.

This means: **rotating the dev wallet rotates the entire app's signer.**

---

## Local key rotation (before any deploy)

1. **Generate a fresh keypair**

   ```bash
   pnpm wallet:generate
   ```

   Writes the new key into `.env.local` as `NEW_DEV_WALLET_PRIVATE_KEY=0x…` and prints the new address. The address is safe to share; the key never appears on stdout.

   ⚠️ **Do this in a clean shell, not inside an AI coding session.** File-diff reminders surfaced by AI tooling will leak the key into the transcript otherwise.

2. **Fund the new address** with a tiny gas allowance:

   - Sepolia: https://www.alchemy.com/faucets/ethereum-sepolia (~0.005 ETH)
   - Base Sepolia: https://www.alchemy.com/faucets/base-sepolia (~0.005 ETH)

   The rotation script transfers everything else from old → new on its own.

3. **Run rotation (dry-run first to see the plan)**

   ```bash
   pnpm wallet:rotate -- --dry-run
   pnpm wallet:rotate
   ```

   The script:
   - Transfers ENS registry ownership of `ethtwin.eth` + every registered subname (parent + all agents in the directory) old → new
   - Flips any `addr` record currently pointing at the old wallet to the new wallet (so email-only twins remain coherent)
   - Sweeps Sepolia ETH, Base Sepolia ETH, and Base Sepolia USDC old → new (keeps a small gas reserve so the sweep doesn't underflow)
   - Promotes `NEW_DEV_WALLET_PRIVATE_KEY` into `DEV_WALLET_PRIVATE_KEY` and updates `NEXT_PUBLIC_DEV_WALLET_ADDRESS` in `.env.local`
   - Removes the temp `NEW_DEV_WALLET_PRIVATE_KEY` entry

   **Limitation:** sub-subnames (`msg-…`) created by the messenger are not transferred. Existing message contents stay readable forever; new messages are created as children of the (newly-owned) parent subnames. Safe trade-off.

4. **Restart the dev server**

   ```bash
   # Ctrl-C the running dev server, then:
   pnpm dev
   ```

   Verify with `pnpm ens:check-parent` — should show the new address as `ethtwin.eth` owner.

---

## Deploying to Vercel

### Pre-flight

- Push the repo to GitHub (or use `vercel deploy` from CLI)
- `.env.local` is gitignored, so secrets don't ship in code
- Verify locally that everything works with the rotated key before deploying

### Vercel project settings → Environment Variables

Add these under **Production** (and optionally **Preview** if you use PR previews):

| Key | Value | Sensitive? |
|---|---|---|
| `NEXT_PUBLIC_PRIVY_APP_ID` | from `.env.local` | no (`NEXT_PUBLIC_` is public anyway) |
| `PRIVY_APP_SECRET` | from `.env.local` | **yes** — mark Sensitive |
| `PRIVY_VERIFICATION_KEY` | from `.env.local` | no (it's a public key) |
| `OPENAI_API_KEY` | from `.env.local` | **yes** |
| `SEPOLIA_RPC` | your Alchemy URL | **yes** (rate-limit auth) |
| `NEXT_PUBLIC_BASE_RPC` | `https://sepolia.base.org` | no |
| `NEXT_PUBLIC_PARENT_DOMAIN` | `ethtwin.eth` | no |
| `NEXT_PUBLIC_ENS_NETWORK` | `sepolia` | no |
| `NEXT_PUBLIC_CHAIN_ID` | `84532` | no |
| **`DEV_WALLET_PRIVATE_KEY`** | **rotated key** from step 1 | **yes** — Sensitive |
| `NEXT_PUBLIC_DEV_WALLET_ADDRESS` | the rotated public address | no |
| `NEXT_PUBLIC_APP_URL` | leave **unset** | — |

`NEXT_PUBLIC_APP_URL` is intentionally left blank on Vercel. `lib/api-guard.ts:resolveAppUrl()` falls back to Vercel's auto-injected `VERCEL_URL`, so previews and prod deployments get the right origin without manual config.

### What "Sensitive" means on Vercel

When you tick the Sensitive box, Vercel:
- Encrypts the value at rest (same as non-sensitive vars actually — they're all encrypted)
- Hides the value from the dashboard UI after save (you can re-set but not re-read)
- Excludes the value from build logs

This protects against casual screen-share leaks but **not** against project members or compromised builds. Anyone in your Vercel team can read or replace env values.

### Privy dashboard — add the deploy URL

After your first deploy you'll get a URL like `<project>.vercel.app`. Without this step, Privy's login modal will refuse to load on the deployed origin.

1. https://dashboard.privy.io → your app
2. **Settings → Domains**
3. Add `https://<project>.vercel.app`
4. (Optional) for PR previews: also add `https://*.vercel.app` if Privy supports wildcards on your plan, otherwise add each preview URL as it comes up

---

## Security reality check

Storing a hot wallet key in any env-var system, including Vercel's, has these properties:

| Threat | Status |
|---|---|
| Vercel's database leaked publicly | ✅ encrypted at rest, attacker gets ciphertext |
| Project members with Vercel access | ❌ they can replace the var with a logger and capture the value |
| RCE / SSRF in a deployed route | ❌ runtime can read `process.env` |
| Compromised CI / build hook | ❌ env is exposed during deploy |
| Key visible in this repo's git history | ✅ `.env.local` gitignored — never committed |

**For this hackathon demo:** acceptable. Sepolia + Base Sepolia testnet only, no real money. Rotate the key when the demo is over.

**For real production with real funds:** never put a hot key in env. Use one of:
- Privy / Turnkey for end-user signing (no centralized signer)
- AWS KMS / GCP KMS for backend signing (key never leaves the HSM)
- Fireblocks / Coinbase Custody for treasury operations
- A purpose-built signing service with hardware-backed roots

---

## Common deploy issues

| Symptom | Likely cause | Fix |
|---|---|---|
| Privy modal won't open on deploy | Domain not in Privy allow list | Add the Vercel URL in Settings → Domains |
| `/api/onboarding` returns 500 with `DEV_WALLET_PRIVATE_KEY missing` | Env var not set on Vercel | Add it under Settings → Environment Variables, redeploy |
| Mint succeeds locally, fails on Vercel with `Parent ENS name has no resolver` | Vercel's `SEPOLIA_RPC` is missing or wrong | Re-paste the Alchemy URL |
| Mint reverts with `subname is owned by a different wallet` | Local + Vercel using different dev wallets | Use the same rotated key in both, or rotate again so a single wallet controls all subnames |
| Twin Chat returns mock reply | `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` not set on Vercel | Add the key |
| OpenAI returns `insufficient_quota` | OpenAI account out of credits | Top up at https://platform.openai.com/account/billing |
| `/api/onboarding` times out (504 / `FUNCTION_INVOCATION_TIMEOUT`) on Vercel Hobby | Onboarding waits for multiple Sepolia tx receipts; Hobby caps `maxDuration` at 60s | Already mitigated: route declares `maxDuration = 60` and uses `setRecordsMulticall` to collapse 9 record-write txs into one. If you still hit the timeout, the Sepolia RPC is slow — switch to a paid Alchemy/Infura key or upgrade to Vercel Pro (300s default). |
