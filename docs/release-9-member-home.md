# HolderPulse release 9 — private member home

Published 2026-09-10 to https://holderpulse.glossy-kid-6048.chatgpt.site/.

- Source: `f05feb5383ca6db3532e074ce3045875425de453`
- Saved version: `appgprj_6aa16c80630081918b8b86d4f513fc17~appgver_b46e413835ac81919851fcea9a785c78`
- Deployment: `appgdep_6aa2989f2ecc819191a2194ea084e372`
- Deployment succeeded. Existing public audience and runtime environment revision 3 retained.
- Additive D1 migration: `0002_purple_nuke.sql`; earlier migrations unchanged.

## Delivered

Automatic detection across both Solana token programs replaces the stock picker. A preflight check finds approved positive holdings before any membership signature. A fresh check after signature verification prevents an obsolete preflight from granting access. Approved mint metadata, token account ownership, integer amounts and program identity are verified; malformed or incomplete RPC responses fail closed.

Members see Home, Topics, Saved and Profile. One supported holding unlocks every discussion. The personalized feed includes held/followed topics plus General; all discussions remain available. Detected holdings are private, exact amounts are discarded, and a single chosen holder badge is opt-in. Following, bookmarks, aliases, badge choices, reply notification preferences and notifications persist in D1. Staff can curate real source links from the moderation page. There are no fabricated member posts, member counts, rewards or live-news claims.

The named-wallet routing fix is retained. Account switches during connection/signing are rejected; Wallet Standard account-change events clear the current member view/session during the connected visit. The server separately enforces the 24-hour session window on every private API request. A session may remain valid after a page reload without an active extension connection, like a normal signed login; it is not continuous wallet monitoring.

## Verification

- 33 unit tests passed: wallet routing and account/message binding, signatures, registry, original survey validation and new automatic discovery failure cases.
- 89 local community checks passed using real disposable Ed25519 signatures and an explicit mock Solana service. Includes two-member privacy isolation, multi-asset detection, cross-topic access, saves, follows, notification opt-out/read/hide behavior, moderation, invalid/replayed signatures, zero holdings and logout.
- 41 existing research integration assertions and 15 verified survey-flow requests passed.
- Type checking, targeted lint, diff whitespace checks and production build passed.
- Packaging checked built JavaScript for RPC API-key literals; no matches. Test RPC never configured on hosted Site.
- Public post-deploy checks: `/`, `/docs`, `/trust`, `/methodology`, `/tokens`, `/surveys`, `/pricing` returned 200. Guest access to member home, discussions, saved discussions and moderation was rejected (401).
- A newly generated, never-funded wallet against the deployed Helius-backed preflight returned the expected 403 before a signature was requested, in 727 ms. No user wallet, new member, test post or token transfer was used in production.

## Outstanding visual and real-wallet verification

Browser QA is **not passed** for this redesign. CUA could not verify the administrator-enforced browser security policy for the specific localhost HolderPulse tab and denied access repeatedly. Broad browser inventory was separately rejected to avoid exposing unrelated signed-in browsing. No bypass, alternate browser automation or user signature approval was attempted. Desktop/mobile rendering, interaction behavior and a completed funded-holder browser session remain unverified. Historical screenshots from older releases are not evidence for this layout.

The existing preview tab was handed the public URL through Codex, with the UI response `queued`. This is not proof that the user viewed it.

The local environment lacks the hosted Helius secret and uses the public Solana RPC, which rejected a local live check. Hosted environment secrets were retained; the deployed live preflight check passed independently.
