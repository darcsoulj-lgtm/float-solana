# Market collection repair — October 2, 2026

## Confirmed causes

The DRAM snapshot omitted ZeroFi and other pools outside its stored inventory. Full mint discovery rotated just two mints per thirty-token refresh every four minutes. A larger inventory stretched primary collection; a late failed request discarded earlier primary results. Direct venue fallback began after primary and Gecko requests under one 45-second deadline. Meteora checked four addresses from the whole chunk instead of each token's pool family.

Production tail independently confirmed `exceededCpu` on scheduled globals and registry RPC jobs. CPU times of 22–23 ms exceeded the Workers Free 10 ms invocation budget. This is an execution failure, separate from API indexing delays and rate limits. More backup URLs cannot repair an interrupted collector.

## Boundaries and data flow

- Shared exact-mint adapters, eligibility checks, zero confirmation and conflict rules remain authoritative. Never sum provider totals or resolve disagreement by selecting the largest amount.
- Scheduled primary collection retains successful independent responses after another address/detail request fails. A complete outage does not renew observations.
- Venue requests start independently of primary collection. Meteora mint searches refresh a pool family in one request. Successful Gecko discovery timestamps persist; unchecked tokens take priority next run.
- Discovery inventory stores identities only. It cannot renew old values or a token observation timestamp.
- Each token's successful refresh commits separately. Overview and detail merge the same stored per-token observations by timestamp; late/older writes cannot overwrite newer values.
- Heavy collection runs on standard GitHub Actions runners in the existing public repository, scheduled every five minutes. The workflow is disabled for private repositories and uses no paid runner, paid API or Cloudflare credential.
- A dedicated `market-data` branch publishes an immutable generation and a small manifest. Collector state contains public market cache values and provider cooldowns only. It contains no community/session/wallet records.
- Cloudflare's existing minute trigger fetches the manifest. Private RPC jobs import bounded chunks, verify their SHA-256 digest and enforce a public-cache key allowlist. Original source timestamps survive ingestion. Failed chunks retry; a generation is marked complete only after all chunks succeed.
- Gecko uses conservative 6.5-second pacing after live runner evidence of HTTP 429 at the previous 2.2-second pacing. Discovery checks up to sixteen mints per five-minute run; successful checks move to the back of the queue. Among equally unchecked mints, higher observed activity takes priority. At 69 tokens a full healthy discovery pass takes roughly five runs, not an instantaneous all-pool scan.
- Provider cooldowns persist between collection runs. Schedule/indexing/provider delays remain possible; five minutes is the target cadence, not a completeness or latency guarantee.

## Verification

- Deterministic DRAM recorded-response regression discovers ZeroFi and refreshes eight Meteora identities without double counting.
- Partial primary failure, full outage, zero/conflict handling, discovery starvation prevention, private cache rejection, immutable digest checks and older-write protection are tested.
- Isolated Miniflare verifies real WorkerEntrypoint/private RPC, D1 persistence, public list observations, discovery-only timestamp preservation, recovery, missing-pool nulls and immutable snapshot ingestion. Thirty synthetic concurrent readers make zero provider requests; this is not a production scalability claim.
- Full local release gate passes types, repository lint, all 546 tests and production build.
- Live runner, deployed ingestion and rendered-route evidence are recorded below after verification.
