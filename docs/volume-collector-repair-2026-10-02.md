# Market collection repair — October 2, 2026

## Confirmed causes

The DRAM snapshot omitted ZeroFi and other pools outside its stored inventory. Full mint discovery rotated just two mints per thirty-token refresh every four minutes. A larger inventory stretched primary collection; a late failed request discarded earlier primary results. Direct venue fallback began after primary and Gecko requests under one 45-second deadline. Meteora checked four addresses from the whole chunk instead of each token's pool family.

Production tail independently confirmed `exceededCpu` on scheduled globals and registry RPC jobs. CPU times of 22–23 ms exceeded the Workers Free 10 ms invocation budget. This is an execution failure, separate from API indexing delays and rate limits. More backup URLs cannot repair an interrupted collector.

## Boundaries and data flow

- Shared exact-mint adapters, eligibility checks, zero confirmation and conflict rules remain authoritative. Never sum provider totals or resolve disagreement by selecting the largest amount.
- Scheduled primary collection retains successful independent responses after another address/detail request fails. A complete outage does not renew observations.
- Venue requests start independently of primary collection. Meteora mint searches refresh a pool family in one request. Successful Gecko discovery timestamps persist; unchecked tokens take priority next run.
- Discovery inventory stores identities only. Separate successful discovery observations may fill a throttled refresh only while their original time is under five minutes old. Provider refreshes supersede older observations from that same provider; disagreement checks compare providers, not two times from the same provider. A copied observation never gains a newer timestamp.
- Each token's successful refresh commits separately. Overview and detail merge the same stored per-token observations by timestamp; late/older writes cannot overwrite newer values.
- Heavy collection runs on standard GitHub Actions runners in the existing public repository, scheduled every five minutes. The workflow is disabled for private repositories and uses no paid runner, paid API or Cloudflare credential.
- A dedicated `market-data` branch publishes an immutable generation and a small manifest. Collector state contains public market cache values and provider cooldowns only. It contains no community/session/wallet records.
- Cloudflare's existing minute trigger fetches the manifest. Private RPC jobs import bounded chunks, verify their SHA-256 digest and enforce a public-cache key allowlist. Original source timestamps survive ingestion. Failed chunks retry; a generation is marked complete only after all chunks succeed.
- Gecko uses conservative 15-second pacing after live runner evidence of HTTP 429 at the previous 2.2- and 6.5-second pacing. Discovery checks up to eight mints per five-minute run; successful checks move to the back of the queue. Among equally unchecked mints, higher observed activity takes priority. At 69 tokens a full healthy discovery pass takes roughly nine runs, not an instantaneous all-pool scan.
- Provider cooldowns persist between collection runs. Schedule/indexing/provider delays remain possible; five minutes is the target cadence, not a completeness or latency guarantee.

## Verification

- Deterministic DRAM recorded-response regression discovers ZeroFi and refreshes eight Meteora identities without double counting.
- Partial primary failure, full outage, zero/conflict handling, discovery starvation prevention, private cache rejection, immutable digest checks and older-write protection are tested.
- Isolated Miniflare verifies real WorkerEntrypoint/private RPC, D1 persistence, public list observations, discovery-only timestamp preservation, recovery, missing-pool nulls and immutable snapshot ingestion. Thirty synthetic concurrent readers make zero provider requests; this is not a production scalability claim.
- Full local release gate passes types, repository lint, all 547 tests and production build.
- Live runner, deployed ingestion and rendered-route evidence are recorded below after verification.

## Live evidence

- GitHub run `36953726665` completed on commit `2ffbda34c1c978558f2a213459068f574a633db3`; its immutable generation `31199fca88efcb6590c049bd3ca24d9280639743` was synchronized by production. DRAM increased from the original $5,731,853 observation to $6,999,740 at 02:02 UTC. ZeroFi $515,698, Byreal $296 and Manifest $18,966 were included, with pool-address deduplication. This is a newer 24-hour window, not proof that the earlier $8.79M screenshot matches.
- The synchronized generation recorded all 21 DRAM pool identities, zero unavailable identities and zero disputed amounts. This does not prove that every DEX pool exists in the inventory.
- Production snapshot RPC imports recorded 1–4 ms CPU and the full import cron 8 ms, outcome ok. Browser/API requests have separate CPU costs; this is not a broad load capacity guarantee.
- Two sequential public responses returned 200, valid JSON, 332,679 bytes, `Cache-Control: no-store` even on cache HIT and no Set-Cookie. No private/session/wallet fields were added.
- Free GitHub shared runners still received Gecko 429 at 6.5-second pacing. The final pacing is fifteen seconds, two-token discovery chunks, eight discovery tokens per generation, and a discovery phase reserved after the first active known-pool chunk. Last-success ordering prevents healthy early symbols from monopolizing discovery.
- Manifest/state reads use minute generation URLs; immutable chunks remain SHA-256 pinned. Minute URLs reduce repeated-request cache reuse; raw GitHub branch propagation can still delay imports.

- Final paced runner `36954238062` on `5e6a4aa6c3f7d5eeb8a59bf525fe07f9b0f47b70` completed in 328 seconds, published 28 chunks and advanced eight successful Gecko discovery checks. No Gecko 429 was recorded in this run. Two deeper-page requests reached the bounded job deadline; those failed checks were not marked successful. Known refresh chunks each reported zero unavailable identities; this still does not certify complete pool coverage.
- Final generation `c3caec69b0796e0b3416faf8a2c62033ac3a7b29` recorded DRAM $7,015,285 and ZeroFi $516,240. Source time is 02:08:43 UTC, earlier than publication 02:14:11 UTC. Original times are preserved; collection duration plus scheduler delay can make early observations delayed on arrival.
- Production version `d115b323-237b-45e5-a61a-d81cedfb6390` and main commit `16a90e2572862894bb61ddd1ea71aaab4aec9c27` preserve the new private import architecture. Release checks are green for the collector and wiring commits. Trading remains disabled.
- Live desktop list and mobile detail both rendered DRAM $7M from the previous successful generation. The restored ZeroFi $515.7K pool appeared in detail. Browser QA also confirmed supply, reference price and minted value were populated after current source refresh.
- Public API smoke checks returned 200 for market, community and issuer holders, with no Set-Cookie. Market JSON was 334,932 bytes with no private/session/wallet-address fields. Availability checks are not proof that all data is accurate.

- Final generation synchronized automatically at 02:17:34 UTC. Two sequential ordinary public reads exposed $7,015,285 DRAM, $516,240 ZeroFi, 21 identities and zero unavailable/disputed identities; JSON 340,100 bytes, no-store on both MISS and HIT, no Set-Cookie. The rendered market row showed $7.02M.
