<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Passes, bundles, tokens and referrals

This document explains how passes, bundles, tokens and referral commission work together in DIY Accounting Submit.

## Overview

The system has four parts:

1. **Passes** - Four-word passphrases that unlock access to bundles
2. **Bundles** - Access tiers that grant tokens and enable HMRC API activities
3. **Tokens** - Credits for metered activities (a VAT submission costs 1 token)
4. **Referrals** - A pass that a user generates links that user to each person who redeems it. The referrer earns commission when the redeemer pays

## How It Works

A bundle with `enable = "always"` is self-service. An authenticated user clicks "Request" on the bundles page and gets the bundle at once. `day-guest` is free, and `resident-vat`, `resident` and `resident-pro` start a Stripe subscription.

A bundle with `enable = "on-pass"` needs a pass:

1. An operator generates a pass with the `generate-pass.yml` workflow or the pass admin API. A user generates a pass on the generate pages (see Referrals and affiliates).
2. The pass is a four-word code, for example `tiger-happy-mountain-silver`, with a URL and a QR code.
3. The user opens the URL or enters the code on the bundles page.
4. The service checks that the pass is not revoked, exhausted, held for review, not yet valid, expired or restricted to another email.
5. The service adds one use to the pass and grants the bundle with its tokens.

## Pass Types

`submit.passes.toml` defines each pass type as a template with defaults. The pass record stores its own bundle, uses and dates, so a later edit to the template does not change an existing pass.

| Pass type                | Bundle              | Max uses       | Validity  | Email required | Issued by             |
| ------------------------ | ------------------- | -------------- | --------- | -------------- | --------------------- |
| `day-guest-test-pass`    | `day-guest`         | 1              | 1 day     | No             | Operator, test        |
| `day-guest-pass`         | `day-guest`         | 1              | 1 day     | No             | Operator              |
| `invited-guest`          | `invited-guest`     | 1              | 1 month   | Yes            | Operator              |
| `resident-guest`         | `resident-guest`    | 1              | Unlimited | Yes            | Operator              |
| `resident-pro-comp`      | `resident-pro-comp` | 1              | 1 year    | Yes            | Operator              |
| `operator`               | `operator`          | 1              | 1 year    | Yes            | Operator, own email   |
| `resident-vat-test-pass` | `resident-vat`      | 1              | 1 day     | No             | Operator, test        |
| `resident-vat-pass`      | `resident-vat`      | 1              | 1 day     | No             | Operator              |
| `resident-pro-test-pass` | `resident-pro`      | 1              | 1 day     | No             | Operator, test        |
| `resident-pro-pass`      | `resident-pro`      | 1              | 1 day     | No             | Operator              |
| `digital-pass`           | `day-guest`         | No cap, held at 1000 | 90 days | No        | User, 10 tokens       |
| `physical-pass`          | `day-guest`         | 1              | Unlimited | No             | User, 10 tokens       |
| `campaign-pass`          | `invited-guest`     | 1              | 3 days    | No             | User type, no generate page |

### Test and production pass types

A pass type with `test = true` (the `-test-pass` types) sets `testPass: true` on the pass record. The granted bundle then carries `qualifiers.synthetic`, and HMRC calls go to HMRC's sandbox. Use test pass types for automated tests and CI. Use the other types for real users.

### Who pays

- **Operator-issued passes**: no payment. A GitHub Actions workflow or the admin API creates them.
- **User-issued passes** (`digital-pass`, `physical-pass`): the issuer pays the `tokenCost` of the matching generate activity, 10 tokens each.
- **Subscription bundles**: Stripe Checkout creates the subscription and the webhook grants the bundle.

## Bundles

`web/public/submit.catalogue.toml` defines each bundle as an access tier.

| Bundle              | Level    | Tokens          | Refresh | Timeout   | Allocation      | Unlocked by                               |
| ------------------- | -------- | --------------- | ------- | --------- | --------------- | ----------------------------------------- |
| `default`           | -        | -               | -       | -         | Automatic       | All authenticated users                   |
| `day-guest`         | Guest    | 3               | None    | 1 day     | On-request      | Self-service; capped at 100 live holders  |
| `invited-guest`     | Guest    | 3               | Monthly | 1 month   | On-email-match  | `invited-guest`, `campaign-pass`          |
| `resident-vat`      | Resident | 100             | Monthly | -         | On-subscription | Stripe, £0.99/month                       |
| `resident`          | Resident | 100             | Monthly | -         | On-subscription | Stripe, £39/year or £3.99/month           |
| `resident-guest`    | Guest    | 3               | Monthly | Unlimited | On-email-match  | `resident-guest`                          |
| `resident-pro-comp` | Pro      | 100             | Monthly | Unlimited | On-email-match  | `resident-pro-comp`                       |
| `resident-pro`      | Pro      | Unlimited       | None    | -         | On-subscription | Stripe, £199/year or £19.99/month         |
| `operator`          | Operator | -               | -       | -         | On-email-match  | `operator`                                |

`resident` is listed on ci only and `resident-pro` is not listed on prod. The catalogue holds both until each goes live.

### Key bundle concepts

- **Tokens**: Only VAT submission and the two generate-pass activities cost tokens. Viewing obligations and returns is free.
- **Unlimited**: `tokensGranted = "unlimited"` exempts the bundle from the token count.
- **Token refresh**: A bundle with `tokenRefreshInterval` refills its tokens on the next API call after the interval.
- **Timeout**: How long the bundle stays active after allocation.
- **Capacity cap**: `day-guest` has a global cap of 100 live allocations. A pass grant skips the cap.
- **One of each**: A user holds at most one allocation of each bundle.

## Activities

An activity defines what a user can do and which bundles it needs. `submit.catalogue.toml` lists them all. The ones that touch passes:

| Activity                 | Token cost | Bundles                                                  | Display        |
| ------------------------ | ---------- | -------------------------------------------------------- | -------------- |
| `submit-vat`             | 1          | every guest, resident and pro bundle                     | With upsell    |
| `generate-pass-digital`  | 10         | `resident-vat`, `resident`, `resident-pro-comp`, `resident-pro` | On-entitlement |
| `generate-pass-physical` | 10         | `resident-vat`, `resident`, `resident-pro-comp`, `resident-pro` | On-entitlement |
| `operator-dashboard`     | 0          | `operator`                                               | On-entitlement |

The two generate activities carry `accountSetting = "passGeneration"`, so a user turns them on in account settings.

## Generating Passes

### Operator: GitHub Actions

The `generate-pass.yml` workflow creates passes and stores them in DynamoDB. Go to Actions > Generate Pass > Run workflow and set:

- **pass-type**: an operator pass type from the table above
- **environment**: `ci` or `prod`
- **email**: required for `invited-guest`, `resident-guest`, `resident-pro-comp` and `operator`
- **max-uses**, **validity-period**, **quantity**, **notes**: optional overrides
- **generate-hmrc-user**: creates an HMRC sandbox test user
- **generate-cognito-user**: creates a Cognito native login user

The workflow also runs daily at 09:00 UTC and on a push that changes `submit.passes.toml`, `app/services/passService.js` or `app/lib/emailHash.js`. Both runs make a test pass for CI.

The workflow writes pass codes and URLs to the step summary. It uploads QR code PNGs and annotated SVGs as artifacts with 30-day retention, and prints HMRC sandbox credentials on request.

### Operator: command line

`node scripts/generate-pass.js <pass-type> <environment>` creates passes with no QR output. `node scripts/generate-pass-with-qr.js` is the script the workflow runs.

### Operator: API

`POST /api/v1/pass/admin` creates a pass. It needs an ID token (`Authorization: Bearer`) for an operator or a `synthetic-*@test.diyaccounting.co.uk` user. Only an operator may restrict a pass to an email. A test user may create `day-guest`, `invited-guest`, `resident-vat`, `resident` and `resident-pro` passes, always as test passes.

### User: generate pages

A signed-in user with a bundle that holds the activity opens `passes/generate-digital.html` or `passes/generate-physical.html`. The page posts to `POST /api/v1/pass/generate`. The service charges 10 tokens, creates the pass with `issuedBy` set to the user's hashed sub, and returns the code. The page shows the link and a QR code.

## Pass Redemption Flow

1. The user opens `https://submit.diyaccounting.co.uk/bundles.html?pass=tiger-happy-mountain-silver`. `web/public/widgets/pass-redeemer.js` redeems a `?pass=` parameter on any page that includes it.
2. A user who is not signed in goes to login and returns to the pass URL.
3. `POST /api/v1/pass` validates the pass and adds one use.
4. The service grants the bundle with its tokens and skips the capacity cap.
5. A bundle with `allocation = "on-pass-on-subscription"` answers valid with `requiresSubscription` and grants nothing until a Stripe subscription exists.

### Validation failure reasons

| Code               | Meaning                                                  |
| ------------------ | -------------------------------------------------------- |
| `not_found`        | The code does not exist                                  |
| `revoked`          | An operator revoked the pass                             |
| `exhausted`        | `useCount` has reached `maxUses`                         |
| `held_for_review`  | `useCount` has reached `reviewLimit`; an operator must release it |
| `not_yet_valid`    | `validFrom` is in the future                             |
| `expired`          | `validUntil` has passed                                  |
| `wrong_email`      | The user's email does not match the restriction          |
| `email_required`   | The pass needs an email and none is available            |

A referral pass adds two refusals on `POST /api/v1/pass`: `own_pass` (403, the issuer cannot redeem it) and `referral_already_used` (409, an account redeems one referral pass, ever).

## Referrals and affiliates

### How a pass links a referrer to a redeemer

A pass with `issuedBy` set is a referral link. `issuedBy` holds the hashed sub of the account that generated it.

1. The redeemer opens the link. `passPost.js` claims one referral for that account: `referral#<hashedSub>` in the passes table holds the code, and a second claim fails.
2. The service redeems the pass and grants the bundle with `acquisition.ref` set to the code.
3. `passPost.js` stores `redemption#<code>#<hashedSub>` with the issuer, the pass type and the time.
4. A failed redemption releases the claim.

The ledger reads these items to find the referrer of a paying account.

### Referral terms

`referrals.toml` sets the tiers and the `[ledger]` switches. `app/services/referralConfig.js` loads and validates it. An approved affiliate earns the tier its affiliate item names. Every other referrer earns the `defaultTier`, `customer`.

| Tier       | Share of net                  | Form and payout                | Release after | Caps                          | Paid from |
| ---------- | ----------------------------- | ------------------------------ | ------------- | ----------------------------- | --------- |
| `customer` | 33%, first 3 months           | Credit, Stripe customer balance | 30 days      | 12 free months of credit      | -         |
| `casual`   | 33%, first 3 months           | Cash, Stripe Connect Express   | 120 days      | £100 a month, £1,000 a tax year | £5      |
| `creator`  | 33%, first 3 months           | Cash, Stripe Connect Express   | 120 days      | £100 a month, £1,000 a tax year | £5      |
| `family`   | 100% of the first month's net | Cash, operator bank transfer   | 60 days       | £1,000 a tax year             | -         |

- Release time counts from the payment.
- Connect payouts are for GB accounts only.
- The operator pays `family` by bank transfer from the ledger figure.
- An annual subscription pays the same share of the months that fall inside the window. A customer or affiliate tier pays 33% of three twelfths of the net. `family` pays one twelfth.
- `[ledger]` holds the switches. `accrue` lets `invoice.paid` write lines. `payCredit` lets the monthly job move credit onto customer balances, and it is on. `payCash` lets the cash payout job pay Connect transfers, and that job reads it.
- A family affiliate list marks a referrer as `family`. The list is the Secrets Manager secret `{env}/submit/family-affiliate-emails`, set from the GitHub secret `FAMILY_AFFILIATE_EMAILS`. It works as `{env}/submit/operator-emails` does for operators.

### The life of a commission line

| State      | How a line gets there                                                            |
| ---------- | -------------------------------------------------------------------------------- |
| `held`     | `invoice.paid` writes the line with `releaseAt` set to the charge time plus the tier's hold days |
| `payable`  | The daily release job finds no hold and no cap refusal                           |
| `paid`     | The payout job pays it                                                           |
| `reversed` | A refund or dispute on the charge reverses it                                    |

**Write.** `billingWebhookPost.js` calls `accrueCommission` in `app/services/commissionLedger.js` on every `invoice.paid`.

- The call does nothing when `accrue` is off, for an account that is not a customer, or for an account with no referral claim.
- It reads the invoice with its charge and balance transaction from Stripe. It handles GBP only.
- It records the card fingerprint of the payer.
- It finds the referrer through the referral claim and the redemption record.
- At the first paid invoice it writes an anchor for the pair that fixes the tier, rate, months, hold days and the window start. A later change of tier does not touch an existing anchor.
- It writes one line per invoice with gross, fee and net pence, the eligible months and the amount. The line key is the invoice, so a repeat delivery writes nothing.
- A failure here is logged and does not fail the webhook.

**Release.** `commissionRelease.js` runs daily. For each held line past its `releaseAt` it checks these holds. A line with any hold stays held and records the reasons.

| Hold reason                  | Meaning                                                              |
| ---------------------------- | -------------------------------------------------------------------- |
| `volume`                     | One pass brought in more conversions in a day than `volumeHoldConversionsPerDay` |
| `card_referrer`              | The referrer paid with the same card                                 |
| `card_shared`                | Another account paid with the same card                              |
| `customer_predates_referral` | The customer account is older than the redemption                    |
| `early_cancel`               | The subscription ended within `earlyCancelDays` of the first payment |
| `affiliate_not_approved`     | A cash tier, and the referrer is not an approved affiliate           |
| `no_subscription`            | A credit tier, and the referrer holds no live subscription           |
| `cap_month`, `cap_tax_year`, `cap_credit` | The line would pass a cap in the tier                   |

A line with no hold becomes `payable` in one transaction. The same transaction adds its amount to the cap totals for the month, the tax year or the credit.

**Pay.**

- Credit: `commissionCreditPayout.js` runs monthly and does nothing while `payCredit` is off. For each payable credit line it creates a negative balance transaction on the referrer's Stripe customer, keyed by the line so a retry cannot pay twice. A referrer with no customer or live subscription keeps the line payable.
- Cash: the cash payout job reads `payCash`. A `family` line is paid by the operator's bank transfer from the ledger figure.

**Reverse.** `billingWebhookPost.js` calls `reverseCommissionForCharge` on `charge.refunded` and on `charge.dispute.created`. A held or payable line becomes `reversed`, and a payable line leaves the cap totals. A paid line gets a second, negative line in state `payable`. For credit, the payout job debits the unused credit back from the customer balance. A partial refund reverses the whole line. Reversal runs whether or not `accrue` is on.

### Affiliates

A referrer becomes an affiliate through Stripe Connect.

1. A signed-in user opens the "Become an affiliate" section on `bundles.html` and clicks "Apply with Stripe". `POST /api/v1/affiliate/application` creates a GB Express Connect account and returns a Stripe-hosted onboarding link for that user only. The affiliate item `affiliate#<referrerHash>` takes state `applied`.
2. `GET /api/v1/affiliate/application` reads the account from Stripe while the state is `applied` and answers the state, the tier and two flags: details submitted, transfers active.
3. An operator sets the tier and state in the Affiliates section of `bundles.html`, which calls `POST /api/v1/affiliate`. The states are `applied`, `approved` and `ended`. Approving a Connect tier needs a stored account with details submitted, else the call answers 409. `GET /api/v1/affiliate?referrerHash=<hash>` reads one affiliate.

Section 22 of `web/public/terms.html` states the terms for affiliates and for customers who share a pass.

### Track performance

| Who             | Where                                      | What it shows                                                         |
| --------------- | ------------------------------------------ | --------------------------------------------------------------------- |
| Pass owner      | "My generated passes" on `bundles.html`    | Per pass and in total: uses, new accounts, filed, subscribers, paid charges, last used |
| Operator        | The operator dashboard                     | The passes held for review, the operators, and a family affiliates table |
| Operator        | Athena view `v_affiliate_commissions_monthly` | Pence held, payable, paid and reversed, and line count, by month and tier |

**Pass-figures card.** Each pass in "My generated passes" carries a figures card, and a totals row follows the list. `passFiguresPublish.js` reads the Athena view `v_pass_performance` nightly and stores one `figures#<code>` item per pass. `GET /api/v1/pass/my-passes` returns up to 50 passes with those figures. A count below 3 new accounts is withheld (`null`), and so are the other counts of that pass, so a figure cannot point at one person. The totals row leaves out passes under the minimum unless together they reach it. Each pass has a Post button. It opens the marketing site with the pass code (`marketing.diyaccounting.co.uk`, or `ci-marketing.diyaccounting.co.uk` off prod) so the user can post the link.

**Held passes.** A pass with `reviewLimit` is held when `useCount` reaches it. `digital-pass` holds at 1000. An operator sees the held passes (`GET /api/v1/pass/held`) in the operator dashboard and in "My generated passes" on `bundles.html`. The Release button calls `POST /api/v1/pass/release` with `raiseBy: 1000`.

**Operator dashboard.** `web/public/operator/dashboard.html` shows the operators, who are the emails in `{env}/submit/operator-emails`. It also shows a family affiliates table: passes generated, link clicks, redeemed, converted to paid, by window.

**Athena.** `infra/main/resources/analytics/views/v_affiliate_commissions_monthly.sql` reduces each line to its latest state from `dynamo_commissions`. It counts live-mode lines only, by month of the charge. A reversal of a paid line counts in `reversed_pence`, and the original stays in `paid_pence`.

## Using a pass with `npm start` (simulator)

The simulator runs locally with dynalite, a mock OAuth server and an HMRC simulator. `npm start` runs `scripts/start-simulator.sh`. Dynalite, the HTTP simulator and the web server each take an OS-assigned port. The web server prints `Listening at http://127.0.0.1:<port>`.

`POST /api/v1/pass/admin` needs an ID token for an operator or a synthetic test user. Set `ID_TOKEN` to that token and `BASE_URL` to the printed address.

### Day guest example

```bash
# 1. Start the simulator with its output in a file
npm start > target/simulator.log 2>&1 &
BASE_URL=$(grep -o 'Listening at .*' target/simulator.log | sed 's/Listening at //')

# 2. Create a day-guest test pass and open it
PASS_CODE=$(curl -s -X POST "$BASE_URL/api/v1/pass/admin" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ID_TOKEN" \
  -d '{
    "passTypeId": "day-guest-test-pass",
    "bundleId": "day-guest",
    "validityPeriod": "P1D",
    "maxUses": 1,
    "createdBy": "manual"
  }' | jq '.code' --raw-output) \
&& echo "Generated pass code: $PASS_CODE" \
&& open "$BASE_URL/bundles.html?pass=$PASS_CODE"
```

You can also sign in first and enter the code in the pass field. The flow: enter the code, click "Redeem pass", then click "Request Day pass" to receive the bundle.

### Resident Pro example

```bash
PASS_CODE=$(curl -s -X POST "$BASE_URL/api/v1/pass/admin" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ID_TOKEN" \
  -d '{
    "passTypeId": "resident-pro-test-pass",
    "bundleId": "resident-pro",
    "validityPeriod": "P1D",
    "maxUses": 1,
    "createdBy": "manual"
  }' | jq '.code' --raw-output) \
&& echo "Generated pass code: $PASS_CODE" \
&& open "$BASE_URL/bundles.html?pass=$PASS_CODE"
```

`resident-pro` is a self-service subscription, so the pass grants the bundle directly. The simulator fakes Stripe (`app/functions/non-lambda-mocks/mockBilling.js`).

### Notes

- A test pass has `testPass: true` and routes to the HMRC sandbox.
- Passes live in local dynalite, not in DynamoDB.
- Mock OAuth signs you in with no real login.
- A pass code is four random words.

## Architecture

### Configuration files

| File                               | Purpose                                                   |
| ---------------------------------- | --------------------------------------------------------- |
| `submit.passes.toml`               | Pass type templates                                       |
| `web/public/submit.catalogue.toml` | Bundle and activity definitions (runtime catalogue)       |
| `referrals.toml`                   | Referral tiers and the ledger switches                    |

### Key source files

| File                                                  | Purpose                                                     |
| ----------------------------------------------------- | ----------------------------------------------------------- |
| `app/services/passService.js`                         | Pass creation, validation, redemption, review holds, referral claim and redemption record |
| `app/services/productCatalog.js`                      | Parse the catalogue and pass types, filter bundles and activities |
| `app/services/tokenEnforcement.js`                    | Token consumption and enforcement                           |
| `app/services/commissionLedger.js`                    | Accrue and reverse commission lines                         |
| `app/services/referralConfig.js`                      | Load and validate `referrals.toml`, resolve a tier          |
| `app/services/affiliateConnect.js`                    | Stripe Connect account, onboarding link and status read     |
| `app/functions/account/passPost.js`                   | `POST /api/v1/pass` (redeem)                                |
| `app/functions/account/passGet.js`                    | `GET /api/v1/pass` (check without redeeming)                |
| `app/functions/account/passAdminPost.js`              | `POST /api/v1/pass/admin` (operator or test user creates)   |
| `app/functions/account/passGeneratePost.js`           | `POST /api/v1/pass/generate` (user pays tokens)             |
| `app/functions/account/passMyPassesGet.js`            | `GET /api/v1/pass/my-passes` (issued passes with figures)   |
| `app/functions/account/passHeldGet.js`                | `GET /api/v1/pass/held` (operator list)                     |
| `app/functions/account/passReleasePost.js`            | `POST /api/v1/pass/release` (operator lifts a hold)         |
| `app/functions/account/affiliateApplicationPost.js`   | `POST /api/v1/affiliate/application`                        |
| `app/functions/account/affiliateApplicationGet.js`    | `GET /api/v1/affiliate/application`                         |
| `app/functions/account/affiliatePost.js`              | `POST /api/v1/affiliate` (operator sets tier and state)     |
| `app/functions/account/affiliateGet.js`               | `GET /api/v1/affiliate` (operator reads one)                |
| `app/functions/account/commissionRelease.js`          | Daily job: held to payable                                  |
| `app/functions/account/commissionCreditPayout.js`     | Monthly job: credit to Stripe customer balance              |
| `app/functions/billing/billingWebhookPost.js`         | Stripe webhook: grants, renewals, accrual, reversal         |
| `app/functions/analytics/passFiguresPublish.js`       | Nightly per-pass figures                                    |
| `app/functions/account/bundlePost.js`                 | `POST /api/v1/bundle` (grant)                               |
| `app/functions/account/bundleGet.js`                  | `GET /api/v1/bundle` (list with capacity)                   |
| `app/data/dynamoDbPassRepository.js`                  | Passes, claims, redemptions, affiliates, figures            |
| `app/data/dynamoDbCommissionRepository.js`            | Commission lines, anchors, pointers and cap totals          |
| `app/data/dynamoDbBundleRepository.js`                | Bundle and token records                                    |
| `app/lib/passphrase.js`                               | Four-word passphrase generation                             |
| `app/lib/emailHash.js`                                | Deterministic HMAC-SHA256 email hashing                     |
| `app/lib/operators.js`                                | The operator email list                                     |
| `app/lib/qrCodeGenerator.js`                          | QR code generation (PNG, SVG, annotated)                    |
| `scripts/generate-pass.js`                            | Local command line pass generation                          |
| `scripts/generate-pass-with-qr.js`                    | Pass generation with QR codes                               |
| `web/public/passes/generate-digital.html`             | Generate page for the digital pass                          |
| `web/public/passes/generate-physical.html`            | Generate page for the physical pass                         |
| `web/public/bundles.page.js`                          | Bundles page: pass entry, my passes, figures, affiliate sections |
| `web/public/operator/dashboard.page.js`               | Operator dashboard                                          |

### DynamoDB tables

| Table                      | Purpose                                                                  |
| -------------------------- | ------------------------------------------------------------------------ |
| `{env}-env-passes`         | Passes (`pass#`), held pointers, referral claims, redemptions, affiliates, figures |
| `{env}-env-bundles`        | User bundle allocations and token tracking                               |
| `{env}-env-commissions`    | Commission lines, anchors, conversion counts, card payers, pointers, cap totals |

### Analytics views

| View                                | Purpose                                                          |
| ----------------------------------- | ---------------------------------------------------------------- |
| `v_pass_performance`                | Uses, new accounts, filers, subscribers, paid charges per pass   |
| `v_pass_redemptions_daily`          | Redemptions by day                                               |
| `v_affiliate_commissions_monthly`   | Commission by month, tier and state                              |

### Workflow

| Workflow                              | Purpose                              |
| ------------------------------------- | ------------------------------------ |
| `.github/workflows/generate-pass.yml` | Generate passes with GitHub Actions  |

## Current Status

- `day-guest` is self-service with a global cap of 100.
- `resident-vat`, `resident` and `resident-pro` are self-service Stripe subscriptions.
- Operators generate the operator pass types. Signed-in users generate `digital-pass` and `physical-pass` for 10 tokens.
- A referral pass links its issuer to each redeemer. `invoice.paid` writes held commission lines under the tiers above.
- The daily release job and the monthly credit payout job run on schedules.
- Subscription handling covers `checkout.session.completed`, `invoice.paid`, `customer.subscription.updated`, `customer.subscription.deleted` and `invoice.payment_failed`, with the Customer Portal for management.

## Human Behaviour Tests

The behaviour tests walk the path a real user follows from first login to subscription.

### The Human Test Journey

`behaviour-tests/payment.behaviour.test.js` runs these steps:

1. Log in with Cognito (native in CI, Google in prod, mock in proxy and simulator).
2. Redeem a test pass for `day-guest` and receive 3 tokens.
3. Use all 3 tokens on VAT submissions to HMRC's sandbox.
4. See the activities disabled with "Insufficient tokens" and an upsell link.
5. Open the `resident-pro` checkout.
6. Pay with a Stripe test card.
7. Submit a VAT return to HMRC's sandbox.
8. Check `/usage.html` for sources and consumption.
9. Check that each step sends its Telegram message to the right channel.

### Payment across environments

| Environment | Stripe behaviour                        | How it works                                                                                           |
| ----------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Simulator   | Completes at once                       | `mockBilling.js` redirects to `/simulator/checkout`, which grants the bundle and returns to `bundles.html?checkout=success` |
| Proxy       | Real Stripe test mode                   | The Express server calls the Stripe test API and the test enters card `4242 4242 4242 4242`            |
| CI          | Real Stripe test mode                   | The deployed Lambda calls the Stripe test API                                                          |
| Prod        | Test when `testPass`, live otherwise    | `qualifiers.synthetic` picks the checkout key; `qualifiers.stripeTestMode` picks the portal key        |

### Behaviour test files

| Test file                               | What it tests                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------------ |
| `payment.behaviour.test.js`             | Guest, exhaustion, checkout, submission and usage                              |
| `passRedemption.behaviour.test.js`      | Pass create, validate, redeem and grant                                        |
| `tokenEnforcement.behaviour.test.js`    | Token use, exhaustion and activity disabling for different token limits        |
| `generatePassActivity.behaviour.test.js` | Generating digital and physical passes                                        |

### Running behaviour tests

```bash
# Simulator (local, fakes payment)
npm run test:paymentBehaviour-simulator

# Proxy (local over native HTTPS, real Stripe test via stripe listen)
npm run test:paymentBehaviour-proxy

# CI (deployed to AWS)
npm run test:paymentBehaviour-ci

# Production
npm run test:paymentBehaviour-prod
```

### Test pass routing

A test pass (`testPass: true`) sets `qualifiers.synthetic = true` on the granted bundle. That drives:

- **HMRC**: HMRC's sandbox API, set by `sessionStorage.hmrcAccount`
- **Stripe**: test mode, set by `STRIPE_TEST_PRICE_ID`
- **Telegram**: the test channel, set by actor classification
- **Developer tools**: the wrench icon appears
