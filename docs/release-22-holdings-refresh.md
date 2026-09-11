# Holdings refresh fix — September 11, 2026

## Root cause

A hard refresh fetched community_holdings from D1, not the current onchain wallet. That table was replaced only during signed wallet verification. The 24-hour authentication lifetime was inadvertently also the holdings snapshot lifetime. New SPCX purchases could therefore be omitted while the session remained valid.

## Fix

- New signed sessions retain the verified public wallet address solely to refresh holdings. No client-supplied address can redirect these checks; no new signature or wallet popup is requested during automatic checks.
- A same-origin authenticated POST reuses existing finalized Solana discovery, including both SPL programs and exact supported mints. It replaces the private symbol list atomically.
- Dashboard reload, return-to-tab and a visible 60-second timer initiate checks. An explicit Refresh holdings button checks again, with a 10-second minimum interval. Background updates preserve loaded discussion pagination.
- The session's 24-hour authentication expiry is never extended by polling. Zero remaining supported holdings revoke membership sessions. Provider failures retain the last successful snapshot, surface an error and show its timestamp.
- Refresh leases prevent rapid duplicate RPC calls. SQL guards bind all writes to the same active session and lease, preventing an older request from overwriting a newer check or resurrecting a replaced/signed-out session.
- Pre-release sessions contain only wallet hashes. They cannot be scanned. They show a one-time Verify wallet action to create a refresh-capable signed session. No invented wallet address or silent fallback to another wallet is used.

## Privacy and migration

Additive migration 0006 adds nullable wallet and a refresh timestamp to community_sessions. Addresses remain server-side, are not returned in member responses, and are deleted with sign-out, replacement verification or expired-session cleanup on subsequent verification/refresh requests. Exact balances and unrelated holdings remain unsaved. Sign-in copy and the public privacy page describe session address retention. Original account/profile identity remains based on a hash.

## Validation

Regression covers signing in without SPCX, then adding the supported SPCX mint, checking again without signing, seeing the persisted holding, unchanged membership expiry, RPC outage preserving the prior list, sale removing SPCX, and zero holdings ending access. Existing wallet and core regression checks remain required. This simulates the purchase; it does not inspect the user's actual wallet or claim to have verified their transaction.

The existing editorial fixture needed pagination-aware event lookup because repeated local runs had accumulated more than a page of test events. No production editorial behavior changed.

Validation result: 93 core/wallet tests, 143 community checks and 44 editorial checks passed. Type checking and the production build passed. Browser-rendered visual verification remains unavailable in this session.
