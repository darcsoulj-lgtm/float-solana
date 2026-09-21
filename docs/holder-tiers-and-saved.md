# Holder tiers and Saved

Saved is a filter within Discussions. Existing bookmarks are retained, and old `?view=saved` links open that filter. The filter also persists in `?view=home&feed=saved`.

The access label is now **Holders only**.

## Value tiers

| Tier | Verified stock-token value (estimated USD) |
| --- | --- |
| Bronze | Above zero, below $100 |
| Silver | $100 to below $1,000 |
| Gold | $1,000 to below $10,000 |
| Platinum | $10,000 to below $100,000 |
| Diamond | $100,000 and above |

Only supported stock tokens in the authenticated wallet count, across issuers. These tiers indicate estimated exposure, not expertise, identity, wealth, or increased posting privileges.

The server reads the latest verified raw token quantities and shared market caches. Every holding must have a fresh, unit-compatible reference price. Unpriced holdings, ambiguous scaled units, conflicting prices, stale verification, and pool-only prices suppress the tier. Exact quantities and USD totals are never returned with public author information.

Value badges are private by default. Profile's **Show value badge** setting permits publishing the tier and its range. Stock-symbol badges retain their separate opt-in.

Holdings refreshes and new verification clear previous tiers atomically. A slow valuation cannot overwrite a newer holdings snapshot. Tiers expire within two minutes and no later than their underlying data's freshness limits. The active dashboard requests a new valuation after its holdings update, normally every minute while visible. Background or offline users can fall back to a generic verified-holder badge until fresh checks resume. No new paid source is required.

## Validation

165 automated tests passed, including threshold boundaries, incomplete and stale valuation, SQL migration defaults, author privacy, snapshot races, authenticated route behavior, forged client inputs, opt-in/revocation, Saved deep links, and rendered Profile/badge markup. Type checking passed.

Rendered-component tests are not browser visual QA. Browser automation was administratively blocked in this session; authenticated production appearance and interactions could not be independently checked in a browser.

## September 21: community navigation and base tier

Verified members have Bronze as their base tier, even when prices are unavailable. Bronze is labeled Base tier, not Under $100. Higher tiers retain the existing conservative valuation checks. Public badges still require opt-in, active verification, and a non-suspended account. Expired value tiers fall back to Bronze while membership remains valid; no unknown price is recorded as zero.

Publishing returns to the selected channel feed. My posts is scoped to the authenticated member on the server. Authors can delete their own posts through the visible overflow menu on feed cards or details; server ownership checks and confirmation remain. Author names and avatars open a compact profile with the existing public bio and opt-in tier; wallet addresses and balances are never added to that profile.
