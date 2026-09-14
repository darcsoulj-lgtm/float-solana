# Float submission readiness — September 14, 2026

## Decision

Float's public demo is technically ready for hackathon review as a working early release. The submission package still needs the latest local commit synchronized to GitHub and one real-holder verification on the new Cloudflare domain. Float is not represented as an audited financial product or as infrastructure ready for paid institutional use.

## News incident

The new Cloudflare deployment began with an empty headline cache. The first member refresh requested Google News and Yahoo Finance for three holdings concurrently. Both public RSS providers returned HTTP 429, leaving six empty cache entries in retry cooldown. The UI correctly reported delayed or unavailable coverage, but a new deployment had no last-good stories to show.

The repair gives Google News and Yahoo Finance independent provider-wide cooldowns, refreshes holdings sequentially, and sends explicit RSS request headers. A Worker-compatible live probe returned 40 current, company-matched stories for each of MU, SKHY and SPCX. Production D1 was inspected read-only and no member or wallet record was changed. An authenticated request against the new production domain still requires a real holder session.

## Release evidence

- Strict TypeScript, repository lint, 277 automated tests and the production build passed.
- The production dependency audit reported zero known production advisories across 621 resolved packages.
- Home, Markets, About, Privacy, Membership, Supported stocks and Help returned HTTP 200. The removed Guidelines route returned HTTP 404. Anonymous holder news returned HTTP 401 as intended.
- Desktop and 390 by 844 mobile browser checks found no horizontal overflow, framework error overlay or console warning/error. Market observations loaded after the initial skeleton.
- The signed-out frontend contains no Guidelines or Stonkfun presentation.
- The production deployment retains the encrypted `SOLANA_RPC_URL` binding.
- Site-wide CSP, anti-framing, MIME-sniffing, referrer and browser-permission headers are applied by the application configuration.

## Remaining limits

- A successful wallet sign-in and authenticated news refresh on the separate Cloudflare domain must be completed by a real holder; production identities must not be fabricated for testing.
- Commit `ce638fc` contains this audited release locally. The HTTPS GitHub remote has no terminal credential on this Mac, and SSH host authentication is not configured, so the public repository still points to the preceding release.
- Google News and Yahoo Finance are free public RSS feeds and can rate-limit hosted traffic. The application now backs off across symbols and preserves last-good stories, but it cannot guarantee continuous upstream availability.
- The public market dashboard intentionally labels partial, delayed and dated observations. These values should not be described as complete real-time market coverage.
- Independent security review, production load testing, backups and formal monitoring remain post-hackathon launch work.
