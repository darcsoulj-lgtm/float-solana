# Development history and disclosure

Float was not started from an empty repository during the current hackathon. Work began before September 14, 2026 under the earlier HolderPulse name. The earlier platform included wallet verification, multi-issuer market work and legacy survey/research workflows.

The current Colosseum page lists a September 14–October 12 competition window. This record uses **September 14 at 00:00 Asia/Seoul only as a reproducible repository comparison boundary**, not as a claim about the competition's official start timestamp. Confirm the selected event's timezone and disclose overlapping boundary work conservatively.

Last commit before that local comparison boundary: `8cdf54a6709e481857fac216bc95fde775adf0d2` (September 13, 22:34 KST). Its subject is “Reconcile Ondo Solana valuations and prioritize issuer value metrics.”

## Work represented after that comparison boundary

The history includes the dedicated public deployment, provider/news recovery, market refresh and automatic Backpack registry work, expanded wallet compatibility and wallet-to-PWA session handoff, holder-tier refinements, mobile/desktop discussion navigation, author profiles, My posts, moderation controls, and submission preparation. This is a description of dated changes, not a claim that every underlying capability was first created during the competition.

## AI assistance

RJ is the founder and product decision-maker. ChatGPT/Codex assisted implementation, debugging, design review, QA and documentation. Tanaka, Mina and other review-role names refer to AI-assisted perspectives, not additional human team members. No independent human security audit is claimed.

## Traceable commit history at preparation time

The table below is a snapshot; later submission-preparation commits appear in the normal Git history. Commit timestamps are supporting history, not independent proof of eligibility.

```text
1f0942d | 2026-09-21T17:37:33+09:00 | Fix production profile sheet positioning and test compiled layout
ed86120 | 2026-09-21T16:35:27+09:00 | Improve discussion management and guarantee verified base tier
50bdc33 | 2026-09-21T16:11:04+09:00 | Revert "Add market source map"
6d95436 | 2026-09-21T16:02:59+09:00 | Add market source map
4648a2f | 2026-09-21T15:24:40+09:00 | Simplify market explanations
66732ab | 2026-09-21T14:49:44+09:00 | Simplify discussion actions and add user blocking
65dcf63 | 2026-09-21T14:34:02+09:00 | Align discussion author typography
f87d1c6 | 2026-09-21T14:24:49+09:00 | Integrate discussion back action into heading
c547c9e | 2026-09-21T14:16:30+09:00 | Add Crypto and Off Topic channels
11b29d8 | 2026-09-21T14:03:04+09:00 | Open discussions in dedicated detail views
be87147 | 2026-09-21T13:50:38+09:00 | Simplify news and market filters
4bf51a5 | 2026-09-21T12:53:23+09:00 | Redesign mobile member experience
20e0192 | 2026-09-21T11:43:17+09:00 | Refresh earnings calendar from public Nasdaq dates
d753310 | 2026-09-21T11:24:21+09:00 | Fix profile divider and mobile notification header
1f83b67 | 2026-09-21T11:18:49+09:00 | Move appearance controls into member profile
9aa4793 | 2026-09-21T11:09:53+09:00 | Simplify holdings summary and widen discussion feed
710756a | 2026-09-21T10:58:51+09:00 | Improve community entry and mobile discussion feed
04e6fba | 2026-09-21T10:41:37+09:00 | Simplify Float navigation and improve app installation
6088579 | 2026-09-21T10:26:32+09:00 | Bind mobile app handoffs to wallet signing challenges
37cc84c | 2026-09-21T10:09:49+09:00 | Restore both wallet return choices and preserve app handoff context
e7ea623 | 2026-09-21T09:53:44+09:00 | Avoid false mobile wallet account changes after connect
b4e3a32 | 2026-09-21T09:41:00+09:00 | Support named mobile wallets and prioritize returning to Float
12a9a72 | 2026-09-21T09:23:56+09:00 | Keep installed Float session after mobile wallet verification
01bd440 | 2026-09-21T08:29:19+09:00 | Keep holder tiers current across wallet refreshes
bdfbd80 | 2026-09-21T00:05:19+09:00 | Use bounded dated quotes for clear holder tiers
6753a81 | 2026-09-20T23:56:47+09:00 | Simplify discussion channels and repair holder tier badges
ea49926 | 2026-09-20T23:38:45+09:00 | Show discussion tiers without generic holder label
9c2115e | 2026-09-20T23:21:38+09:00 | Replace stock badges with verified holder status
08be61a | 2026-09-20T23:04:42+09:00 | Remove duplicate profile appearance control
89cf9b0 | 2026-09-20T23:00:33+09:00 | Reset unsaved profile drafts on navigation
b738465 | 2026-09-20T22:49:38+09:00 | Remove delayed source banner from markets
971e0e7 | 2026-09-20T22:42:23+09:00 | Clarify market pool coverage labels
e03b0e6 | 2026-09-20T22:35:37+09:00 | Move market source credits into methodology disclosure
91583bf | 2026-09-20T22:24:22+09:00 | Show compact times in discussions
6aff717 | 2026-09-20T22:19:31+09:00 | Remove About name and independence sections
fa41331 | 2026-09-20T22:16:27+09:00 | Remove repeated supply basis from market rows
7aa2cb1 | 2026-09-20T22:08:35+09:00 | Add Stocks and Pre-IPO market filters
1fbfd09 | 2026-09-20T20:55:42+09:00 | Open asset market pages and preserve news return path
2315fb7 | 2026-09-20T20:26:09+09:00 | Simplify market controls and refresh automatically
6f33bc3 | 2026-09-20T20:18:40+09:00 | Clarify Solana market overview heading
eb81c95 | 2026-09-20T20:09:51+09:00 | Include graduated verified Stonkfun stock pairs
d829cf5 | 2026-09-20T19:50:03+09:00 | Include verified Stonkfun stock-quoted pool volume
ea1cf52 | 2026-09-20T19:11:35+09:00 | Improve eligible DEX pool coverage for active stocks
4eab0a4 | 2026-09-20T15:51:46+09:00 | Restore verified pool metrics after free source rate limits
d441937 | 2026-09-20T15:20:32+09:00 | Refresh onchain metrics faster
1b10e0a | 2026-09-20T15:17:41+09:00 | Use shared onchain market metrics
f5fdde0 | 2026-09-20T13:57:25+09:00 | Make market token sorting visible and improve mobile listing
c24416e | 2026-09-20T13:22:37+09:00 | Simplify market overview copy and sparse history presentation
1620262 | 2026-09-20T12:56:16+09:00 | Fix mobile wallet routing and source refresh reliability
293a7a7 | 2026-09-20T12:10:00+09:00 | Add wallet-gated community moderation
415ac8b | 2026-09-20T00:31:05+09:00 | Add observed market history and asset-first stock rows
fc9e656 | 2026-09-19T23:50:25+09:00 | Configure production D1 migrations
01223f8 | 2026-09-19T23:48:03+09:00 | Add verified-member discussion polls
7cbd297 | 2026-09-19T23:13:11+09:00 | Hide redundant desktop market sort control
0b6a3ff | 2026-09-19T22:53:34+09:00 | Refine market discovery and add verified Tessera context
9f7e720 | 2026-09-19T21:53:39+09:00 | Restore Float landing and community navigation
16d5f35 | 2026-09-19T21:43:58+09:00 | Open public markets dashboard and refine Float branding
1286048 | 2026-09-19T21:03:10+09:00 | Refine Float landing page messaging
4dd9147 | 2026-09-15T13:18:48+09:00 | Add sorting to all market columns
0c6c19f | 2026-09-15T13:02:25+09:00 | Show member bios in community posts
5180fc1 | 2026-09-15T12:47:03+09:00 | Add home screen installation guide
75e9303 | 2026-09-15T12:38:56+09:00 | Make Float installable as a home screen app
c29b976 | 2026-09-15T11:28:55+09:00 | Add current DEX activity breakdown
21cae72 | 2026-09-15T10:55:53+09:00 | Clarify token supply and use DEX volume
d0d81c7 | 2026-09-15T10:29:12+09:00 | Use eligible DEX volume for issuer dashboards
76f92a0 | 2026-09-15T09:17:09+09:00 | Add market overview activity dashboard
62e1a9e | 2026-09-14T22:10:21+09:00 | Simplify empty-wallet message and align eligibility button
d3e59b8 | 2026-09-14T21:51:41+09:00 | Keep newer market snapshots and extend pending refresh checks
0e1e822 | 2026-09-14T21:47:24+09:00 | Refine dark market summary contrast
ec9406b | 2026-09-14T21:44:00+09:00 | Fix mobile wallet handoff and badge visibility
cbc5526 | 2026-09-14T21:33:18+09:00 | Refine discussion reply layout
0ee825f | 2026-09-14T21:17:28+09:00 | Harden news refresh and submission release
0ae00ef | 2026-09-14T21:02:03+09:00 | Add public markets and simplify submission navigation
9e175e6 | 2026-09-14T20:51:17+09:00 | Document production Solana RPC secret
12fbd88 | 2026-09-14T20:39:28+09:00 | Add Cloudflare hackathon deployment setup
560369a | 2026-09-14T20:11:20+09:00 | Restrict discussion composer to curated channels
29b2bfc | 2026-09-14T20:01:50+09:00 | Validate pending release and repair official API parsing
238a93a | 2026-09-14T19:37:04+09:00 | Align public dashboard card with member shell
80dab45 | 2026-09-14T19:14:58+09:00 | Add verified stock-linked Stonkfun activity
c082bc0 | 2026-09-14T16:11:29+09:00 | Keep Backpack ticker sources resilient and market scoped
6b4cf3c | 2026-09-14T16:10:00+09:00 | Use Backpack official stock tickers for venue metrics
d0a5fa4 | 2026-09-14T15:48:19+09:00 | Prefetch markets screen before navigation
197d241 | 2026-09-14T11:07:11+09:00 | Show local discussion timestamps
b760104 | 2026-09-14T11:02:30+09:00 | Refresh discussions for new replies
a71457e | 2026-09-14T10:45:03+09:00 | Hide legacy rooms from member navigation
76f4a50 | 2026-09-14T10:40:17+09:00 | Curate community channels
f5bd9c8 | 2026-09-14T08:38:07+09:00 | Record navigation release verification and live session limitation
0735760 | 2026-09-14T08:34:44+09:00 | Keep member logo navigation in app and simplify wallet entry
```

Source: [Colosseum eligibility FAQ](https://colosseum.com/hackathon). The founder should confirm the relevant event and disclose all relevant earlier work in the submission form.
