# Cloudflare hackathon deployment

Float has a separate zero-cost Cloudflare Worker deployment for hackathon review. It uses the `float-solana-production` D1 database and is intentionally isolated from the existing Sites-hosted deployment.

Run `pnpm prepare:cloudflare` after the production build. It derives `dist/server/wrangler.float.json` from Vinext's generated Worker configuration, replaces the platform-owned bindings with Float's dedicated D1 database, and removes the unavailable R2 binding. Deploy that generated configuration rather than a separate hand-written Worker manifest so server-side module references and client assets remain aligned.

R2 is intentionally not bound. Cloudflare requires an account subscription before enabling R2, even though its monthly free allowance may cover a small launch. The avatar API fails closed with a clear unavailable response when the binding is absent; all other Float workflows continue to use D1. Do not add an R2 binding until the account owner explicitly accepts that subscription.

Before a future external deployment, run the full release build, apply the `drizzle/` migrations to the selected D1 database, and deploy the exact resulting Worker with this configuration. The deployment contains a separate community database, so it does not carry existing Sites-hosted member sessions, posts, or market caches.
