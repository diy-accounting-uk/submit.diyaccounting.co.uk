# Human QA Test Plan — DIY Accounting Submit

## Purpose

Iterative manual QA test sessions. Each section builds on the previous one, giving the tester early wins before progressing to more complex journeys. Start from Section 1 and work through in order.

**Test both mobile and desktop** for every section.
**Monitor the Telegram feed** — every action you take should appear in the live Telegram channel.
**Note any incidents** on the ops Telegram channel and record them.

### Test environments

| Environment | URL | Notes |
|-------------|-----|-------|
| CI | https://ci-submit.diyaccounting.co.uk | Deployed from feature branches |
| Prod | https://submit.diyaccounting.co.uk | Live site |

| Channel        | URL                            | Description |
|----------------|--------------------------------|-------------|
| @diy-ci-test   | https://t.me/+AmY3Lrf6yw0yYmY0 | User activity from a test or from someone using a test pass. |
| @diy-ci-live   | https://t.me/+aFj-IawVGwtkN2E0 | Real customer data not using a test pass. |
| @diy-ci-ops    | https://t.me/+1IFAay17W05mY2I0 | Infrastructure and deployment events, errors, warnings. |
| @diy-prod-test | https://t.me/+GObj6Vgv7khlMTQ0 | User activity from a test or from someone using a test pass. |
| @diy-prod-live | https://t.me/+IMrCsu2V_yZiZWRk | Real customer data not using a test pass. |
| @diy-prod-ops  | https://t.me/+k7jbzYLeHBo5NTBk | Infrastructure and deployment events, errors, warnings. |

---

## Section 1: Information Discovery (no login required)

**Goal**: Can a visitor find out what the service does and how existing customers can submit VAT?

### Steps

1. Open the gateway site: https://diyaccounting.co.uk
2. Browse the site — can you understand what DIY Accounting does?
3. Find the link to the Submit service (submit.diyaccounting.co.uk)
4. On the Submit site, read the home page without logging in
5. Look for information about:
   - What VAT submission is
   - How existing customers can submit VAT
   - What bundles/passes are
   - How to get started
6. Check the footer links: Privacy, Terms, Accessibility, Guide
7. Try navigating to the Spreadsheets site: https://spreadsheets.diyaccounting.co.uk

### Checklist
- [ ] Gateway site loads and is informative
- [ ] Submit site home page is clear about the service
- [ ] Footer links all work
- [ ] Page looks good on mobile and desktop
- [ ] No broken images or layout issues

---

## Section 2: Account Access and Early Access List

**Goal**: Log in, explore the authenticated experience, and join the early access list.

### Steps

1. On submit.diyaccounting.co.uk, click "Log in"
2. You'll be redirected to the login page — use your Google/social account or create one
3. After login, note what the home page shows (Activities section)
4. Are any activities available? What does it say about access?
5. If there's an "Early Access" banner, click "Register for Early Access"
6. Check the Bundles page (nav link) — what bundles are available?
7. Check the Token Usage page — what does it show for a new user?
8. Log out and verify you're logged out

### Checklist
- [ ] Login flow works smoothly (Google / social login)
- [ ] Home page shows correct state for a new user (no bundles)
- [ ] Early access registration works (if banner is visible)
- [ ] Bundles page shows the catalogue
- [ ] Token Usage page loads (may show empty state)
- [ ] Logout works cleanly
- [ ] Telegram test channel shows login event
- [ ] All pages render well on mobile and desktop
-
---

## Section 3: Guest Pass — First VAT Query

**Goal**: Redeem a guest pass and query VAT obligations.

**Prerequisite**: You'll be given a day-guest pass code (4-word passphrase like "tiger-happy-mountain-silver").

### Steps

1. Log in
2. Go to Bundles page
3. In the "Have a Pass?" section, enter the 4-word pass code
4. The pass should be redeemed and you should see "day-guest" in your current bundles
5. Note the token count (should be 3 tokens)
6. Go to the Home page — Activities should now be available
7. Click "VAT Obligations (HMRC)" to see upcoming obligations
8. You'll be redirected to HMRC to authorize access — follow the prompts
9. After authorization, you should see your VAT obligations listed
10. Check the Telegram test channel for the obligation query event

### Checklist
- [ ] Pass redemption works (pass code accepted, bundle granted)
- [ ] Token count shows correctly (3 tokens)
- [ ] Activities page enables the obligation query
- [ ] HMRC OAuth flow works end-to-end
- [ ] Obligations are displayed after authorization
- [ ] Telegram feed shows the event
- [ ] Works on mobile and desktop

---

## Section 4: Submit a VAT Return and View Receipt

**Goal**: Submit a VAT return using the HMRC sandbox and verify the receipt.

### Steps

1. From the Home page, click "Submit VAT (HMRC)"
2. Fill in the VAT form:
   - VAT number (use a sandbox number if testing)
   - Period dates
   - VAT amounts (any reasonable test values)
   - Check the declaration checkbox
3. Click Submit
4. If redirected to HMRC, authorize and grant permission
5. Wait for the submission to complete (may take a few seconds)
6. You should see a receipt with:
   - Processing date
   - HMRC receipt reference
   - The amounts you submitted
7. Go to "View VAT Return (HMRC)" — find your receipt in the list
8. Click on it to view the full receipt details
9. Check your token count on the Bundles page — it should have decreased by 1

### Checklist
- [ ] VAT form loads and accepts input
- [ ] Submission completes successfully
- [ ] Receipt is displayed with HMRC reference
- [ ] Receipt appears in the receipts list
- [ ] Token count decreased by 1
- [ ] Telegram feed shows the submission event
- [ ] Works on mobile and desktop

---

## Section 5: Running Out of Tokens

**Goal**: Experience what happens when tokens are exhausted.

### Steps

1. Submit VAT returns until your remaining tokens reach 0
   (day-guest has 3 tokens — you used 1 in Section 4, submit 2 more)
2. After exhausting tokens, go to the Home page
3. The "Submit VAT (HMRC)" button should show "Insufficient tokens" and be disabled
4. Look for an upsell link to the Bundles page
   (Not yet live, you will need a resident-pro-test-pass to access the pro bundle)
5. Go to the Bundles page — verify your day-guest bundle shows 0 tokens remaining
6. Note the "Resident Pro" option in the catalogue with the subscription price

### Checklist
- [ ] Submission works until tokens are exhausted
- [ ] Activities are disabled with clear "Insufficient tokens" message
- [ ] Upsell to bundles page is visible
- [ ] Bundles page shows 0 tokens correctly
- [ ] Resident Pro subscription option is visible with price
- [ ] Telegram feed shows all submission events
- [ ] Disabled state looks correct on mobile and desktop

---

## Section 6: Upgrade to Pro via Subscription

**Goal**: Subscribe to Resident Pro via Stripe checkout and verify access is restored.

**Prerequisite**: You'll be given a resident-pro pass code.

### Steps

1. Go to Bundles page
2. Enter the resident-pro pass code in "Have a Pass?"
3. The pass should indicate a subscription is required — click "Subscribe"
4. You'll be taken to the Stripe checkout page
5. Pay with a test card: **4242 4242 4242 4242**, expiry **12/30**, CVC **123**
6. After payment, you should be redirected back to the Bundles page
7. Verify:
   - "Resident Pro" appears in your current bundles
   - Token count shows 100
   - "Manage Subscription" button is visible
8. Go to Home page — all activities should be enabled again
9. Submit a VAT return to verify tokens work

Other test cards are available here: https://stripe.com/docs/testing#cards

### Checklist
- [ ] Pass code triggers subscription flow
- [ ] Stripe checkout loads and accepts test card
- [ ] Redirect back to bundles page after payment
- [ ] Resident Pro bundle appears with 100 tokens
- [ ] Manage Subscription button visible
- [ ] Activities are re-enabled
- [ ] VAT submission works with Pro tokens
- [ ] Telegram feed shows checkout/subscription events
- [ ] Works on mobile and desktop

---

## Section 7: Generate a Pass and Test the QR Code

**Goal**: As a Pro subscriber, generate a digital pass and test the QR code yourself.

### Steps

1. Go to Home page — you should see "Generate Digital Pass" activity (Pro only)
2. Click "Generate Digital Pass"
3. A pass should be generated with:
   - A 4-word pass code
   - A QR code image
   - Validity information (7 days, up to 100 uses)
4. Note: this costs 10 tokens — check your token count decreased
5. Try the QR code:
   - On mobile: use your camera app to scan the QR code
   - On desktop: copy the pass code text
6. The QR code should link to the bundles page with the pass pre-filled
7. Open the link in an incognito/private window to test as a different user
8. Verify the pass code is valid and can be redeemed

### Checklist
- [ ] Digital pass generation works
- [ ] Pass code and QR code are displayed
- [ ] Token count decreased by 10
- [ ] QR code is scannable on mobile
- [ ] QR code link goes to the correct URL
- [ ] Pass can be redeemed by another user
- [ ] Telegram feed shows pass generation event
- [ ] Works on mobile and desktop

---

## Section 8: Manage Subscription and View Usage

**Goal**: Check the subscription management portal and review token usage history.

### Steps

1. Go to the Bundles page
2. Click "Manage Subscription" button
3. You should be taken to the Stripe billing portal showing:
   - Your subscription details (Resident Pro, price)
   - Payment method (test card ending 4242)
   - Invoice history
   - Option to cancel
4. Click "Return to DIY Accounting" to go back
5. Go to the Token Usage page
6. Verify:
   - Token Sources table shows your bundles and token counts
   - Token Consumption table shows your VAT submissions
   - Pass generation should appear as a consumption event (10 tokens)

### Checklist
- [ ] Manage Subscription button navigates to Stripe portal
- [ ] Stripe portal shows correct subscription info
- [ ] Return link brings you back to the site
- [ ] Token Usage page shows correct sources
- [ ] Token Usage page shows correct consumption history
- [ ] All events match the Telegram feed
- [ ] Works on mobile and desktop

---

## Throughout: Telegram and Ops Monitoring

### Live Channel

Every user action should generate an event in the Telegram test channel:
- Login/logout events
- Bundle grants and pass redemptions
- VAT submissions (with token usage)
- Checkout/subscription events
- Pass generation events

**For each section**: Verify the Telegram test channel shows the corresponding events.

### Ops Channel

| Channel        | URL                            | Description |
|----------------|--------------------------------|-------------|
| @diy-ci-ops    | https://t.me/+1IFAay17W05mY2I0 | Infrastructure and deployment events, errors, warnings. |
| @diy-prod-ops  | https://t.me/+k7jbzYLeHBo5NTBk | Infrastructure and deployment events, errors, warnings. |

Monitor the Telegram ops channel for:
- Infrastructure warnings or errors
- CloudFormation deployment events
- CloudWatch alarm transitions

**Record any incidents**: Note the time, what you were doing, and what appeared in the ops channel.

---

## Issue Reporting Template

When you find something wrong, record:

https://github.com/diy-accounting-uk/submit.diyaccounting.co.uk/issues/new?template=support.md

```
**Section**: (which section number)
**Device**: Mobile / Desktop
**Browser**: Chrome / Safari / etc.
**What happened**: (describe what you saw)
**What you expected**: (describe what should have happened)
**Screenshot**: (take a screenshot if possible)
**Telegram**: (did the event appear in Telegram? was it correct?)
**Ops channel**: (any related ops incidents?)
```
