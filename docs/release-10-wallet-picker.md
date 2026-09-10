# Wallet picker and signing repair — 2026-09-10

## Evidence and scope

The user still reports a Phantom failure after release 9. Recent production logs show three successful browser POSTs to `/api/community/challenge` at 11:53:34, 11:53:41 and 11:54:07 UTC, followed by no `/verify` POST. This narrows those attempts to the client/signature boundary after holdings detection. Logs from that release do not identify the chosen wallet or exact client error, so the cause of the user's report remains unconfirmed.

Do not mark the real Phantom flow fixed based on simulated tests. The previous namespace-based implementation had already opened Backpack during a Phantom attempt; reverting to `window.phantom.solana` or the shared `window.solana` is not an evidence-based repair.

## Changes

- Replaced the community wallet dropdown with large navy wallet rows and authentic Phantom, Backpack and Solflare icons. Only implemented integrations are listed. Browser detection distinguishes missing, compatible and duplicate registrations; missing wallets get official setup links.
- Clicking a wallet connects and detects supported holdings. The next screen asks for guideline consent and provides a separate `Sign in Phantom` (or selected wallet) button. Signing now begins directly within a fresh user click, without an intervening holdings RPC request.
- Retained exact named Wallet Standard discovery, captured connect/sign features, message-only signing, signature/account binding and server-side holdings rechecks. No generic injected-provider fallback.
- Fixed account comparison to accept refreshed equivalent account objects from the same wallet. A changed address, public key or required capability still fails closed. Signing uses the current matching account object.
- Normalize valid cross-realm typed arrays and serialized byte arrays before strict message and Ed25519 checks. Invalid bytes, different messages and wrong-account signatures still fail closed.
- Added bounded wallet-request waits, actionable errors and allowlisted operational diagnostics. Diagnostic event fields exclude addresses, holdings, signature bytes, message text and free-form errors. Trust/help copy describes the changes.
- Existing member home, persistent community data, mint registry and hosted secrets are retained. No schema or package changes.

## Verification

- 43 unit checks passed, including equivalent account refresh, cross-realm/serialized signatures, invalid bytes, wrong keys/messages, Phantom/Backpack/Sui coexistence, provider substitution and account changes.
- 93 local community checks passed using disposable real Ed25519 signatures and an explicitly simulated Solana RPC. Includes full member persistence/privacy/access flows and diagnostic input rejection. Test RPC configuration was restored afterward; it was never sent to production.
- Browser rendering and the real funded-holder Phantom flow are **not verified**. Scoped CUA inspection of the existing HolderPulse tab was denied because the administrator-enforced browser security policy service was unavailable. A later retry returned the same denial. No alternate browser or indirect bypass was used, and no user wallet signature or transaction was approved.

This release supplies compatibility fixes and better evidence for the unresolved report; it is not proof of a completed real-wallet login.

## Publication

- Type checking, targeted lint, diff whitespace checks and the production build passed.
- Archive validated with all three wallet icons and the expected Worker entrypoint. Built JavaScript contained neither test RPC configuration nor API-key URL literals.
- Pushed/built source: `449cf9f7d4e323c14d925db6cfe42458f28e8d0f`.
- Saved version 10: `appgprj_6aa16c80630081918b8b86d4f513fc17~appgver_132586a381d88191a8612cdf1696cd73`.
- Deployment: `appgdep_6aa2a1818a188191bf861873d05b0dc3`; succeeded at 2026-09-10 12:25:02 UTC.
- Public URL: https://holderpulse.glossy-kid-6048.chatgpt.site/ . Existing public audience and environment revision 3 retained.
- The deployment service confirmed publication. Post-publication browser QA remains blocked; no rendered-page or real-wallet success is claimed. The initial recent worker-log query returned no events.
