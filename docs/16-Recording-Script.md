# 16 — Backup Demo Video — Recording Script (T2-13)

> **Purpose:** A pre-recorded 3-min video that plays in Tab 4 as a fallback if the live demo collapses (Wifi, mic, RPC, Apify, anything).
>
> **Rule:** This video is *insurance*, not the show. Record it the night before. If live works, never play it.

---

## Recording setup

### Software
- **Screen recorder:** macOS QuickTime *File → New Screen Recording* (or ScreenStudio if zoom transitions wanted)
- **Resolution:** 1920×1080, 60fps if possible
- **Voiceover:** record live during screen capture with a quiet headset mic; do NOT post-dub (lip-sync to UI events matters)
- **Format:** MP4, H.264, mono audio, ~50-100MB target
- **Final file:** save as `public/demo-backup.mp4` so it can be played from `https://ethtwin.xyz/demo-backup.mp4` if needed

### Browser prep
- Chrome, fresh profile, no extensions visible
- Window size: exactly the laptop's screen dimensions (no resizing mid-record)
- Bookmark bar OFF, tab bar visible only if needed
- DevTools closed
- Wallpaper: solid dark
- macOS dock auto-hide ON, menu bar visible only for time

### Tabs (left to right, in order)
1. `localhost:3000` (or `ethtwin.xyz`) — Login screen
2. `https://sepolia.basescan.org/address/<smart-wallet>` — pre-loaded
3. `https://app.ens.domains/daniel.ethtwin.eth` — pre-loaded, scrolled to text records
4. `https://basescan.org/address/<x402-sender-wallet>` — Mainnet for the Apify tx

### Pre-flight (run once before recording)
- Onboarding flow tested end-to-end, twin live at `daniel.ethtwin.eth`
- Smart Wallet has ≥$5 USDC + Sepolia ETH for gas
- `X402_SENDER_KEY` wallet has ≥$3 USDC on Base Mainnet (3 retries' worth)
- `OPENAI_API_KEY` set, voice tested 1× with one full round-trip
- cTRNG cache primed (`pnpm test:cosmic` or hit the cosmic-seed endpoint twice)
- `analyst.ethtwin.eth` answering, ENSIP-25 verified
- All system notifications silenced (Slack, Mail, Calendar)

---

## Shot list (timed, total 2:55)

> Voiceover lines below are **English** for international judges. German variant is at the bottom.

### [0:00 – 0:05] Cold open — Logo card
- **Visual:** static EthTwin logo on dark background, subtle particle motion
- **VO:** *(none — let the logo breathe for 2 seconds, then voice starts)*
- **Action:** quick cross-fade to Tab 1 (login screen)

### [0:05 – 0:18] Hook
- **VO:** *"60 seconds ago I had no wallet, no crypto, no ENS name. Now I have all three — and an AI twin that works for me. This is EthTwin."*
- **Visual:** Tab 1, mouse hovers the email field

### [0:18 – 0:55] Onboarding (the 60-second magic)
- **VO:** *"Watch. I type my email. Face ID. Done."*
- **Action 0:18:** type `daniel@ethtwin.xyz`, click Continue
- **Action 0:23:** Privy passkey prompt — confirm
- **Action 0:28:** OnboardingFlow opens, step 1 → step 2 (username `daniel`)
- **Action 0:35:** step 3 — **CosmicOrb fires**, attestation hash appears
- **VO at 0:35:** *"Right now my twin is being seeded with cosmic randomness from a satellite in low-earth orbit. Not VRF. Real entropy from space."*
- **Action 0:48:** step 4 — twin spawns at `daniel.ethtwin.eth`, welcome animation
- **VO at 0:50:** *"My twin lives at `daniel.ethtwin.eth`. Persona, capabilities, stealth privacy key — all in ENS text records. ENSIP-25 verified."*

### [0:55 – 1:05] ENS proof beat
- **Action:** quick switch to Tab 3 (ENS app), scroll text records, hover `agent-registration` and `stealth-meta-address`
- **VO:** *"Everything you'd expect of an agent identity — on-chain, in ENS."*
- **Action 1:03:** switch back to Tab 1

### [1:05 – 1:35] Voice + x402 to Apify (live $1 USDC tx)
- **Action 1:05:** click Voice tab, push-to-talk
- **VO (in-app):** *"Twin, what's the sentiment on the SPACE token today?"*
- **Visual 1:10:** twin transcript: *"Let me check..."* + tool-pill `requestDataViaX402` activates
- **Visual 1:15:** x402-flow animation, $1 USDC traveling to Apify, basescan link surfaces
- **Action 1:20:** quick switch to Tab 4 (Mainnet basescan), tx is there, ~$1 USDC USDC transfer to Apify facilitator
- **VO:** *"Twin just paid Apify one dollar in USDC, on-chain, via the x402 standard. Real money, real call, real data."*
- **Action 1:28:** back to Tab 1, twin streams synthesis: *"Sentiment 72% bullish; 4 rugpull mentions in the last 24 hours."*

### [1:35 – 2:05] Agent-to-agent x402 + ENSIP-25 verification
- **VO at 1:35:** *"Twin doesn't know everything. When it needs a specialist, it hires one. And it verifies the agent first."*
- **VO (in-app) 1:40:** *"Twin, ask analyst.eth for today's best DeFi yields."*
- **Visual 1:45:** `findAgents` tool pill, ENSIP-25 verified badge appears on `analyst.ethtwin.eth`
- **Visual 1:50:** x402-flow animation between twin-node and analyst-node, $1 USDC pill traveling
- **Visual 1:55:** analyst response card, twin synthesizes: *"50% Aave V3 USDC, 50% hold. Low risk."*
- **VO at 1:58:** *"Agent-to-agent economy. Live, on-chain, ENS-discoverable, ENSIP-25 verified. No spoofing."*

### [2:05 – 2:40] HERO — Cosmic stealth send
- **Action 2:05:** switch to Stealth Send tab
- **VO:** *"Now the most important part. Privacy."*
- **VO (in-app) 2:08:** *"Twin, send 1 USDC. Privately."*
- **Action 2:12:** CosmicOrb takes over the screen — fetching → revealed → sending
- **VO at 2:15:** *"These bytes are coming from Orbitport, a real satellite. Live. Nobody can predict them. Not me. Not my server. Not Vitalik."*
- **Visual 2:25:** stealth address materialises, attestation hash, EIP-5564 viewTag
- **Action 2:30:** Tx-Approval modal — plain English: *"You're sending 1 USDC. Recipient is anonymous. Confirm with Face ID?"*
- **Action 2:33:** Face ID approval, tx broadcasts, basescan.org/sepolia opens in side panel showing the stealth tx
- **Visual 2:38:** result card — "Privacy: 10/10."

### [2:40 – 2:55] Closing
- **VO:** *"In three minutes you saw: onboarding without a seed phrase, voice-controlled twin, ENSIP-25 agent economy, plain-English approvals, live x402 payments, real cosmic privacy."*
- **VO at 2:50:** *"EthTwin. ENS-native. Voice-first. Privacy by default. Which twin do you want?"*
- **Visual:** logo card, `ethtwin.xyz`, slogan

### [2:55 – 3:00] End card
- Static logo + URL + the four bounty logos (ENS, Apify, SpaceComputer, Umia) in a row at the bottom

---

## German voiceover (alternative track)

If the audience is German-speaking, swap to this VO. Visuals identical.

- **0:05:** *"Vor 60 Sekunden hatte ich keine Wallet, kein Crypto, keinen ENS-Namen. Jetzt habe ich alles drei — und einen AI-Zwilling der für mich arbeitet."*
- **0:35:** *"Mein Twin wird gerade mit kosmischer Zufälligkeit aus einem Satelliten geseedet. Kein VRF. Echte Entropie aus dem All."*
- **1:08:** *"Twin, was ist das Sentiment auf den SPACE Token heute?"*
- **1:22:** *"Twin hat gerade live einen Dollar USDC an Apify bezahlt. On-chain. Via x402."*
- **2:08:** *"Jetzt der wichtigste Teil. Privatsphäre."*
- **2:15:** *"Diese Bytes kommen jetzt live aus dem Weltall. Niemand kann sie vorhersagen. Auch wir nicht."*
- **2:50:** *"EthTwin. ENS-native. Voice-first. Privacy by default."*

---

## Recording protocol

**Take 1:** silent — just the visual choreography. Watch back, fix UI hesitations and dead frames.

**Take 2:** with VO live. If you fluff a line past second 30, restart from the top — don't try to splice.

**Take 3+:** keep going until you have a clean take. Budget 6 takes / 90 minutes.

**Editing:**
- Trim only at start and end. No mid-cuts.
- Add a 0.5s fade-in and fade-out.
- Encode at H.264 medium preset. Verify on phone speakers (judges may watch on a laptop).

**After:**
- Save as `public/demo-backup.mp4`
- Add `<link rel="preload" as="video">` in `app/layout.tsx` if we want the URL to be hot before the pitch
- Test playback once on the demo laptop, in the demo browser, with sound

---

## Failure modes and what to do

| Failure during live demo | Switch to backup video at | Resume live at |
|---|---|---|
| Privy auth error during onboarding | 0:18 | 0:55 (after twin spawns) |
| x402 tx hangs during voice ask | 1:05 | 1:35 (after sentiment) |
| analyst.eth times out | 1:35 | 2:05 (after specialist call) |
| Cosmic-orb / stealth send breaks | 2:05 | 2:40 (closing) |
| Total wifi loss | 0:00 | never — play the whole video |

The judge does not need to know which parts were live and which were the backup. Just keep narrating in present tense over the video.
