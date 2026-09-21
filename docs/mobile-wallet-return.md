# Mobile wallet return flow

The installed web app and wallet browser have separate sessions. The installed
app creates a short-lived handoff and retains the claim secret locally. The
wallet browser receives only its ID. Fresh wallet verification binds that ID
to a member; only the original app can claim the session using its secret.

Wallet links with a handoff always enter the root authentication flow with
`join=1`, including when the wallet browser already has a member cookie.
Navigation context is retained in wallet-browser session storage and captured
before signing, so URL changes do not silently discard the handoff. This
context contains no claim secret and cannot authenticate a user by itself.

After verification, mobile users choose Return to Float app or Continue in
wallet. The choice is displayed before refreshing member data and survives a
page reload. Continue in wallet explicitly dismisses and clears the handoff
navigation context; it does not invalidate the original app's pending claim.

On iPhone, an ordinary web link cannot reliably reopen an installed Home Screen
web app. Return to Float app therefore reveals manual return instructions,
including the system's top-left Float back link when present. No same-origin
link or window.close call is presented as guaranteed app switching. Native
universal links would require a separately installed native app.

Validation: all release tests, including context persistence, selected wallet
links, both return-screen choices, and server secret/replay tests. The actual
return component was checked at 390x844 in a local browser; both buttons were
exercised with no console errors. Signing and switching with real iPhone wallet
apps remains unverified in this environment.
