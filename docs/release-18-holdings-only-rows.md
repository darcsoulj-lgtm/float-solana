# Holdings-only feed and compact reading rows

Published as version 18 on September 11, 2026 at 00:27:25 UTC.

- Removed All coverage tabs and empty-state links. Filters list only detected holdings.
- Editorial member API always applies direct-holding filtering, including legacy `scope=all` requests. Administrator publishing remains available through the operations API.
- Replaced card presentation with compact divided rows, one-line desktop summaries and actions alongside each story. Mobile uses stacked actions and two-line summaries. Source/date and original links remain visible.
- Lifted the stock filter to the dashboard so Your brief and Calendar retain the same selection. Brief labels its limited event preview explicitly.

Validation: TypeScript, targeted lint, production build, 41 editorial API checks and 121 community-flow checks passed. Built client assets contain the row styles and no All coverage controls. No database migration or environment change.

The old Chrome tab was unavailable. A fresh scoped HolderPulse inspection was denied by the administrator-policy security service. No bypass was attempted. The precise reason the user did not see version 17 in their browser remains unverified; publication success is not visual verification.

URL: https://holderpulse.glossy-kid-6048.chatgpt.site

Source: `b8d115034b80fdeae1061edabf33c1710ad39248`

Version: `appgprj_6aa16c80630081918b8b86d4f513fc17~appgver_78c1e72d00188191ac26427cf3b91b64`

Deployment: `appgdep_6aa34ae03a48819187ed6ce5b1f3e0b9`

Environment revision 3 preserved. Local server stopped after publication.
