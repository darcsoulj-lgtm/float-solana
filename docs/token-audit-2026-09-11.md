# Backpack Solana token audit — 11 September 2026

Checked the current Backpack assets and securities registries, visible spot markets, and finalized Solana mint accounts. Evidence is captured in [the audit JSON](../research/token-audit/2026-09-11.json).

- **39 existing entries verified; 0 incorrect entries found.** Each mint matched one Backpack asset with Solana transfers enabled, a valid initialized mint, and onchain Backpack Securities metadata matching its symbol.
- **2 omissions corrected: DNUT (Krispy Kreme) and GRND (Grindr).** Both passed the same checks. The supported list now contains 41 tokens.
- **BABA is valid.** Backpack maps BABA.US to `BABANGA4JE7Kkam4nTrALAwAVgsNJUuFJnnkF7S16BZp`; deposits and withdrawals were enabled. Its onchain name is “Alibaba Group Holding - Backpack Securities.” No visible Backpack spot order book was returned for BABA. Token transfer availability and a listed spot order book are separate checks.

## Why the omissions happened

The application uses a reviewed mint allowlist. Its live market refresh only looked up tokens already in that list. DNUT and GRND were absent from our previous saved registry snapshot and had since appeared in the current registry. Refreshing market prices could not discover them. This was a coverage-maintenance gap, not an incorrect BABA mapping. The evidence does not establish the exact time the two tokens were listed.

The list and its review evidence are now updated. Registry-dependent market caches include the review date, so a new reviewed list gets fresh data. The release check `npm run audit:tokens` detects missing, removed, or mismatched registry entries and exits unsuccessfully on drift. It is an on-demand check, not a scheduled monitor or automatic listing approval.

## Why multiple data sources are used

| Source | Purpose | Limit |
| --- | --- | --- |
| Backpack | Token identities, transfers, spot order books | A token can exist without a visible spot order book |
| Solana | Mint supply and wallet holdings | Does not supply a USD market price |
| CoinMarketCap | Aggregate token prices, volume, circulating metrics | Only exact-mint-matched tokens with available coverage |
| DEX Screener | Pool prices, liquidity and volume | Pool-specific observations, not total token trading |
| DefiLlama | Fallback price and price cross-check | Coverage and update timestamps vary |

The strategy is retained. A CMC volume and a largest-pool volume have different scopes and should not be interpreted as directly comparable totals. Issued value is total minted supply multiplied by an observed token price; it is not circulating market capitalization or the underlying company's value. Unavailable values remain unknown.

## SPCX selection defect

Only the stock-name button selected a row. Clicking its price, change or issued value did nothing, leaving MU selected. The entire row now selects that stock, and the name button remains keyboard accessible. Both paths call the same selection action. The button stops event propagation to avoid duplicate activation.

## All verified tokens

All entries below had an exact Backpack Solana mint match and passed finalized mint validation. Status is a point-in-time technical check, not a legal opinion or a guarantee of account or regional trading eligibility.

| Token | Name | Solana mint |
| --- | --- | --- |
| MU | Micron Technology, Inc. | [MUxEsUKSMACyw5fZf68wxf5FLnZVhtU9CwH8uNNGay1](https://explorer.solana.com/address/MUxEsUKSMACyw5fZf68wxf5FLnZVhtU9CwH8uNNGay1) |
| SKHY | SK Hynix | [SKHYhSjuRWHgikq8eRKbtBbpABgJSkd7ytQV14i9EQ3](https://explorer.solana.com/address/SKHYhSjuRWHgikq8eRKbtBbpABgJSkd7ytQV14i9EQ3) |
| SPCX | SpaceX | [SPCXxcqXj6e5dJDVNovHN8744zkbhM2bYudU45BimGb](https://explorer.solana.com/address/SPCXxcqXj6e5dJDVNovHN8744zkbhM2bYudU45BimGb) |
| AMC | AMC Entertainment | [AMC1qwR9KhiyrQBRPrxnfo4JfMeMZqEBvt5tgTytNNoc](https://explorer.solana.com/address/AMC1qwR9KhiyrQBRPrxnfo4JfMeMZqEBvt5tgTytNNoc) |
| BA | The Boeing Company | [BArimz1PcKZr8PcPh3tcZ2dg4S7FJLk3cw6R5F8GsHKg](https://explorer.solana.com/address/BArimz1PcKZr8PcPh3tcZ2dg4S7FJLk3cw6R5F8GsHKg) |
| BABA | Alibaba Group Holding Limited | [BABANGA4JE7Kkam4nTrALAwAVgsNJUuFJnnkF7S16BZp](https://explorer.solana.com/address/BABANGA4JE7Kkam4nTrALAwAVgsNJUuFJnnkF7S16BZp) |
| BOT | RoboStrategy | [BoTx8y9ynfdxf5ZjWtCoBVkff52qKA82ysaLU8ZM6d8T](https://explorer.solana.com/address/BoTx8y9ynfdxf5ZjWtCoBVkff52qKA82ysaLU8ZM6d8T) |
| BULL | Webull Corporation | [BULL151gUXcFV5wXEUqu9Am2L7Qt4bTJRLRuAUjkcspC](https://explorer.solana.com/address/BULL151gUXcFV5wXEUqu9Am2L7Qt4bTJRLRuAUjkcspC) |
| COST | Costco Wholesale Corporation | [CZEB3WNZuF2Yz1z2H81RcCk8T7fsw82KB33zqamASVsg](https://explorer.solana.com/address/CZEB3WNZuF2Yz1z2H81RcCk8T7fsw82KB33zqamASVsg) |
| DELL | Dell Technologies Inc. | [DELL2aRKQz7DMq5DrKLtkn47ZCnbxXPZXrSGbkmd13wy](https://explorer.solana.com/address/DELL2aRKQz7DMq5DrKLtkn47ZCnbxXPZXrSGbkmd13wy) |
| DJT | Trump Media & Technology Group Corp. | [DJTu7vi8norVzdVAffgvb39VP7wjKeTsgaMBJrzfxvoF](https://explorer.solana.com/address/DJTu7vi8norVzdVAffgvb39VP7wjKeTsgaMBJrzfxvoF) |
| DNUT | Krispy Kreme, Inc. | [DNUTsCvKbKwu2RM72cUuW3TD9YpzArzACcqYQssjPLSk](https://explorer.solana.com/address/DNUTsCvKbKwu2RM72cUuW3TD9YpzArzACcqYQssjPLSk) |
| DRAM | Roundhill Memory ETF | [DRAMjSWR7HRfJKjRkvQWYL2bcaejaVhuxEcjf4pAY4Cw](https://explorer.solana.com/address/DRAMjSWR7HRfJKjRkvQWYL2bcaejaVhuxEcjf4pAY4Cw) |
| GPRO | GoPro | [GPRR2u6NS5yBQHWGauoJ9HXgjrTH8dDsrBfTV5zAYvDH](https://explorer.solana.com/address/GPRR2u6NS5yBQHWGauoJ9HXgjrTH8dDsrBfTV5zAYvDH) |
| GRND | Grindr | [GRNDYDpqwpCm6jVxpbh4xT5AM4r3p391qYsKTHqgaET2](https://explorer.solana.com/address/GRNDYDpqwpCm6jVxpbh4xT5AM4r3p391qYsKTHqgaET2) |
| HIMS | Hims & Hers Health, Inc. | [HiMSSzzwkZkrXJ4PGVJRdtfLaANeAztjjcgk5Dxe7Lwx](https://explorer.solana.com/address/HiMSSzzwkZkrXJ4PGVJRdtfLaANeAztjjcgk5Dxe7Lwx) |
| HOOD | Robinhood Markets, Inc. | [HooDYv5RewLRiMLnEVq3VJqdqxhuE6c5eYvqejMC3e9A](https://explorer.solana.com/address/HooDYv5RewLRiMLnEVq3VJqdqxhuE6c5eYvqejMC3e9A) |
| HTZ | Hertz | [HTZsLG4zqaNvWMwXSLHH3GG5KyJpKwpBRsKVdMG6hvzP](https://explorer.solana.com/address/HTZsLG4zqaNvWMwXSLHH3GG5KyJpKwpBRsKVdMG6hvzP) |
| IBM | International Business Machines Corporation | [BMKdM4yUxX12moFqVk195k7coMbaybd4RUKCUdm7D1Sk](https://explorer.solana.com/address/BMKdM4yUxX12moFqVk195k7coMbaybd4RUKCUdm7D1Sk) |
| INTC | Intel Corporation | [iNTCy1qTsUEZQe3DSocLz1ZXXai34Gdw8THQh5rxFaF](https://explorer.solana.com/address/iNTCy1qTsUEZQe3DSocLz1ZXXai34Gdw8THQh5rxFaF) |
| JNJ | Johnson & Johnson | [JNJg1znKdF712Phe7L7z52AATAvEjEytBdN2w8Lnh1Y](https://explorer.solana.com/address/JNJg1znKdF712Phe7L7z52AATAvEjEytBdN2w8Lnh1Y) |
| LLY | Eli Lilly and Company | [LLYuwZ33keFihgwoxXsBawy31AiRFLFSva32TYq5TvD](https://explorer.solana.com/address/LLYuwZ33keFihgwoxXsBawy31AiRFLFSva32TYq5TvD) |
| LMT | Lockheed Martin Corporation | [LMT3i1BHgixFqPUgcyteJhnEz2dpy9i3cYy4pi9BoeV](https://explorer.solana.com/address/LMT3i1BHgixFqPUgcyteJhnEz2dpy9i3cYy4pi9BoeV) |
| LULU | Lululemon Athletica Inc. | [LULUmT9VMttkfAJE236LXJcYJ2tTP7nunrSWR5G1BdS](https://explorer.solana.com/address/LULUmT9VMttkfAJE236LXJcYJ2tTP7nunrSWR5G1BdS) |
| MGM | MGM Resorts International | [MGMuubtUEirmkhfEQdmGUh4pr7HuUdMWcZXFtpPbVJD](https://explorer.solana.com/address/MGMuubtUEirmkhfEQdmGUh4pr7HuUdMWcZXFtpPbVJD) |
| MRNA | Moderna, Inc. | [MRNAzXzhNcaEXJPibHEn8cd4vyekCDiivTyEwswLUCT](https://explorer.solana.com/address/MRNAzXzhNcaEXJPibHEn8cd4vyekCDiivTyEwswLUCT) |
| MRVL | Marvell Technology, Inc. | [MRVLSjkR2ceUBukujaD3xCyHP1H3B2SzpsNTZF546jo](https://explorer.solana.com/address/MRVLSjkR2ceUBukujaD3xCyHP1H3B2SzpsNTZF546jo) |
| MSTR | Strategy Inc | [MSTRdWXMeZxdE8osAQy3fA4rvTY5rgummDSMEx6U7Nz](https://explorer.solana.com/address/MSTRdWXMeZxdE8osAQy3fA4rvTY5rgummDSMEx6U7Nz) |
| NBIS | Nebius Group N.V. | [NBiSF3UaVUFtRzHwAfxyHsBCAZWGEKnMpewAE4oh7BG](https://explorer.solana.com/address/NBiSF3UaVUFtRzHwAfxyHsBCAZWGEKnMpewAE4oh7BG) |
| NKE | NIKE, Inc. | [NKEda5nHhNGgjrE9nDdMvaEmkmJ96qqxzBVZEcKmjSg](https://explorer.solana.com/address/NKEda5nHhNGgjrE9nDdMvaEmkmJ96qqxzBVZEcKmjSg) |
| PFE | Pfizer Inc. | [PFER6ENqP8r8NF3CqVt4mFowxsin3V5MLidBNQFCC3x](https://explorer.solana.com/address/PFER6ENqP8r8NF3CqVt4mFowxsin3V5MLidBNQFCC3x) |
| QUBT | Quantum Computing Inc. | [QUBTAD8C9bMU9LvmMNgKPhrmBGbHvxpu6vfWQtThxxw](https://explorer.solana.com/address/QUBTAD8C9bMU9LvmMNgKPhrmBGbHvxpu6vfWQtThxxw) |
| RBLX | Roblox Corporation | [RBLXDGRD64AtRamHMFVcjqne3Ar7NLWtFtYNtsrf1cE](https://explorer.solana.com/address/RBLXDGRD64AtRamHMFVcjqne3Ar7NLWtFtYNtsrf1cE) |
| RDDT | Reddit, Inc. | [RDDTGbhHwVXfyCvQMXzzowKjf5qrYBZAnehoXW83ooh](https://explorer.solana.com/address/RDDTGbhHwVXfyCvQMXzzowKjf5qrYBZAnehoXW83ooh) |
| RIVN | Rivian Automotive, Inc. | [RcZmt84VMJv9bDhKqmw1uWDahYrUT468VwAChTnfD8p](https://explorer.solana.com/address/RcZmt84VMJv9bDhKqmw1uWDahYrUT468VwAChTnfD8p) |
| SHOP | Shopify Inc. | [SH55hfaipFAbwT42nQYhRoM5o5t61QpkmJ6p62vXB3m](https://explorer.solana.com/address/SH55hfaipFAbwT42nQYhRoM5o5t61QpkmJ6p62vXB3m) |
| SNAP | Snap Inc. | [SNAPcESrvnH8yUdgeMF6xm1hym9b6hW6s8YeqeHdZFz](https://explorer.solana.com/address/SNAPcESrvnH8yUdgeMF6xm1hym9b6hW6s8YeqeHdZFz) |
| SNDK | Sandisk Corporation | [SNDKbwMUQvZhnLnxLduradgLHG5KrPuKwpnrkkGRhfH](https://explorer.solana.com/address/SNDKbwMUQvZhnLnxLduradgLHG5KrPuKwpnrkkGRhfH) |
| SPHR | Sphere Entertainment Co. | [SPHRp8cZaSQBTp1KMNP4V1X821SXhXWt4Q2yLdyHzju](https://explorer.solana.com/address/SPHRp8cZaSQBTp1KMNP4V1X821SXhXWt4Q2yLdyHzju) |
| TTWO | Take-Two Interactive Software, Inc. | [TTWofwAge91oFhZs7kpQdyrVRkmevgM88xijGvQFbKo](https://explorer.solana.com/address/TTWofwAge91oFhZs7kpQdyrVRkmevgM88xijGvQFbKo) |
| UPS | United Parcel Service, Inc. | [UPSqUeMHcWbkdg784XuBUEF9DtySSnW9ur5LAVdcuB9](https://explorer.solana.com/address/UPSqUeMHcWbkdg784XuBUEF9DtySSnW9ur5LAVdcuB9) |

Sources: [Backpack assets](https://api.backpack.exchange/api/v1/assets), [securities](https://api.backpack.exchange/api/v1/securities), [markets](https://api.backpack.exchange/api/v1/markets), finalized Solana getMultipleAccounts.

Initial audit: 2026-09-11T07:53:46.402Z. Additional mint check: 2026-09-11T07:55:32.457Z.

## Verification

- 120 unit/component checks passed: core validation, wallet-provider isolation, market source parsing, all 41 captured mint accounts, and row-selection event handlers.
- 143 local community checks and 44 editorial checks passed with genuine test signatures and mock Solana ownership responses. The test suite was paced below the existing production request limit after its first run exceeded that limit; production limits were unchanged.
- Live registry drift check passed for all 41 tokens at 2026-09-11T08:02:59.979Z.
- Type checking, changed-file lint, production build and local token-directory HTTP/render checks passed.
- Browser interaction and visual verification could not run because the environment's browser access policy denied access. Component-handler tests are not a substitute for a real Chrome/extension check.
