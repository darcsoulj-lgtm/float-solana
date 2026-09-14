# Public markets submission scope

Float's signed-out navigation now leads to `/markets`, a public, read-only view of the full Solana tokenized-stock market. The market endpoint accepts visitors without a wallet and rate-limits anonymous traffic by Cloudflare client IP. It returns public issuer and market observations only; community identity, sessions, wallet addresses and holdings remain outside the response.

The Guidelines route and navigation links are removed for the hackathon submission. Privacy, membership and methodology disclosures remain available in their existing pages.

Stonkfun is retained as a dormant, tested backend integration but is no longer imported, requested, attributed or rendered by the frontend. It can be reconsidered after the submission without affecting the current market methodology.
