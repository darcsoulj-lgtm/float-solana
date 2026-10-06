# Volume snapshot alignment

Owner: Noah. Product decision: the default activity chart, composition and
headline must use the same cached provider observations. Dates describe
source observations, not the visitor's clock. No additional provider calls,
subscription, public refresh endpoint or change to quota/freshness rules.

The reported discrepancy was real: the summary showed $51,332,770.65 from
72 tokens, while the chart fell back to an earlier $26,926,953.44 snapshot
covering 70 tokens after midnight UTC. Both were rolling observations.
EWZ and CBRS account for $5,387,652.05 of the newer total. Calling this a
90.6% daily trading-growth figure was not justified.

The chart now keeps the latest observations visible on their actual source
UTC day, with the same total and coverage as the headline and token list.
Both summary and chart show the latest included source time; full source-time
ranges remain available in methodology details. Selecting an earlier day
still selects that day's saved snapshot, clearly labeled Snapshot.

Hourly scheduled persistence updates a source day's snapshot only when a
newer source observation exists. The atomic database write fences older
concurrent runs. Midnight alone does not create a day or rewrite unchanged
data. Source and capture timestamps remain distinct. No visitor writes
history. Existing older history is not reconstructed or invented.

Validation covers midnight rollover, updated coverage, history merge,
unavailable data, original timestamps and concurrent writes in actual SQLite.
The UI does not publish a daily change percentage from mismatched windows.
Full release gate passed: dependency audit, strict types, repository lint, 764 tests, production build and eight offline public shells.

The audit found newly reported source-map-js, proxy-addr and tinypool advisories. Compatible patch overrides (1.2.2, 2.0.8 and 2.1.2 respectively) were installed with the existing lockfile and prior reviewed braces patch preserved. The final gate has no unmitigated moderate/high/critical advisories.

Deployed Worker version: a977e798-8311-4d90-8a51-a1117dce007e. Live production health is ok with no issues. Desktop and 390px mobile browser checks show $51.33M in both headline and chart, Oct 5 20:39 UTC, and 72/73 token coverage. Historical navigation returns $19.88M for Oct 4 and restores the latest $51.33M when moving forward. No horizontal overflow or application console errors were observed; wallet extension injection errors are separate. Scheduled history persistence will be verified at its next hourly run.
