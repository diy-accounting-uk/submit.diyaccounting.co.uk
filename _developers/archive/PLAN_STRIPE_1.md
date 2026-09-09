<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Plan: Add Stripe Payment Links to Spreadsheets Donation Page

## Context

The spreadsheets.diyaccounting.co.uk donate page currently uses PayPal hosted donations only. Stripe Payment Links offer better conversion (no login wall, donors stay on a clean checkout form). This plan adds Stripe as the primary donation option, keeping PayPal as a secondary option. This is completely separate from future Stripe subscription integration for submit.diyaccounting.co.uk — donations use simple Payment Links (just URLs), no backend/Lambda/webhook infrastructure needed.

## Prerequisite: Stripe Dashboard Setup (Manual)

1. **Create a "Spreadsheet Donation" product** — one-time payment, NOT subscription. Clearly separate from future subscription products.
2. **Create a Payment Link** with "customer chooses amount" enabled, with suggested amounts £10, £20, £45. Currency: GBP.
3. **Set the success URL** to: `https://spreadsheets.diyaccounting.co.uk/download.html?stripe=success`
4. **Record the Payment Link URL** (`https://buy.stripe.com/XXXXX`) — goes into `donate.html`.

Done, link:
```
test: https://buy.stripe.com/test_9B6dR94G7euH66u90s3VC00
live: https://buy.stripe.com/5kQ7sK49X9bie0N0bN4F200
```
5Use live-mode link for both CI and prod (behaviour tests only verify the link renders, they don't complete checkout).

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `web/spreadsheets.diyaccounting.co.uk/public/donate.html` | Modify | Add Stripe as primary, move PayPal to secondary |
| `web/spreadsheets.diyaccounting.co.uk/public/lib/donate-page.js` | Modify | Add GA4 tracking for Stripe link click |
| `web/spreadsheets.diyaccounting.co.uk/public/lib/download-page.js` | Modify | Merge Stripe+PayPal return detection |
| `web/spreadsheets.diyaccounting.co.uk/public/spreadsheets.css` | Modify | Stripe button, donate layout, divider styles |
| `behaviour-tests/spreadsheets.behaviour.test.js` | Modify | Update donate test for both options |

**No CDK/CSP changes needed** — Stripe Payment Links use `<a href>` navigation (not forms/iframes/scripts), which is not governed by CSP.

## Changes

### 1. donate.html — Stripe Primary, PayPal Secondary

Replace the current PayPal-only container (lines 55-63) with:

```html
<div class="donate-amounts">
  <p class="donate-suggested">Suggested donation amounts:</p>
  <div class="amount-options">
    <span class="amount-badge">£10</span>
    <span class="amount-badge">£20</span>
    <span class="amount-badge">£45</span>
    <span class="amount-badge">Any amount</span>
  </div>
</div>

<div class="stripe-container">
  <a href="https://buy.stripe.com/XXXXX" id="stripe-donate-link" class="btn-stripe-donate" target="_top">
    Donate with card
  </a>
  <p class="donate-hint">Secure payment via Stripe</p>
</div>

<div class="donate-divider"><span>or</span></div>

<div class="paypal-container">
  <!-- existing PayPal form unchanged -->
</div>
```

Amount badges are visual guidance only — the actual amount is confirmed on Stripe's hosted checkout page.

### 2. donate-page.js — Stripe Analytics

Add click listener on `#stripe-donate-link` for GA4 `begin_checkout` event (matching existing PayPal form submit tracking). SessionStorage logic is payment-provider-agnostic, no changes needed there.

### 3. download-page.js — Merged Return Detection

Replace the separate PayPal-only return check with a merged flow:

```javascript
var isPayPalReturn = returnParams.get('st') === 'Completed';
var isStripeReturn = returnParams.get('stripe') === 'success';
if (isPayPalReturn || isStripeReturn) {
  var savedFilename = sessionStorage.getItem('donateFilename');
  var savedProduct = sessionStorage.getItem('donateProduct');
  sessionStorage.removeItem('donateFilename');
  sessionStorage.removeItem('donateProduct');
  if (savedFilename) {
    var provider = isStripeReturn ? 'stripe' : 'paypal';
    trackEvent('purchase', { transaction_id: provider + '_' + Date.now(), ... });
    window.location = '/zips/' + encodeURIComponent(savedFilename);
    return;
  }
}
```

### 4. spreadsheets.css — New Styles

Add to the Donate Page section:
- `.donate-amounts`, `.donate-suggested`, `.amount-options`, `.amount-badge` — suggested amount badges (teal border pills)
- `.stripe-container`, `.btn-stripe-donate` — primary button in Stripe purple (#635bff), large rounded pill
- `.donate-hint` — muted helper text below Stripe button
- `.donate-divider` — "or" separator with horizontal rule
- Make PayPal button slightly smaller as secondary option

### 5. Behaviour Test Update

Rename test to "Donate page loads with Stripe and PayPal donation options". Add:
- Verify `#stripe-donate-link` is visible with `href` containing `buy.stripe.com`
- Verify amount badges are displayed (count >= 3)
- Keep existing PayPal form verification

## Flow After Changes

1. User on download.html selects product + period
2. Clicks "Download with optional donation" → navigates to `donate.html?product=X&filename=Y`
3. donate-page.js saves `{product, filename}` to sessionStorage
4. User clicks "Donate with card" → navigates to `buy.stripe.com/XXXXX`
5. Stripe redirects to `download.html?stripe=success`
6. download-page.js detects `stripe=success`, reads sessionStorage, auto-downloads
7. sessionStorage is cleared

PayPal flow continues to work identically via `?st=Completed`.

## Verification

1. `npm test` — no regressions
2. Visual check of donate.html — Stripe primary, amount badges, PayPal secondary
3. Click Stripe link → verify Stripe checkout page loads
4. Complete Stripe payment → verify redirect to `download.html?stripe=success` → auto-download
5. Complete PayPal payment → verify `?st=Completed` flow still works
6. `npm run test:spreadsheetsBehaviour-ci` after deployment
