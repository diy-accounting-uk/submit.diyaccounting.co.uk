# PLAN: Issue #6 (pre-migration #737) — Pass link navigation

> Source issue: https://github.com/diy-accounting-uk/submit.diyaccounting.co.uk/issues/6
> Original body: "Activities page enables the obligation query - yes but if using the link directly, requires going into activities then back into the bundles to register the tokens"
> Existing plans: `_developers/archive/PLAN_GENERATE_PASS_ACTIVITY.md`, `PLAN_PASSES_V2.md` (passes UX), `PLAN_TOKENS_BUNDLES_UX.md`.

## Elaboration

When a user receives a pass URL (e.g. `https://submit.diyaccounting.co.uk/bundles.html?pass=XXX-XXX-XXX-XXX`), two things need to happen before they can use a protected activity (VAT obligations query, VAT return submission):

1. **Bundle allocation** — redeeming the pass grants them a bundle and associated tokens (stored in `prod-env-bundles`).
2. **Activity entitlement refresh** — the entitlement-status widget (`web/public/widgets/entitlement-status.js`) caches `/api/v1/bundle` and decides whether an activity is unlocked.

Today, the reporter's workflow is:
- Click a direct activity link (e.g. `/hmrc/vat/vatObligations.html?...`).
- Page says "Activity: requires invited-guest" — tokens not registered yet.
- Navigate to `/bundles.html`, which triggers the redemption logic via `?pass=` in the URL (`bundles.html:1017` sets `postLoginRedirect`, line 1228 replaces the URL, line 1231 invalidates the bundle cache).
- Navigate back to the activity, now it works.

This is a two-step navigation that should be a single step. The pass should also redeem when opened on an activity page, or the activity page should detect a `?pass=` param and forward it to a redemption handler.

## Likely source files to change

- `web/public/widgets/entitlement-status.js` — extend `determineEntitlementStatus()` so that if `?pass=` is present in the URL it calls the pass-redeem path (or redirects once to `/bundles.html?pass=X&then=<originalUrl>`).
- `web/public/bundles.html:1017-1265` — existing pass redemption logic; extract into a reusable module `web/public/lib/passRedemption.js` or `web/public/widgets/pass-redeemer.js`.
- `web/public/hmrc/vat/vatObligations.html`, `submitVat.html`, `viewVatReturn.html` and `passes/generate-*.html` — add the new reusable widget script tag so they pick up `?pass=` automatically.
- `web/public/widgets/auth-status.js` — if it already invalidates `/api/v1/bundle` on auth change, ensure it also invalidates after pass redemption.
- `app/functions/account/passPost.js` — no change expected; the server contract already works.

## Likely tests to change/add

- **New Playwright test** (`behaviour-tests/passLinkNavigation.behaviour.test.js`): open `/hmrc/vat/vatObligations.html?pass=<valid-code>` as an authenticated user with no allocated bundle; assert the page redeems the pass once and lands on the obligations query form without a round-trip through `/bundles.html`.
- Extend `passRedemption.behaviour.test.js` (if it exists — check) with the "direct activity link" case.
- Unit test for the extracted `passRedeemer` module in `web/browser-tests/`.

## Likely docs to change

- `_developers/archive/PLAN_GENERATE_PASS_ACTIVITY.md` — supersede the current redeem-then-navigate pattern.
- `web/public/guide.html` and `help.html` — update any "how to use a pass" instructions if they describe the two-step flow.

## Acceptance criteria

1. A fresh user (no bundle) clicking a pass URL pointed at *any* activity page (`/hmrc/vat/vatObligations.html?pass=XXX`, `/hmrc/vat/submitVat.html?pass=XXX`, `/passes/generate-*.html?pass=XXX`, `/bundles.html?pass=XXX`) ends up on that same activity page with the pass redeemed, tokens available, and the activity unlocked — no manual second navigation.
2. The entitlement widget refreshes its cache on successful redemption (does not require a page reload).
3. The `?pass=` param is removed from the URL after redemption (already happens on bundles.html line 1228 — match that behaviour everywhere).
4. If the pass is expired/invalid, the user sees a clear error in-line on the activity page and a link to the bundles page; current behaviour of silent failure is removed.
5. Synthetic test `passRedemptionBehaviour-prod` covers at least one direct-activity-link scenario.

## Implementation approach

**Recommended — shared widget + inline redeem.**

1. Extract the pass-redemption code from `bundles.html` into `web/public/widgets/pass-redeemer.js` (IIFE, exposes `window.PassRedeemer.tryRedeemFromUrl()`).
2. Include the widget on every page that can be a pass destination: `bundles.html`, `hmrc/vat/*.html`, `passes/*.html`.
3. On DOMContentLoaded, if `URLSearchParams` contains `pass=`, call the Lambda (`POST /api/v1/pass/{code}`) directly; on success, `invalidate("/api/v1/bundle")`, remove the `pass=` query string, and trigger any page-specific "entitlement changed" event so the UI updates without a full reload.
4. Add the Playwright test for every activity page.

### Alternative A — server-side 302 with Set-Cookie
Pass URLs hit a `/pass/{code}` server endpoint that redeems and sets a cookie flag, then 302s to the `then=` target (or `/bundles.html` by default). Cleaner but requires a new Lambda and URL scheme change.

### Alternative B — preserve current two-step but animate the transition
Instead of a silent second navigation, the activity page on a pass parameter briefly shows "Redeeming your pass…" then reloads. User still sees one perceived hop. Cheapest fix, no code extraction.

## Questions (for QUESTIONS.md)

- Q6.1: Do we want the redemption to happen automatically on any page, or only when the user explicitly arrives at a bundle/pass page? (Security-wise, redeeming silently on a random page is fine — the pass is the auth token for that one-shot action — but it might surprise users. Recommendation: yes, auto-redeem anywhere.)
- Q6.2: Should the `then=<originalUrl>` query param be supported, so `/bundles.html?pass=X&then=/hmrc/vat/vatObligations.html` still works for legacy shared links?

## Good fit for Copilot?

Yes — the extraction + test is mechanical once the design is agreed. Assign after Q6.1 is answered.
