# Float audit remediation — October 4, 2026

## Release decisions

Reconcile the live application into the existing GitHub main history using a reviewed application/build/test manifest, preserving existing repository files and excluding environment files, generated output, raw research, screenshots and private datasets. A required public Jupiter ABI fixture is now in tests/fixtures/trading instead of an unversioned research directory. A clean frozen-lockfile installation and full release gate from a separate checkout confirm the release no longer depends on that private local directory.

Public entry/information pages use eight HTML shells rendered offline from the actual production bundle, without a database, session, provider or outbound request. The Worker forwards no cookies or credentials to these assets and applies the same security headers as ordinary pages. Membership and live data still use their separate APIs. Wallet callbacks, private routes, mutations, unsupported queries and RSC navigation bypass this path. Missing built assets fall back to normal rendering.

The public market endpoint reads a prepared JSON snapshot through one database query. A private scheduled invocation assembles it every minute from existing public observations. Assembly does not recollect data, move original timestamps, fill missing values with zero or contain personal holdings. A failed writer retains the last good snapshot; a missing/malformed/over-five-minute prepared snapshot fails503. Internal response cache remains30seconds; browsers receive no-store. Bootstrap uses the existing validated public market response before activating the new reader.

Active source checks run every five minutes independently of source failures. They track source collection and observation age separately, allowing unchanged weekend stock prices. One-hour grace applies to first-seen listings. Previously indexed volume going stale is actionable; never-indexed tokens remain a disclosed coverage gap. Health summaries expose only fixed source categories/counts. Private incidents deduplicate, recover and reopen; inactive legacy queue incidents resolve. Hourly GitHub health checks use the existing owner's Actions notification channel. A production outage or email delivery test was not induced.

Expired authentication/limit/draft rows are removed in bounded batches every five minutes. Additive indexes bound expiry selection. Posts, balances and unresolved trade records are excluded. Trading and paid cross-issuer collection remain disabled.

## UI

Available history determines the chart range and bar/date alignment, preserving real gaps. A prior-day observation cannot fabricate today's bar. Table stock-reference dates are visible; summary/detail/chart/table say24hvolume consistently. Pools are collapsed with their separate observation scope inside. Public posts remain readable after a membership-status error; write actions wait for a successful status check. Detail metadata omits removed liquidity.

## Validation

Strict types, repository lint, dependency security, all705tests and production/offline-shell builds passed. A clean reconciled checkout also passed frozen dependency installation and the complete gate. Existing security, membership and wallet-switch regressions remain active; no suites were skipped. Runtime and deployed browser evidence will be appended after release.

Limits: this is not a supported-user-count claim or a worldwide latency benchmark. Real wallet signatures, mobile installed-app switching and authenticated private account mutations were not performed. External provider coverage and outages cannot be guaranteed away.
