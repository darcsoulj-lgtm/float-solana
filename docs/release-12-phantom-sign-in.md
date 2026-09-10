# Phantom Sign In with Solana candidate — 2026-09-10

## Evidence and remaining uncertainty

The user's 22:13 KST screenshot shows HolderPulse's Phantom-connected state, one detected stock token, and an active signing wait while Backpack's password/unlock window is open. Production logs at 13:12:39–13:13:08 UTC confirm Phantom connection and holdings success followed by signing requests. No verification request reached the server. This confirms the candidate in release 11 did not resolve the real flow. The exact mechanism inside the installed extensions remains unknown.

Direct, task-scoped Chrome inspection was again denied by the unavailable administrator-enforced browser policy service. No alternate browser technology, private browser-file access, extension modification or indirect inspection bypass was attempted. The screenshot supplies visual evidence; the agent did not observe or approve a real signature.

## Targeted change

Phantom community membership now uses the distinct native `signIn` operation documented by Phantom's Sign In with Solana specification. It does not invoke `request({method: 'signMessage'})`, the convenience `signMessage` method, or a Wallet Standard message-signing wrapper for this flow. This tests an alternate authentication operation rather than another wrapper around the failed message-signing request. Backpack/Solflare community access and existing survey signing retain their prior paths.

- Capture Phantom's specific sign-in method before connection, reject missing/shared/replaced methods, and never fall back to generic signing or another wallet.
- Create all SIWS fields on the server: actual request origin/host, connected address, mainnet, a 32-character alphanumeric nonce derived from the random challenge ID, issuance and five-minute expiration.
- Store the exact canonical SIWS message in the existing challenge row. The server verifies only its stored message and account, then atomically consumes the challenge and rechecks holdings. A client-supplied message cannot replace it.
- Verify the returned account address/public key, signature type, exact signed bytes and strict Ed25519 signature on the client as well. Reject account/transport changes during the request.
- Keep consent, held-token preflight, 24-hour member sessions, privacy and server access checks. No transaction methods, asset transfers, dependency changes, schema changes or hosted-secret changes.
- Add allowlisted static application-version and requested-authentication-method fields to existing operational diagnostics. These identify the executing app release/operation; no extension implementation, browser inventory, wallet address, balance, signature or free-form error is collected.

## Validation

- 75 unit checks passed (15 new SIWS cases), including operation isolation, no fallback, wrong domains/nonces/expiry/accounts, changed response keys/messages/signature types and account/method changes.
- 107 local community checks passed with disposable Ed25519 keys and a clearly simulated RPC. The new SIWS challenge reaches persistent membership; altered-domain signatures are rejected even when accompanied by a client-supplied replacement message; replay and holdings loss fail; legacy challenges and existing community/moderation flows still work.
- Local mock settings were restored and checked; no test RPC appears in `.env` or `.dev.vars` afterward.
- TypeScript, targeted lint, formatting, whitespace checks and the final production build passed.

**This remains a candidate repair.** These tests verify app behavior and authentication controls, not which real extension popup appears in the user's Chrome. Completion requires successful sign-in with both Phantom and Backpack enabled.

## Primary references

- https://github.com/phantom/sign-in-with-solana — provider `signIn` interface, field requirements, output structure and SIWS message grammar.
- https://github.com/solana-labs/wallet-standard/blob/master/packages/core/util/src/signIn.ts — canonical field order and signature/message verification contract. The app uses a fixed explicit field set and exact server-stored bytes, not a permissive parser.

## Publication

- Pushed source: `a78636a4ecea32aeae8869255a58a7eb8e83447d`.
- Version 12: `appgprj_6aa16c80630081918b8b86d4f513fc17~appgver_92a0e1ee13748191a28c5d27903bb6b2`.
- Deployment: `appgdep_6aa2afbd02888191aa1b5645fdf76b2a`, succeeded at 2026-09-10 13:25:44 UTC.
- Public URL: https://holderpulse.glossy-kid-6048.chatgpt.site/ . Existing public audience and runtime environment revision 3 retained.
- Archive validation confirmed the SIWS operation and static client version marker in built assets, expected Worker entrypoint, and exclusion of test RPC configuration, environment files and test source.
- Deployment success was confirmed by Sites. Real Chrome extension selection/sign-in remains unverified because the task-scoped browser security check was unavailable.
