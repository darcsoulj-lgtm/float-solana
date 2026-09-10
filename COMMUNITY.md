# HolderPulse community

Current product: one shared discussion board. A positive supported MU or SKHY token balance unlocks all topics, including SPCX discussion. No simulated community posts or fabricated membership. Legacy surveys and records remain accessible through their original routes but are outside the main community navigation.

## Runtime

Existing Vinext / Cloudflare Worker / D1 project. Apply additive migration 0001 locally using the existing db:local script. Sites applies packaged migrations on deployment. Migration 0000 is unchanged.

SOLANA_RPC_URL is server-only. Default public Solana mainnet RPC can rate-limit or reject Worker traffic; configure a dedicated mainnet RPC endpoint for reliable membership checks. Never configure the local test RPC on a hosted deployment. ADMIN_EMAILS controls the ChatGPT-authenticated administrator allowlist. No private wallet keys or payment custody.

## Membership and privacy

The server verifies a strict Ed25519 signature over a one-use, five-minute, origin-bound challenge, then checks exact allowlisted mint and token accounts at finalized commitment. Token / Token-2022 metadata and ownership are validated. A positive raw token balance qualifies. The UI does not use scaled token amounts for membership.

Membership and HttpOnly, SameSite=Lax session expire after 24 hours. HTTPS adds Secure. Selling after verification does not immediately revoke membership. New login invalidates previous sessions. Suspension invalidates all sessions immediately. A badge is optional and means a holding was checked within the membership window, not continuous holding or investor expertise.

The community stores a deterministic private wallet hash, alias, qualifying token, verification expiry, preferences and content. Known public addresses can be matched to hashes: this is pseudonymity, not anonymity. Exact balances are not stored. Temporary challenge wallet addresses are deleted on successful verification or after expiry by cleanup on later challenges. The RPC provider sees queried wallet addresses. No wallet address or wallet hash appears in member feed responses. Cookies, signatures and balances are never exposed in logs.

## Operations

/admin/community requires ChatGPT sign-in and server-side admin authorization. Reports, hidden content, member suspensions and restorations are persisted and audited. The initial console shows up to 100 open reports, 100 recent members, and 50 hidden items of each type. Removed content is hidden, not erased; operator deletion requests currently require manual handling. Contact: elcresearch.support@gmail.com.

All member API reads enforce current membership. Mutation requests require same-origin JSON and bounded input, with persistent rate limits. Threads and replies use compound time/id pagination. Content is rendered as plain React text. Members may copy discussions; they are not confidential. Refresh is manual, not realtime chat. Mobile wallet browser injection is supported where available; external deep-link wallet pairing is not implemented.

## Validation

`node --test tests/core.test.mjs`: existing signature and validation checks.
`node tests/community-flow.mjs`: local Worker integration with real ephemeral wallet signatures and an explicit mock RPC. Covers guest access, invalid/replayed signature, MU entry into SKHY topic, persistent threads/replies, optional badge/privacy, reports and moderation, suspension, zero balance rejection, logout. Requires dev server at localhost:3000 and local test admin config, restores local env in finally.

No live funded holder-wallet session or mobile extension pairing has been tested. Dialog regression coverage now includes real Chromium renders at 1440, 768, 390 and 320px, with browser-only member fixtures for profile/report/removal dialogs. `tests/dialog-browser.mjs` accepts PLAYWRIGHT_MODULE and CHROME_PATH when using a bundled browser runtime. Server render, API tests, strict lint/type checking and production build are performed. Live RPC membership reliability depends on configured provider.

No rewards, airdrops, payments or partner programs are active. Community discussion is not investment advice and does not imply affiliation with Backpack or underlying companies.

## Visual system

Warm ivory surfaces, dark ink, deep blue accents, and serif display headlines. Backpack red was considered and explicitly rejected by the user. Legacy research grids use a namespaced class to avoid overriding Tailwind and shared dialog/checkbox/radio components. Every community dialog has one vertical flow, bounded viewport sizing, accessible close controls, and visible field labels.
