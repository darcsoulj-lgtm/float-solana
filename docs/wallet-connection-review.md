# Wallet connection review — 2026-09-10

Scope: HolderPulse source at the stock-registry expansion. This is a limited internal review, not an independent audit or guarantee.

- Clients use wallet.connect and wallet.signMessage only. No transaction-signing, transaction-sending or allowance instruction calls are present in the two wallet clients. Regression test covers these call names.
- Server creates readable, five-minute challenges bound to origin, wallet, token and nonce. Strict Ed25519 verification precedes atomically consuming the challenge. Replays fail.
- Membership reads exact allowlisted Solana mints at finalized commitment and checks token-account owner, mint, initialization, supported program and positive integer balance. Unknown symbols cannot supply their own mint.
- Server-owned Helius endpoint is a hosted secret. Client receives neither RPC credentials nor private keys. No recovery phrase is requested or collected.
- Member mutations require matching Origin and JSON. Session cookies are HttpOnly, SameSite=Lax, Secure on HTTPS, with 24-hour expiry. Suspension revokes sessions.
- Wallet address is disclosed to the site and RPC provider; public-chain activity is linkable. Exact balances and raw wallet addresses are excluded from member profiles. Signature authenticates community membership and does not authorize a transfer in this implementation.
- Unresolved limits: no independent audit; compromise of site/dependencies/operator account/wallet can change behavior. Snapshot verification permits selling after entry until session expiry. Existing moderation and manual privacy-request handling remain.

Evidence: tests/core.test.mjs, tests/community-flow.mjs, lib/solana.ts, lib/community-server.ts, app/api/community/[[...path]]/route.ts. The reviewed token registry and finalized mint metadata are recorded separately in token-registry-review.json.
