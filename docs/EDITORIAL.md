# Editorial and community operations

## Administrator access

Open `/admin`, sign in with the existing Sites account, and use an email already in the production `ADMIN_EMAILS` allowlist. Wallet membership alone never grants administrator privileges. `/admin/community` opens the same workspace. `/admin/research` retains legacy surveys and commercial requests.

## Publishing

1. Choose **Publishing → New story** or **Add event**.
2. Write an original short summary, provide the publisher, original HTTPS source link and source publication date, and select 1–10 relevant supported stocks.
3. For an event, distinguish a confirmed date from an estimate. If an exact time is announced, enter it in your device's timezone; the app stores UTC and shows members their local time. Date-only events remain on the stated day.
4. Use **Preview**, then **Save draft** or **Publish**. Drafts remain admin-only. **Archive** hides content from member feeds without deleting it.
5. If another administrator edits the same item, reload it before saving. Content, tags and the audit entry save atomically.

The library rejects duplicate source URLs for the same content kind, strips common tracking parameters, and permits one story to carry multiple stock tags. A news announcement and its calendar event may share a source.

## Member experience

**Your brief** defaults to published stories matching verified holdings and followed topics. **All coverage** shows the broader library. Both views offer stock filters. **Discuss this** opens a prefilled discussion draft with its source link; it does not post automatically. The calendar shows upcoming sourced events and labels estimated dates. No market-price, sentiment or historical-holding data is fabricated.

Coverage is manually curated, not a connected real-time newswire. Empty selections say so. The current starter catalog covers MU/SKHY and related memory-industry context, not every supported stock. Administrators must maintain coverage; the overview flags when the most recent published update is older than 72 hours. This freshness indicator does not certify every article as current.

## Initial reviewed content

The application initializes four reviewed records through an authenticated, same-origin POST. The request accepts no user content. A transactional release marker prevents duplicate initialization and preserves later admin edits and archival. Database migrations contain only schema, never editorial seeds.

- SK hynix Future Forum story, source publication September 9, 2026: https://news.skhynix.com/en/future-forum-2026/
- Micron fiscal Q4 announcement, source publication August 26, 2026: https://investors.micron.com/news/press-release/2026/Micron-Technology-to-Report-Fiscal-Fourth-Quarter-Results-on-September-30-2026/default.aspx
- NVIDIA fiscal Q2 FY2027 results as memory-industry context, source publication August 26, 2026: https://investor.nvidia.com/news/press-release-details/2026/NVIDIA-Announces-Financial-Results-for-Second-Quarter-Fiscal-2027/default.aspx
- Micron earnings call, September 30, 2026 at 20:30 UTC (14:30 Mountain), using the same Micron announcement. Members in Seoul see October 1 at 05:30.

These are real sourced editorial entries, distinct from labeled simulated survey examples. They were reviewed September 10, 2026; publication is not a promise of ongoing automated updates.

## Moderation and signals

**Moderation** supports reports and hiding/restoring discussions. **Members** supports suspension/restoration. Existing checks enforce those decisions on the server. The overview shows non-suspended member count, visible discussions, open reports and draft count.

Service signals aggregate server verification/posting requests over the last 24 hours, rounded to hourly buckets. Rejections include normal eligibility/validation failures. They do not measure extension popup failures, browser failures or end-to-end success rates. No wallet address, exact balance or discussion body is stored in these counters. Recent audit activity records editorial and community actions. Automated alerts and counter-retention cleanup are not configured.

## Verification

Run local migrations, start the local server, then run `tests/community-flow.mjs` and `tests/authorization.mjs` sequentially. Tests temporarily configure a local synthetic wallet/RPC fixture and restore local configuration in `finally`. They must never target production. Unit coverage lives in `tests/core.test.mjs` and `tests/wallet-provider.test.mjs`.
