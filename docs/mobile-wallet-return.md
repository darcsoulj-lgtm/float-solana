# Mobile wallet return flow

The installed web app and wallet browser have separate sessions. The installed
app creates a short-lived handoff and retains the claim secret locally. The
wallet browser receives only its ID. Fresh wallet verification binds that ID
to a member; only the original app can claim the session using its secret.

Wallet links with a handoff enter `/wallet/connect/:handoffId` with `join=1`,
including when the wallet browser already has a member cookie. The route passes
the ID as a component prop, so stripped query parameters cannot remove it.
The server stores the ID on the signing challenge and uses that stored value at
verification, even if the final client request loses its navigation context.
Conflicting IDs are rejected. The response confirms the handoff was written
before the UI reports the app return is ready. Older in-flight clients remain
compatible. The private claim secret never leaves the originating app except
when sent directly to Float to claim its session.
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

Foreground status refreshes use request ordering so a stale guest response cannot
overwrite a newer authenticated response. Continue in wallet leaves the dedicated
connect route. The September 21 production observation showed an unbound app flow
and a Backpack session created eight seconds later; this suggests omitted handoff
context, but does not prove which wallet navigation discarded it.

Additional verification uses isolated SQLite with all migrations and the actual
challenge, verify, and claim handlers. Wallet signatures/holdings are simulated;
all three wallet request shapes, missing final context, conflicting IDs, invalid
signatures, expired flows, wrong secrets, and replay are covered.

User device confirmation (September 21): the user reported Backpack now signs
in the Home Screen app when they return. No authentication changes were made in
the subsequent UI cleanup. The instructional control is now labeled “How to
return to Float” and the manual-return hint is always visible; “Continue in
wallet” remains available.

Installation cleanup: explicit 192/512 PNG app icons and a separate maskable icon
were added. Chrome's address-bar Install Float control and native install dialog
were observed against localhost in the user's Chrome. Desktop menu instructions
follow Google Chrome Help (answer 9658361); a native prompt button is shown only
when beforeinstallprompt is offered. No localhost app was intentionally installed.

## September 23: mobile browser return

The previous implementation created and claimed transfers only in standalone
Home Screen apps. Consequently, Safari and in-app browsers such as KakaoTalk
opened the wallet without a handoff ID: signing created only a wallet-browser
session. All mobile originating browsers now prepare the same secret-protected
handoff before opening the selected wallet. Receiver pages reuse their incoming
ID and never replace it with a new transfer. Foreground, focus, and `pageshow`
checks collect the verified session in the original browser. Failed or unfinished
claims retain their secret for retry until the existing ten-minute expiry.

Return instructions now refer to the originating app or browser, while retaining
Home Screen instructions and the explicit Continue in wallet choice. No arbitrary
return URL or claim secret is sent to the wallet. The original browser must
retain its own storage: switching to a different browser or a discarded private
webview cannot recover the secret and requires restarting there.

Validation includes executing the actual wallet selector for KakaoTalk-like and
Safari user agents and standalone mode against all three wallet links, plus the
actual foreground claim effect and existing isolated signature/claim/replay
tests. These simulate browser APIs and wallet signatures. Physical iOS KakaoTalk
app switching and real Phantom, Backpack, and Solflare signing remain unverified.
