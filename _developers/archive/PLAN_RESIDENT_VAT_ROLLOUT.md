<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Resident VAT Bundle Rollout Plan

> **Goal**: Launch `resident-vat` as the primary publicly available subscription tier at £0.99/mo
> **Prerequisite for**: `_developers/backlog/PLAN_CAMPAIGN_AND_REFERRALS.md` Phase A
> **GitHub Issue**: TBD

## User Assertions

- `resident-vat` is the new imminently launched bundle — it will be available to all users
- `resident-pro` exists and will remain accessible only by pass (admin-issued, not publicly promoted)
- Behaviour tests for pass issuing should, where possible, move to use `resident-vat` in place of `resident-pro`
- Behaviour tests for payments should also move to `resident-vat` as the primary test target
- `resident-pro` is not being removed — it stays for existing users and admin-issued passes

## What Already Exists

| Component | Status |
|-----------|--------|
| `resident-vat` bundle in `submit.catalogue.toml` | **Done** — 100 tokens/mo, `on-pass-on-subscription`, `hidden: true` |
| Activities referencing `resident-vat` in catalogue | **Done** — submit-vat, vat-obligations, view-vat-return, generate-pass-digital, generate-pass-physical |
| Bundle allocation flow (`on-pass-on-subscription`) | **Done** — same flow as `resident-pro`: pass reveals card, subscription grants access |
| Billing webhook (`billingWebhookPost.js`) | **Done** — already reads `bundleId` from Stripe session metadata (no code change needed) |
| Billing checkout (`billingCheckoutPost.js`) | **Done** — already accepts `bundleId` in request body (falls back to `resident-pro` if omitted) |

## What Needs to Be Done

---

### Phase 1: Pass Types & Stripe Product

#### 1.1 Add pass types to `submit.passes.toml`

- [ ] Add `resident-vat-test-pass` (test/sandbox, `bundleId=resident-vat`, `defaultValidityPeriod=P1D`, `defaultMaxUses=1`, `test=true`)
- [ ] Add `resident-vat-pass` (production, `bundleId=resident-vat`, `defaultValidityPeriod=P1D`, `defaultMaxUses=1`)

```toml
# resident-vat-test-pass → unlocks "resident-vat" bundle (test/sandbox)
# Grants: 100 tokens, refreshing monthly, HMRC sandbox access (testPass: true)
# Payment: None (admin-issued via GitHub Actions for automated tests and CI)
[[passTypes]]
id = "resident-vat-test-pass"
name = "Resident VAT Test Pass"
description = "VAT subscription access to HMRC Sandbox APIs for testing"
bundleId = "resident-vat"
defaultValidityPeriod = "P1D"
defaultMaxUses = 1
requiresEmailRestriction = false
test = true

# resident-vat-pass → unlocks "resident-vat" bundle (production)
# Grants: 100 tokens, refreshing monthly, production HMRC access
# Payment: Pass reveals the card, subscription grants the bundle (£0.99/mo)
[[passTypes]]
id = "resident-vat-pass"
name = "Resident VAT Pass"
description = "VAT subscription access to production HMRC APIs"
bundleId = "resident-vat"
defaultValidityPeriod = "P1D"
defaultMaxUses = 1
requiresEmailRestriction = false
```

#### 1.2 Add pass types to generate-pass workflow

- [ ] Update `.github/workflows/generate-pass.yml`: add `resident-vat-test-pass` and `resident-vat-pass` to the `pass_type` dropdown

#### 1.3 Create Stripe product and price

- [ ] Update `scripts/stripe-setup.js`: add `resident-vat` product + price (£0.99/mo = `unit_amount: 99`, `currency: "gbp"`, `recurring.interval: "month"`)
- [ ] Run script against test Stripe: `STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-setup.js`
- [ ] Run script against live Stripe: `STRIPE_SECRET_KEY=sk_live_... node scripts/stripe-setup.js`
- [ ] Record the price IDs for test and live modes

The script should be extended to handle multiple products. Pattern:

```javascript
const PRODUCTS = [
  {
    name: "Resident Pro",
    bundleId: "resident-pro",
    priceAmount: 999,    // £9.99
    currency: "gbp",
    interval: "month",
  },
  {
    name: "Resident VAT",
    bundleId: "resident-vat",
    priceAmount: 99,     // £0.99
    currency: "gbp",
    interval: "month",
  },
];
```

#### 1.4 Configure price ID environment variables

The checkout Lambda resolves the Stripe price ID via `resolveStripePriceId()`. Currently this returns a single price ID. It needs to support multiple price IDs, one per bundle.

- [ ] Add GitHub Actions environment variables for the new price ID:
  - `STRIPE_PRICE_ID_RESIDENT_VAT` (for ci and prod environments)
  - `STRIPE_TEST_PRICE_ID_RESIDENT_VAT` (for test mode)
- [ ] Keep existing `STRIPE_PRICE_ID` / `STRIPE_TEST_PRICE_ID` for `resident-pro` (backwards compatibility for existing subscribers)

#### 1.5 Update checkout Lambda to support multiple prices

- [ ] Modify `billingCheckoutPost.js`: resolve price ID based on `bundleId` in the request body
  - `resident-vat` → `STRIPE_PRICE_ID_RESIDENT_VAT` / `STRIPE_TEST_PRICE_ID_RESIDENT_VAT`
  - `resident-pro` → `STRIPE_PRICE_ID` / `STRIPE_TEST_PRICE_ID` (existing)
  - Default: `resident-pro` (existing behaviour unchanged)
- [ ] Update `resolveStripePriceId()` to accept bundleId parameter
- [ ] Pass price ID through CDK environment variables (BillingStack.java)

#### 1.6 Update CDK BillingStack

- [ ] Add `STRIPE_PRICE_ID_RESIDENT_VAT` and `STRIPE_TEST_PRICE_ID_RESIDENT_VAT` environment variables to the `billingCheckoutPost` Lambda in `BillingStack.java`
- [ ] Source values from GitHub Actions variables (same pattern as existing price ID)

---

### Phase 2: Make resident-vat Visible & Purchasable

#### 2.1 Make resident-vat visible on bundles page

- [ ] Change `hidden = false` in `submit.catalogue.toml` for `resident-vat`
- [ ] The bundles page (`bundles.html`) already renders all non-hidden catalogue bundles dynamically — no HTML change needed

#### 2.2 Update catalogue bundle mapping comment

- [ ] Update the mapping summary comment at the top of `submit.catalogue.toml` to include `resident-vat`

#### 2.3 Optionally: hide resident-pro from public view

- [ ] Change `hidden = true` in `submit.catalogue.toml` for `resident-pro` (still accessible via pass, just not shown in catalogue listing)
- [ ] Existing `resident-pro` subscribers are unaffected — their bundle is already allocated

---

### Phase 3: Update Behaviour Tests

The tests should prefer `resident-vat` over `resident-pro` where the test is exercising general subscription/token/pass-generation behaviour. `resident-pro` specific tests should remain for backwards compatibility.

#### 3.1 Pass generation tests (`generatePassActivity.behaviour.test.js`)

Currently: grants `resident-pro` via `ensureBundleViaPassApi(page, "resident-pro", ...)` to get 100 tokens for pass generation.

- [ ] Change to `ensureBundleViaPassApi(page, "resident-vat", ...)` — `resident-vat` also has 100 tokens and the same `generate-pass-digital`/`generate-pass-physical` activity entitlements
- [ ] Update log messages from `"resident-pro"` to `"resident-vat"`
- [ ] Verify test still passes — the pass generation flow is bundle-agnostic once tokens are available

#### 3.2 Payment tests (`payment.behaviour.test.js`)

Currently: exercises the full conversion funnel ending with `resident-pro` checkout.

- [ ] Add a parallel test (or update the existing one) that exercises `resident-vat` checkout:
  - Grant `resident-vat` pass → verify "Subscribe £0.99/mo" button → complete checkout → verify bundle allocated → verify 100 tokens
- [ ] Keep existing `resident-pro` payment test as a separate test or mark as a variant
- [ ] Update `ensureBundleViaCheckout(page, "resident-vat", ...)` calls
- [ ] Verify Stripe test mode creates the £0.99 subscription correctly

#### 3.3 Token enforcement tests (`tokenEnforcement.behaviour.test.js`)

Currently: tests "Token consumption for resident-pro (100 tokens)".

- [ ] Rename/duplicate to test `resident-vat`: grant `resident-vat` via pass, verify 100 tokens, submit VAT, verify 99 remaining
- [ ] Same token mechanics — only the bundle name changes

#### 3.4 Pass redemption tests (`passRedemption.behaviour.test.js`)

Currently: creates a `resident-pro` pass and verifies the "Subscribe" button appears.

- [ ] Add test for `resident-vat` pass redemption: create pass, redeem, verify "Subscribe £0.99/mo" button appears
- [ ] Keep existing `resident-pro` pass redemption test

#### 3.5 Bundle step helpers (`behaviour-bundle-steps.js`)

- [ ] Verify `ensureBundleViaPassApi` works with `"resident-vat"` as the bundleId parameter — it should already since it's data-driven from the pass type
- [ ] Verify `ensureBundleViaCheckout` works with `"resident-vat"` — may need to handle different price ID resolution

---

### Phase 4: Unit Tests

#### 4.1 Checkout unit tests (`billingCheckoutPost.test.js`)

- [ ] Add test case: checkout with `bundleId: "resident-vat"` resolves to the VAT price ID
- [ ] Verify existing test still works with default `resident-pro`

#### 4.2 Webhook unit tests (`billingWebhookPost.test.js`)

- [ ] Add test case: `checkout.session.completed` with `metadata.bundleId: "resident-vat"` grants the `resident-vat` bundle
- [ ] Verify `invoice.paid` token refresh works for `resident-vat` (100 tokens from catalogue)

#### 4.3 Pass tests

- [ ] Add `resident-vat-test-pass` to pass creation/redemption unit tests
- [ ] Verify catalogue lookup returns correct bundle definition for `resident-vat`

#### 4.4 Catalogue tests (`productCatalog.test.js`)

- [ ] Verify `resident-vat` bundle is loaded correctly from catalogue
- [ ] Verify activity entitlements include `resident-vat` for submit-vat, generate-pass-digital, etc.

---

### Phase 5: Deploy & Verify

#### 5.1 CI deployment

- [ ] Commit all changes, push to feature branch
- [ ] Verify CI deployment succeeds (CDK + Terraform)
- [ ] Run behaviour tests against CI: `npm run test:submitVatBehaviour-ci`
- [ ] Run payment behaviour tests: `npm run test:paymentBehaviour-ci`

#### 5.2 Stripe setup for live mode

- [ ] Run `stripe-setup.js` against live Stripe to create resident-vat product + price
- [ ] Store live price ID in GitHub Actions prod environment variables
- [ ] Deploy to prod

#### 5.3 Verify production

- [ ] Create a `resident-vat-pass` via GitHub Actions generate-pass workflow
- [ ] Redeem pass as a test user
- [ ] Verify "Subscribe £0.99/mo" button appears
- [ ] Complete subscription in Stripe (use a real test card in live mode)
- [ ] Verify bundle is granted, 100 tokens available
- [ ] Verify pass generation works (costs 10 tokens)

---

## Files to Create

| File | Phase | Purpose |
|------|-------|---------|
| (none — all changes are to existing files) | | |

## Files to Modify

| File | Phase | Changes |
|------|-------|---------|
| `submit.passes.toml` | 1.1 | Add `resident-vat-test-pass` and `resident-vat-pass` pass types |
| `.github/workflows/generate-pass.yml` | 1.2 | Add `resident-vat-test-pass` and `resident-vat-pass` to dropdown |
| `scripts/stripe-setup.js` | 1.3 | Add `resident-vat` product + price (£0.99/mo) |
| `app/functions/billing/billingCheckoutPost.js` | 1.5 | Resolve price ID by bundleId |
| `infra/.../BillingStack.java` | 1.6 | Add `STRIPE_PRICE_ID_RESIDENT_VAT` env vars to checkout Lambda |
| `web/public/submit.catalogue.toml` | 2.1, 2.2 | Set `hidden = false` for `resident-vat`; optionally `hidden = true` for `resident-pro` |
| `behaviour-tests/generatePassActivity.behaviour.test.js` | 3.1 | Switch from `resident-pro` to `resident-vat` |
| `behaviour-tests/payment.behaviour.test.js` | 3.2 | Add/update test for `resident-vat` checkout flow |
| `behaviour-tests/tokenEnforcement.behaviour.test.js` | 3.3 | Add/update test for `resident-vat` token consumption |
| `behaviour-tests/passRedemption.behaviour.test.js` | 3.4 | Add test for `resident-vat` pass redemption |
| `behaviour-tests/steps/behaviour-bundle-steps.js` | 3.5 | Verify/update helpers for `resident-vat` support |
| `app/unit-tests/functions/billingCheckoutPost.test.js` | 4.1 | Add `resident-vat` checkout test case |
| `app/unit-tests/functions/billingWebhookPost.test.js` | 4.2 | Add `resident-vat` webhook test case |

---

## Risk & Rollback

- **No breaking changes**: `resident-pro` continues to work exactly as before. All changes are additive.
- **Stripe**: New product/price doesn't affect existing subscribers. Webhooks handle any `bundleId` from session metadata.
- **Rollback**: Set `hidden = true` on `resident-vat` in catalogue to hide from public. No infrastructure teardown needed.
- **Default fallback**: `billingCheckoutPost.js` and `billingWebhookPost.js` both default to `resident-pro` if no `bundleId` is provided, so existing flows are unaffected.

---

*Created: 2026-03-16*
