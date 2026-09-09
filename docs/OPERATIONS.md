# Operations and launch boundary

Owner: RJ / APG. Engineering implementation is in this checkout. Next milestone: obtain one commissioned research brief, recruit a defined holder sample, and verify that a customer will pay for the resulting evidence. Dates remain TBD.

Continue if buyers use the research, participants can be recruited economically, and eligibility improves trust in the dataset. Pivot or stop if willing buyers, usable sample depth, or sustainable recruitment costs fail to materialize. No fabricated target TAM or revenue forecast is asserted.

## Before paid institutional use

- Configure a dedicated HTTPS mainnet RPC endpoint; public provider requests were observed returning 503 through the local Worker because the upstream was busy/denying the request.
- Complete a real holder sign/connect/respond test on actual Backpack, Phantom, and Solflare wallets. No actual user wallet or funds were accessed in this build.
- Establish the operating legal entity, final pricing/terms, privacy request channel, retention policy, recruitment agreement, and data-use restrictions.
- Configure monitoring, alerting, database backup/export and restoration practice, and a named incident owner. Do not represent this first release as externally audited.
- Keep administrator access narrowly allowlisted. Production must not contain `seedy@sites.test` or the local RPC fixture URL.
- Review survey briefs for personal/confidential/MNPI requests and potentially misleading reward language. Planned rewards are not entitlements.
- Validate SPCX with an official published source and mainnet mint check before enabling it.

## Rollback and migrations

Deploy only saved, tested source versions. Applied Drizzle migrations are immutable; append new migrations for future schema changes. A failed deployment may have already applied migrations. Inspect before modifying migration history. Rollbacks must account for schema compatibility.

## Seed data

Three fixed example studies have IDs `demo-mu`, `demo-skhy`, and `demo-spcx`, each with 24 deterministic simulated answers. Seeding is idempotent and never changes an existing live study. No seeds appear as live responses. Remove the temporary `SEED_KEY` after any initial bootstrap and apply the new environment revision with a deployment.

## Data access and deletion

Admin requests are in `/admin`; no outbound email automation is configured. Operators must check this queue. Privacy requests currently use the authenticated enterprise form and a response receipt. Verify request authority before deleting any record. No automated retention or self-service deletion is implemented. Wallet challenge/proof cleanup runs on subsequent verification traffic, not on a scheduled timer.

## Funding architecture

Reward and payment integrations are documented in ARCHITECTURE.md. Neither requires or justifies accepting a treasury private key into this website. Build settlement as a separately controlled service before enabling claims. An unresolved funding state must never produce a successful payout message.
