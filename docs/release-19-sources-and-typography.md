# Exact sources, licensed-news import and simpler typography

## Changes

- Calendar and brief use Micron's exact GlobeNewswire announcement. Known old URLs are repaired on authenticated initialization, preserving unrelated administrator changes.
- Calendar source action says View announcement and explicitly names the publisher. Generic home/news-index URLs are rejected by the publishing form's server validation.
- Replaced Georgia serif fonts with the existing system sans-serif stack, reduced dashboard headings to 28px (25px on small screens), changed labels to Your news / Calendar / Rooms, simplified Your holdings, and removed decorative sidebar slogans. Compact news rows and holdings-only filtering remain.
- Admin Publishing has a Benzinga headline importer with an explicit Not connected state. Server-only licensed API key required; only MU mapping reviewed. Imports remain drafts and preserve reviewed/archived records on retries. No automated feed is represented as live.

## Verification

TypeScript and targeted lint pass. 93 unit checks cover wallet behavior, source normalization, provider validation/error handling and real SQLite import persistence/idempotency. Local synthetic-wallet integration: 43 editorial and 121 community checks pass, including authentication, exact repaired URLs, holdings-only filters, publication and calendar behavior. Provider responses are mocked because no licensed API key is configured.

Browser inspection remains blocked by the administrator-policy security service. No alternative browser or other bypass was attempted. Visual layout is not claimed as browser-verified. Production build passed. Compiled styles were inspected for the new sans-serif heading rules. Published successfully as version 19 on September 11, 2026 at 04:57:33 UTC. Environment revision 3 preserved.


Production: https://holderpulse.glossy-kid-6048.chatgpt.site

Source: `7f92b0583335c4b64f05b4f4bcf8557091574d62`

Version: `appgprj_6aa16c80630081918b8b86d4f513fc17~appgver_ea3ff7fa1928819188f8c7d67d29760c`

Deployment: `appgdep_6aa38a31c32c8191b411b1ceebe5337f`

Local test configuration restored and development server stopped.
