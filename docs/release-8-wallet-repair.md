# HolderPulse release 8 — wallet routing repair

Published September 10, 2026 to https://holderpulse.glossy-kid-6048.chatgpt.site/.

- Source: `7675fcf7938107a465e882aa74ad43c42b791245`
- Saved version: `appgprj_6aa16c80630081918b8b86d4f513fc17~appgver_2be5f3dc0e2c8191ae0673d358f003e6`
- Deployment: `appgdep_6aa2879c38248191b03a7535fae035a3`, succeeded
- Runtime configuration revision: 3, preserved

## Scope and prepublication evidence

See [wallet QA](./wallet-qa-2026-09-10.md) for the reproduced v7 mismatch, implementation, 29 unit checks, 43 local integration checks, installed-wallet connection results, and limitations. The final production build passed with all temporary diagnostic routes excluded.

## Live checks

- Public community status returned 200; unauthenticated private discussions returned 401.
- A newly generated disposable empty test wallet signed a fresh membership challenge in the test process. The production service validated its signature and checked its real onchain balance through the configured service, returning 403 with “This wallet does not currently hold the required token.” This was not a simulated RPC result. No user wallet or asset was used for this test.
- Reusing that challenge/signature returned 401. The registered-member count remained unchanged. No test membership or discussion was created; the consumed challenge is subject to normal expiration cleanup.
- The live wallet dialog displays Phantom and “Connect Phantom & verify” together. Consent is required before the action becomes available.
- Membership navigation loaded the methodology page; its Community link returned to the home page.

## Limits

Actual Phantom and Backpack connection checks returned their separate accounts locally. The repaired Phantom signature also passed account/message checks locally, but its popup returned before direct inspection; the agent clicked no signature approval. Full-Chrome inspection was blocked by automatic privacy review because unrelated signed-in browsing could be exposed; no bypass was attempted. Direct inspection of the repaired signing popups, mobile wallets, and completed real-holder membership remain unverified.
