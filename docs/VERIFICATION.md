# Verification report — 2026-09-09

## Completed

- TypeScript typecheck: passed.
- Strict application lint: passed. The two top-level SIWC sign-in/sign-out anchors intentionally retain native navigation because the platform prohibits prefetching authentication routes.
- Core test suite: 11 tests passed, including strict signature verification, tampering and small-order key rejection, input validation, exact owner/mint filtering, BigInt balance arithmetic, and fail-closed provider errors.
- Local integration: 41 request/route assertions passed across authentication, CSRF, persistent draft creation, moderation lifecycle, invalid signatures/proofs, example isolation, commercial-request storage and 13 server-rendered routes.
- Authorization: 8 checks passed for researcher role, restricted administration, forged dispatcher-header rejection, foreign survey ownership, and prevention of self-publication.
- Signed response flow: 15 requests passed with real ephemeral Ed25519 signatures and an isolated mocked Solana RPC. A zero balance at submission is rejected, a valid response is persisted, a used proof cannot be reused, duplicate wallets cannot re-answer, analytics reflect the stored response, and unfunded rewards cannot be claimed.
- Mainnet mint structure: MU and SKHY queried successfully with `getAccountInfo`; both are initialized six-decimal Token-2022 mints. Mainnet metadata and issuer-control/scaling extensions were inspected.
- Production Worker build: passed; default Worker fetch entrypoint generated. Final packaging uses the Sites helper and source commit.

## Explicit gaps

No real funded user wallet was connected or used. Successful holder submission was tested with a mock RPC, not an actual MU/SKHY-holding wallet. The public RPC was observed returning provider errors from the Worker; use a configured dedicated RPC endpoint for reliable production operation.

Browser wallet prompts and mobile wallet-browser compatibility were not interactively tested. Rendered-route checks verify successful server responses, not visual screenshots or a full browser interaction audit. WebMCP listing support was implemented but no supported WebMCP validation context was available; its runtime registration remains unverified.

No actual checkout, recurring subscription, USDC funding, payout, historical indexer, or independent penetration test was performed. These are documented inactive integrations, not features claimed as operational.

## Fixed during validation

- Allowed administrator-owned drafts to enter the normal moderation submission flow.
- Replaced permissive runtime Ed25519 verification with strict noble-curves verification after a small-order public-key test exposed the issue.
- Corrected draft-edit rendering and reran route checks.
- Bounded studies and open-text answers to keep analytics within Worker memory constraints.
- Replaced untyped application data with explicit response/record types and corrected accessibility labels and native authentication links.
