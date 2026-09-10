# Native Phantom account response correction — 2026-09-10

The user confirmed that release 12 opens Phantom. Its subsequent signing attempt displays `The wallet returned an invalid account.` Production diagnostics at 13:27 UTC identify client version 12 and `method=signIn`, followed by a client signing failure before server verification.

## Root cause

The integration incorrectly typed the native `window.phantom.solana.signIn` response as the Wallet Standard wrapper response, then read `result.account.publicKey`. Phantom's current public injected SDK instead defines the native response with a top-level `address` (a PublicKey-like object); its strategy normalizes that address with `.toString()`. The SDK-level helper/tests also document the string-address form. The absent `account.publicKey` therefore reached the app's byte-array validator and produced the exact reported error.

Before changing application code, the test fixture was corrected to the native shape. The existing successful-login unit test then failed with the same `The wallet returned an invalid account.` error. After the application correction it passes. Earlier SIWS tests had used the wrong response contract and did not catch this defect.

## Correction and security checks

- Read native `result.address`, accepting a string or a PublicKey-like object. Reject missing/malformed addresses and a Wallet Standard-only account object.
- Compare the returned address with the captured connected address. Verify the signature against the immutable connected public key and exact server-issued message; no public key is accepted from response metadata.
- Preserve the dedicated Phantom `signIn` operation, no fallback, account/transport-change guards, strict Ed25519 verification, server challenge consumption and holdings rechecks.
- Update the static operational client marker to 13; the server accepts the current and previous markers. No private data was added to diagnostics.

82 unit checks passed, including the corrected native object fixture, SDK string response, malformed/missing address cases, wrong-key signatures and all existing wallet/security cases. TypeScript, targeted lint and whitespace checks passed. The server authentication flow is unchanged; its 107-check local suite passed in release 12 and was not rerun for this response-field correction.

The user's observation confirms Phantom selection on release 12. A completed real-holder login on release 13 remains unverified; the previous task-scoped browser security-service outage has not been worked around. No user signature or transaction was approved by the agent.

## Primary evidence

Read directly from Phantom's public repository during this investigation:

- https://github.com/phantom/phantom-connect-sdk/blob/main/packages/browser-injected-sdk/src/solana/types.ts
- https://github.com/phantom/phantom-connect-sdk/blob/main/packages/browser-injected-sdk/src/solana/strategies/injected.ts
- https://github.com/phantom/phantom-connect-sdk/blob/main/packages/browser-injected-sdk/src/solana/signIn.ts
- https://github.com/phantom/phantom-connect-sdk/blob/main/packages/browser-injected-sdk/src/solana/signIn.test.ts
