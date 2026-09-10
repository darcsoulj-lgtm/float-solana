# Member rooms and precise holdings coverage

- Replaced the auto-generated stock directory with persistent member-created rooms and legacy topics that contain visible discussions. Existing posts are preserved; new token listings do not create visible rooms.
- Added room creation, case-insensitive normalized duplicate-name checks, automatic following, room-aware posting and display names. Existing verification, suspension, same-origin and rate-limit checks apply.
- Renamed Topics navigation to Rooms. Creation uses the existing styled dialog/form primitives with visible labels, error preservation and a pending state.
- My holdings includes direct coverage matching actual verified holdings; followed rooms and industry-context tags no longer expand it. All coverage retains broader stories with an explicit context label.
- Added an editorial coverage classification and a one-time authenticated correction for the untouched reviewed NVIDIA context item. Later admin edits are not reset.
- Schema-only migration 0004 creates rooms and adds coverage; no migration seeds or data deletion.

Validation: 88 unit tests passed; 121 local community checks passed including room creation, duplicate rejection, persistent room posts, auto-follow and empty-legacy filtering; 40 editorial API checks passed including exclusion of NVIDIA from holdings. Synthetic signatures and a mock local RPC were used; no real wallet interaction was performed. Browser visual verification remains unavailable due to the previously confirmed administrator-policy service block.

TypeScript, targeted lint, production build and the local HTTP check passed. Published successfully as Sites version 16 at 2026-09-10 23:35:16 UTC (September 11 in Korea).

- URL: https://holderpulse.glossy-kid-6048.chatgpt.site
- Source: `3d1cb92ae5badf56ab71b2e5afe5c4d9ce1c2f8c`
- Version: `appgprj_6aa16c80630081918b8b86d4f513fc17~appgver_eb384898d484819199539911da524068`
- Deployment: `appgdep_6aa33e96650c819195c0198a382de4ee`
- Environment revision 3 preserved; local server stopped.
