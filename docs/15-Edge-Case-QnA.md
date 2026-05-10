# 15 — Edge-Case Q&A (Judge Follow-ups)

> Crisp answers für Q&A nach dem 3-min Pitch. Zwei bis vier Sätze pro Antwort. Technische Begriffe in English, Erklärung auf Deutsch wo natürlicher.

---

## Core Q&A (T2-14 Liste)

### Wie sichert ihr die Stealth-Address-Generierung ab?

- Stealth-Address-Generierung läuft via `@scopelift/stealth-address-sdk` (offizielle EIP-5564 Implementation). Ephemeral Keys aus dem CSPRNG der SDK, Recipient leitet `stealth-meta-address` aus seinem ENS Text Record ab.
- Für die Twin-zu-Twin Message-Encryption nutzen wir static-static ECDH auf den EIP-5564-Spending-Keys (gleiche Primitive wie Stealth) plus AES-256-GCM mit Domain-Tag-gebindetem Key.
- Recipient-Side Spending+Viewing-Keys sind deterministisch aus einem Master-Secret + ENS abgeleitet (HMAC-SHA256 → secp256k1-Skalar) — Production würde User-eigene KMS-Keys nutzen statt Server-Master.

### Was ist ENSIP-25?

- ENSIP-25 ist der offizielle ENS-Standard (2025/2026) für verifizierbare AI Agent Identity in ENS.
- Er definiert ein Text-Record-Format `agent-registration[<ERC-7930-interop-address>][<agentId>] = "1"`, das einen Agent in einem on-chain Registry (typisch ERC-8004 IdentityRegistry) mit einer ENS-Adresse verknüpft.
- Wir implementieren das nativ — jeder Twin und jeder Sample-Agent (z.B. `analyst.ethtwin.eth`) hat den Record gesetzt, gegen ERC-8004 IdentityRegistry auf Base Sepolia (`0x8004A818BFB912233c491871b3d84c89A494BD9e`).
- Damit kann Twin live verifizieren dass `analyst.eth` ein echter registrierter Agent ist, nicht ein Imposter — bevor er $1 USDC dorthin schickt.

### Warum $1 USDC pro Apify-Call?

- Das ist Apify's hartes x402-Minimum für Pay-Per-Event Actors — kein Verhandlungsspielraum.
- Für Real-Time-Daten (Sentiment-Scrapes, Job-Listings, Markt-Feeds) ist das marktüblich. Twin nutzt es selektiv, agent-driven, nicht user-driven.
- Im echten Produkt wird Twin batchen (1 Apify-Call → mehrere User-Antworten cachen) und Cheaper-Tier-APIs für nicht-zeitkritische Queries verwenden.
- Wir nutzen `@x402/fetch` v2.x (x402-foundation), nicht die ältere v1, weil v2 der Standard ist und mit `@coinbase/x402` als Facilitator settled.

### Wie skalierbar ist das?

- Stateless Backend auf Vercel — horizontal skalierbar by design. Kein Centralized DB-Bottleneck.
- ENS skaliert nativ: Subname-Reads sind RPC-Calls, cacheable, gratis. Wir cachen Resolver-Reads serverseitig (`readTextRecordFast`).
- x402-Fees finanzieren ihren eigenen Throughput — jede Tx zahlt für die Infrastruktur die sie braucht.

### Was ist das Geschäftsmodell?

- Drei Säulen: (1) Subscription für Privacy-Premium und Pro-Voice, (2) x402 service fees auf agent-to-agent payments, (3) B2B Twin-as-API für DApps die ihren Usern Twin-UX geben wollen.
- Markt: 100M+ Crypto-Wallet-User. Ledger macht $200M+ ARR mit Hardware-Privacy — wir machen Software-Privacy + Agent-UX, größerer TAM, niedrigere CAC.
- Token $TWIN gibt einen vierten Hebel: Service-Credits, Governance, Premium-Tier-Unlock — alles native usage drivers, nicht Speculation.

### Token-Distribution?

- Standard AGTC-Setup auf Umia: 30% community, 25% team (4-year vesting, 1-year cliff), 20% public sale via Umia, 15% treasury, 10% advisors + ecosystem grants.
- Utility: $TWIN als Service-Credit für x402-Payments zwischen Twins, Governance über Parent-ENS-Kuration und Agent-Registry-Listing, Premium-Tier-Unlock (Multi-Twin, Pro-Voice).
- Kein Airdrop in 48h. Kein Token-Launch in der Demo. Token ist Pitch-Asset und Roadmap-Item, nicht Deployment-Item.

---

## Anticipated Judge Follow-ups

### Warum Sepolia ENS und nicht Mainnet?

- 48h-Hackathon-Constraint: Mainnet ENS-Subname-Operations kosten echtes ETH und sind langsamer zu iterieren. Sepolia ENS ist on-chain, frei, voll funktional.
- ENSIP-25 + ERC-8004 sind mainnet-spec-kompatibel — wir verifizieren gegen die Base Sepolia Deployment (`0x8004A818BFB912233c491871b3d84c89A494BD9e`), die Mainnet-Deployment (`0x8004A169...`) ist seit 29. Januar 2026 live und ein 1-line config-change.
- NameStone offchain-ENS bleibt als Backup-Pfad eingebaut, falls Sepolia-RPC zickt.

### Können zwei Twins miteinander reden?

- Ja, live in der Demo: Twin findet `analyst.ethtwin.eth` über die `agents.directory` Text Record auf `ethtwin.eth`, resolved den Eintrag, verifiziert ENSIP-25 Badge, ruft den `twin.endpoint` mit `@x402/fetch` und $1 USDC payment.
- Wir haben auch on-chain ENS-Subname-Messaging gebaut (`lib/messages.ts` + Messenger-Tab) — Twin kann eine Nachricht als kurzlebigen Subname registrieren und der Empfänger liest sie aus seinem ENS-Reverse-Lookup.
- Für die Demo bleibt der Hero-Flow x402-driven — schneller, klarer, on-chain visible.

### Was stoppt Impersonation? Kann jemand `daniel.ethtwin.eth` faken?

- Subname-Minting läuft via dev wallet (parent owner von `ethtwin.eth`) und ist an Privy-Email-Auth gebunden — eine Email kann nur einen Subname claimen.
- ENSIP-25 verifiziert dass ein Agent wirklich in ERC-8004 IdentityRegistry registriert ist, nicht nur "behauptet" zu sein. Imposter-Subnames ohne Registry-Eintrag bekommen kein Verified Badge im Twin-Chat.
- Stealth-Meta-Address ist on-chain immutable nach Onboarding — ein Angreifer kann nicht den Receiver-Key überschreiben ohne Sepolia-ETH und parent-wallet-Zugriff.
- In Production würde der parent ownership zu einem multisig oder DAO migrieren — der dev wallet ist Hackathon-Scope.

### Was wenn die x402 Live-Tx auf der Bühne fehlschlägt?

- Pre-signed Tx vorbereitet im Block-Explorer-Tab — Pitcher switcht und zeigt: "Hier die identische Tx von 10 Minuten vor Pitch."
- Backup-Demo-Video aufgenommen (T2-13).
- Drop-Rule um Hour 36: wenn x402 Live broken → Tx pre-sign + Block-Explorer als Beweis. Story bleibt: x402 funktioniert, Demo-Conditions sind brittle.
- Wichtig: Apify x402 Mainnet ist primary — wenn Base Sepolia facilitator nicht mitspielt, switchen wir zu Mainnet mit funded wallet.
