# Member-created rooms update

Members create rooms from **Rooms → Create a room** with a name and description. Every verified member can create, follow, and post in a room. Creation persists the room and follows it for its creator in one transaction; duplicate normalized names are rejected and creation is limited to three attempts per minute per member. Existing global membership and suspension rules apply. Room creation does not confer admin privileges.

The directory no longer maps the token registry into empty topics. It shows member-created rooms and existing legacy topics with visible discussions. Existing posts are preserved. General remains the shared posting destination; it appears in discovery only when it has discussions. Newly supported stocks do not generate room entries.

Your brief now defaults to **My holdings**: direct company coverage for verified holdings only. Following rooms affects discussions, not this news filter. Broader industry stories remain in **All coverage** with a context label. The reviewed NVIDIA story is industry context, not evidence of NVIDIA ownership. Administrators choose the coverage relationship in the editor.

The sections below document earlier community behavior where not superseded by this update.

# Float community

Current product (updated September 11, 2026): a private member home with one shared discussion feed, personalized by automatically detected holdings and followed topics. A positive balance of any token in the reviewed registry unlocks all topics. The registry currently has 41 enabled Backpack stock/ETF tokens, including SPCX. No simulated community posts or fabricated membership. Legacy surveys and records remain accessible through their original routes but are outside the main community navigation.

## Runtime

Existing Vinext / Cloudflare Worker / D1 project. Apply additive migrations 0001 and 0002 locally using the existing db:local script. Sites applies packaged migrations on deployment. Previously applied migrations remain unchanged. 0002 adds private holdings, follows, bookmarks, source records, in-app reply notifications, and a constant-default notification preference.

SOLANA_RPC_URL is server-only. Default public Solana mainnet RPC can rate-limit or reject Worker traffic; configure a dedicated mainnet RPC endpoint for reliable membership checks. Never configure the local test RPC on a hosted deployment. ADMIN_EMAILS controls the ChatGPT-authenticated administrator allowlist. No private wallet keys or payment custody.

## Membership and privacy

Before requesting a signature, the server scans both SPL Token programs with getTokenAccountsByOwner at finalized commitment. Only positive balances whose exact mints appear in the reviewed registry proceed to a batched getMultipleAccounts mint validation. Zero qualifying holdings return an actionable 403 before signing; any failed or malformed provider result returns 503 and grants no access. The server then verifies a strict Ed25519 signature over a one-use, five-minute, origin-bound challenge, then repeats discovery before granting access. No stock picker or client-supplied symbol controls eligibility. Accounts use exact allowlisted mints and validated token programs. Token / Token-2022 metadata and ownership are validated. A positive raw token balance qualifies. The UI does not use scaled token amounts for membership.

Membership and HttpOnly, SameSite=Lax session expire after 24 hours. HTTPS adds Secure. Selling after verification does not immediately revoke membership. New login invalidates previous sessions. Suspension invalidates all sessions immediately. A badge is optional and means a holding was checked within the membership window, not continuous holding or investor expertise.

The community stores a deterministic private wallet hash, alias, supported token symbols with verification slots/times, an optional selected badge, verification expiry, followed topics, private saved references, notification preferences and content. Known public addresses can be matched to hashes: this is pseudonymity, not anonymity. Verified quantities are stored privately for the member’s portfolio view; they are not included in public profiles or discussion feeds. Temporary challenge wallet addresses are deleted on successful verification or after expiry by cleanup on later challenges. The RPC provider sees queried wallet addresses. No wallet address or wallet hash appears in member feed responses. Cookies, signatures and balances are never exposed in logs.

## Operations

/admin/community requires ChatGPT sign-in and server-side admin authorization. Reports, hidden content, member suspensions/restorations, and curated source additions/visibility changes are persisted and audited. Three reviewed official source directories initialize the source library; they are labeled curated links, not live news or fabricated member activity. The initial console shows up to 100 open reports, 100 recent members, and 50 hidden items of each type. Removed content is hidden, not erased; operator deletion requests currently require manual handling. Contact: elcresearch.support@gmail.com.

All member API reads enforce current membership. `/api/community/home` returns only the current member’s holdings, follows, bookmarks and notifications. A single holding unlocks every topic; `feed=personal` includes General plus held/followed topics. `feed=saved` joins only that member’s bookmarks. There are no balances or unrelated asset records in these tables. Mutation requests require same-origin JSON and bounded input, with persistent rate limits. Threads and replies use compound time/id pagination. Content is rendered as plain React text. Members may copy discussions; they are not confidential. Refresh is manual, not realtime chat. Mobile wallet browser injection is supported where available; external deep-link wallet pairing is not implemented.

## Validation

`node --test tests/core.test.mjs`: existing signature and validation checks.
`node tests/community-flow.mjs`: local Worker integration with real ephemeral wallet signatures and an explicit mock RPC. Covers guest access, invalid/replayed signature, MU entry into SKHY topic, persistent threads/replies, optional badge/privacy, reports and moderation, suspension, zero balance rejection, logout. Requires dev server at localhost:3000 and local test admin config, restores local env in finally.

Current release automated results: 33 unit checks and 89 local community integration checks passed, including genuine disposable signatures against an explicitly simulated RPC, two-member privacy isolation, multiple detected holdings, cross-topic participation, saving/following, notification opt-out/read state, moderation, invalid mint/amount/account data, replay, zero holdings, and selected-wallet routing. Type checks, targeted lint, and the production build passed.

**Current release browser QA is blocked.** On 2026-09-10, CUA repeatedly reported that the browser security policy service was unavailable for the exact HolderPulse localhost tab. Broad inventory was separately rejected to protect unrelated browsing; no workaround was used. Previous dialog screenshots are historical evidence only and do not validate this redesigned member home. Desktop/mobile visual appearance and the completed funded-wallet browser flow are not certified by this release. No real user signature approval or transaction was performed.

The local `.env` currently uses the public Solana RPC and has no Helius secret. A real empty-wallet local check returned the explicit provider-authorization error, as expected when that public endpoint rejects requests; it was not a successful Helius test. The public Site retains its separately configured secret `SOLANA_RPC_URL` and environment revision 3. Never copy a fixture URL to production.

No rewards, airdrops, payments or partner programs are active. Community discussion is not investment advice and does not imply affiliation with Backpack or underlying companies.

## Visual system

Warm ivory surfaces, dark ink, deep blue accents, and serif display headlines. Backpack red was considered and explicitly rejected by the user. Legacy research grids use a namespaced class to avoid overriding Tailwind and shared dialog/checkbox/radio components. Every community dialog has one vertical flow, bounded viewport sizing, accessible close controls, and visible field labels.

## Token registry expansion — 2026-09-10

41 enabled Solana security mints selected from the official Backpack /api/v1/assets endpoint (US securities with deposits or withdrawals enabled). All passed finalized getMultipleAccounts mint/program/initialized checks; evidence and exact addresses are in docs/token-registry-review.json. Disabled catalogue entries and crypto assets were excluded. Registry is a reviewed snapshot, not automatically refreshed or expanded from untrusted token symbols. The public /tokens page shows sources and review date.

September 11 portfolio update: latest quantities are stored in community_holdings for the authenticated member only. Public author responses never include these fields. Profiles support nickname, bio and a member-visible JPEG photo in R2. News uses company-matched Yahoo Finance RSS headlines with 15-minute shared caching and seven-day filtering; no article bodies are retained.
