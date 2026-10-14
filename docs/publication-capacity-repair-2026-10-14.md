# Public market publication capacity repair — 14 October 2026

The collection jobs succeeded, but the publication verifier repeatedly failed because the Backpack public overview exceeded its 400,000-byte budget. At 77 listings and 1,576 pool rows the captured response was 419,318 bytes. The same persistent violation caused failure mail after each collection (approximately every 15 minutes). Earlier propagation differences cleared within the bounded verification allowance; the size violation did not.

## Change

The browser uses `/api/backpack-market?schema=5`. Its versioned transport stores each public pool observation as an ordered tuple rather than repeating fourteen property names in every row. The decoder restores the same domain records before presentation or browser persistence. All pool identities, values, numeric precision, nulls, source timestamps and unavailable/disputed/delayed flags are preserved. No pool truncation, provider substitution, budget increase or new provider calls are introduced.

The scheduled writer prepares both representations with one atomic database statement. The default endpoint retains its object representation for installed older clients and research consumers; schema 5 has a separate server cache identity. During rollout a missing compact snapshot falls back to the legacy snapshot; an expired compact snapshot still fails freshness checks. Active health measures the browser representation, while the verifier requests schema 5 and retains its original 400KB budget and all independent value, coverage, freshness and privacy checks.

The captured production response encoded to 289,240 bytes (31% smaller), with an exact round-trip equality assertion. A 2,000-row test retains all observations below 300KB and confirms missing or changed observations still fail publication verification. Future growth may still exceed the fixed budget and must be addressed through measured response partitioning; this is not unlimited capacity.

## Verification

See release gate and live verification evidence recorded during deployment. Do not infer scheduled operation from a local test or silence mail by disabling publication checks.
