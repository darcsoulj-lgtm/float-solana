# Member navigation and wallet entry — 14 September 2026

## Cause and change

The member logo used the public full-document link. Returning to `/` remounted Community with an unknown session (`null`), which incorrectly selected the visitor landing page until the status response arrived. This was a presentation flash, not evidence of a logout.

Ordinary logo clicks now use the existing member navigation owner to open Home without remounting the member shell or restarting wallet checks. The anchor retains a real Home URL for modifier/new-tab clicks. Clicking the logo on Home only scrolls to the top and does not append history.

An unknown first session check now renders a neutral entry state. An initial network error offers Retry without claiming that the visitor is signed out. A confirmed anonymous response renders the public page, and a confirmed member response renders the dashboard. Server authorization, expiry, cookie handling, wallet challenges and signatures remain in their existing owners; membership is not copied into public/browser persistent caches.

The always-visible Supported stocks link was removed from wallet selection and signature confirmation. The catalogue remains in the public footer. A specific empty-holdings response supplies a machine-readable code so a contextual View eligible stocks link can appear only when useful; it opens a separate tab without discarding the connection dialog. Provider outages do not trigger that eligibility message.

## Verification

The release gate passes types, lint, regression tests and the production build. Added regression cases cover initial unknown/error/guest/member presentation, native modifier-click behavior, logo destination and history, connect/sign/empty-holdings link visibility, typed API errors and preserved session-expiry events. The empty-holdings API path is tested in an isolated route fixture, including a distinct provider-outage response.

The normal connect dialog was visually checked in the local browser. A new real wallet signature was not requested. The older full community-flow harness was attempted but expects a separate server on port 3000 and did not run to completion; it is not counted as passed. Its temporary local environment edits were restored. Final signed-in logo navigation is checked on the published site.

No dependency or database schema changes are included.
