# Copy-ready submission answers

Drafted from the current implementation and founder statements. Review first-person motivation, business hypotheses and unsupplied personal fields before submitting. Counts include spaces.

## Brief description (500 maximum)

Float is a community and market dashboard for holders of tokenized stocks on Solana. Verify your holdings with a wallet signature, follow relevant news and market data, and join discussions with other verified holders.

*218 characters.*

## What are you building, and who is it for? (1,000 maximum)

Float is for people who hold tokenized stocks on Solana and want useful market context and a place to talk with other holders. Members verify a supported holding with a wallet signature, then use discussions, replies, polls and profiles under a nickname. Optional Bronze-to-Diamond badges show holder tiers without publishing exact balances. Home brings together a private portfolio, relevant news and upcoming events. Public Markets lets anyone explore supported assets, issuers, volume and liquidity without connecting a wallet. Float checks wallet control and token ownership; it does not claim to verify expertise, unique identity or the quality of an investment opinion.

*675 characters.*

## Why did you decide to build this, and why now? (1,000 maximum)

I wanted an investing community where holding the asset is a verifiable part of participation, rather than an uncheckable claim. Tokenized stocks make this possible: supported Solana holdings can be checked directly, without brokerage credentials. Float brings that proof together with market context and conversation. My hypothesis is that holders will return for both useful information and discussion with people who have exposure to the market. The working product lets me test that hypothesis now. My next priority is measuring whether independent users complete verification, participate and return; I am not treating the existence of the technology as proof of demand.

*675 characters.*

## What technologies are you using?

Solana mainnet RPC, SPL and Token-2022 token-account checks, Ed25519 message signatures, and Phantom, Backpack and Solflare wallet integrations. The app uses TypeScript, React 19, Vinext, Tailwind CSS, Base UI, Cloudflare Workers, Cloudflare D1 and Drizzle migrations. Provider adapters combine supported market sources, including Backpack, CoinMarketCap, DEX Screener and DefiLlama, with public news and calendar sources. ChatGPT/Codex assisted coding, debugging, design iteration and documentation. Float uses no custom onchain program; community records remain offchain.

*573 characters.*

## Which chain does Float use?

Solana mainnet.

*15 characters.*

## How does your product use these chains?

Float uses Solana to verify control of a wallet and ownership of supported tokenized-stock tokens. A user signs a one-use message; the server verifies the signature and reads finalized SPL or Token-2022 token accounts, matching exact supported mint addresses. Eligible holders receive community access. Sign-in requires no transaction, transfer or custody. The app also uses onchain supply and market observations where available. Posts, profiles and sessions are stored offchain in Cloudflare D1. Float does not deploy its own smart contract.

*543 characters.*

## Anything else judges should know?

I started with no coding experience and built Float with the help of ChatGPT/Codex. I directed the product, tested the app across wallet and mobile flows, and iterated on issues found during use. AI tools assisted implementation and review; I remain responsible for the product decisions and claims. This is an early working product, not a claim of audited infrastructure or proven product-market fit. The repository documents pre-existing work, completed features, automated checks and remaining validation. My next step is testing retention and discussion quality with independent tokenized-stock holders.

*607 characters.*

## Important context about your repo (500 maximum)

This repo contains Float and earlier HolderPulse survey/research code begun before September 14, 2026. Legacy modules are retained but are not the core submission. Later work includes market coverage, wallet-to-PWA sign-in, holder tiers and discussion UX. See docs/hackathon/development-history.md for dated commits and scope. ChatGPT/Codex assisted implementation; RJ directed and tested the product.

*401 characters.*

## Go-to-market and demand validation (draft; no supplied limit)

Start with a small group of Solana tokenized-stock holders reached through founder-led outreach in relevant communities, with permission. Ask them to verify a wallet, read or create a discussion, and return over the following week. Measure verification completion, first meaningful contribution and repeat participation. No issuer partnership, external-user count, retention rate or revenue is claimed yet. The first distribution hypothesis is that useful asset-specific conversations and publicly accessible market pages will bring in more holders; this needs validation.

*572 characters.*

## Business model (hypothesis, not a live paid feature)

Keep the core holder community free while testing whether active users will pay for better research workflows, saved screens and alerts. A later B2B research product is a separate hypothesis and would require explicit privacy and consent boundaries. Float has not validated willingness to pay or launched a paid subscription. The immediate milestone is evidence that users return for the free product before expanding monetization.

*431 characters.*

## Project website

https://joinfloat.xyz

## GitHub

https://github.com/darcsoulj-lgtm/float-solana

## Complete personally

Team members, founder location, legal entity details, capital raised, time commitment, market-size estimate with evidence, actual traction and video links have not been supplied or verified. Do not use the AI review personas as human teammates.
