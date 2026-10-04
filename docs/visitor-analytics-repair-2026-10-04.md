# Visitor analytics delivery repair

October 4, 2026 (Korea time). Production Worker version `f5536736-661e-495a-9fea-cc099bd0ee87`.

The installed manual Cloudflare beacon matched the dashboard token and enabled manual setting, but the production response CSP permitted only same-origin scripts and connections. A fresh Chrome Incognito session reproduced the actual browser CSP rejection of `https://static.cloudflareinsights.com/beacon.min.js`. Prior zero/insufficient-data reports are not evidence of zero visitors.

The response policy now permits only the exact Cloudflare beacon script URL and the exact `https://cloudflareinsights.com/cdn-cgi/rum` collection path. Other policy directives and the stock-logo sandbox remain intact. A regression test exercises the real proxy response with a minimal NextResponse stub, checking allowed destinations and preservation of the restrictive logo policy. Existing internal-exclusion and private-path tests remain in the full release gate.

Full dependency security, types, lint, regression suites and production build passed. Deployment headers were checked by a public GET. In an isolated Chrome Incognito session, the actual browser resource timings showed script HTTP 200 and collection HTTP 204. The Cloudflare dashboard subsequently showed two visits and two pageviews, matching the two deliberate `/about` test document loads. These are internal test observations, not external visitors. The initial pre-repair `/markets` document was blocked and did not send analytics. The isolated session was closed after verification.

Chrome RJ and Codex IAB both displayed the excluded preference. Each subsequently loaded `/about` with zero analytics beacon elements. Their preferences were not changed. Physical phone/installed-app exclusion remains per-device and was not verified this turn. Historical uncollected visits cannot be reconstructed. Reporting visits are not exact unique people, and client blocking can still cause undercounting.

Evidence: `outputs/visitor-analytics-repair-build.log`, `outputs/visitor-analytics-repair-deploy.log`, `outputs/visitor-analytics-repaired-receipt.png`, `outputs/visitor-analytics-dashboard-receipt.png`.
