# Active source monitoring and temporary-record maintenance

The custom-domain production collector uses GitHub snapshots plus fast reference,
history, supply and Birdeye jobs. Durable-queue state alone does not describe these
lanes. The private health job now checks their cache contracts, writes a small
public-safe summary, and maintains aggregate failure/recovery incidents.

The health reader performs no provider requests. It uses the verified listing
registry and original observation times. Successful repeated checks of the same
weekend candle remain healthy; a changed fetch time is never substituted for the
candle's observation time. A missing or stale prepared market snapshot is checked
independently of upstream collection.

## Thresholds

- First-seen listings receive one hour for initial collection; the initial monitor
  adoption uses the same grace and publishes coverage counts during that period.
- Reference coverage: dated history remains displayable only under the existing
  96-hour retention policy; history collection itself must have checked within two
  hours when the ticker is not fresh.
- Supply: existing 20-minute validity plus ten minutes operational grace.
- Birdeye: observation overdue after configured collection interval plus two
  hours; scheduler status must be healthy and checked within 15 minutes. Tokens
  never indexed by Birdeye remain disclosed partial coverage rather than an outage
  by themselves. Loss of a previously observed token is actionable. No coverage
  at all is actionable after the new-listing grace.
- Holders: no more than 30 hours old; changed verified registry coverage must
  catch up after new-listing grace.
- Activity: daily immutable observations can legitimately be recorded later in a
  UTC day. Allow one day plus the volume source cadence plus two hours; at the
  current 14-hour cadence this is 40 hours.
- Prepared public snapshot: assembly within five minutes, matching reader
  expiry. Global snapshot absence/expiry is never hidden by listing grace.
- Prepared payload growth: warn from 400,000 UTF8 bytes. The 1,500,000-byte
  writer/reader ceiling leaves 25% headroom below D1's documented 2MB row/string
  maximum. It is a security/storage ceiling, not measured free-plan CPU or
  supported traffic capacity. All pool observations remain intact; none are
  silently removed to fit. Exceeding the ceiling retains the previous successful
  snapshot and its original assembly time; it eventually expires normally.
- Public health summary: check within 15 minutes; malformed, missing or future
  checks return unavailable.

An optional private alert binding retains deduplicated failure/recovery delivery.
Without it, the checker records incidents and reports `not_configured`; this is
not evidence that email was delivered. A public publication workflow can poll the
allowlisted summary and fail on actionable degradation using existing GitHub
notification preferences. Worker/workflow deployment and delivery evidence are
separate release steps.

Temporary-record cleanup runs independently of sign-in traffic. It deletes at
most 100 expired rows per fixed table (1,200 maximum per invocation), preserving
active sessions, in-flight translation leases, member content, holdings and all
trade orders. Additive expiry indexes support bounded range selection. No public
endpoint accepts a table name or starts this work.

Validation: 21 isolated tests across active health, incident lifecycle, cleanup,
index plans and existing durable failure boundaries passed. Strict TypeScript and
scoped lint passed. Fixtures include a closed market, never-indexed partial
coverage, previously observed values aging out, changed registry, source outage,
stale public snapshot, UTC cadence skew and provider-free cache-only loading.
This document is implementation evidence, not deployment or notification proof.
Worldwide latency, free-plan CPU headroom and supported listing/visitor counts
remain unmeasured. Payload-growth warnings require an owner capacity review
before reaching the storage ceiling. [D1 limits](https://developers.cloudflare.com/d1/platform/limits/).
