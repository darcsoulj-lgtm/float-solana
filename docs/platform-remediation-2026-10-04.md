# Float audit remediation — October 4, 2026

## Release decisions

Reconcile the live application into the existing GitHub main history using a reviewed application/build/test manifest, preserving existing repository files and excluding environment files, generated output, raw research, screenshots and private datasets. A required public Jupiter ABI fixture is now in tests/fixtures/trading instead of an unversioned research directory. A clean frozen-lockfile installation and full release gate from a separate checkout confirm the release no longer depends on that private local directory.

Public entry/information pages use eight HTML shells rendered offline from the actual production bundle, without a database, session, provider or outbound request. The Worker forwards no cookies or credentials to these assets and applies the same security headers as ordinary pages. Membership and live data still use their separate APIs. Wallet callbacks, private routes, mutations, unsupported queries and RSC navigation bypass this path. Missing built assets fall back to normal rendering.

The public market endpoint reads a prepared JSON snapshot through one database query. A private scheduled invocation assembles it every minute from existing public observations. Assembly does not recollect data, move original timestamps, fill missing values with zero or contain personal holdings. A failed writer retains the last good snapshot; a missing/malformed/over-five-minute prepared snapshot fails with 503. Internal response cache remains 30 seconds; browsers receive no-store. Bootstrap uses the existing validated public market response before activating the new reader.

Active source checks run every five minutes independently of source failures. They track source collection and observation age separately, allowing unchanged weekend stock prices. One-hour grace applies to first-seen listings. Previously indexed volume going stale is actionable; never-indexed tokens remain a disclosed coverage gap. Health summaries expose only fixed source categories/counts. Private incidents deduplicate, recover and reopen; inactive legacy queue incidents resolve. Hourly GitHub health checks use the existing owner's Actions notification channel. A production outage or email delivery test was not induced.

Expired authentication/limit/draft rows are removed in bounded batches every five minutes. Additive indexes bound expiry selection. Posts, balances and unresolved trade records are excluded. Trading and paid cross-issuer collection remain disabled.

## UI

Available history determines the chart range and bar/date alignment, preserving real gaps. A prior-day observation cannot fabricate today's bar. Table stock-reference dates are visible; summary/detail/chart/table say 24h volume consistently. Pools are collapsed with their separate observation scope inside. Public posts remain readable after a membership-status error; write actions wait for a successful status check. Detail metadata omits removed liquidity.

## Validation

Strict types, repository lint, dependency security, all 705 tests and production/offline-shell builds passed. A clean reconciled checkout also passed frozen dependency installation and the complete gate. Existing security, membership and wallet-switch regressions remain active; no suites were skipped. The initial remediation was deployed as Worker 421a95ad-ec01-4697-8ed7-6c4c55ba1ad6, with source commit 210b017f4c975a9ddd4823b9cac5cc02c332a027. GitHub Release checks run 37180186561 succeeded. Runtime follow-up and the additional valuation repair are recorded below.

Limits: this is not a supported-user-count claim or a worldwide latency benchmark. Real wallet signatures, mobile installed-app switching and authenticated private account mutations were not performed. External provider coverage and outages cannot be guaranteed away.

## Initial deployed verification

Bounded live checks returned 200 for Markets, community entry, the prepared market endpoint and the active health endpoint after its first scheduled cycle. Markets used the built-shell response with its CSP and no-store headers; the prepared API showed its internal cache. Legacy identity headers still returned 401 for a private account request. Source fingerprint matched the reconciled release. Production snapshot timestamps advanced automatically after deployment, and the cached source-health status became ok. The production publication workflow run 37180426325 also succeeded. The first health request before the first check reported monitor_overdue, rather than inventing a healthy result.

A 55-second runtime sample contained 24 events, allsuccessful with no recorded exceptions. Public home used 1 ms CPU; the market API used 22 ms CPU on a miss and 9 ms CPU on a hit. This is bounded sampling, not a percentile or capacity guarantee. Background source work still used 25–26 ms CPU in two sampled invocations; detail pages and private authenticated routes retain their ordinary rendering path.

Search narrowed the live table to MU, detail navigation worked, and no browser errors or warnings were recorded in that tab. Mina verified the deployed 390px chart, aligned dates, composition selection, tooltip and collapsed Pools. Screenshots are inoutputs/platform-checkup-2026-10-04.

## Additional data-policy issue discovered during verification

The headline tokenized value varied sharply as source freshness changed. In one captured response all 71 supplies were current, but only 26 tokens contributed $10.58M.45 reference prices were roughly 29 hours old; their last hourly prices remained visible for 96 hours, while retained value required a24-hour price and a15-minute price/supply pair. This was an existing intentional safety policy with an inconsistent public-estimate outcome, not missing supply or prepared-snapshot collection failure. A separate display-only historical estimate now uses an official hourly close retained up to 96 hours with verified safe supply checked within 20 minutes, only after ordinary compatible price/supply pairs are unavailable. Adjustment and comparable-price conflict checks remain active. Source times are preserved separately; eligibility, portfolio and current-quote rules remain strict. Replaying the captured observations at their actual supply-check time valued 71/71 tokens at approximately $31.86M, compared with $10.58M under the previous display policy. This is an estimate, not a claim of live market value.

A current Backpack price with no comparable return keeps its strict quote. A validated companion historical close/return/date can drive public presentation as a pair, preventing an old percentage from being attached to a new price. Missing baselines, expired references, inconsistent returns and known later display-unit adjustments suppress this fallback. Display sorting uses the same pair as the rendered numbers. The visible reference caption, summary estimate label, detail provenance and public methodology document this behavior.

Prepared-response size is a storage/security bound, not a supported traffic or CPU capacity claim. The measured response was about 352KB, with 1,299 pools consuming approximately 79% of that size. Retaining all pools preserves deduplication, counts and conflict checks. Growth past 400KB is an owner-health warning so capacity work starts before the storage ceiling is reached. The 1.5MB ceiling leaves headroom beneath the database row/string limit, but large-response performance has not been verified in production and must be measured before scaling.

## Final additional-repair gate

The final reconciled checkout passed dependency security, strict types, full repository lint, all 725 tests with zero failures/skips, production build and eight offline public shells. Its source fingerprint matches the working application: 84d36db954f008d2320a35359cb6e70b8fd8b8ee40933143f65e27ce56fee7e9. Snapshot health now uses the same five-minute expiry as the reader, with no listing grace hiding a global publication failure. Final deployment and bounded live evidence are saved separately in outputs/platform-remediation-2026-10-04/.

Final mobile verification exposed one additional primary-history path: a fresh independent DEX quote with no return could suppress a historical pair already stored as the main Backpack quote, rather than as a companion. Both primary and companion history now use the same validated fallback and adjustment guard. A regression preserves the fresh strict quote while presenting its separate dated stock-price/return pair. Replaying the captured public snapshot returned 65/71 paired/comparable percentages; missing baselines remain unavailable. When a detail value uses a current token quote while its stock reference is historical, its tooltip and Sources explicitly identify the different quote, amount and timestamp.
