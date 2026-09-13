# Float community launch

The primary product is now a wallet-gated community. Read [COMMUNITY.md](COMMUNITY.md) for current behavior, operations, privacy and test coverage. The research documentation below describes retained legacy survey tools.

The member experience includes markets, discussions, news with upcoming events, and profiles. Administrators publish sourced stories and events, manage reports and members, and inspect request counters at `/admin`. See [editorial operations](docs/EDITORIAL.md) for publishing instructions and coverage limitations. Legacy survey administration has moved to `/admin/research`.

# Float

A community and market dashboard for holders of tokenized stocks on Solana, with retained legacy research tools. Built with React 19, Vinext, Cloudflare Workers and D1 SQLite. Holders sign in with a wallet; the administrative workspace uses platform-managed Sign in with ChatGPT. See the [September 13 engineering repair](docs/engineering-repair-2026-09-13.md) for architecture, measured checks and remaining limits.

## Run locally

Use Node 22.13+ and the bundled pnpm runtime. Install with `pnpm install`; preserve the lockfile and dependency security policy. This environment may report ignored optional dependency build scripts even after installing packages; the supplied binaries were sufficient for our successful build. Do not globally enable arbitrary install scripts.

1. Copy `.env.example` to `.env`.
2. Create an ignored `.dev.vars` file with `ADMIN_EMAILS=seedy@sites.test` for local testing. The Sites dev plugin signs in as this fixed local identity. Never use this local identity as a production administrator.
3. `pnpm db:local` applies generated migrations to the local database.
4. `pnpm dev` starts the app; use its printed URL. Sign in from the workspace.
5. Visit `/admin` for the editorial workspace. Use `/admin/research` → **Add labeled example studies** only if you need legacy survey examples locally.

The Vite plugin reads `.dev.vars` for local Worker bindings. Restart the server after editing it. `.env` and `.env.example` document the same supported configuration keys; production values belong in Sites settings. No local test data is deployed.

## Configuration

- `ADMIN_EMAILS`: comma-separated exact emails supplied by the trusted Sites dispatcher. Empty means nobody has administrator privileges. Researchers are identified by stable site-specific user IDs; every study access is checked on the server.
- `SOLANA_RPC_URL`: server-only authenticated Solana mainnet JSON-RPC endpoint. Defaults to `https://api.mainnet-beta.solana.com`. Use a dedicated provider for production throughput. Public RPC can return 403/429 from hosted runtimes; errors never grant eligibility. Keep API keys secret.

Configure hosted values through Sites environment settings and deploy the saved version to apply them. Sites provisions the logical `DB` D1 binding and applies `drizzle/` migrations. `.openai/hosting.json` preserves the Site project ID. Never deploy the test-only `.dev.vars` file or its localhost RPC fixture.

## Main workflows

- Public landing, studies, pricing, enterprise request, methodology, trust, docs, and about pages.
- Researchers: authenticated private workspace; create and edit drafts; submit for review; pause/close studies; view analytics; export JSON.
- Administrators: explicit allowlist; approve/reject/pause/resume surveys; review commercial requests; audit trail; seed examples.
- Participants: choose a wallet provider; sign a single-use challenge; finalized ownership check; answer; fresh check at submission; atomic insert and proof consumption; duplicate-wallet prevention.
- Commercial requests: persisted per-survey or enterprise interest. No actual checkout or paid entitlement.
- Rewards: planned amounts and an unfunded ledger entry associated with accepted responses. Claims return a clear disabled response; no transfers or custody.

## Verification semantics

See [research](docs/RESEARCH.md), [architecture](docs/ARCHITECTURE.md), [operations](docs/OPERATIONS.md), and [verification report](docs/VERIFICATION.md).

The reviewed registry contains 1,300 Solana mints across Backpack (44), xStocks (832), Ondo (416), PreStocks (7), and Tessera (1). See [multi-issuer coverage](docs/multi-issuer-coverage.md) for sources, limits, and valuation methodology. See the [September 11 audit](docs/token-audit-2026-09-11.md) for every mint, evidence and two corrected omissions. The [September 13 refresh](research/token-audit/2026-09-13.json) reconciles all 44 enabled Backpack listings and verifies the new DKNG, FLWS and WEN mint accounts at finalized commitment. Symbols alone are never accepted as token identity. Positive raw balances qualify; cohorts are raw token units, not adjusted economic shares. No exact balance is stored with answers.

## Tests

See [the current member experience](docs/release-26-holder-experience.md) for dark mode, private portfolio values, photos, automatic news and verification limits.

- `pnpm audit:tokens`: read-only live Backpack registry check before a release. Exits unsuccessfully if entries are missing, removed or mismatched. Review exact Solana mints before changing the allowlist; update the review date and evidence together. This is not a scheduled monitor.
- `pnpm test:markets`: source parsing, coverage, supply validation and market-row selection regressions.
- `pnpm test`: discovers every `tests/*.test.mjs` regression suite, including validation, signatures, mint checks, market caches, listings, authorization and database behavior.
- `pnpm test:integration`: local persistence, lifecycle, access boundaries, CSRF, demo isolation, commercial requests, server-rendered routes.
- `node tests/authorization.mjs`: local researcher/admin/foreign-owner boundaries and forged-header rejection.
- `pnpm test:wallet`: temporary local RPC fixture with genuine key generation/signatures; tests proof replay, fresh balance checks, duplicate wallets, analytics, reward refusal. Restores `.env` and `.dev.vars` afterward.
- `pnpm build` (also `pnpm verify`): requires strict types, repository-wide lint and all regression suites to pass before producing the production build. A failed check stops the release build.
- The [metadata-parser security patch](docs/dependency-security-2026-09-13.md) removes two vulnerable build-time parser paths. Keep its regression tests and review bundled dependencies before upgrading Vinext.
- `node scripts/check-repair-runtime.mjs`: isolated Worker/D1 test with real application routes and sessions, synthetic users, and simulated slow/rate-limited providers. It does not load project secrets or contact providers. Reports latency, database work and request isolation. Local results do not establish regional production capacity.

Integration tests require a running local server, applied migrations, and local admin configuration. They create only local test studies. Wallet tests never mint tokens, transact, or use a user's private keys. Do not run the fixture against a production database.

## Remaining integrations

A successful mainnet holder submission from an actual funded user wallet has not been tested. A dedicated RPC URL, real wallet-browser compatibility testing, payment/subscription processing, USDC funding and payout worker, historical indexer, operator privacy procedures, monitoring, backups, and independent security review remain necessary before paid institutional operation. Mobile currently requires a compatible wallet browser; deep-link pairing is not included. The public site is an initial working release, not a claim of audited institutional readiness.

Initial provisioning used a temporary fixed-data bootstrap route. That route has been removed from the published application; subsequent demo seeding is available only to signed-in administrators.

### Client release continuity

The Vite client build retains immutable JavaScript, CSS and related assets from the three preceding builds. Keep `.float-build-cache/client-assets/` (ignored) between release builds; a clean checkout has no previous assets to retain. Only manifest-referenced static files are carried forward, never old HTML, manifests, server code or configuration. The current build plus three prior dependency graphs are tested before packaging. Purge this cache and old build output when an urgent client security fix requires invalidating old code.

Home and Markets have independent error boundaries. Module download failures retry twice; render errors are not automatically retried. Failures report only section, category, React error code and static chunk paths to the rate-limited, same-origin `/api/client-error` endpoint. Raw messages, page URLs, wallet identifiers and form contents are not sent. Inspect Sites Worker logs for `Client section failed` to diagnose a recurrence; source-refresh timeouts alone do not establish a client crash cause.

### Automatic Backpack listings

Backpack dashboard and all-market discovery now use a durable runtime registry, not only the seed snapshot. Public requests schedule a shared check every five minutes; an idle site catches up on the next visit. Existing pages poll and pick up new rows and page counts without a redeploy. No external scheduler or paid provider is required.

A new candidate must have an enabled Solana address in Backpack's official assets endpoint and a finalized initialized mint with matching symbol, decimals, metadata mint, Backpack Securities name and pinned Backpack metadata authority. Duplicate identities, conflicting existing mints and non-Solana assets are rejected. New verified entries are appended in D1; provider errors retain the last-good list and honor retry delays. Market cache keys include the exact batch mints so new listings cannot inherit an older batch's data. Verification handles up to 80 new candidates per check and rotates large backlogs.

This discovery currently covers Backpack. Other issuers retain their reviewed seed registries. The same server-validated registry now supplies market parsing, holdings verification, holder tiers, community topics and news matching. A discovered token can qualify a holder only after the existing signed-wallet and finalized ownership checks; client-supplied symbols never grant access. The public market listing is not an assertion that a token is available to every jurisdiction.

Markets, the public Backpack dashboard and holder-tier valuation share canonical mint batches and the same price/supply/history cache entries. A warm batch reads its source snapshots in one database query. Normal market polling is every two minutes while a view is active; registry checks remain demand-driven every five minutes. Cache timestamps and delayed-source status remain visible. Full market summaries still load the tracked universe in bounded batches; a dedicated summary endpoint is a remaining scaling improvement.

Backpack's official API docs also distinguish `source=Venue` trading statistics from `source=External` stock-market statistics. Neither is labeled total Solana DEX volume in Float.
