# Real-device wallet and installed-app QA

Status as of September 21, 2026. **Not a completed device certification.** Automated provider tests use fixtures; they do not launch the real iOS wallets.

| Wallet | Existing evidence | Required final smoke test |
| --- | --- | --- |
| Phantom | Founder reported successful installed-app return | Pending on final release |
| Backpack | Founder reported Float stays signed in after reopening from Home Screen | Pending on final release |
| Solflare | Integration and simulated provider tests exist | Real-device completion unverified |

## Repeat for each wallet

Record date, iPhone/iOS version, wallet version and the release URL. Do not put private keys, full addresses or session values into shared evidence.

1. Start at the dedicated Cloudflare URL in Safari, install Float if needed, and open the Home Screen app.
2. Choose Join the community and the wallet under test. Use your own wallet holding a supported token.
3. Approve the membership **message**. No transaction, spending approval, seed phrase or transfer should be requested.
4. Confirm the success page offers both return guidance and Continue in wallet.
5. Reopen Float using the iOS return affordance if available, or its Home Screen icon. Do not assume an ordinary web button can force an iOS app switch.
6. Confirm Float is signed in without asking for another wallet connection; background and reopen once more.
7. Check the expected holdings and Profile tier. Any eligible verified holder has at least Bronze. Turn the value badge on; verify it appears on your own discussion/reply. Turn it off; verify it disappears.
8. Create a clearly labeled QA post in Off Topic, using only your own account. Confirm return to the discussion list, then find it through My posts. Open the detail and delete it using the three-dot menu. Confirm it disappears. Remove QA content immediately.
9. Check a nickname change without Save is discarded on navigation. Open your alias/profile and check the saved bio.
10. Open a news headline, return to Float and check the original Home context. Switch tabs and confirm no blank sheet, overflow or lost session.
11. Sign out. Cancel the next wallet prompt and verify there is no half-signed-in state. Reconnect with another wallet account and confirm the first account's private holdings are absent.

## Record result

| Date / release | Wallet / version | iOS | App-return login | Tier / toggle | Post / delete | Cancel / account switch | Evidence / issue |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Pending | Phantom | — | — | — | — | — | — |
| Pending | Backpack | — | — | — | — | — | — |
| Pending | Solflare | — | — | — | — | — | — |

## Desktop installation

In a current regular Chrome window, check the install affordance or the browser's Cast, save, and share menu. Also test the fallback instructions when no install prompt is offered. The app manifest alone does not prove that a particular Chrome profile or managed browser permits installation. Use the installed app and repeat a basic extension sign-in. Do not claim this test passed until performed.
