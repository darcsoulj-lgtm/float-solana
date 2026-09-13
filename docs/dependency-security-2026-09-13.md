# Dependency repair and live verification

13 September 2026 · Engineering follow-up to release 68

The two remaining dependency alerts are resolved in the installed dependency graph. Normal Chrome can inspect the live site; no hosting protection or access policy needed to change. This closes those two specific caveats, not every remaining launch-readiness task.

## What changed

Vinext 1.0.0-beta.5 used `image-size@2.0.2` to read dimensions from build-time metadata images. The [ICNS advisory](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr) and [JXL/HEIF advisory](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq) describe malformed files that can trap that parser in an infinite loop. No fixed `image-size` version was published in the registry at the time checked.

We replaced that single parser import with [image-dimensions 2.5.1](https://github.com/sindresorhus/image-dimensions), a maintained MIT library with no transitive dependencies. The change uses pnpm's standard `patchedDependencies` mechanism: `patches/vinext@1.0.0-beta.5.patch` is versioned, `packageExtensions` declares the replacement, and an override removes the obsolete dependency. Normal installs apply the patch reproducibly. No audit exclusion or advisory suppression was added.

The adapter validates positive, safe-integer dimensions. Invalid or unsupported metadata fails the build with an explicit error. Supported binary metadata formats are PNG, JPEG, GIF, WebP, AVIF and HEIF. SVG icons retain native `sizes="any"` handling without a binary parser. ICO, ICNS and JXL metadata are not supported by this replacement. This project uses a public SVG favicon; serving existing files under `public/` is unchanged.

A blind framework upgrade was rejected: inspection of the published Vinext 1.0.0-beta.9 distribution found an embedded `image-size@2.0.2` parser despite its absence from the dependency list. Removing an audit entry while retaining the affected implementation would not solve the problem. Before upgrading Vinext, inspect its distributed code, rerun the malformed-image tests and remove this patch only when the replacement is demonstrably safe.

## Verification

- Dependency audit: **zero known advisories**, including development dependencies, at the time checked. This is not a guarantee of vulnerability-free software.
- **247 tests pass**, zero failures or skipped tests. Strict types, full repository lint and production build pass.
- New tests exercise the actual patched metadata reader with a valid PNG and SVG, verify returned image bytes, and run malformed ICNS/JXL/HEIF cases in a child process with a hard timeout so a regression cannot hang the test runner.
- A dependency regression check rejects reintroduction of a separate `image-size` lockfile entry and verifies the active metadata reader uses the replacement.

Evidence: [follow-up checks](../research/engineering/2026-09-13/dependency-followup.json). The original 244-test and local concurrency evidence remains in the earlier repair report. This change adds no database migration or runtime service.

## Live browser coverage and limits

Normal Chrome successfully loaded Markets, expanded stock details, the existing member's portfolio/news page, Profile, Discussions and Rooms. Navigation and the existing signed-in session worked. The public Backpack dashboard loaded all 44 entries and populated its summary values. The public dashboard was visually inspected at 390 × 844, with page width matching the viewport. No profile data, discussion content or wallet transaction was changed; no private balances are stored in this evidence.

The previous Python HTTP probe was rejected with Cloudflare 1010 (`browser_signature_banned`). We did not retry that blocked client, imitate a browser signature, disable the control or broaden site access. Calling all live verification blocked was too broad: normal-browser verification is available.

The live inspection also observed delayed xStocks circulation data and temporary unavailable values during background refresh; Backpack values subsequently populated. Worker logs identified an xStocks source timeout. This provider freshness issue is separate from the dependency repair. Browser console output included explicit MetaMask extension connection failures plus generic connection errors without enough attribution to call the console clean. No full-page application crash was seen in the inspected journeys.

Fresh wallet signing, profile saves, posting, every mobile route and global performance are not established by these read-only checks. The repair does not claim full end-to-end security certification.
