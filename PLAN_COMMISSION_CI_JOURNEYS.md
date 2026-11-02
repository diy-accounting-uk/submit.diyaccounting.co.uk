<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN: Commission journeys J1 to J4 on ci with real Stripe test-mode events

The design that CT4b builds from. Each redeeming customer sits on a Stripe Test Clock. Real
`invoice.paid`, renewal, refund, dispute and cancel events reach the ci webhook. The release runs
at a chosen "as-of" date. The test reads the ci ledger after each step. The journeys and events
(J1 to J4, E1 to E8) are the ones that `app/system-tests/commissionJourneys.system.test.js` and
`behaviour-tests/commissionJourneys.behaviour.test.js` run against the simulator.

## User assertions

> CT4a. Commission journeys on ci: design. Real Stripe test-mode webhooks against the ci ledger: each redeeming customer on a Stripe Test Clock, so that advancing the clock produces real `invoice.paid`, renewal and cancel events; a ci-only `as-of` input on a release dispatch to read the holds at day 31, 61 and 121; the synthetic referrers this needs on ci's `FAMILY_AFFILIATE_EMAILS`, and a ci affiliate approved `casual` with a test-mode Connect account. (operator, 2026-11-01)

> A cancel does not reverse a line: a cancel inside 30 days keeps it held with `early_cancel` (operator, 2026-11-01: keep this behaviour), and only a refund or a dispute reverses it.

## Board

| Id | What | Files | Model | Blocked by |
|---|---|---|---|---|
| COMM1 | Change 3 alone: accrue the first invoice from the invoice's subscription metadata (a prod defect) | ~2 | Sonnet | — |
| CT4b | Build this design (changes 1, 2, 4 to 7) and run J1 to J4 on ci | ~20 | Sonnet | COMM1 (shares `billingWebhookPost.js`); O-CT4 steps 1 and 2 |
| CT4c | Credit payout of test-mode lines on ci (see open question 4) | ~4 | Sonnet | CT4b |

## Facts found while designing (each changes what CT4b builds)

1. **The first invoice loses its commission in most runs, on ci and on prod.** `handleInvoicePaid`
   returns when no subscription record exists (`app/functions/billing/billingWebhookPost.js:393`).
   Only `checkout.session.completed` writes that record (`billingWebhookPost.js:316`). Stripe
   delivers the two events at the same time. The webhook logs for the 30 days to 2026-11-02 show
   the miss: `ci-env-billing-webhook` logged "No subscription record found for invoice.paid" 543
   times against 741 "Processing invoice.paid". `prod-env-billing-webhook` logged 540 against 705.
   Two sampled ci subscriptions (`sub_1UW6UFFdFHdRoTOjwfOR7rhp`, `sub_1UWI18FdFHdRoTOj2he1AYci`)
   show `invoice.paid` processed before the checkout stored the record. So E1 (and the whole
   family tier, which pays month 1 only) is lost for most new subscribers. CT4b fixes it (change 3).
2. **Synthetic users never accrue.** `accrueCommission` accrues only when the record's actor is
   `customer` (`app/services/commissionLedger.js:59-62`). The actor comes from the customer's email
   (`billingWebhookPost.js:260`), and every `@test.diyaccounting.co.uk` address is `test-user`
   (`app/lib/activityAlert.js:236-238`). So no ci test user writes a line or a card record today.
3. **A cancel on a Test Clock is dated in real time.** `handleSubscriptionDeleted` writes
   `canceledAt: new Date()` (`billingWebhookPost.js:537`). The release compares it with
   `firstPaidAt`, which is the charge time on the clock (`commissionLedger.js:109`,
   `app/functions/account/commissionRelease.js:62-66`). A cancel at clock day 65 then reads as a
   cancel at day 0, so E5 would show `early_cancel`. Stripe's `subscription.ended_at` is the clock
   time on a clock and the real time everywhere else.
4. **Every ci payment with card 4242 shares one fingerprint.** `fillAndSubmitStripeTestCard` types
   4242 for every lane (`behaviour-tests/steps/behaviour-bundle-steps.js:439`). Once accrual runs
   for test users, each 4242 payer gets a card record (`commissionLedger.js:91-92`), and any line
   paid with 4242 gets `card_shared` (`commissionRelease.js:51-56`). The journeys use other test
   card numbers, one per payer.
5. **The webhook Lambda is an environment stack.** `ci-env-billing-webhook` belongs to
   `ci-env-BillingWebhookStack` (`infra/main/java/co/uk/diyaccounting/submit/SubmitSharedNames.java:228`),
   which `deploy-environment.yml` deploys (`.github/workflows/deploy-environment.yml:680-694`).
   `app/functions/billing/**` is not in that workflow's push paths (lines 47-112). A webhook change
   reaches ci only by a dispatch of `deploy-environment.yml` on the branch.
6. **`OPERATOR_EMAILS` and `FAMILY_AFFILIATE_EMAILS` are repository secrets**, shared by ci and prod
   (`gh secret list` shows both at repository level, none on the `ci` environment).
   `deploy-env-secrets.yml:231-248` writes them to `<env>/submit/operator-emails` and
   `<env>/submit/family-affiliate-emails`. Each holds 2 addresses on ci today, none synthetic.
7. **An unconditional bundle update recreates a purged bundle.** `updateBundleSubscriptionFields`
   is a plain `UpdateCommand` (`app/data/dynamoDbBundleRepository.js:343`). A late
   `customer.subscription.deleted` for a previous run's referrer subscription can set the new
   run's referrer bundle (same `hashedSub` and `bundleId`) to `canceled`. That gives a false
   `no_subscription` hold. The cleanup order below prevents it.

## Production changes (each one stays honest)

### Change 1: one config key names the environments that run test journeys

`referrals.toml`, in `[ledger]`:

```toml
testJourneyEnvironments = ["ci"]  # Stripe test-mode lines accrue for test users, and the release takes an as-of date
```

`app/services/referralConfig.js` `validateReferralConfig` requires an array of strings (it may be
empty). The key follows the `listedInEnvironments` pattern of the catalogue
(`app/services/productCatalog.js:56-60`). The list is in the repository, reviewed, and names the
environment. Prod is not on it.

### Change 2: test-user accrual in a listed environment

`commissionLedger.js` `isAccrualActor(subRecord, invoice, config)`:

- A `test-user` actor on a test-mode invoice (`invoice.livemode === false`) accrues only when
  `process.env.ENVIRONMENT_NAME` is in `config.ledger.testJourneyEnvironments`.
- Every other case keeps today's rule (lines 59-62).

The webhook Lambda has `ENVIRONMENT_NAME` (`infra/main/java/co/uk/diyaccounting/submit/stacks/BillingWebhookStack.java:177`).
Two gates keep prod clean: Stripe's own `livemode` flag, and the list. A test-mode event that
reaches prod's endpoint returns `not-customer`.

### Change 3: accrue the first invoice when the record is not yet written

`billingWebhookPost.js` `handleInvoicePaid` (line 382): when `getSubscription` finds no record,
read `invoice.parent.subscription_details.metadata`. `billingCheckoutPost` sets `hashedSub`,
`bundleId` and `actor` there (`app/functions/billing/billingCheckoutPost.js:165-167`), and Stripe
copies subscription metadata onto the invoice. With `hashedSub` present, call `accrueCommission`
with `subRecord = { hashedSub, bundleId, actor }` and return. Skip the token and bundle updates,
because `checkout.session.completed` writes them. With no `hashedSub`, keep today's warning. This
path needs no Stripe call, so it adds no failure mode.

### Change 4: the cancel time comes from Stripe

`handleSubscriptionDeleted` (line 537): `canceledAt: new Date(subscription.ended_at * 1000).toISOString()`.
`ended_at` is set on every deleted subscription. Only `commissionRelease.js:62-66` and the
simulator route read `canceledAt`.

### Change 5: the release takes an as-of date in a listed environment

`commissionRelease.js` `handler(event)` (line 102):

- With `event.asOf` absent, run `releaseCommissions(new Date())`. The EventBridge schedule
  (`infra/main/java/co/uk/diyaccounting/submit/stacks/AccountStack.java:1778-1786`) sends no `asOf`.
- With `event.asOf` present, throw unless `ENVIRONMENT_NAME` is in `testJourneyEnvironments`, and
  throw on a date that does not parse. Then run `releaseCommissions(new Date(event.asOf))`.
- Return `{ asOf: <the date used, ISO>, ...summary }`. The test asserts the echo, so a deployment
  with the old handler fails at once.

Only a direct `lambda:InvokeFunction` can send `asOf`, and IAM gates that. No API route is added.

### Change 6: a checkout on a Test Clock for a synthetic caller

`billingCheckoutPost.js` `ingestHandler`: an optional body field `testClockId`
(`/^clock_[A-Za-z0-9]+$/`).

- A caller that is not synthetic (`isSynthetic`, line 110) and sends it gets 400 `test-clock-not-allowed`.
- A synthetic caller gets a customer made first:
  `stripe.customers.create({ email: userEmail, test_clock: testClockId, metadata: { hashedSub } })`.
  The session then takes `customer: customer.id` in place of `customer_email` (lines 160-173).
- Stripe creates test clocks in test mode only, and a synthetic caller always gets the test client
  (line 156). The field changes nothing for a real customer.

`isSynthetic` comes from the verified token and the caller's bundles, the same server-side fact
that already selects test-mode Stripe. Stripe test clocks attach to a customer only at creation
(Stripe API, "Create a test clock": "Once attached, customers can't be removed from a test clock";
advanced usage: "Create a Customer, set the `test_clock` parameter"). So the server makes the
customer, and the test never passes a customer id.

### Change 7: synthetic addresses on ci's lists, without a copy of the real ones

`.github/workflows/deploy-env-secrets.yml:231-248`: append two `ci` environment **variables** to
the values written:

- `"${{ secrets.OPERATOR_EMAILS }}${{ vars.SYNTHETIC_OPERATOR_EMAILS && format(',{0}', vars.SYNTHETIC_OPERATOR_EMAILS) || '' }}"`
- the same for `FAMILY_AFFILIATE_EMAILS` with `vars.SYNTHETIC_FAMILY_AFFILIATE_EMAILS`.

The variables exist on the `ci` environment only, so prod's lists do not change. The addresses are
not secret. `parseEmailList` ignores the empty parts (`app/lib/emailList.js:17-22`).

## The journeys on ci

### Test users (durable lanes, 11)

`scripts/ensure-cognito-test-user.js ci <lane>` makes `synthetic-<lane>@test.diyaccounting.co.uk`
(`laneSlug`, line 84). Each run rotates the password and TOTP device and purges the user's bundles
(line 403, `scripts/delete-user-data.js:149-158`). It does not touch the passes or commissions tables.

| Lane | Role | Card number |
|---|---|---|
| `commission-operator` | operator: sets affiliate state | none |
| `commission-j1-referrer` | R1, J1 referrer | 5555555555554444 |
| `commission-j1-redeemer-a` | J1a: renewals, refund | 4000056655665556 |
| `commission-j1-redeemer-b` | J1b: dispute | 4000000000000259 |
| `commission-j1-redeemer-c` | J1c: pays with R1's card | 5555555555554444 |
| `commission-j2-family` | R2, J2 family referrer | 2223003122003222 |
| `commission-j2-redeemer-a` | J2a: cancel at day 10 | 5105105105105100 |
| `commission-j2-redeemer-b` | J2b: month 2 earns nothing | 4000008260000000 |
| `commission-affiliate` | RA, J3 and J4 referrer, Connect | 5200828282828210 |
| `commission-j3-redeemer` | J3a: customer tier, late cancel | 4000058260000005 |
| `commission-j4-redeemer` | J4a: casual tier | 4000000400000008 |

- `SYNTHETIC_OPERATOR_EMAILS` = `synthetic-commission-operator@test.diyaccounting.co.uk`.
- `SYNTHETIC_FAMILY_AFFILIATE_EMAILS` = `synthetic-commission-j2-family@test.diyaccounting.co.uk`.
- One referral claim per account, ever (`app/data/dynamoDbPassRepository.js:253`), so each
  redeemer is its own user, and the cleanup deletes the claims.
- J3 and J4 share RA, so one Connect account serves both. The anchor fixes the tier per redeemer at
  the first paid invoice (`commissionLedger.js:111-136`). J3a pays while RA is `applied`; J4a pays
  after RA is `approved`.
- The cards are reserved for this suite. No other lane may type them. 4000000000000259 makes a
  fraudulent dispute after the charge succeeds (Stripe test cards).

### Sign-in

The test signs in each user without a browser. It runs the ensure script per lane, reads the
`TEST_AUTH_PASSWORD=` and `TOTP_SECRET=` lines from its stdout, and calls
`logInAndAnswerChallenge` (exported, `scripts/ensure-cognito-test-user.js:186`) for an ID token.
It sends the ID token as `Authorization: Bearer` to the API, as the pages do
(`behaviour-tests/steps/behaviour-bundle-steps.js:631-645`). Run the 11 ensure calls at the same
time, with `GITHUB_OUTPUT` removed from each child's environment. Sign in again when a token is
older than 50 minutes. The only browser step is the Stripe-hosted Checkout page.

### Steps, in order

Name each Test Clock `commission-ci-<GITHUB_RUN_ID or local timestamp>-<J1|J2|J3J4>`. Wait for a
ledger state by polling, never by a fixed sleep (2 s interval, 180 s limit).

1. **Start cleanup** (the cleanup section, Stripe part first, then DynamoDB).
2. **Users.** Ensure the 11 lanes; sign in each.
3. **Referrers subscribe.** R1, R2 and RA each: `POST /api/v1/billing/checkout`
   `{ bundleId: "resident-vat", interval: "monthly" }` with no clock. Open the URL in the page, and
   call `fillAndSubmitStripeTestCard(page, screenshotPath, { cardNumber })`. Poll `GET /api/v1/bundle`
   until `resident-vat` shows `subscriptionStatus: "active"`.
4. **RA's affiliate state.** As the operator, `POST /api/v1/affiliate`
   `{ referrerHash: RA, tier: "casual", state: "applied" }`. Then read
   `GET /api/v1/affiliate/application` as RA. Stop with the setup command in the error when
   `detailsSubmitted` is not true (operator step 3).
5. **Passes.** Each referrer generates one pass per redeemer: `POST /api/v1/pass/generate` with the
   `passTypeId` that `behaviour-tests/steps/behaviour-pass-generation-steps.js` uses. R2's call
   writes its family marker (`app/functions/account/passGeneratePost.js:131-134`).
6. **Redemptions.** Each redeemer replays the bundles page's calls for its code
   (`web/public/bundles.page.js:794-890`: `POST /api/v1/pass`, then the "Request Week pass" bundle
   request). Assert a `referral#<redeemerHash>` claim exists afterwards (`GetItem` on `ci-env-passes`).
7. **Clocks.** Wait 2 s after the last redemption. Create three clocks with
   `frozen_time = floor(now)`. The customer's `created` must not precede `redeemedAt`, or the line
   gets `customer_predates_referral` (`commissionRelease.js:58-60`).
8. **First invoices (E1).** Check out J1a, J1b, J1c on the J1 clock, J2a and J2b on the J2 clock,
   and J3a on the J3J4 clock: `POST /api/v1/billing/checkout`
   `{ bundleId: "resident-vat", interval: "monthly", testClockId }`, then the card. Poll the ledger:
   - J1a, J1c: one `held` `customer` `credit` line each.
   - J1b: one `reversed` line, `reversalReason: "dispute"`. Either path ends here: the dispute
     reverses a written line (`billingWebhookPost.js:681`), or accrual sees `charge.disputed` and
     writes it reversed (`commissionLedger.js:148-150`).
   - J2a, J2b: one `held` `family` `cash` line each, `amountPence` equal to `netPence`.
   - J3a: one `held` `customer` `credit` line.
9. **Approve RA.** As the operator, `POST /api/v1/affiliate` `{ tier: "casual", state: "approved" }`.
   Expect 200. `affiliatePost.js:91-103` checks the Connect details.
10. **J4a's first invoice.** Check out J4a on the J3J4 clock. Expect one `held` `casual` `cash` line.
11. **Early cancels (E4, E8).** Cancel J1b and J1c at once (`stripe.subscriptions.cancel`). Advance
    the J2 clock to day 10 and cancel J2a.
12. **Month 2 (E6).** Advance each clock to its subscription's `current_period_end` plus 2 hours
    (`subscriptionPeriod`, `app/lib/stripeSubscriptionPeriod.js`). Stripe keeps a renewal invoice
    in draft for about an hour before it pays it. Expect a second line for J1a and J3a (`customer`)
    and J4a (`casual`). J2b gets no line (the family tier pays month 1 only).
13. **Month 3.** Advance the J1 and J3J4 clocks the same way. Expect a third line for J1a, J3a, J4a.
14. **Late cancel (E5).** Cancel J3a at the J3J4 clock's time (about day 61).
15. **Refund (E2).** `stripe.refunds.create({ charge: <J1a month-3 chargeId> })`. Expect that line `reversed`, `reversalReason: "refund"`.
16. **Releases.** Invoke the release with each as-of below (the release section). After each one,
    read every line and assert the states. "R(x)" is the line's `releaseAt`.

| As-of | Expected |
|---|---|
| R(J1a m1) − 1 s | J1a m1 `held`, no reasons |
| R(J1a m1) + 1 s | J1a m1 `payable`; J3a m1 `payable`; J1c `held` with `card_referrer`, `card_shared`, `early_cancel` |
| then cancel R1's own subscription (E7); wait for R1's bundle `canceled` | |
| max(R(J1a m2), R(J2a), R(J2b)) + 1 s | J1a m2 `held` `no_subscription`; J2a `held` `early_cancel`, `affiliate_not_approved`; J2b `held` `affiliate_not_approved`; J3a m2 `payable` |
| then the operator approves R2: `{ tier: "family", state: "approved" }` | |
| same as-of again | J2b `payable`, no payable pointer (`app/data/dynamoDbCommissionRepository.js:26-30`); J2a `held` `early_cancel` |
| R(J4a m1) − 1 s | J3a m3 `payable`; J4a m1 to m3 `held` |
| R(J4a m3) + 1 s | J4a m1 to m3 `payable`, each with a `payable#connect` pointer |

17. **Cash payout.** Invoke `<deployment>-app-commission-cash-payout`. Expect `{ status: "off" }`
    (`payCash = false`). J4a's lines stay `payable`.
18. **End cleanup.** A failure here is logged, not fatal; the next run's start cleanup repeats it.

Amounts: assert `amountPence === Math.floor(netPence * rateBps * eligibleMonths / (10000 * lineMonths))`
from the line's own fields (`commissionLedger.js:49-55`). `resident-vat` costs 99p a month, so the
amounts are small and the fee decides them. Assert holds with `expect.arrayContaining`, and assert
`toEqual` only where the table names all of them.

### The release on ci

- The function is `<DEPLOYMENT_NAME>-app-commission-release` (`infra/main/java/co/uk/diyaccounting/submit/names/AccountNames.java:989-997`;
  `ci-set1-app-commission-release` exists on ci today). Each ci deployment has one and a daily
  schedule at 03:15 (`AccountStack.java:1778-1786`). All of them work on `ci-env-commissions`.
- The test invokes it with `@aws-sdk/client-lambda` `InvokeCommand`, `Payload: {"asOf": "<ISO>"}`,
  unqualified ($LATEST, the schedule's own target). It asserts `FunctionError` is absent and the
  returned `asOf` equals the one sent.
- In GitHub the job's OIDC session is `submit-ci-deployment-role` (`AdministratorAccess`), assumed
  by `./.github/actions/aws-role`. Locally it is the `diya-submit-ci` SSO profile.
- No workflow input is added. The test interleaves releases with Stripe events, so it calls the
  release itself. An operator who wants one as-of release runs:
  `aws --profile diya-submit-ci lambda invoke --function-name ci-set1-app-commission-release --cli-binary-format raw-in-base64-out --payload '{"asOf":"2027-03-01T00:00:00.000Z"}' --region eu-west-2 /dev/stdout`
- **The schedule in between.** The daily run uses the real time. Every line's `releaseAt` is its
  charge time on the clock plus 30, 60 or 120 days (`commissionLedger.js:151`). The clocks start at
  the real time, so no line of a run is due by the real time while the run lasts. Lines that a
  failed cleanup leaves become due 30 to 120 days later. The schedule then releases or keeps them,
  and the next run's start cleanup deletes them first.
- **One release covers the whole table.** `queryDueHeldPointers` reads every held pointer up to the
  as-of (`dynamoDbCommissionRepository.js:200-206`). So assert per line, never the summary counts,
  and run one commission suite at a time. The probe-test concurrency group does that
  (`.github/workflows/probe-test.yml:348-350`).

### Reading the outcome

- Lines: `QueryCommand` on `ci-env-commissions`, `pk = commission#<referrerHash>`,
  `begins_with(sk, "line#")`, then filter by `redeemerHash`. A Query on three known partitions, never a Scan.
- Hashes: `initializeSalt` and `hashSub` from `app/services/subHasher.js` with
  `ENVIRONMENT_NAME=ci`. The salt's resource policy admits the actions role, the deploy role and
  SSO administrators (`scripts/put-salt-secret-resource-policy.sh`).
- Stripe: a client made with the test key at `ci/submit/stripe/test_secret_key`
  (`infra/stripe/stripe.toml`, `[keys.ci]`), read from Secrets Manager.

### Cleanup (run at the start and at the end)

Stripe first, in this order, because of fact 7:

1. List test clocks (`stripe.testHelpers.testClocks.list`, all pages). Delete each whose name
   starts with `commission-ci-`. Stripe: "Deleting the simulation also deletes the test customers
   associated with the clock and cancels their subscriptions."
2. For each of the 3 referrer emails, `stripe.customers.list({ email })` (clock customers are not
   listed). Note each customer's subscription ids, then `stripe.customers.del`.
3. Poll `ci-env-subscriptions` `stripe#<id>` for those ids until `status` is `canceled` (120 s
   limit). Only then ensure the lanes (which purge the bundles) and subscribe again.

Then DynamoDB, by key only:

4. For R1, R2 and RA: Query every item in `commission#<hash>` (lines, anchors, conversions,
   `totals#credit`, `totals#month#*`, `totals#taxyear#*`, payouts). For each line delete
   `charge#<chargeId>`/`line`, the held pointer `held`/`<releaseAt>#<hash>#<invoiceId>`, the payable
   pointer `payable` or `payable#connect`/`<hash>#<line sk>`, and the card records
   `card#<cardFingerprint>`/`payer#<hash>` for the 11 users. Then delete the partition's items.
   The totals must go, or `totals#credit` reaches the cap (12 × 99p) after about 47 lines.
5. `ci-env-passes`: delete `referral#<hash>` for the 7 redeemers and `affiliate#<R2 hash>`. Keep
   RA's affiliate item, which holds the Connect account. Step 4 of the journey sets it to
   `applied` each run. An `ended` state is not a reset, because an ended item drops the family
   tier (`app/services/referralConfig.js:68-70`).

Leave the passes, redemptions, `family#` markers and `ci-env-subscriptions` records. Nothing reads
them again, and Stripe deletes a clock by itself after its `deletes_after` time.

## Files CT4b creates or changes

| File | Change |
|---|---|
| `referrals.toml` | change 1 |
| `app/services/referralConfig.js` | change 1 validation |
| `app/services/commissionLedger.js` | change 2 |
| `app/functions/billing/billingWebhookPost.js` | changes 3 and 4 |
| `app/functions/account/commissionRelease.js` | change 5 |
| `app/functions/billing/billingCheckoutPost.js` | change 6 |
| `.github/workflows/deploy-env-secrets.yml` | change 7 |
| `.github/workflows/probe-test.yml` | suite option, ci guard, `DEPLOYMENT_NAME` |
| `behaviour-tests/commissionJourneysStripe.behaviour.test.js` | new: the steps |
| `behaviour-tests/helpers/commissionCi.js` | new: lanes, sign-in, clocks, ledger, release, cleanup |
| `behaviour-tests/steps/behaviour-bundle-steps.js` | `cardNumber` option |
| `scripts/commission-ci-affiliate-onboarding.js` | RA's Connect test account; CT4b replaces the hosted onboarding with the suite's own setup |
| `playwright.config.js` | project |
| `package.json` | two scripts |
| `README.md` | script table count and names |
| unit tests | listed below |

- **Unit tests.** `app/unit-tests/services/referralConfig.test.js`, `app/unit-tests/services/commissionLedger.test.js`,
  `app/unit-tests/functions/commissionRelease.test.js`, `app/unit-tests/functions/billingWebhookPost.test.js`,
  `app/unit-tests/functions/billingCheckoutPost.test.js`. Cases: the list accepts and refuses each
  actor and mode; `asOf` runs on a listed environment, throws on prod and on a bad date, and the
  schedule's event runs at the real time; `invoice.paid` with no record accrues from the invoice
  metadata and skips the bundle updates; `canceledAt` equals `ended_at`; `testClockId` makes the
  customer for a synthetic caller and gets 400 from any other caller.
- **`app/test-support/stripeSimulator.js`**: change it only if a system test sends `testClockId`.
- **`probe-test.yml`.** Add `commissionJourneysStripeBehaviour` to the `behaviour-test-suite`
  choices, and not to the scheduled matrix (line 215). Add a guard step, as for Companies House
  (lines 452-470), that fails the suite on any environment except ci. Add
  `DEPLOYMENT_NAME: ${{ needs.names.outputs.deployment-name }}` to the run step's `env` block (it starts at line 532).
  The job's own ensure step makes one more lane user, `synthetic-commission-journeys-stripe-behaviour`.
  The test does not use it.
- **`playwright.config.js`.** Project `commissionJourneysStripeBehaviour`, `testMatch`
  `**/commissionJourneysStripe.behaviour.test.js`, `workers: 1`, `timeout: 3_600_000`.
- **`package.json`.** `test:commissionJourneysStripeBehaviour` (the pattern at line 241) and
  `test:commissionJourneysStripeBehaviour-ci` (the pattern at line 233, through
  `scripts/use-deployed-base-url.js`).
- **`behaviour-bundle-steps.js:392`.** `fillAndSubmitStripeTestCard(page, screenshotPath, { cardNumber = "4242424242424242" } = {})`.
  Every caller today keeps 4242.
- **`scripts/commission-ci-affiliate-onboarding.js`.** Ensures the `commission-affiliate` lane,
  signs in, calls `POST /api/v1/affiliate/application`, and prints the onboarding URL.
- **Capability blocks.** New scripts and tests carry `@capability` blocks; follow the `capabilities`
  skill and regenerate `REPORT_CAPABILITIES.md`.
- No CDK change, and no new Lambda environment variable.

## Commands CT4b runs

```bash
npm run bundle
npx vitest --run app/unit-tests/services/referralConfig.test.js app/unit-tests/services/commissionLedger.test.js app/unit-tests/services/commissionScenarios.test.js app/unit-tests/functions/commissionRelease.test.js app/unit-tests/functions/billingWebhookPost.test.js app/unit-tests/functions/billingCheckoutPost.test.js 2>&1 | tee target/ct4b-unit.log
npx vitest --run app/system-tests/commissionJourneys.system.test.js app/system-tests/billingCheckout.system.test.js 2>&1 | tee target/ct4b-system.log
npm run test:commissionJourneysBehaviour-simulator
npm test 2>&1 | tee target/ct4b-npm-test.log
npx prettier --write <changed files>
npx eslint <changed JS files>
```

Then, after the push:

1. Dispatch the environment deploy for ci. It carries the webhook (changes 2 to 4) and the lists (change 7):
   `gh workflow run deploy-environment.yml --ref claude/<branch> -f environment-name=ci`
2. Wait for the branch's `deploy.yml`. It must finish after step 1, because the app Lambdas cache
   the email lists per container (`app/lib/emailList.js:62-68`).
3. The suite's first journey answers what a spike would: it pays a Checkout on a clock customer
   with `fillAndSubmitStripeTestCard`, and its accrual assertions fail unless
   `checkout.session.completed` stores `actor: "test-user"` (from `session.customer_details.email`,
   `billingWebhookPost.js:247`). No separate spike runs (operator, 2026-11-02).
4. Run the suite:
   `gh workflow run probe-test.yml --ref claude/<branch> -f environment-name=ci -f deployment-name=<the branch's ci deployment> -f behaviour-test-suite=commissionJourneysStripeBehaviour`
   Or locally, with `AWS_PROFILE=diya-submit-ci`:
   `DEPLOYMENT_NAME=<deployment> npm run test:commissionJourneysStripeBehaviour-ci`

## Cost and run time

- **Stripe.** Test mode costs nothing. 3 clocks, each within Stripe's limits (3 customers per
  clock, 3 subscriptions per customer, advance at most 2 intervals at a time). 6 clock advances.
- **Webhook deliveries to `ci-billing`**, about 60: 10 checkouts × 3 (session completed,
  subscription created, invoice paid), 7 renewals × 2, 5 cancels × 2, 1 refund, 2 dispute, and
  about 5 deletions from the cleanup.
- **Run time**, about 30 to 40 minutes: lanes in parallel 2 min; 10 Checkout pages at 1 to 1.5 min
  each; 6 advances with their waits, 1 to 3 min each; 7 releases and the payout 2 min; cleanup 2 min.
- **Cognito.** 12 durable users (the 11 lanes and the job's own lane), each a monthly active user
  in a month the suite runs.
- **GitHub Actions.** One Playwright-container job of about 40 minutes per run.

## Proof that counts as done

- The unit, system and simulator commands above pass, and `npm test` passes.
- One `probe-test.yml` run of `commissionJourneysStripeBehaviour` on ci is green, with every row of
  the release table asserted, and its run URL is in the PR.
- A second run straight after it is green too. That proves the start cleanup.
- `ci-env-billing-webhook` logs no "Commission accrual failed" in the run's time window.

## Operator steps (O-CT4)

Steps 1, 2 and 4 are the operator's (or Claude Code's, on the operator's yes per command); step 3
is Claude Code's, with the operator as the fallback.

1. Set the synthetic operator address on ci:
   `gh variable set SYNTHETIC_OPERATOR_EMAILS --env ci -R diy-accounting-uk/submit.diyaccounting.co.uk --body synthetic-commission-operator@test.diyaccounting.co.uk`
2. Set the synthetic family address on ci:
   `gh variable set SYNTHETIC_FAMILY_AFFILIATE_EMAILS --env ci -R diy-accounting-uk/submit.diyaccounting.co.uk --body synthetic-commission-j2-family@test.diyaccounting.co.uk`
3. The affiliate RA's Connect test account is set up by the suite itself, with no person on a
   hosted page: through the Stripe API in test mode with Stripe's published test values, or by the
   suite filling the test-mode onboarding page as it fills the card (the account is test-mode
   because the caller is synthetic, `app/functions/account/affiliateApplicationPost.js:64`).
   Operator, 2026-11-02.
4. Approve the dispatch of `deploy-environment.yml` for ci from the branch (CT4b command step 1).
   It writes ci's secrets from the branch's workflow.

## Open questions

1. **Does Stripe Checkout accept a customer on a Test Clock?** Stripe's test-clock pages show
   customers and subscriptions made through the API. No page found states it for Checkout. The
   suite's first journey settles it (command step 3). If Checkout refuses, the alternative is a subscription made
   by the API with a `pm_card_*` payment method on the clock customer. That needs the webhook to
   write the subscription record from `customer.subscription.created` metadata (change 3 covers
   the lines; `early_cancel` needs the record, `commissionRelease.js:62`). That is a larger webhook
   change, and E8 then uses Stripe's payment-method tokens in place of typed card numbers.
2. **Synthetic list entries: variables appended (chosen) or environment secrets.** The other way
   is a `ci` environment secret `OPERATOR_EMAILS` that holds the repository value plus the
   synthetic address. It needs no workflow change, but it copies the operator's real addresses,
   and a later change to the repository secret no longer reaches ci.
3. **Do the ci and prod Stripe test keys belong to one Stripe account?** `stripe.toml` registers a
   test-mode endpoint for prod as well as ci. If one account holds both, prod's webhook receives
   these journeys' test events too, as it already does for every ci payment. Changes 2 and 3 keep
   prod's ledger empty of them (the list holds only ci). Check with
   `stripe.accounts.retrieve()` on each key. Nothing in CT4b depends on the answer.
4. **The credit payout of test-mode lines (CT4c, proposed as its own row).** The credit payout
   uses the live client and skips every line with `livemode !== true`
   (`app/functions/account/commissionCreditPayout.js`, handler). The payout Lambda has no test
   key ARN (`AccountStack.java:1795-1800`). Paying J1a's and J3a's payable lines onto the test-mode
   customer balance needs the test key ARN in the stack, a per-line client chosen by `livemode`,
   and the `testJourneyEnvironments` gate. It is a CDK change in a path that moves money, so it is
   kept out of CT4b. Folding it in is the alternative; it adds about 4 files and a `./mvnw clean verify`.
5. **J1b and J1c cancel at once.** The other choice is to let them renew. That adds 4 lines with
   the same holds and 4 more webhook deliveries, and proves nothing more.
