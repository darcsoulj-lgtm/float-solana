# HolderPulse

A persistent research application for verified tokenized-equity holder surveys. Built with React 19, Vinext, Cloudflare Workers, D1 SQLite, and platform-managed Sign in with ChatGPT. This is working application code, with explicit integration boundaries below.

## Run locally

Use Node 22.13+ and the bundled pnpm runtime. Install with `pnpm install`; preserve the lockfile and dependency security policy. This environment may report ignored optional dependency build scripts even after installing packages; the supplied binaries were sufficient for our successful build. Do not globally enable arbitrary install scripts.

1. Copy `.env.example` to `.env`.
2. Create an ignored `.dev.vars` file with `ADMIN_EMAILS=seedy@sites.test` for local testing. The Sites dev plugin signs in as this fixed local identity. Never use this local identity as a production administrator.
3. `pnpm db:local` applies generated migrations to the local database.
4. `pnpm dev` starts the app; use its printed URL. Sign in from the workspace.
5. Visit `/admin` and use **Add labeled example studies** to seed the local database.

The Vite plugin reads `.dev.vars` for local Worker bindings. Restart the server after editing it. `.env` and `.env.example` document the same supported configuration keys; production values belong in Sites settings. No local test data is deployed.

## Configuration

- `ADMIN_EMAILS`: comma-separated exact emails supplied by the trusted Sites dispatcher. Empty means nobody has administrator privileges. Researchers are identified by stable site-specific user IDs; every study access is checked on the server.
- `SOLANA_RPC_URL`: server-only authenticated Solana mainnet JSON-RPC endpoint. Defaults to `https://api.mainnet-beta.solana.com`. Use a dedicated provider for production throughput. Public RPC can return 403/429 from hosted runtimes; errors never grant eligibility. Keep API keys secret.
- `SEED_KEY`: optional temporary secret for the one-purpose `/api/bootstrap` POST endpoint. It can only insert three fixed, labeled demo studies and deterministic simulated responses. Remove this key and redeploy after provisioning. Alternatively seed through an authenticated administrator; no seed key is needed.

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

Approved mints: MU and SKHY, sourced from Backpack and confirmed against Solana mainnet. SPCX examples are available, but its live registry entry remains disabled pending a sufficiently reliable official mint source. Symbols alone are never accepted as token identity. Both enabled assets are Token-2022 mints with 6 decimals and issuer-control/scaling extensions. Positive raw balances qualify; cohorts are raw token units, not adjusted economic shares. No exact balance is stored with answers.

## Tests

- `pnpm test`: validation, strict signatures, small-order rejection, mint/program checks, account filtering, integer balances, RPC failure behavior.
- `pnpm test:integration`: local persistence, lifecycle, access boundaries, CSRF, demo isolation, commercial requests, server-rendered routes.
- `node tests/authorization.mjs`: local researcher/admin/foreign-owner boundaries and forged-header rejection.
- `pnpm test:wallet`: temporary local RPC fixture with genuine key generation/signatures; tests proof replay, fresh balance checks, duplicate wallets, analytics, reward refusal. Restores `.env` and `.dev.vars` afterward.
- `pnpm typecheck` and `pnpm build`.

Integration tests require a running local server, applied migrations, and local admin configuration. They create only local test studies. Wallet tests never mint tokens, transact, or use a user's private keys. Do not run the fixture against a production database.

## Remaining integrations

A successful mainnet holder submission from an actual funded user wallet has not been tested. A dedicated RPC URL, real wallet-browser compatibility testing, payment/subscription processing, USDC funding and payout worker, historical indexer, operator privacy procedures, monitoring, backups, and independent security review remain necessary before paid institutional operation. Mobile currently requires a compatible wallet browser; deep-link pairing is not included. The public site is an initial working release, not a claim of audited institutional readiness.
