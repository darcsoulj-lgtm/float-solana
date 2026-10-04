# Float platform checkup

Reviewed on October 4, 2026 by Noah, with Kai checking infrastructure and security, Tanaka checking product flows, and Mina checking visual quality. The audit covered the deployed site, source, isolated failure tests, representative HTTP timings, and mobile and desktop reading flows. Confirmed urgent defects were repaired and deployed. The platform still needs stronger monitoring and a reproducible release process before we can confidently assess growth capacity.

## Fixed and deployed

| Finding | Repair and verification |
| --- | --- |
| Public requests could supply legacy identity headers and authenticate a synthetic legacy research identity | Removed the entire identity-header family at custom-domain ingress. A harmless GET returned 200 before the repair and 401 afterward. Public community reads still return 200. Cookies, authorization, and request bodies remain intact in regression tests. No private records, administrator actions, or mutations were tested. This finding does not establish that an attacker exploited the issue. |
| Failure in one scheduled source could prevent independent hourly activity recording | Independent activity recording now runs before the aggregate source error is reported. Isolated provider-failure tests verify that recording still runs and the source failure remains visible. |
| Detail disclosures could attach a newer timestamp to an older displayed price | The displayed fallback price now uses its own timestamp. A visible date accompanies the price; the redundant unavailable-price message is removed when a dated price exists. Live mobile verification confirmed matching dates. |
| Saved tokenized value could appear in the headline but disappear in Sources | Both sections now use the same validated valuation, with separate price and supply provenance. Freshness limits and calculations were preserved. |
| Title-only posts rendered an empty clickable body | Empty bodies no longer create a button. The title still opens the post. The existing title-only poll was verified in the live feed. |

Production version: `043c54c0-4fee-4279-a026-042407a13ddf`. The narrow ingress security repair was also preserved on GitHub main in commit `e16303a735cdd635be5a6f887c226b9817c0b84e`; readback confirmed the change. The other deployed audit repairs remain in the local working tree pending controlled source reconciliation.

## Remaining engineering priorities

1. **Reconcile deployed source with GitHub before the next release.** The repository Worker is substantially older than the deployed Worker, and the checkout contains extensive preexisting changes. A deployment from main could restore older behavior even though the security patch is now preserved there. Preserve all existing work, reconcile deliberately, and record the exact source and build for each deployment. A blanket commit of the current checkout is inappropriate.
2. **Monitor every active collection path.** The GitHub collection branch does not invoke the existing health checker, and that checker reads the older work queue rather than all current reference, history, supply, and Birdeye states. An isolated failure of active sources generated no incidents. Check per-source coverage and age, record meaningful failures, and verify an owner notification destination. No operational alert delivery was verified in this audit.
3. **Reduce work on uncached reads.** Cached browser HTML responded in approximately 0.6–0.8 seconds in this local sample. Uncached HTML/API paths consumed substantially more CPU; individual uncached requests reached 88–170 ms CPU, and one ordinary market response took 4.35 seconds. Keep requests focused on prepared snapshots and move expensive work to collection. Measure real browser loading and interaction metrics before claiming a capacity limit. The free Workers CPU allowance is constrained; see [Cloudflare limits](https://developers.cloudflare.com/workers/platform/limits/).
4. **Schedule bounded expiry cleanup.** Expired session-limit records currently rely on activity-driven cleanup, and administrator sessions lack periodic cleanup. An aggregate production read found 29 expired limit records. This is a retention and quota concern, not evidence that expired credentials remain valid.

## Remaining product and visual improvements

- Show a compact date or range for older table prices and changes without requiring hover. Detail dates are now visible; the table still needs the same clarity.
- Adapt the activity chart to available history. Two observations on a 30-day axis leave most of the graph blank. Show the available range until enough observations exist, preserving genuine gaps.
- Use consistent volume terminology across the summary, chart, and table. Keep provider and scope explanations in the existing information tooltip and methodology.
- Consider collapsing pool details: their separate observation times can distract from the headline token volume.
- Keep public reading available if membership-status retrieval fails, while keeping all writes blocked until verification succeeds. This is a code-review finding; no production outage was induced.

Tanaka and Mina recommend retaining the current visual system. Feed and All topics are coherent, attachments are compact, and mobile layouts inspected at 390 pixels had no horizontal overflow. Wallet entry opened and closed correctly, restoring focus to Create post. No browser warnings or errors were captured in the inspected tab.

## Validation and limits

The complete local release gate passed: strict types, repository lint, 678 tests with zero failures, dependency review, and the production build. An old copied diagnostic source file caused a type-check failure; its contents were preserved as a text artifact instead of excluding active code from validation. The remote security patch was separately bundled and tested with forged headers, wallet credentials, and a POST body. A full GitHub workflow result for that narrow commit was not verified.

The bounded production log window contained 36 events, all with successful outcomes and no exceptions. This small, partly audit-generated sample cannot establish population error rates or global latency. A separate isolated 20-reader cache test showed that reads did not wait for the simulated provider refresh; it is not a production load test.

No paid service, live stress test, real wallet signature, transaction, or private account mutation was used. Real mobile wallet switching, signed-in rendering, LCP, and INP were not verified in this audit. Existing regression tests cover relevant authentication and holdings rules, but do not replace device testing.

Evidence is saved in `outputs/platform-checkup-2026-10-04/`: `security-live.json`, `html-sample.json`, `http-sample.json`, `runtime-sample.json`, and `detail-mobile.png`. Earlier desktop audit images are saved under `outputs/mina-audit-*-2026-10-04.png`. Full local build and focused-test logs remain in the temporary audit directory.
