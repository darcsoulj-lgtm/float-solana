# Video scripts and recording plan

Two separate videos. No recording or upload has been performed. Use the live Cloudflare product and your own wallet; hide personal holdings if you do not want them in a public video. Delete clearly labeled QA posts after recording. Do not stage fake activity or claim independent user traction.

## Presentation — approximately 2:30

Read naturally at about 130 words per minute. Rehearse once and trim pauses to stay within 2–3 minutes. First-person motivation is a draft for RJ to review.

**0:00–0:25 · Founder on camera, then Float title**

“I'm RJ, founder of Float. Float is a community for people who hold tokenized stocks on Solana. In an investing conversation, someone can say they own an asset, but other participants usually cannot check that claim. I wanted a place where verified ownership could be part of participation, without asking people to share their brokerage login.”

**0:25–0:55 · Join screen, then a real holder session**

“A member signs a message with their Solana wallet. Float checks the signature and supported token holdings on the server. There is no transaction or transfer. Members use a nickname, and they can choose to show a Bronze-to-Diamond holder tier without exposing their exact balance. This verifies ownership, not investment expertise or the quality of someone's opinion.”

**0:55–1:25 · Home, discussion list/detail, Markets**

“Home brings a member's portfolio, relevant news and upcoming events together. Discussions have channels, replies and polls, with profiles and moderation controls. Markets is public, so someone can explore assets and issuers before joining. The goal is a useful daily place for holders to understand their investments and talk with other people who actually have exposure.”

**1:25–1:55 · Simple architecture or live app**

“Solana makes that ownership check possible across compatible wallets using public token accounts and exact mint addresses. The app itself runs on Cloudflare Workers with D1 storage. I built it with ChatGPT and Codex, directing the product and testing the experience myself. I iterated on real mobile issues, including returning from a wallet to the installed Float app.”

**1:55–2:30 · Founder on camera; closing graphic**

“This is an early product. I am not claiming proven demand or product-market fit. The next step is a small group of independent tokenized-stock holders: can they join without help, make a useful contribution and come back? I plan to keep the core community free while testing demand for premium research workflows. Float's first job is to earn repeat use from a specific group of holders.”

## Technical/product demo — target 2:40, maximum 3:00

| Time | Screen/action | Narration |
| --- | --- | --- |
| 0:00–0:20 | Landing → Explore markets → search an actual asset | “Markets works without a wallet. Rows show source-aware observations; missing or delayed data is labeled.” |
| 0:20–0:50 | Join the community → wallet message | “A one-use challenge is signed with the wallet. The server verifies the Ed25519 signature, then checks finalized SPL or Token-2022 accounts against exact supported mints. Sign-in requests no transfer.” |
| 0:50–1:10 | Return to installed Float and show signed-in state | “The wallet verification result is transferred through a server-mediated handoff. I reopen the Home Screen app to complete the session here.” |
| 1:10–1:30 | Home portfolio, one headline and agenda | “Holdings provide private portfolio context and matching news/events. Availability depends on upstream sources. External headlines open at their source.” |
| 1:30–2:00 | Select channel, open a thread/replies; show three-dot menu | “A dedicated detail view keeps long reply lists out of the main feed. Members can save posts, report content, block authors and manage their own posts.” |
| 2:00–2:20 | Profile tier toggle and an author profile | “Every verified holder has Bronze as a base. Supported valuation data can establish higher tiers. The public badge is optional; exact balances remain out of discussions.” |
| 2:20–2:40 | Repository README and core file map | “React and TypeScript run through Vinext on Cloudflare Workers. D1 stores offchain community records. The repository includes checks for signatures, authorization, stale sources and wallet handoffs, with earlier work disclosed.” |

If wallet switching takes too long, shorten idle waiting in editing and label the cut. Do not edit a failed sign-in into a supposed success. Use a wallet whose full device flow passed. Solflare must not be demonstrated or described as device-verified until its checklist is complete.

## Technical appendix for questions

- Signature/account logic: `lib/community-server.ts`, `lib/wallet-provider.ts`, `lib/community-sign-in.ts` and the community API.
- Wallet-to-app flow: `lib/wallet-handoff.ts`, `components/wallet-return.tsx`, `components/community.tsx`.
- One registry boundary: `lib/registry-server.ts`, `lib/backpack-registry.ts`, `lib/token-registry.ts`.
- Market/cache/valuation: `lib/market-service.ts`, `lib/market-cache.ts`, `lib/holder-tier.ts`.
- No custom smart contract, trading, custody, subscription billing or transaction-based login is claimed.

Source: current [Colosseum submission FAQ](https://colosseum.com/hackathon), checked September 21, 2026. Final timing must be measured on the actual recording.
