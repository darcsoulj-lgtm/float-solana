# Submission release evidence — September 21, 2026

## Implemented in this preparation

- Landing primary action: Join the community → existing wallet verification.
- Landing secondary action: Explore markets → public /markets, no wallet required.
- Help copy matches Home portfolio, My holdings and wallet-to-PWA return behavior.
- Privacy signing-domain instructions cover the current dedicated deployment and the Sites mirror; admin authentication wording reflects both configured paths.
- Branded project/social graphic and Open Graph/X metadata.
- Current-product README, dated prior-work disclosure, copy-ready form answers, two recording scripts and a real-user validation kit.
- Read-only runtime registry reconciliation script; no seed date was falsely advanced and no eligibility rules changed.

## Verified

| Check | Result | Scope |
| --- | --- | --- |
| Full release gate | 326/326 tests, types, lint and production build passed | Local code/build |
| Production dependency advisory check | No known vulnerabilities reported | Public advisory database, point-in-time check |
| Responsive landing and public Markets | Passed at 390×844 and 1440×1000, light/dark | Chrome viewport emulation; no horizontal overflow or page errors |
| Primary CTA | Opens wallet picker with Phantom, Backpack, Solflare | UI only; no real signature |
| Secondary CTA | Keyboard activation reaches /markets without verification | Real rendered local routes |
| Keyboard dismissal | Escape closes wallet picker | Local browser |
| Runtime/security scenarios | Passed | Isolated Worker/D1, synthetic sessions and 500ms/429 provider simulations |
| Backpack registry | 56 official / 56 runtime, no missing or extra entries | 44 reviewed seeds + 12 verified runtime additions; matching symbol and mint |
| Upload assets | PNG logo and landscape graphic inspected | Existing square logo; generated social card |

Raw evidence: [browser](browser-qa.json), [isolated runtime](runtime-qa.json), [registry reconciliation](registry-review.json). Runtime latency measurements describe local fixtures only, not production user capacity. The static `pnpm audit:tokens` still reports 12 seed additions; the full runtime reconciliation passes. Other issuer seeds have not been re-audited in this pass.

## Remaining founder checks

- Solflare real-device sign-in and installed-app return remain unverified.
- Phantom/Backpack return success is founder-reported; repeat on the final release using [the device matrix](device-qa.md).
- Browser viewport QA is not an actual iOS/Android wallet-app test.
- No external user results, retention or revenue have been supplied; the [validation kit](user-validation.md) is a proposed experiment.
- Founder must review first-person submission copy, event timing, funding/team fields and prior-work disclosure.
- Video recording/upload and actual form submission remain outstanding.

## Deployment evidence

Publication and final public-route smoke checks are recorded after deployment. This document's verified local checks do not by themselves assert live publication.
