# PLAN: Issue #5 (pre-migration #740) — "Manage subscription" button not visible on mobile

> Source issue: https://github.com/diy-accounting-uk/submit.diyaccounting.co.uk/issues/5
> Original body: screenshot only (511×315 PNG showing a mobile viewport with the button missing or cut off).
> Existing plans: `_developers/archive/PLAN_BILLING_HARDENING.md`, `PLAN_PAYMENT_LIFECYCLE.md`, `PLAN_PAYMENT_INTEGRATION.md` cover billing flow; no mobile-specific plan.

## Elaboration

The billing flow already exposes a Stripe Customer Portal via `GET /api/v1/billing/portal` (`app/functions/billing/billingPortalGet.js`, Lambda `prod-env-app-billing-portal-get`). The client-side entry to that flow is a "Manage subscription" button on `bundles.html` (line 602 redirects to `body.portalUrl`). On mobile viewports the button is either:
- Off-screen (overflow:hidden on a parent container), or
- Hidden behind the "current bundles" card stack, or
- Present but styled with a desktop-only media query.

Without the button, a paying subscriber cannot cancel, update their card, or download invoices from their phone. That is an immediate support/compliance risk — subscription cancellation must be one click from any device to comply with consumer rights (UK Consumer Rights Act 2015).

## Likely source files to change

- `web/public/bundles.html` — locate the "Manage subscription" button element; check its containing flex/grid and any `display:none` rule under narrow breakpoints.
- `web/public/submit.css` — `@media (max-width: 768px)` or similar — audit for any rule hiding the button.
- `web/public/widgets/auth-status.js` — if the button is gated on `subscriptionActive` state from `/api/v1/bundle`, ensure the state reaches the DOM on mobile.
- Screenshot reference: `https://github.com/user-attachments/assets/715b02c9-bfe6-4859-b454-020e9c214274` — download and save to `_developers/screenshots/issue-740-manage-sub-mobile.png` for the plan file (optional).

## Likely tests to change/add

- **New Playwright mobile viewport test** in `behaviour-tests/bundles.behaviour.test.js` or a new `billingMobile.behaviour.test.js`: set viewport to `375×667` (iPhone SE) and `390×844` (iPhone 14); navigate to `/bundles.html` as a paying user; assert the Manage subscription button is `isVisible({ timeout: 5000 })`.
- **Browser test** under `web/browser-tests/` for a snapshot of `bundles.html` at a mobile width to catch future regressions.
- Update the weekly compliance workflow to add a mobile Lighthouse/Pa11y run (overlaps with #13).

## Likely docs to change

- `_developers/backlog/IMPLEMENTATION_PLAN_PRODUCTION_HARDENING.md` if it has a mobile checklist — add this item.
- `accessibility.html` (if relevant) — already should commit to mobile compatibility.

## Acceptance criteria

1. On viewport widths 320px, 375px, 390px, and 414px, the "Manage subscription" button is visible without scrolling past the fold on `/bundles.html` for a paying user.
2. Button is keyboard-focusable and has a minimum tap target of 44×44 px (WCAG 2.5.5).
3. Clicking the button triggers `POST /api/v1/billing/portal` (or `GET` per current impl) and navigates to the returned Stripe Customer Portal URL.
4. New Playwright test passes on both mobile viewports.
5. Button visible test added to the `paymentBehaviour` or `bundleBehaviour` synthetic run so a regression pages out.

## Implementation approach

**Recommended — diagnose first, then fix CSS.**

1. Reproduce: `npm run test:submitVatBehaviour-proxy` with a manually-set viewport of 375px, take a screenshot.
2. Likely causes (in order):
   - The button is inside a grid/flex container with `overflow: hidden` and a min-width causing horizontal overflow.
   - A `display: none` under a max-width media query.
   - The button is placed after a large current-bundles card that pushes it below the screen fold on narrow devices.
3. Fix: adjust the CSS in `submit.css` so the button is inside the subscription summary panel at the top of the page (not at the bottom), or that it collapses into a visible action row on mobile. Prefer placing primary actions above-the-fold on small screens.
4. Add the Playwright viewport test.

### Alternative A — always-visible floating action button
Pin a "Manage subscription" FAB to the bottom-right of `/bundles.html` when the user has an active subscription. Solves this for all layouts but may conflict with legal footer or cookie banner on mobile.

### Alternative B — move to account menu
Put the button in the logged-in user dropdown in the header (next to Sign out). Nav stays constant across pages. Bigger UX change but fixes the "find my subscription" problem site-wide.

## Questions (for QUESTIONS.md)

- Q5.1: Screenshot link — can you confirm the exact mobile OS/browser where you captured this? Specifically, is this iOS Safari or Android Chrome? (Changes which viewport tests I run.)
- Q5.2: Should this be in the header user menu as well (Alternative B)? That doubles the discoverability.

## Good fit for Copilot?

Partial. The CSS/mobile layout diagnosis needs eyes on a real mobile device or at least the screenshot. Copilot can draft the Playwright viewport test and the CSS candidate fix; a human should verify the screenshot matches before merging.
