# News fetch recovery

Production logs on September 11 showed all three MU, SKHY and SPCX refreshes failed before fetching: Cloudflare Workers rejects `redirect: 'error'`. The UI then displayed an empty-feed message instead of distinguishing an unavailable source.

- Use Workers-supported manual redirects and reject non-success status codes without following redirects.
- Preserve HTTP failures and Retry-After through SourceHttpError and the shared cache. HTTP 429 backs off at least five minutes.
- Use the observed Yahoo SKHY US listing feed instead of 000660.KS; continue requiring company-name matches on every candidate headline.
- Advance public headline cache namespace for the mapping change.
- Expose unavailable status, distinguish pending, unavailable and successfully empty feeds, and provide retry. Editorial/calendar request failures no longer suppress independently available news.

Verification: direct live Yahoo requests returned RSS for MU (19 candidates), SKHY (15), SPCX (17), and 000660.KS (15). These are candidate counts before filtering, not displayed counts. The local Workers live probe subsequently received HTTP 429 from Yahoo; live provider delivery is therefore not claimed as verified. The Workers fixture test passes for MU/SKHY/SPCX with the real fetch transport. Browser inspection is restricted; authenticated production feed rendering remains unverified.

Run `node scripts/check-headline-runtime.mjs` for the Workers regression check; `--live` additionally requires public provider availability. Feed refresh remains shared at 15 minutes; display window remains seven days. This feed is narrower than Google News search and is not comprehensive coverage.
