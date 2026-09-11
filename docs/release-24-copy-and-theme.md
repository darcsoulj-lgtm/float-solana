# Release 24 — concise copy and Backpack colors

## Copy standard

Use short, literal labels. Remove ornamental taglines, duplicate headings, repeated instructions and vague calls to action. Preserve information that affects consent, access, privacy, source quality or financial interpretation. Keep the product in English; the user requested a writing style, not translation.

- Landing: clear community description and Connect wallet CTA. Removed repeated proof line and closing promotional section. Preview remains explicitly illustrative.
- Dashboard: removed decorative page eyebrows and descriptions that restated headings. News, New discussion, Message, Following and Notifications replace figurative labels.
- Forms: keep field labels, validation and visibility context. Shortened placeholders and empty states. Wallet selection/signing code untouched.
- Markets: update cadence moved under Auto-updating. Sources and financial distinctions retained. No data calculations changed.
- Help and Membership: condensed and corrected outdated topic-generation and holdings-refresh descriptions.

## Theme

Backpack-inspired red/charcoal/white palette; preserve HolderPulse identity and independence disclosure. Reference: https://backpack.exchange/ . Accent red #e33e3f; action red #c92d35, dark hover #b3222b; charcoal #0e0f14. The darker action shade supports readable white text. Light dashboard retained; wallet chooser uses charcoal surfaces. Wallet provider logos are unchanged.

Legacy navy and sage CSS tints were normalized; central overrides are in app/backpack-theme.css. Semantic positive/negative and error states retain their meaning. Updated hp favicon.

## Validation

Type check passed. Landing, About, Help and Membership rendered HTTP 200 with expected copy. Primary action, selected navigation, body and wallet text contrast ratios checked: 5.37, 5.97, 5.58 and 9.90 respectively (normal text threshold 4.5). No new implementation-mirroring tests for this copy/style change. Production build checked before packaging.

Automated interactive visual QA remains unavailable under the existing browser security restriction. Preview handoff queued successfully; that is not a visual-test claim.
