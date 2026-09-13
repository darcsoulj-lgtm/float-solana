# Solana issuer valuation reconciliation — 13 September 2026

## What changed

Ondo was understated for two separate reasons: the registry omitted 22 listings, and the old supply × quote calculation withheld tokens with an unconfirmed scaled-token price convention. The new adapter reads the latest dated Solana supply and USD-value breakdown from DeFiLlama's Ondo Global Markets endpoint. It preserves their common observation timestamp and never multiplies the result by a second quote or display multiplier. Current trading quotes remain separate observations.

The issuer headline order is now onchain value, 24-hour DEX pool volume, and pool liquidity. Token count stays beside Stocks. Markets shows an aggregate and issuer values in the existing issuer controls, without duplicate summary cards.

## Evidence and reconciliation

- [Free protocol endpoint](https://api.llama.fi/protocol/ondo-global-markets): the snapshot at 2026-09-13 10:49:35 UTC has 202 valued Solana products totaling **$25,483,537.78152**. The original date is retained in the app.
- The old registry omitted 21 ETFs and BTGOon. Together these account for **$4,620,848.17322** in that snapshot. Ondo coverage is now 438 registered products, of which 202 have paired valuations in this source snapshot; unvalued products are not assumed to have zero supply.
- The 22 additions were checked against finalized Solana mint accounts alongside the established GOOGLon issuer anchor. All match the Token-2022 program, initialized mint state, Ondo mint/update authority, exact metadata symbol/mint and an app.ondo.finance metadata URI. The captured read-only evidence is in `research/market-data/ondo-added-mints-2026-09-13.json`.
- GOOGLon has raw supply **840.92529** and paired USD value **$284,346.17337** in the source snapshot. No global token supply is substituted for Solana supply.
- [Ondo pricing documentation](https://docs.ondo.finance/ondo-stocks/token-and-quote-pricing) explains the distinction between raw tokens and scaled display/share units.
- [DeFiLlama adapter methodology](https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/ondo-global-markets/index.js) describes total issued supply. Its number is not verified free float.

The user's Token Terminal screenshot shows Ondo at $28.5M. The remaining roughly **$3.02M / 10.6% discrepancy is unresolved**. Timing, coverage and valuation methods may contribute, but no cause has been proven. We have not copied the screenshot figure or presented agreement with Token Terminal as validation.

## Why the headline does not say total circulating market cap

The current product tracks five issuers. The reference screenshot includes additional issuers outside our verified registry. xStocks supplies an official circulating-value calculation excluding inventory; the other included sources use minted/outstanding supply with inventory treatment not consistently verified. Their sum is labeled **Tracked onchain value · est.**, with basis, timestamp and partial coverage available in details. It must not be presented as complete Solana circulating market cap or issuer all-chain AUM.

Completing a comparable circulating market cap requires verified Solana circulation/inventory treatment for every issuer and adding the missing issuers. This release does not claim that work is complete.

## Architecture and cost

- One read-only `/api/issuer-values` endpoint, using the existing D1 shared snapshot cache and refresh lease; no per-asset valuation request fan-out.
- Ten-minute cache TTL, background refresh, small retained latest-Solana response. The free upstream includes history, so its body is bounded at 12 MiB and the request at 15 seconds.
- A maximum source age of 36 hours supports this dated source cadence; expired, future, malformed or mismatched snapshots fail closed. Transport retries never turn the original observation into a fresh one.
- Match only verified Ondo registry entries. Unknown products and cash/yield tokens are excluded and reported. Cache identity incorporates the canonical mints, so registry changes invalidate old coverage.
- No new dependency, paid plan, account, or credential. Free access is not a promise of an unlimited provider SLA.
- The public Solana fallback now follows the current [official RPC documentation](https://solana.com/docs/rpc), `https://api.mainnet.solana.com`. An explicit deployment RPC setting remains untouched. The local Worker still received HTTP 403 from public RPC; the existing production dashboard was separately verified to show live supply and value before publication. This is not claimed as a resolved public-RPC access issue.

## Validation

- Release gate: TypeScript, lint, **264 tests**, and production build pass.
- Regression cases cover aggregate reconciliation, wrong chain/issuer/mint, paired timestamps, scaled-unit mismatch, stale/future/invalid values, excluded cash products, HTTP failure/body bounds, and replayed authority checks for the added listings.
- Desktop and mobile preview verified: ordered metrics, stock count beside Stocks, responsive layout and source details. The local Ondo endpoint returned all 202 paired values; local public-RPC supply access remains unavailable.
- Production publication and final rendered-flow evidence are recorded in the release response after deployment; a build alone is not live verification.
