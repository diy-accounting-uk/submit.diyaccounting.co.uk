<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN_FILING_FEE_PROTECTION: chargebacks, fraud and caps on the filing fees Submit pays on a customer's behalf

## Operator assertions (verbatim)

> Create another plan for this that will be included in the commet wave set: ```Should I board it as a machine-only row?``` Decision: "policy choice" - "contest filing-fee disputes". and "Flag the account on any dispute, and refuse further fee-bearing filings until the dispute closes." and "Optionally, ask Stripe to authenticate every fee payment". I also want to make the filing fee paying services only available to users on paid subscription plans and I want a per subscriber cap on fee paying per (suggest safe cooling off period) (so ideally a frauster would have tripped a google/microsoft or stripe fraud check before they could do too much damage) and create a per environment cap for a filing fee combined cap (which can be equal to a user cap right now I suggest 150 GBP and a we need this on the operator dashbard and an email notification (like we do for subscribers).

> Sorry, here I should have said the bramble wave set

> "Should I apply all six fixes" - all except "An early fraud warning only puts the account on hold."

> Also rather than this, we can't process the filing we shouldn't offer it and hold

(operator, 2026-11-26.)

## Status

defined 2026-11-26; its rows are in wave set bramble (`PLAN_WAVE_SET_BRAMBLE.md`), which is off `NEXT.md` until the operator boards it. `/plan-review-loop` ran three rounds. Open for the operator: a hold that arrives after a fee is paid and before its filing is sent. Today the plan files it (rule 4 holds, rule 2 is broken for that filing); the alternatives are to refuse the filing and keep the charge `paid` until the hold lifts (rule 2 holds, rule 4 is broken), or to refuse and refund, which puts Stripe secrets on the Companies House form Lambdas.

## Why

A filing fee is money Submit pays to Companies House from its own presenter credit account. A confirmation statement costs the customer £61.35, of which £50 is Companies House's fee. Today every Stripe dispute is accepted at once (`app/functions/billing/billingWebhookPost.js`, the `charge.dispute.created` case, `stripeClient.disputes.close`), a dispute flags only a subscription record, and any account with the right bundle can pay a fee the moment it signs up.

The code today:

- The fee activities are `file-confirmation-statement` (`app/functions/companies-house/companiesHouseConfirmationStatementPost.js`, the 402 at line 355) and `change-company-name`, standard and same day (`app/services/companiesHouseFormFiling.js`, `feeChoice` and `paidCharge` at line 188). A filing whose fee is waived, or filed under the customer's own presenter, is not fee-bearing.
- `app/functions/billing/billingActivityCheckoutPost.js` opens a `payment` mode Checkout Session with `metadata: { hashedSub, activityId, subjectKey, priceKey }` on the session only; the PaymentIntent and the Charge carry no metadata. Stripe Checkout collects the card, so the card is known only after payment.
- `handleActivityChargeComplete` in the webhook records the charge in the activity charges table (`<env>-env-activity-charges`, key `hashedSub` + `chargeKey` `charge#<activityId>#<subjectKey>`, with `amount`, `createdAt`, `stripePaymentIntentId`, status `paid`).
- `markChargeUsed` (`app/services/activityCharges.js`) moves the charge to `used` when the gateway takes the filing (confirmation statement post line 448, form filing line 285). `app/services/companiesHouseSubmissionStatus.js` records the receipt on acceptance (line 338) and calls `refundCharge` on rejection (line 303).
- `refundCharge` takes the raw Cognito sub, which the webhook does not have.
- The subscription record (`stripe#<subscriptionId>`) holds `hashedSub`, `bundleId`, `status`, `createdAt` (written when the subscription's first payment completes) and `currentPeriodEnd`. Nothing records a renewal as such.
- The webhook's enabled events are the `[events].enabled` list in `infra/stripe/stripe.toml`, applied by `infra/stripe/stripe-sync.js` (`infra-apply.yml`).
- The operator dashboard reads a snapshot that `app/functions/analytics/operatorSnapshotPublish.js` builds from the lake; `operatorSnapshotGet.js` only serves it.
- `OPERATOR_COPY_KINDS` in `app/functions/email/customerEmailSend.js` sends the operator a copy after a customer email of the same kind, and never for a test account.

## The rules

The aim is to keep disputes from happening, more than to win them: card schemes and Stripe judge a seller by its dispute ratio, and at a few dozen payments a month two disputes can cross the monitoring threshold for the one Stripe account that also takes every subscription. Rules 3, 4, 5, 7 and 8 stop a doubtful account or card before it can spend a fee; rule 1 recovers money after a dispute has already counted.

All the checks run when the fee is taken: at the fee checkout and again when the payment completes. A fee that passes is filed at once, and the filing paths add no check of their own (rule 4).

1. **Contest filing-fee disputes; accept subscription disputes.** A dispute on a fee payment whose filing Companies House accepted is contested automatically with the evidence: the company number, the filing kind, the submission number and acceptance time, the customer's email, and the terms' fee and refund clauses. A dispute on a fee payment whose filing was not accepted is accepted, and the charge can then not be spent. A subscription dispute keeps today's auto-accept.
2. **Any dispute or early fraud warning holds the account.** On `charge.dispute.created` and `radar.early_fraud_warning.created` for any of the account's payments, the account is held: every fee checkout and fee payment is refused, so the account starts no fee-bearing filing. A dispute that Submit wins clears its hold. A dispute that the customer won (Submit lost) and an early fraud warning keep the hold until the operator lifts it. An early fraud warning refunds nothing (operator, 2026-11-26).
3. **Paid subscribers only.** A fee checkout and a fee payment need a bundle whose catalogue `allocation` is `on-subscription`, with a Stripe subscription (`stripeSubscriptionId`) whose `subscriptionStatus` is `active`. A bundle from a pass (the comp, guest and invited bundles, or a test pass) does not qualify. Accounts on the operator list (`isOperatorEmail`, `app/lib/operators.js`) are exempt from this rule only.
4. **Seasoning and the cooling-off.** A subscriber is *unseasoned* until their subscription is 90 days old or has renewed once. An unseasoned subscriber is not offered a fee filing until 72 hours after their subscription's first successful payment: the page says from when they can file, and the server refuses a fee checkout before then. Once a fee is paid, the filing goes to Companies House at once; Submit never takes a fee for a filing it then holds (operator, 2026-11-26: "we can't process the filing we shouldn't offer it and hold"). Seasoned subscribers file at once. The hours and days are settings per environment. An operator account with no subscription counts as seasoned.
5. **Caps.** Per subscriber: £150 of fee payments in any rolling 30 days. Per environment: £150 of fee payments by *unseasoned* subscribers together in any rolling 30 days, so a fraudster, or a busy week of new customers, cannot close fee filing for established customers. Both are settings per environment and can differ later. Both count the customer's payment (£61.35 for a confirmation statement), not only Companies House's share. A payment that Submit refuses and refunds when it completes does not count. A refusal says which cap and when it lifts.
6. **Authenticate every fee payment.** The fee checkout asks Stripe for card authentication on every payment (`payment_method_options.card.request_three_d_secure: "any"`), so an authenticated fraudulent payment's chargeback is normally the card issuer's loss.
7. **The same card, a clean card.** While a subscriber is unseasoned, the fee must be paid with the card that pays the subscription (Stripe's card `fingerprint` on both payment methods). A card whose fingerprint has paid Submit for another account is refused. Stripe Checkout shows the card only after payment, so a refused card's payment is refunded at once, before the charge can be spent. Stripe's test cards give the same fingerprint to every test account, so the second check uses live-mode payments only.
8. **Stripe's risk score.** A fee charge whose `outcome.risk_level` is `elevated` or `highest` is refunded at once (the fee is unspent, so nothing is lost but Stripe's processing fee) and the account held.
9. **Visible to the operator.** The operator dashboard shows the fee payments in the window against both caps, the subscribers nearest their cap, the held accounts and the open disputes and warnings. The operator gets an email for each fee payment, each cap reached (and at 80% of the environment cap), each dispute and each early fraud warning.

## Tasks

| Id | Task | Waits on | Model | Size | Bramble wave and batch |
|---|---|---|---|---|---|
| FFP1 | Disputes and early fraud warnings: contest fee disputes with evidence, hold the account | none | Opus design, Sonnet build | ~10 files | W1 fee-disputes |
| FFP2 | The fee gate: paid subscribers only, cooling-off, the two caps, authentication, the card and risk checks | FFP1 (the hold) | Opus design, Sonnet build | ~16 files | W3 fee-gate (PAY2 owns `DataStack.java` in W2) |
| FFP3 | The operator dashboard panel and the operator emails | FFP1, FFP2 | Sonnet | ~8 files | W4 fee-ops (DUE10 and DUE11 own the email files in W2 and W3) |
| FFP4 | The pages, terms, privacy notice, FAQ and Welsh for the refusals and the rules | FFP2 (the refusal codes and the check) | Sonnet | ~9 files | W5 fee-ui |

### FFP1. Disputes and early fraud warnings

1. **The payment's account and kind.** One resolver serves `charge.dispute.created`, `charge.dispute.closed` and `radar.early_fraud_warning.created` (each carries `charge` and `payment_intent`), with the Stripe client in the event's mode.
   - A fee payment is found with `stripe.checkout.sessions.list({ payment_intent })`; the session's metadata gives `hashedSub`, `activityId` and `subjectKey`, and the charge record is read by its key.
   - A subscription payment is found through its invoice: `stripe.invoicePayments.list({ payment: { type: "payment_intent", payment_intent } })`, then the invoice's subscription. The account is the subscription record's `hashedSub`, or the invoice's `parent.subscription_details.metadata.hashedSub` when the record is not yet written (a test card's dispute can arrive before `checkout.session.completed` is handled). Today's path reads `payment_intent.invoice` (`billingWebhookPost.js:847`), which the Stripe API versions from 2025-03-31 do not return; the client uses the SDK's default version (`app/lib/stripeClient.js:51-61`, `stripe` ^23.1.0).
2. **Acceptance on the charge.** Where `companiesHouseSubmissionStatus.js` records an accepted filing (line 338), it also writes `acceptedAt` and `submissionNumber` onto the fee charge (a new conditional update in `app/data/dynamoDbActivityChargeRepository.js`, called through `activityCharges.js`). The status poll Lambda already has `UpdateItem` on the table.
3. **Contest or accept.** A fee charge with `acceptedAt` is contested: a new `app/services/disputeEvidence.js` builds the evidence as text fields (`product_description`, `customer_email_address`, `service_date`, `uncategorized_text` with the company number, filing kind, submission number and acceptance time, `refund_policy_disclosure` from the terms' section 10), and the webhook sends `stripe.disputes.update(id, { evidence, submit: true })`. A fee charge without `acceptedAt` gets today's `disputes.close`, and the charge moves to status `disputed` (a conditional update from `paid` or `used`), so `paidCharge` and `hasPaidCharge` refuse it. `refundCharge` leaves a `disputed` charge as it is, because Stripe refuses a refund of a disputed charge. A subscription dispute keeps the auto-accept.
4. **The hold.** For every dispute and early fraud warning that resolves to an account, the webhook writes a hold item in that account's own partition of the activity charges table: `chargeKey` `hold#<id>` (the dispute, warning or charge id), with the reason, the charge id and the time. One function writes the hold and publishes `account-held`; FFP2's risk check calls the same function. A gate reads holds with a Query on the account's `hashedSub` and `begins_with(chargeKey, "hold#")`, never a Scan. These items move with the account in a salt rotation and go with the account's data on deletion, because the table is already in `scripts/salt-rotation-tables.json` and `scripts/delete-user-data.js`. `charge.dispute.closed` with status `won` or `warning_closed` deletes that dispute's hold and publishes `account-hold-cleared`; `lost` keeps it.
5. **The operator lifts a hold** with a new `scripts/fee-hold-lift.mjs --env <ci|prod> --hashed-sub <hash> --id <id>`, run from the operator's SSO session. It deletes that one hold item and publishes `account-hold-cleared`.
6. **Events.** Add `radar.early_fraud_warning.created` to `[events].enabled` in `infra/stripe/stripe.toml`. Publish the activity events `fee-dispute-contested`, `early-fraud-warning`, `account-held` and `account-hold-cleared`, each with `hashedSub` and the hold id in `detail`.
7. **Grants.** In `BillingWebhookStack.java`, give the webhook `dynamodb:GetItem`, `dynamodb:Query`, `dynamodb:UpdateItem` and `dynamodb:DeleteItem` on the activity charges table beside its existing `PutItem`.

Gates: `npm test` with the webhook unit tests extended for each branch (fee contested, fee accepted, subscription accepted, subscription resolved from invoice metadata, warning held, closed won, closed lost) and a unit test of `disputeEvidence.js` on a recorded dispute object; `./mvnw clean verify`.

### FFP2. The fee gate

1. **The gate.** A new `app/services/filingFeeGate.js` answers "may this account pay this fee now?" with `{ allowed, code, until }`, for `file-confirmation-statement` and `change-company-name` only. It takes the account's hashed sub, its bundles and the fee's amount (the catalogue price row's `amount`). It checks, in this order:
   - the hold (FFP1's hold items);
   - a live paid subscription (rule 3), from the bundles, with the operator exemption;
   - the cooling-off for an unseasoned subscriber (rule 4): hours from that bundle's `createdAt`, which `handleCheckoutComplete` writes when the first payment completes;
   - the per-subscriber cap (rule 5): this fee plus the account's own `charge#` items in status `paid`, `used` or `disputed` whose `createdAt` is in the window, from a Query on its partition;
   - the environment cap (rule 5), for an unseasoned payer: this fee plus the day totals below.

   A subscriber is seasoned when the bundle's `createdAt` is `FILING_FEE_SEASONED_DAYS` old or the bundle has `renewedAt`. The webhook's `invoice.paid` sets `renewedAt` on the bundle when `billing_reason` is `subscription_cycle`, in its update and in a bundle it writes again because the item is missing. A subscriber who renewed before this lands is seasoned at the next renewal or at 90 days.
2. **The checkout.** `billingActivityCheckoutPost.js` calls the gate before it opens a fee checkout and returns a refusal as a 403 JSON with `code` and, where it applies, `until`. The codes are `fee-account-held`, `fee-needs-paid-subscription`, `fee-cooling-off`, `fee-subscriber-cap` and `fee-environment-cap`. A body with `check: true` runs the gate only and returns 200 `{ allowed: true }` or the same 403, so a page can decide before the person pays whether to offer the fee. The session sets `payment_method_types: ["card"]`, so every fee charge carries a card fingerprint, and `payment_method_options: { card: { request_three_d_secure: "any" } }`.
3. **The payment.** In the webhook, `handleActivityChargeComplete` checks a fee payment before it records the charge. It ignores a redelivered event whose session already has its charge item (same `stripeSessionId`). It reads the PaymentIntent with `latest_charge` expanded, in the event's mode, for `outcome.risk_level` and `payment_method_details.card.fingerprint`. Then it runs, in this order:
   - the risk check (rule 8, writes a hold `hold#<charge id>`, `fee-account-held`);
   - for an unseasoned subscriber, the card check against the card fingerprint of the subscription's `default_payment_method` (`fee-card-not-subscription`); a subscription payment method with no card fingerprint fails it;
   - in live mode, the card index (`fee-card-other-account`);
   - the gate again with this payment counted, which catches a hold or a cap reached after the checkout opened, for example several checkouts paid at once.

   On a refusal it refunds the PaymentIntent with `stripe.refunds.create` (idempotency key from the PaymentIntent id), records the charge with status `refunded` and `refusedCode`, and publishes `fee-refused`. When Stripe already shows the charge disputed, it records the charge as `disputed` with `refusedCode` and makes no refund. When Stripe already shows the charge refunded, the event is ignored like a redelivered one. On a pass it records the charge as `paid` as today, adds the amount to the environment day total when the payer is unseasoned, adds the fee card to the card index in live mode, and publishes `activity-charge-paid` with `amountPence` and `unseasoned` in `detail`.

   A new charge item replaces an earlier one for the same subject only when that one is `refunded` (the condition in `putActivityChargeIfAbsent` becomes "absent, or `refunded`"). Without this, a customer who pays again after a refund is charged and the payment is not recorded, because the key is one per activity and subject (`dynamoDbActivityChargeRepository.js:14-36`). A passed payment whose record fails because another session's charge for the subject is `paid`, `used` or `disputed` (two checkouts paid for one filing) is refunded and published as `fee-refused` with `fee-already-paid`, so Submit keeps no fee that no filing can spend. `refundCharge` (`activityCharges.js`) takes its idempotency key from the charge's PaymentIntent id in place of `hashedSub` and `chargeKey`, because a second payment for one subject must not reuse the first refund's key.
4. **The filing.** The two filing paths spend a paid charge as today and check nothing new. When the subject's charge carries a `refusedCode`, the 402 (`companiesHouseConfirmationStatementPost.js` at line 355, `companiesHouseFormFiling.js` at `paidCharge`) carries that `code`, so the page can say why the payment came back.
5. **A new table** `<env>-env-filing-fees` (key `pk` + `sk`) holds no account hash:
   - the environment day totals: `pk` `unseasoned`, `sk` `YYYY-MM-DD`, `pence` updated with an atomic `ADD`, read with one Query over the window;
   - the card index: `pk` `card#<fingerprint>`, `sk` `<subscriptionId>`. In live mode, `handleCheckoutComplete` adds the subscription's `default_payment_method` card, and a passed fee payment adds the fee card under the payer's subscription id. A card is "another account's" when the index holds a subscription id whose subscription record (`stripe#<id>`) has a `hashedSub` other than the payer's.

   The table goes in `DataStack.java`, its name in `DataNames.java`, the `Custom::AWS` and `Custom::EnsurePitr` counts in `SubmitEnvironmentCdkResourceTest.java`, and `noHashTables` in `scripts/salt-rotation-tables.json`, which `SaltRotationTablesTest` requires. For local runs, `FILING_FEES_DYNAMODB_TABLE_NAME` goes in `.env.test` and `.env.proxy`, and the table in `CONFIGURED_TABLES` in `app/bin/dynamodb.js`.
6. **Settings per environment.** `FILING_FEE_COOLING_OFF_HOURS` (72), `FILING_FEE_SEASONED_DAYS` (90), `FILING_FEE_CAP_PENCE_PER_SUBSCRIBER` (15000), `FILING_FEE_CAP_PENCE_PER_ENVIRONMENT` (15000) and `FILING_FEE_CAP_WINDOW_DAYS` (30). They go in `.env.ci`, `.env.prod`, `.env.proxy` and `.env.test`, and reach the Lambdas through the stack props: `SubmitApplication.java` for `BillingStack`, as `COMPANIES_HOUSE_CS_FEE_WAIVED_COMPANY_NUMBERS` does, and `SubmitEnvironment.java` for `BillingWebhookStack`, which is an environment stack. ci sets the cooling-off to 1 hour and the per-subscriber cap to 6135, so that one proof run sees a refusal, then pays, then reaches the cap. ci sets the environment cap to 61350, because each proof run adds one unseasoned fee of 6135 and ci must stay open for repeated runs in one window.
7. **Grants and environment.** `LambdaEnvironmentWiringCdkResourceTest` requires every name the gate reads in the environment of each Lambda that imports it:
   - `BillingStack.java`, the activity checkout: Query on activity charges, Query on the new table, the table name and the settings.
   - `BillingWebhookStack.java`, the webhook: Query on bundles, Query, UpdateItem and PutItem on the new table, the table name and the settings.
8. **The simulator.** `app/functions/non-lambda-mocks/mockBilling.js` answers `check: true` with `{ allowed: true }` and records a mock payment as today. The gate does not run in the simulator, so the simulator lanes keep their test pass.

Gates: `npm test` with unit tests of `filingFeeGate.js` for each code and each `until`, and webhook unit tests for each refusal at payment, a redelivered event, a disputed charge and a second payment after a refund; `./mvnw clean verify`; `npm run test:fileConfirmationStatementBehaviour-simulator`.

### FFP3. The operator dashboard panel and the operator emails

1. **The snapshot.** `app/functions/analytics/operatorSnapshotPublish.js` gains a `filingFees` block, read from `activity_events_all` in the lake with Athena (`event`, `hashed_sub`, `detail_json`):
   - the window's unseasoned total against the environment cap, and the total of all fee payments;
   - the five subscribers nearest their cap, hashed, with their totals, from `activity-charge-paid`;
   - the held accounts with their hold ids, from `account-held` minus `account-hold-cleared`;
   - the open disputes, from `dispute-created` minus `dispute-closed`.

   The caps come from the settings, which `SubmitEnvironment.java` passes through `AnalyticsStack.java` to `OperatorSnapshotPublish.java`, and that construct puts in the Lambda's environment. The dashboard page (`web/public/operator/dashboard.page.js`) shows the block as one panel.
2. **The emails.** Add the operator kinds `filing-fee-paid`, `filing-fee-cap` (a subscriber cap reached, the environment cap at 80% and at 100%), `fee-dispute` and `early-fraud-warning`. These kinds have no customer email. `customerEmailSend.js` sends them straight to `CUSTOMER_EMAIL_OPERATOR_COPY_TO`, with no address lookup. A test or synthetic account's email goes to `CUSTOMER_EMAIL_TEST_SINK`, as a test account's customer email does. The templates go in `app/lib/customerEmailTemplates.js`, with no customer email address, card or name in the subject.
3. **The requests.** The webhook requests the emails with `requestCustomerEmail({ kind, hashedSub, synthetic, data })`: on a fee payment recorded, on a total that reaches a cap or crosses 80% of the environment cap after that payment, on each dispute and on each early fraud warning.

Gates: `npm test` with the snapshot block's unit tests and the email send tests for an operator-only kind; the dashboard's browser test.

### FFP4. The pages, terms, privacy notice, FAQ and Welsh

The confirmation statement and change of company name pages (`web/public/companies-house/fileConfirmationStatement.page.js`, `changeCompanyName.page.js`) call the activity checkout with `check: true` when a fee is due. On a refusal they show the message in place of the pay button, so a fee is not offered:

| Code | Message |
|---|---|
| `fee-needs-paid-subscription` | "Filing fees are for paid subscribers." |
| `fee-cooling-off` | "Your first filing fee can be paid from <date and time>." |
| `fee-subscriber-cap` | "You have paid £X in filing fees in the last 30 days. The limit is £150. You can pay again from <date>." |
| `fee-environment-cap` | "Filing fees for new subscribers are paused until <date>." |
| `fee-account-held` | "Your account cannot pay filing fees while we check a payment." |

When a payment came back (a 402 with a `code`), the page says "We refunded your payment" and the reason:

| Code | Reason |
|---|---|
| `fee-card-not-subscription` | "Pay with the card that pays your subscription." |
| `fee-card-other-account` | "This card cannot be used for filing fees." |
| A cap or hold code | The message from the first table. |

The other pages:

- The terms' section 10 ("Bundles, tokens, fees and subscriptions") states the rules: paid subscribers only, the cooling-off, the caps, card authentication, the card checks, that a disputed fee payment for an accepted filing is contested with the filing's evidence, and that an account with a dispute or a fraud warning cannot pay fees.
- `faqs.toml` gains one answer.
- `privacy.html` says what Submit sends Stripe as dispute evidence (the company number, the filing kind, the submission number and acceptance time, the customer's email) and that Submit compares card fingerprints.
- Every new string has its Welsh in `i18n/cy.toml`.

Gates: the pages' browser tests for each message, `npm test`, `npm run build:welsh`, the Welsh proof in bramble's look wave.

## Proof

- ci: a subscriber within an hour of subscribing (ci's cooling-off) is refused a fee checkout with `fee-cooling-off`, and the page shows from when they can file. A pass-only account is refused with `fee-needs-paid-subscription`. After the cooling-off, a fee paid with a card other than the subscription's is refunded with `fee-card-not-subscription`. The subscriber then pays the same fee with the subscription card, and a second fee is refused with `fee-subscriber-cap`. A subscription paid with test card `4000000000000259` is disputed at once, and the dispute holds the account (`fee-account-held`). A subscription paid with test card `4000000000005423` gets an early fraud warning, which holds the account. The contest path is proved by the webhook and `disputeEvidence.js` unit tests, because a test card's dispute arrives before a filing can be accepted. The dashboard panel shows the holds and the dispute, and each operator email that the run causes has a `sent` outcome record (ci sends test accounts' email to the test sink).
- prod: the dashboard panel shows the environment total and cap; no customer is refused who should not be (read the `fee-refused` events and the 403 refusals in the lake for a week).
