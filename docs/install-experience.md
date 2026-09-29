# Home Screen installation

The root installation provider captures the browser's install event across Float pages. Menu/footer and Profile links remain available without a wallet. When a native prompt is available, a user's tap opens it directly; otherwise `/install` shows only device-relevant guidance. iPhone instructions use Safari Share → Add to Home Screen. Embedded-browser guidance includes a copy-link fallback and never promises it can force Safari to open.

A small mobile reminder is eligible after a return at least 30 minutes after the previous page visit, appears after 12 seconds, and is limited to once per seven days. Closing it or accepting installation stops future reminders in that browser. Local preferences contain only timestamps and a dismissal flag. Storage failure disables reminders. Standalone mode, wallet callback/sign-in URLs, install/admin routes and open dialogs suppress the reminder. No wallet/session information is copied into the installation link.

Existing wallet handoff code is unchanged. Automated tests exercise Phantom, Backpack and Solflare launches from simulated iPhone Safari, KakaoTalk and standalone mode, origin claim-secret isolation and return recovery. These are not physical-device installation/signing tests. Browser visual testing is unavailable because the browser tool's admin-policy check cannot currently complete.
