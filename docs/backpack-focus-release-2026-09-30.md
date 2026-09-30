# Backpack-focused public release

Scope: homepage, app metadata, About, Help, Membership, data methodology and market tooltips now describe the Backpack focus. Markets and wallet metrics are scoped to Backpack. Solana remains in technical coverage/verification descriptions. Discussions remain general ideas, questions, replies and polls. Existing eligible members retain access.

Chart/portfolio composition remains development-only. The local composer is not a persistent authenticated posting implementation; portfolio examples must not appear as real holdings. No chart accuracy certification is implied.

Validation: full type/lint/test/build release gate passed; desktop and 390px mobile homepage/Markets and tooltip rendering checked. No database migrations pending. Deployed Cloudflare Worker float-solana version 1017b139-e8a7-4c6d-b38f-d10df8f1807e. Live homepage, Markets, data-methodology and manifest return 200 with Backpack copy; /preview/social and /api/preview/chart?symbol=MU both return 404. Development middleware is not enabled in production.
