# Research record — 2026-09-09

## What was verified

Backpack's official MU announcement publishes `MUxEsUKSMACyw5fZf68wxf5FLnZVhtU9CwH8uNNGay1`. The SKHY announcement publishes `SKHYhSjuRWHgikq8eRKbtBbpABgJSkd7ytQV14i9EQ3`. Mainnet `getAccountInfo` returned initialized Token-2022 mint accounts with six decimals for both, at observed slots 445635868 (MU) and 445636176 (SKHY). The queried metadata names matched Backpack Securities. This verifies mint structure at those observations, not an audit of issuer backing or legal rights.

Sources:

- [Backpack MU](https://learn.backpack.exchange/blog/tokenized-micron-mu)
- [Backpack SKHY](https://learn.backpack.exchange/blog/sk-hynix-skhy-backpack)
- [Solana getAccountInfo](https://solana.com/docs/rpc/http/getaccountinfo)
- [Solana getTokenAccountsByOwner](https://solana.com/docs/rpc/http/gettokenaccountsbyowner)

Observed extensions include metadata pointer, permanent delegate, pausable configuration, confidential transfer configuration, and scaled UI amount. MU's observed multiplier was approximately 1.000106843; SKHY's was 1. The product therefore reports raw-token cohorts and avoids pretending that a raw balance is a fixed economic share amount.

## SPCX

Backpack describes tokenized SPCX but the opened official article did not publish a mint address. A candidate address was found in a post in r/Backpack_official and in third-party trading listings, but that is insufficient for the chosen registry standard. Live SPCX remains disabled. A large number of unrelated tokens reuse the SPCX symbol, illustrating why symbol-only verification is unsafe.

- [Backpack SPCX explanation](https://learn.backpack.exchange/articles/how-to-hold-spcx)

## Competitor differentiation

[EquiChamber](https://equichamber.com/) describes profiles, curated news, portfolio insights, stock-specific conversation, and optional Plaid-backed ownership verification. Verified ownership itself is not unique, nor is it exclusive to tokenized equities.

HolderPulse's proposed differentiation is an institutional research workflow: commissioned briefs, explicitly defined eligibility, private datasets, sample and verification metadata, answer distributions, and exports. No chat/community/social graph is built. This is a product-positioning hypothesis; uniqueness, willingness to pay, and predictive value are not proven by this research.

## Wallet authentication

Backpack's [message-signing documentation](https://docs.backpack.app/deeplinks/provider-methods/signmessage) explains message signatures as address-control proofs without network fees. Extension-provider architecture is used for Backpack, Phantom, and Solflare; mobile deep-link encryption/session pairing is not implemented.

A local runtime test exposed permissive handling of a small-order Ed25519 key by the runtime's WebCrypto verifier. The implementation now uses [noble-curves strict verification](https://github.com/paulmillr/noble-curves), with `zip215:false`, and includes a regression test. Application signing is authentication, not consensus validation.

## Claims deliberately excluded

No claims of millions of reachable respondents, representative investor samples, issuer partnerships, legal shareholder identity, unique-person verification, validated historical ownership, or investment alpha. The earlier conversation's optimistic adoption and commercial claims were not treated as established evidence.
