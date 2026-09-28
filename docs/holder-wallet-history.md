# Holding wallet history

Validated production imports retain one latest observation per issuer per UTC day for 90 days in D1 market_cache. Only aggregate counts, observation time and registry hash are stored. Failed refreshes never become new observations.

The existing cards show a small 30-day trend after seven distinct observed days. Missing dates break the line. Registry changes restart the comparable series; percentage change requires an actual observation exactly 30 UTC days earlier with a positive denominator. No backfilled estimates or empty chart placeholders are shown. Daily counts can be expanded on touch or keyboard. Counts represent distinct owner wallets per issuer, not people.
