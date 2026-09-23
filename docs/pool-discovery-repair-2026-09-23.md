# Ordinary-pool discovery repair — 23 September 2026

## Cause and boundary

The multi-token DEX Screener endpoint supplies a discovery snapshot. Float then queried the individual token-pairs endpoint for only the two highest discovered-volume tokens in each group of 30. A lower-ranked token could therefore retain one discovery pool even when the individual endpoint returned many eligible pools. SPCX reproduced this exact failure. This was an application selection limit, not evidence that the additional pools were proprietary AMMs.

Remove the rank and positive-volume cutoffs: every token with an eligible discovery pool receives individual detail enrichment, including zero-volume pools. Continue exact Solana mint, counterpart, and pool-address validation and deduplication. No eligibility or issuer-total policy changed.

This is still partial provider coverage. Tokens absent from discovery are not all individually scanned each cycle; neither endpoint establishes full Solana coverage or complete prop-AMM coverage. Birdeye is not integrated by this change. Official Stonkfun discovery retains its existing separate policy.

## Execution and failure handling

Preserve the existing 90-token cache keys and observation timestamps, avoiding a cold-cache deployment. The private MarketRefresh service splits pool collection into at most 30 mints per call; it validates mints against the same verified registry. There is no public refresh endpoint. Each chunk paces DEX requests and has a 25-second deadline. The parent merges three chunks before publishing one canonical snapshot. Its pool cache lease is 120 seconds, covering those deadlines; unrelated price/supply jobs retain their existing deadlines.

RPC error responses explicitly preserve HTTP status and Retry-After because transported exceptions lose custom properties. A failed chunk rejects the new snapshot, stops later chunks and retains the previous cached payload and timestamp. A 429 still activates the existing shared DEX cooldown. No unavailable value is converted to zero.

Free-provider budget: the recorded registry replay required 45 discovery requests and 126 individual token requests per four-minute cycle, plus the existing official-pair lookups. No per-visitor overview refresh is introduced. More activity increases requests; serialized pacing, deadlines and cooldowns bound work rather than silently selecting only high-volume stocks.

## Evidence

Public response captures are retained locally under research/pool-repair-2026-09-23 (not bulk-committed). The audit individually queried 128 tokens: all 126 previously observed tokens and two empty controls across the remaining issuers. All 1,338 registry tokens were also queried through the discovery endpoint in 45 groups. There were 126 discovery-present tokens: Backpack 60, Ondo 5, PreStocks 7, Tessera 1 and xStocks 53.

Replaying the same captured response set through the repaired fetchPools implementation matched every eligible captured detail pool for all 126 discovery-present tokens. Example counts under old versus repaired selection:

| Token | Old selection | Repaired selection |
|---|---:|---:|
| SPCX | 1 | 21 |
| GOOGLx | 1 | 22 |
| AAPLx | 1 | 15 |
| COPX | 1 | 13 |
| ANTHROPIC | 1 | 12 |

Snapshot times differ between discovery and individual response capture. Their dollar-volume differences must not be described as an exact missing-volume percentage. Pool counts are returned/eligible counts, not a census of all existing pools. The raw response set includes ineligible counterpart pools which remain excluded.

## Validation before deployment

- Full release gate: 360 tests, strict TypeScript, repository lint and production build passed.
- Production dependency audit: zero reported advisories; lockfile unchanged.
- Recorded SPCX fixture checks all 21 eligible pools and deduplication.
- Regression checks cover third-ranked/zero-volume tokens, spoof pairs, shared-pool deduplication, failed detail refresh, 30-mint chunks, RPC cooldown propagation, invalid private job inputs and the extended lease preventing duplicate in-flight refreshes.
- Production and rendered-page verification recorded after deployment below.
