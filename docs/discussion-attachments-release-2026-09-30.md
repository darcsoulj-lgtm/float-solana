# Discussion attachments — public release

## Scope and boundaries

Optional Add chart / Add snapshot controls live in the real discussion composer. Plain text and polls remain supported. Server-generated, owner-bound attachment drafts expire after ten minutes; posting copies the sanitized payload into the thread. Readers never trigger market provider requests. Edits preserve the original attachment; hiding/deleting a thread also hides its attachment through the existing read boundary.

Charts reuse the canonical Backpack adapter, exact verified mint registry, completed External hourly bars and a shared five-minute public cache. A post freezes its chart and original timestamps. These are stock references, not live token trade prices. Missing hours remain gaps. Provider response bytes are bounded before buffering.

Portfolio preparation takes the wallet only from the verified session, scans finalized accounts and validated mints again, and uses the existing market observation service. Only Backpack holdings are in scope. Every position must have a fresh, credible valuation, a matching decimal count and a unit multiplier of one. Non-unit multipliers (including currently observed MU), missing or stale prices and conflicts block the entire snapshot rather than silently excluding a position. No claim of universal availability or independent-provider accuracy is made.

Public snapshots contain only token names, rounded percentages and dates. Quantities, addresses and total values are never copied into drafts or posts. Largest-remainder rounding totals 100.0%; positive dust rounding to zero is shown as <0.1%. The author previews and checks explicit sharing consent; the server requires it again for posting. A separate authorization gate still checks active membership at publication.

## Verification

- Strict types, repository lint, all 405 tests and production build passed.
- SQLite-backed tests cover migration, ownership isolation, expiry, consent, repeated public reads, hidden threads, sanitization, missing/stale/scaled-unit valuation failure, exact percentage rounding and provider caching.
- Portfolio service tests inject an isolated RPC fixture and verify that supplied wallet/member/total values cannot override session ownership. No real user's wallet was signed or posted during QA.
- Browser: local authenticated fixture fetched an actual Backpack MU chart, published it through the real API, reloaded it and opened its detail view. 390px mobile and desktop rendering checked; no horizontal overflow or browser errors observed. Portfolio visual QA used an explicitly labeled simulated allocation. Real RPC balance parsing is covered by the existing Solana suites; a real-user signed production portfolio publication was not performed.
- Production: migration 0018 applied successfully. Worker deployed as 29dc6680-4796-42f6-b98b-3341c3c32300. Public discussions and methodology checked; unauthenticated/cross-origin writes checked separately. No production test posts created.

## Usage

Verify a supported holding, choose New discussion, then Add chart or Add snapshot. Prepare preview, review it, and post. Portfolio percentages require the sharing checkbox. Expired previews must be refreshed. Old posts are unchanged.
