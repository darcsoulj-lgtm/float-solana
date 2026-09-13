# Float holder experience

## Behavior

- Four member destinations: Home, Discussions, Markets, Profile. Legacy News/Calendar links map to Home; Saved maps to Discussions; Backpack maps to Markets with issuer=backpack. Public /backpack remains public.
- Home contains the private portfolio once, five relevant headlines expandable to the existing paginated feed, the shared upcoming agenda, and up to three real holder discussions. Portfolio ticker buttons filter news; article discussion actions preserve the exact source link. Empty discussions are stated explicitly, never seeded with invented activity.
- Markets retains the all-Solana overview and issuer value filters. Backpack opens its specialist dashboard within Markets; All markets returns to the prior state. Portfolio is not duplicated in Markets.
- General stock details now expand within the selected table row, matching Backpack. No automatic jump to a second page section. Detailed pool/book polling starts only for an opened stock. Close returns focus to the stock trigger.
- React Activity preserves visited Home and Markets UI state while suspending hidden effects. Navigation supports history Back/Forward and restores saved scroll positions. News and agenda filters retain their selection. Profile draft fields remain in the member component.
- Home loads only the market batches containing holdings, not the complete catalog. Public source snapshots are reusable in memory between Home and Markets with original timestamps; personal data is not stored in that cache. Holdings and discussion reads are independent, so one failure no longer blocks the other.
- Routine event refreshes retain matching saved events; a changed holding filter hides the old selection until its result arrives. Failures retain usable content and expose a retry. A failed new news selection cannot display the previous holding's headlines as its own.

## Verification

214 existing and extended checks passed before the final inline detail change; the subsequent focused presentation/row suite also passed, including inline expand/collapse. TypeScript and production build passed. Tests cover wallet proof/security rules, posting validation, server-held identity isolation, source/cache failures, tier privacy, navigation aliases, headline limits, matching agenda dates, and selected-stock actions.

Live read-only probes through the existing Google News adapter returned 40 matching recent headlines each for MU, SPCX, and SKHY. This verifies upstream availability from the local environment, not delivery within a particular holder's production session. No paid provider, wallet transaction, or public discussion was created for QA.

Responsive rules cover the four-item mobile menu, stacked news/events, compact portfolio, light/dark tokens, visible keyboard focus, and reduced-motion preferences. Live browser/device visual inspection remains blocked by the session's browser policy; these are source and component checks, not a claim of visual sign-off.
