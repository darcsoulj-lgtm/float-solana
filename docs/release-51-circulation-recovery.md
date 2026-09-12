# Circulation recovery and wallet-flow simplification

Production logs on 12 September showed repeated `xstocks-circulation:v1` provider timeouts. The previous nine-page refresh discarded all progress if any page failed. After fifteen minutes, the strict valuation age limit excluded the old payload, and page merging also discarded that dated data. xStocks is currently the only issuer with a verified net-circulation source, so both its card and the headline became blank while other issuers' separate gross-minted estimates remained visible.

## Changes

- Refresh issuer pages independently, with at most three newly scheduled pages per invocation, individual D1 leases, and an eighteen-second per-page timeout. Completed pages persist across retries.
- Use the current issuer API host and verified symbol ordering. Strip unused query fields. Publish a new snapshot only when every page passes completeness, duplicate, exact-mint, chain, supply, and currency validation. No incomplete generation can overwrite the last complete result.
- Keep source timestamps. During failure, display the last verified circulating value for at most twenty-four hours, explicitly dated and marked delayed. Strict current-value calculations still exclude observations after fifteen minutes. Gross issuance and other chains never become circulation fallbacks.
- A separate public issuer-only read endpoint lets the member interface retry circulation independently of the larger market list. No wallet/account data is exposed. Current prices, wallet balances, and holder-tier validation retain their existing freshness rules.
- Remove the wallet-connect guideline checkbox and its server-side boolean requirement. Quiet Guidelines and Privacy links remain. Signature, nonce, expiry, same-origin, replay and actual holdings verification remain required. Survey participation consent is unchanged.

## Validation

213 tests passed, including persisted progress across a simulated failed page, retry-only recovery, atomic rejection of invalid generations, dated fallback bounds, source timestamp preservation, and signature/challenge enforcement without checkbox input. Existing wallet, market, news and dashboard regression tests passed. Live production verification follows publication. Browser inspection remains administratively blocked; static rendering and source inspection are not claimed as visual browser QA.
