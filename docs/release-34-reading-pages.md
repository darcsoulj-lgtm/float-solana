# Reading pages and public navigation

- Scoped reading layout for Guidelines, Membership, Privacy, About and Help: 800px maximum width including gutters, responsive 28–36px title, 18px section headings, 16px body, simple section dividers.
- Plain Guidelines and Privacy titles; concise Rules section headings. Privacy storage details split into paragraphs without changing retention or disclosure semantics. Support links are actionable.
- Footer and header both call the membership page Membership.
- Public header uses two rows below 1000px. At phone widths, appearance icons stay beside the brand with accessible names and 44px-high controls; navigation sits below. Existing light/dark/system behavior is preserved.

Validation: TypeScript passed; all five pages rendered on the server with one main heading and relevant support links; 41 dashboard/market regression tests passed, including appearance preference synchronization.

Visual verification remains incomplete: browser access is restricted by an administrator policy in this session. No desktop/mobile screenshots, actual browser focus/zoom checks, or authenticated end-to-end checks are claimed. Broad global stylesheet cleanup and a complete product-wide visual review remain outstanding; this release deliberately scopes changes to reading pages and the public header.
