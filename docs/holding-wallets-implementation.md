# Holding wallets — daily aggregate pipeline

## Data flow
Existing verified Float registry → finite GitHub Actions daily collector → dedicated `holder-data` branch aggregate → existing Cloudflare minute scheduler (hourly aggregate check) → D1 public aggregate cache → read-only `/api/issuer-holders` → Markets and issuer views.

The public repository uses standard Ubuntu Actions runners (no paid runner, artifact storage, new API subscription, or new long-lived credential). The workflow stops if the repo is private. Runs are serialized, capped at four hours, and triggered daily at 01:17 UTC, manually, or by collector/workflow changes on main. GitHub schedules are best-effort. No claim of live or simultaneous counts.

## Collection and fail-closed publication
Collector reads `/api/issuer-holders/registry`, which uses the same verified registry as Markets and refuses stale Backpack listing checks. Exact mint sets and SHA-256 fingerprints are verified. Finalized owner accounts are validated and deduplicated within each issuer; multiple issuers count independently. Zero balances are excluded; frozen positive balances count. Pools, exchanges and treasury authorities count: wallets are not people.

Before/after mint supply must match the sum of raw balances. Batches of 25 reduce requests; failed tokens get two individual retries. A missing account response, malformed data, cap hit, or unresolved change cannot become zero holders. 401/403/429 stops the run. Registry is rechecked after collection; an issuer with changed scope or any unresolved token retains its previous count and date. An issuer scan longer than 24 hours cannot publish. Successful independent issuer updates can publish while another retains old observations.

Only six aggregate fields per issuer leave the runner: issuer, count, token count, registry fingerprint, start and completion timestamps. No wallet addresses, raw provider responses or address artifacts are uploaded. The dedicated data branch avoids modifying application code for routine updates.

## Application safety
No new write endpoint, access token or database migration. Private existing Worker scheduler checks the fixed repository URL; maximum 16 KB, 10-second timeout, no redirects, one-hour lease. New rows must match current verified registry and increase their original observation time. HTTP clients only read D1 or the embedded verified seed. Malformed/upstream-failed/older responses preserve the previous observation. Public DTO strips unexpected fields.

Frontend checks for a new published snapshot every five minutes and when returning to the tab. This does not run the census per visitor. Shows exact counts, covered token counts, original dates and a brief methodology tooltip. Initial bootstrap is the Sep 28 research observation, not a claim that the scheduled job has already completed.

## Verification
Full type/lint/test/build gate; Python collector tests for duplicate/zero/frozen balances, incomplete/malformed accounts, changing supply, retry and union behavior; real isolated Miniflare Worker+D1 test for import, lease, failure retention, registry mismatch and malformed payload. Browser preview checked on desktop and 390px mobile. Live deployment/workflow status must be recorded separately; fixture passes do not prove the scheduled job ran.
