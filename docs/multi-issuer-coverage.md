# Solana issuer coverage — September 12, 2026

Community membership now accepts positive balances in 1,297 reviewed Solana mints. Existing Backpack symbols and stored holdings are unchanged. No rooms or fake discussions are generated.

| Product family | Reviewed mints | Discovery source |
| --- | ---: | --- |
| Backpack | 41 | Official Backpack assets API; Solana entries with deposits or withdrawals enabled |
| xStocks | 832 | Official `https://api.backed.fi/api/v2/public/assets`, pages 0–8; only `deployments.network === 'Solana'` |
| Ondo | 416 | Solana Foundation curated equities registry, exact mints; token symbols and names cross-checked against Token-2022 onchain metadata |
| PreStocks | 7 | Solana Foundation curated equity variants |
| Tessera | 1 | Solana Foundation curated equity variants |

Foundation source is pinned to commit `baf2ec5dd9737e07e77192e38b37e6303a3b1c83`: https://github.com/solana-foundation/tokens/tree/baf2ec5dd9737e07e77192e38b37e6303a3b1c83/packages/asset-registry/src/data

Ondo's public issuer GitHub tokenlist returned only Ethereum and BNB chain entries during this review. Those addresses were **not** imported as Solana mints. Its Global Markets addresses API requires a key. The coverage page explicitly identifies Foundation records as the source rather than claiming an official Ondo Solana API integration.

## Coverage limits

This is tracked coverage, not a complete census of every equity-like instrument on Solana. There is no trustworthy permissionless ticker lookup that establishes issuer authenticity. New issuers, deployments and wrappers require review, finalized mint validation, duplicate checks, a dated snapshot and a release. No new source is silently auto-approved. The Foundation's curated set may omit additional Ondo or private-company products. Stocks, ETFs and private-company exposure are included; rights are not interchangeable.

The exact mint is the token identity. Display tickers such as MU, MUx and MUon remain separate, while `underlyingSymbol` supports company-level news and counting. Unique underlying counts are registry identifiers, not an audited economic-equivalence assertion.

## Overview and issuer metrics

All issuer cards use the same metric: **Solana minted token supply × a recent observed token price**. Aggregate = sum of covered mint values, each mint counted once. This includes reserve inventories and is not circulating market cap, issuer global TVL, underlying company market cap or assets under management. It is a partial subtotal with the number of valued versus tracked tokens shown.

Prices retain existing priority: exact-mint CMC coverage, highest-liquidity observed DEX pool, then a recent DefiLlama token reference. CMC remains limited to the previously reviewed records; new CMC IDs are not guessed from ticker strings. Missing and stale values are excluded. Low-liquidity prices are indicative observations, not executable quotes. Volume coverage has not been expanded or misrepresented as all-chain volume.

Token-2022 scaled UI multipliers can change economic/display units. Wallet amounts already respect those multipliers. For newly integrated products, until a quote provider's unit convention is independently confirmed for a non-unit multiplier, its issued valuation and private position valuation are withheld; raw supply and observed quote can still be inspected. This intentionally lowers valuation coverage. Existing Backpack valuations retain their previously documented raw-token quote basis. See docs/release-26-holder-experience.md and the Solana Scaled UI Amount integration guide: https://solana.com/docs/tokens/extensions/scaled-ui-amount/integration-guide.

## Loading and cost

Authenticated market data is divided into deterministic pages of 90 reviewed mints. Each page uses <=3 DEX Screener requests of <=30 mints, one bounded DefiLlama request and one Solana getMultipleAccounts call. Wallet validation independently batches at 100 mints. The browser loads at most two pages concurrently, checks every 30 seconds while visible, and loads only relevant pages in Your holdings. Public observations are shared in D1 for two minutes; CMC is cached for five minutes. Failures use backoff. Partial failures do not erase fresh pages.

No new paid provider, API key, subscription or scheduled service was added. Existing hosted RPC configuration remains unchanged. Costs/limits of that existing RPC plan still apply. Registry discovery is a reviewed snapshot, not an automatic nightly sync.

## Verification

- All 1,297 mints were checked at finalized commitment with initialized mint data, supported token programs and non-executable accounts. Evidence: `research/multi-issuer/mint-accounts-2026-09-12.json`.
- Live public prices and Workers-compatible parsing were exercised across every market page. The local public Solana endpoint returned HTTP 403 from workerd; production's private RPC secret is masked and was not read back. Runtime supply tests used explicitly captured finalized RPC responses. This is not a claim of a fresh authenticated production-wallet test.
- Regression coverage checks exact mint identity, duplicate rejection, mixed-issuer wallets with >100 holdings, bounded supply requests, issuer subtotal math, adjusted-unit exclusions, partial source failures, underlying-company news queries and existing wallet-provider isolation.
- Browser automation remains administratively unavailable in this task. No claim of completed visual/extension-popup QA.

Maintenance: `node scripts/audit-solana-mints.mjs` validates the entire reviewed registry without approving additions. `node scripts/audit-tokens.mjs` checks Backpack registry drift. Run tests and build after any reviewed registry update. `node scripts/check-multi-issuer-runtime.mjs --captured-rpc` uses the explicitly captured mint audit with live public prices; omit the flag only with a runtime-accessible RPC configured.
