# Phantom transport candidate — 2026-09-10

## Evidence

The user confirmed Chrome, then confirmed that Phantom works with Backpack disabled and that re-enabling Backpack restores the wrong signing popup. This establishes an extension-coexistence reproduction in the user's environment. It does not identify the internal extension function that redirects the request.

Production v10 diagnostics show Phantom selection, successful connection and holdings detection, then a failed or unanswered signing request. Earlier fixes to account equality, signature byte handling and user-gesture timing did not resolve coexistence. The local Sites plugin contains no wallet-signing hooks; this inspection does not cover unknown hosting-side code.

## Candidate repair

Phantom now uses the documented `window.phantom.solana.request` transport for both `connect` and `signMessage`. It bypasses the registered Wallet Standard signing wrapper and the convenience `provider.signMessage` method used in earlier versions. Backpack and Solflare retain their Wallet Standard paths.

- Capture one specific Phantom provider and its request function before connection.
- Reject providers marked as Backpack, providers identical to another selected extension, and request functions shared with Backpack/Solflare. Missing native Phantom cannot fall back to a generic or named registration.
- Bind connection and signing to that captured transport. Changes to the namespace, transport or account stop the flow before further requests.
- Validate the connection response against the provider's canonical base58 public key. Copy the key/message before awaiting any requests.
- Decode typed, serialized or base58 signature responses and perform strict Ed25519 verification against the original message and account. The existing server verification, one-use challenge and holdings recheck remain in force.
- Preserve selected-wallet event cleanup and session invalidation. No transaction, token transfer, package, schema or hosted-secret changes.

Primary references:

- https://docs.phantom.com/solana/detecting-the-provider
- https://docs.phantom.com/solana/establishing-a-connection (documented `request({method: 'connect'})` interface)
- https://docs.phantom.com/solana/signing-a-message (documented `request({method: 'signMessage', params: ...})` interface)

## Validation and limits

60 unit checks passed, including 17 new native-Phantom cases. One test deliberately makes the Phantom Wallet Standard signing feature call Backpack's implementation; production selection still uses the independent native Phantom request transport and neither standard feature is invoked. Other cases cover missing/spoofed/shared providers, changed transports/accounts, wrong addresses/messages/keys, serialization, rejected requests and event cleanup.

That reproduction is simulated. Direct Chrome inspection was again denied by the administrator-enforced browser security-policy service after resetting the browser-tool session. No alternate browser technology or indirect access bypass was attempted. No real user signature or transaction was approved by the agent. **This is a candidate repair, not a verified resolution of the user's real two-extension flow.** A fresh real-world attempt with both extensions enabled is still required.

The old `tests/fixtures/wallet-qa.tsx` predates native Phantom selection and must not be used to claim current Phantom coverage. The dedicated native transport is exercised by `tests/wallet-provider.test.mjs`; the old fixture remains archival and is not a public route.

Final TypeScript, targeted lint, formatting and whitespace checks passed. The production build completed successfully from the final application source.

## Publication

- Source: `81415f5bfce12ee52f8c184ea75c44f2c01e4e65`, pushed successfully before saving.
- Saved version: 11, `appgprj_6aa16c80630081918b8b86d4f513fc17~appgver_fbbe560f67288191b3123920745b58d8`.
- Deployment: `appgdep_6aa2a8aa6f208191a252c32c10b50b00`, succeeded at 2026-09-10 12:55:19 UTC.
- Public URL: https://holderpulse.glossy-kid-6048.chatgpt.site/
- Hosted environment revision: 3, unchanged. No secret or RPC configuration mutation.
- The validated archive contains the built Worker/client assets and excludes environment files, tests and dependencies.

Publication success does not establish real-extension behavior. The browser-policy service outage still prevents direct Chrome verification; the coexistence result remains pending.
