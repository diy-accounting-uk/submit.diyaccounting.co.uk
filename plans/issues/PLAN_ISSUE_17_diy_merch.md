# PLAN: Issue #17 (pre-migration #576) — DIY Merch

> Source issue: https://github.com/diy-accounting-uk/submit.diyaccounting.co.uk/issues/17
> Original body: (empty)
> Existing plans: none. Related: existing Stripe integration for subscriptions (`app/functions/billing/*`).

## Elaboration

"DIY Merch" implies physical/digital branded merchandise sales: T-shirts, mugs, stickers, mouse pads, A5 calculation spreadsheets on paper, calculators, etc. A marketing channel, not a revenue driver. Two reasons to build this:

1. **Brand awareness** — a DIY Accounting tote in an accountant's office is cheap marketing for a niche B2B tool.
2. **Community signalling** — free merch can be a referral reward (ties to #652 Phase 6 — a pro subscriber who gets 10 redemptions unlocks a t-shirt).

Two paths for implementation:

- **Print-on-demand** (Printful, Teemill, Teespring) — zero inventory, our site links to a storefront. Minimal engineering — just links from a new `/merch.html` page.
- **Stripe Products + print-on-demand fulfilment** — use the existing Stripe account, create physical Products with shipping, fulfil via print-on-demand API. More control over branding and payment flow; integrates with existing bundles UX (e.g. merch redemption unlocked by ambassador tier). Higher engineering cost.

## Likely source files to change

**If path = storefront link:**
- New `web/public/merch.html` — one page with embedded storefront widget or link-out.
- `web/public/*.html` nav — optional "Merch" link (probably footer, not main nav).

**If path = integrated Stripe Products:**
- `app/functions/billing/billingCheckoutPost.js` — extend to handle physical products (different Price IDs; requires `shipping_address_collection`).
- New `app/functions/merch/merchOrderGet.js` / `merchOrderList.js` — post-purchase order status.
- New Stripe webhook handler in `billingWebhookPost.js` for `checkout.session.completed` events with shipping data; fulfilment trigger via Printful API.
- `infra/.../stacks/BillingStack.java` — add routes.
- New `web/public/merch/` page set — catalogue, product detail, cart (or single-item purchase for simplicity), post-purchase order tracking.
- `web/public/submit.catalogue.toml` — no change (merch is orthogonal to activities / bundles, though pro users may get a discount code).
- Secrets — `printful/api-key` in Secrets Manager.

## Likely tests to change/add

- For storefront path: basic link validation.
- For integrated path:
  - Unit tests for merch Lambdas.
  - Webhook test simulating Stripe `checkout.session.completed`.
  - Integration test with Printful API mocked.
  - Behaviour test: select a T-shirt, go through checkout (Stripe test mode), assert the order was created at Printful (mock).

## Likely docs to change

- `guide.html` — mention Merch as a section.
- `privacy.html` — **important**: collecting shipping addresses is a new PII category; update the privacy notice and data-processing register.
- New `_developers/MERCH_OPS.md` — print-on-demand vendor choice, SLA, refund policy.
- `PLAN_CAMPAIGN_AND_REFERRALS.md` — link merch as a reward tier if we go that route.

## Acceptance criteria

Path A (storefront link):
1. `/merch.html` page live with a discoverable link from the footer.
2. Outbound link to the chosen storefront works.
3. Page is accessible (pa11y clean).

Path B (integrated):
1. User can browse merch catalogue, pick an item, pay via Stripe Checkout.
2. Shipping address collected; UK only at launch.
3. Post-checkout, a Printful order is created automatically.
4. User sees order confirmation + tracking link.
5. Privacy notice updated; new PII (shipping address) documented.
6. Refunds/returns policy linked from checkout.

## Implementation approach

**Recommended — Path A first, Path B only if merch proves demand.**

1. **Phase 0** — design 3–5 products (T-shirt, mug, sticker set, tote, calculator) with DIY Accounting brand.
2. **Phase 1 (Path A)**: set up Teemill or Printful storefront; point `/merch.html` at it. Ship in a day.
3. **Phase 2** (only if orders materialise): build Path B for deeper integration with bundles / referrals.

### Alternative A — Shopify storefront
Proven platform; ~£20/mo. More capable than Teemill/Printful's bundled storefront. Worth considering if Path A orders justify.

### Alternative B — drop physical merch, digital only
Downloadable assets — a DIY Accounting spreadsheet template, a desktop wallpaper, a tax-return checklist PDF. Zero fulfilment cost. Less brand-extension but much cheaper.

### Alternative C — free merch for ambassadors (integrated with #652)
No paid sale; merch is a redemption reward. Adds engineering to redeem via tokens but ties into the referral flywheel.

## Questions (for QUESTIONS.md)

- Q17.1: Path A (storefront link) vs Path B (integrated) vs Path C (reward-only, free for ambassadors)? (Recommendation: A first.)
- Q17.2: Product set to start — T-shirt, mug, sticker? Any brand-collateral preferences (colours, slogan)?
- Q17.3: Geographic scope — UK-only, EU, worldwide?
- Q17.4: Print-on-demand vendor preference? (Teemill is UK-based + eco-branded — aligns with small-business narrative. Printful is US-based with UK fulfilment.)

## Good fit for Copilot?

Path A is yes — trivial static page + link. Path B needs a human to design the payment flow + privacy review. Path C couples tightly with #652 Phase 6.
