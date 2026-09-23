# Public discussion reading

Decision: anyone can read visible discussion threads, replies and channel listings. A current verified-holder session is still required for posting, replying, voting, saving, following, reporting, blocking and profile changes. Saved, personal and My posts feeds remain private.

The same read service handles guests and signed-in viewers. Guest queries bind a null viewer ID, so they cannot inherit another member's bookmarks, poll choice, blocks, follows or holdings. Queries explicitly select public post and author fields; wallet addresses, session secrets, balances and notification settings are not returned. Existing hidden-content checks and optional badge preferences remain enforced. Responses remain private/no-store because authenticated views are personalized.

Public author metadata includes the nickname, avatar and bio already attached to visible posts. This change makes existing visible posts and their author metadata accessible without signing in; product/privacy copy must say so. Block preferences filter a signed-in viewer's feed but are not a promise that another person cannot read public posts while signed out.

Validation: SQLite fixtures test guest/member scope, private-feed rejection, moderation visibility, opt-in tier badges and poll-result privacy. The actual HTTP route is tested with isolated auth/provider dependencies to verify public GET access and 401 responses for guest mutations/private endpoints. Full release checks and browser QA are performed by the coordinating implementation task.

## Integrated UI and corrected badge policy

The public Community link and homepage Explore discussions action now open the readable channel feed. Guest thread details include replies and author profiles. Posting, replying, voting, saving, reporting and blocking request wallet verification. API enforcement remains authoritative. Public author responses contain no private holdings, wallet/session values or private-feed preferences.

Badges are optional value labels, not access controls: no badge below $100, Bronze $100–<$1,000, Silver $1,000–<$10,000, Gold $10,000–<$100,000, Platinum $100,000–<$1,000,000, Diamond $1,000,000+. Missing reliable valuation does not imply a value below $100 and does not produce a fallback badge. Any positive verified supported-token holding retains all member features. Known below-threshold valuation cannot restore a previously cached tier.

Production build/type/lint gates passed. Final full regression run: 356 tests passed. Desktop 1440×1000 and mobile 390×844 browser fixtures verified public feed/detail/replies, channel filtering, reply/vote/save verification prompts without content writes, no badge for null tier, and no page errors or overflow. Screenshots and results are in outputs/public-discussions-*.

Wallet transfer now supports originating mobile browsers as well as installed PWAs. Automatic tests cover Kakao-style and Safari user agents with Phantom, Backpack and Solflare links; original-page claim, pageshow/focus recovery, secret isolation, one-use transfer, fractional holdings without tier and zero-holdings rejection. This is not physical iOS/Kakao signing verification. The original browser must retain its storage; opening a different app/browser cannot claim another browser's secret.

Deployed version: 56b7e678-ba08-44ee-b576-e598018abb0f. Live verification: anonymous public threads HTTP 200, saved feed and private home HTTP 401. The live public page rendered discussions without a wallet dialog; New discussion opened wallet verification. Physical wallet signing was not performed.
