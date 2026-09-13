# Float engineering requirements

Inherit APG project instructions. Float is the current product name; the legacy directory and hosted domain are intentional. The product covers tokenized equities on Solana, with community building as the current priority. Preserve the user's zero-budget constraint.

## Architecture before implementation

- Optimize for maintainability, modularity, security, and measured performance. Before a nontrivial change, explain the proposed boundaries, data flow, access checks, failure handling, and validation. Scale the explanation to the change; this is not an extra approval gate.
- Keep frontend presentation, server application services, provider adapters, and database access logically separate. Prefer the existing application and established libraries. Separate deployments or microservices require a concrete operational need.
- One owner for each rule: verified token identity, issuer mapping, valuation basis, source freshness, cache keys, membership, and news matching. Pass explicit validated inputs across module boundaries. Do not add another fixed registry or copy provider orchestration into a new consumer.
- Keep modules focused on one responsibility. Refactor an inconsistent boundary when changing it. Do not divide generated datasets or library components merely to satisfy an arbitrary line limit.
- Record material decisions and tradeoffs in project documentation. The initial risk assessment is in `docs/engineering-audit-2026-09-13.md`; `docs/engineering-repair-2026-09-13.md` records implemented repairs and outstanding work. Do not confuse baseline findings with current behavior.

## Verification and release evidence

- Run strict type checks, repository lint, all relevant tests, and a production build for application changes. `pnpm build` runs the full release gate and discovers every `tests/*.test.mjs` suite. Preserve this gate when modifying build scripts.
- Test behavior and failure boundaries, especially authorization, replay, ownership isolation, token identity, stale data, provider failure, concurrency, and newly discovered listings. Passing source-pattern tests alone is insufficient.
- Do not hide failing checks by lowering rule severity, adding blanket suppressions, skipping suites, or describing scoped lint as repository-wide success. Report inherited failures explicitly and maintain a concrete remediation list.
- Review dependency advisories and deployed applicability. Preserve the lockfile, prefer compatible security patches, and check the resulting dependency graph. A package advisory is not proof of an exploited production vulnerability.
- Use isolated databases and fake providers for deterministic stress tests. Before a broader launch, measure representative authenticated flows, cold/warm cache behavior, provider outages, p95/p99 latency, request counts, D1 work, and quota headroom in staging. Do not load-test production or external free APIs by default.
- Report exactly what passed, failed, was simulated, or could not be checked. “Scalable” requires a measured workload, environment, resource use, and limits. Local microbenchmarks are not evidence of worldwide latency or a supported user count.
- A clean build is not visual QA. Verify relevant rendered routes, mobile/desktop states, keyboard behavior, navigation, and browser errors when browser access is available. State access limitations honestly.

## Security and data integrity

- Keep authorization and ownership checks on the server. Derive private scope from the verified session, never a supplied member ID. Preserve signature checks, one-use challenges, expiry, and revocation.
- Bound untrusted request bodies before buffering and expensive work. Use parameterized database statements and trusted provider destinations.
- Public caches must never contain wallet addresses, session values, or personal holdings. Privacy wording must match actual storage and retention.
- Preserve Solana-only identity, source timestamps, valuation basis, and partial coverage. Never replace unavailable values with zero, global AUM, another wrapper's price, or fabricated data.
- Revisit architecture after cross-cutting feature changes and repeated defects in the same subsystem. Prioritize measured risks over cosmetic cleanup. Do not start a recurring automation without a user request.
