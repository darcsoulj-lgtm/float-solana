# Holder access to Backpack dashboard

Root cause: the authenticated member layout hides the public header and replaces it with its own menu. The public header contained the only /backpack link; the member menu omitted it. The Backpack route and market endpoint themselves have no membership restriction.

Added a normal same-tab Backpack link immediately after Markets in the member menu. Reused navigation spacing, theme, focus and mobile horizontal scrolling rules for anchors as well as buttons. Existing community sessions remain on the same origin.

Verified rendered member navigation with both admin=false and admin=true fixtures: /backpack is present with accessible name and correct menu order. TypeScript and production build passed. Browser click-through QA remains unavailable under the previously reported browser policy block.
