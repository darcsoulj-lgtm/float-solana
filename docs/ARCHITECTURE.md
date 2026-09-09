# Architecture and invariants

## Components

- `app/`: server-rendered routes and one namespaced JSON API route.
- `components/`: institutional UI and browser interaction components; installed Shadcn primitives handle selection, radio groups, checkbox consent, buttons, and tables.
- `lib/server.ts`: D1 access, trusted-dispatch identity, authorization, rate limits, hashing and privacy serialization.
- `lib/validation.ts`: domain validation and allowed state transitions.
- `lib/solana.ts`: strict Ed25519 authentication through noble-curves, base58 validation, mint validation, finalized RPC account aggregation.
- `db/schema.ts` and `drizzle/`: persistent schema and immutable migration history.

## Schema

Surveys own questions (version-locked JSON), owner ID, token symbol, status, target, planned reward, secret pseudonymization salt, and timestamps. Responses reference surveys, contain answers, a keyed survey-specific wallet hash, cohort, finalized slot, and timestamps. A unique survey/wallet-hash constraint prevents duplicate votes under concurrent submissions. No exact balance or wallet address is stored in response rows.

Challenges bind origin + wallet + survey + nonce + expiration. Consumed challenges cannot be reused. Proofs retain a wallet address and only a SHA-256 hash of a random bearer value for up to ten minutes. Responding checks that proof again inside the conditional insert, alongside current study status and capacity. Inserting the response, deleting the proof, and creating an unfunded reward ledger entry happen in one D1 transaction batch. The bearer exists only in browser memory and is never stored in browser storage.

Commercial requests, audit events, and rate limits also persist in D1. The reward ledger is architecture for future settlement, not an existing payment system.

## Role model

The Sites dispatcher supplies authenticated identity; application code never accepts an arbitrary user ID from JSON. Researcher identity is site-scoped. Admin status requires an allowlisted dispatcher-verified email. SIWC proves identity, not membership. Public visitors can view approved research briefs and demo analytics; live analytics are owner/admin only. Raw wallet addresses and exact balances never appear in analytics exports.

Draft → pending → active requires admin approval. Researchers may pause/close their studies. Administrators may reject, pause, resume, or close. Closed/rejected studies cannot be silently reopened; submitted question sets cannot be edited. Demo records are immutable examples and rejected by every live-response endpoint.

## Solana model

`getAccountInfo` validates a initialized mint and approved SPL/Token-2022 program. `getTokenAccountsByOwner` queries by exact mint with finalized commitment and a minimum context slot from the mint read. All correctly parsed, matching-owner/mint accounts are summed with BigInt, including frozen balances. A positive raw total proves the defined eligibility predicate. Signing is a message-only operation; no transaction methods exist in the participant flow.

Scaled-UI-amount and other extensions can change economic interpretation. The application does not claim that raw token cohorts equal legal shares. Confidential balances cannot be inferred from publicly parsed amounts. Current balances cannot establish unique people, acquisition dates, purchases, or uninterrupted ownership.

## Future payments and rewards

Keep research response acceptance independent of payment claims. To enable rewards, add a reconciled USDC escrow/funding record per study, an idempotent claim authenticated by the same wallet, a separate least-privileged settlement worker, transaction signature/confirmation states, atomic budget reservation, and expiry/refund logic. Never trust a client-provided transfer status, pay twice, or sign from the browser app's server process. No treasury key exists here.

For paid research, use a payment provider's signed webhook to create paid study entitlements and subscription periods. Reconcile invoice failures/cancellations. The current `orders` rows only record interest; they must never be interpreted as payment confirmation.

## Limits

Maximum 1,000 responses per study, 10 questions, 500 characters per open answer. These bound the in-memory analytics package for the Worker. Move heavy exports to pagination/streaming if limits expand. Historical cohorts require a validated indexer and provenance; currently explicitly null. WebMCP exposes only available survey listing, with strict empty-object input and no write privileges.
