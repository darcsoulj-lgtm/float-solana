# Company news provider review — September 11, 2026

## Decision

Use Benzinga as the first practical licensed news integration for the MU pilot. Its company ticker filters, exact story URLs and financial-platform distribution focus fit the current product. This is a product fit recommendation, not an assertion that Benzinga is universally the most trustworthy publisher. Original company announcements remain the first choice for confirming a calendar event.

Reuters via LSEG is the institutional alternative for broader reporting. Its licensed APIs provide company/topic metadata and timestamped news. Access, redistribution terms, specific issuer coverage and cost require a commercial agreement. Neither provider has been authenticated from this project. No evidence establishes which news vendor Backpack uses.

## Primary sources reviewed

- Benzinga API guide and newsroom fields: https://www.benzinga.com/apis/blog/mastering-the-benzinga-newsfeed-api/
- Benzinga API products: https://www.benzinga.com/apis/
- Benzinga documentation: https://docs.benzinga.com/introduction/introduction
- Benzinga earnings calendar: https://docs.benzinga.com/api-reference/calendar-api/get-earnings
- Reuters through LSEG: https://developers.lseg.com/en/product/news/news_service_rdp
- LSEG news catalogue: https://www.lseg.com/en/data-catalogue/news
- Micron's original release distributed by GlobeNewswire: https://www.globenewswire.com/news-release/2026/08/26/3351673/14450/en/micron-technology-to-report-fiscal-fourth-quarter-results-on-september-30-2026.html

## Calendar source correction

The production database contained specific Micron IR article URLs, not literal homepage URLs. The web text retrieval returned the announcement, but the user's reported browser destination could not be reproduced because browser access is blocked. The root cause of that redirect remains unverified. The replacement is Micron's same exact announcement on GlobeNewswire, where the date and call time are present. The UI labels this View announcement, not Join webcast.

The fixed release updates only the two known Micron records still using the old URL, through the existing authenticated initialization flow. Admin changes to other sources are preserved. Both Calendar and the brief preview read the same stored event.

## Implemented scope and limits

Server-only key, HTTPS provider allowlist, no redirects carrying credentials, 12-second timeout, bounded ticker-specific results, original dates, generic-source rejection, idempotent draft persistence, administrator authorization and same-origin writes. MU is the only reviewed vendor mapping. No paid account was purchased, no live provider claim is made, and no unattended polling or auto-publication is enabled.
