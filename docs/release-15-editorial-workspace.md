# Editorial workspace release

## Delivered behavior

- Verified members receive a holdings/follows-based brief, all-coverage browsing, stock filters, original source links and source-linked discussion drafts.
- Calendar events distinguish exact times, date-only announcements and estimates. Exact times convert to the member's timezone.
- The administrator workspace combines editorial drafts, previews, publishing/archival, existing moderation/member tools, recent audit activity and aggregate request signals.
- Four reviewed initial records use official company sources. No automatic newswire is connected and uncovered topics have explicit empty states.
- Existing Phantom/Backpack selection and signing code is unchanged. The community API adds best-effort aggregate verification/post counters.

## Validation evidence

- 88 unit tests passed during implementation, including four new editorial validation, source normalization and timezone tests.
- 38 editorial API checks passed, including unauthorized access, drafts, deduplication, personalized filtering, atomic concurrent edits, archive persistence and calendar filtering.
- 112 existing community-flow checks passed using real synthetic Ed25519 signatures and a local mock RPC; persistent posting/replies, suspension, replay protection and logout were exercised.
- 11 authorization checks passed, including explicit admin denial and spoofed identity rejection.
- TypeScript, targeted lint and whitespace checks passed.
- Production build passed with the existing Vinext toolchain. No fixture RPC URL or local admin identity appeared in the client output or deployment configuration.
- Local migration 0003 applied successfully. Production migration is handled by Sites during deployment; existing migration history remains unchanged.

The approved browser tool denied scoped HolderPulse access because its administrator-policy security check was unavailable. No browser workaround was used. Desktop/mobile rendering, the new editor interactions and a real extension session are not browser-verified. Automated API tests do not substitute for visual review.

The standard Sites build helper attempted an unnecessary dependency installation and stopped on ignored package build scripts. No package-install security policy was relaxed; the existing installed `vinext` build command was used instead.

See EDITORIAL.md for operation and coverage limits. Hosted RPC/admin settings remain at environment revision 3.

## Publication

- Sites version 15 successfully published September 10, 2026 at 23:05:11 UTC (September 11 in Korea).
- URL: https://holderpulse.glossy-kid-6048.chatgpt.site
- Source: `a55ce16f0b4a110acf842d51ec52ba9d28adba90`
- Version: `appgprj_6aa16c80630081918b8b86d4f513fc17~appgver_ea847fb9566481919def71ed277cb6f3`
- Deployment: `appgdep_6aa337982b608191ad89d6fed93ff0eb`
- Environment revision: 3, preserving the configured admin allowlist and RPC secret.
- Local development server stopped after completion. Production publication succeeded; a signed-in browser smoke test remains unverified due to the browser security-service denial described above.
