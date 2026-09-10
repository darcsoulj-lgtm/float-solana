# Discussion form correction — 2026-09-10

## Findings

The user's screenshot shows an oversized combobox input, two focus outlines and a menu narrower than its complete control. Legacy `.form input`, `.form button` and dialog input rules apply borders, padding, margins and heights inside the composed InputGroup. The menu's default anchor was the inner input rather than the full field.

The user also reported being unable to post a thread. Recent production logs showed successful membership and feed reads, with no failed thread POST in the retrieved sample. The exact user's click behavior remains unconfirmed. The existing form silently delegated minimum lengths to native browser validation; a server error shared dashboard state, and success refreshed the old feed query after changing filters.

## Changes

- Give SearchPicker an explicit full-field anchor and scoped input, button, menu and focus styling. Preserve Base UI keyboard, popup and selection behavior and installed primitives.
- Isolate the discussion form from broad legacy form selectors. Use visible associated labels, readable length hints and consistent field spacing.
- Share trimmed title/body/topic validation between client and server. Show field errors on submission, focus the invalid field and preserve the draft on a server error.
- Use dedicated posting/error state, a synchronous duplicate-submit guard and a visible Posting state. Open the returned thread ID after success instead of refreshing a stale feed query.
- Validate content before spending the per-member posting allowance. Existing authentication, holdings checks, IP throttling and successful-post throttling remain enforced.

## Validation

- 84 unit checks passed, including new all-topic and invalid/whitespace input cases plus the existing wallet tests.
- 112 local community checks passed with synthetic keys and a local mock RPC: signed membership, rejected drafts followed by a valid post, persisted content retrieved by its returned thread ID, cross-topic access, replies, moderation and access restrictions.
- TypeScript, targeted lint and whitespace checks passed before publication build.
- Local homepage returned HTTP 200.
- Chrome visual/interaction QA was attempted through the approved browser tool and denied because its admin-policy security check was unavailable. No alternate browser or access workaround was used. The revised visual layout and real-user submission are not yet browser-verified.
- No hosted test member/content was created. The integration fixture restored local environment files; production RPC configuration is unchanged.
