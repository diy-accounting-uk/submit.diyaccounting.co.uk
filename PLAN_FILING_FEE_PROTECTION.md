<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN_FILING_FEE_PROTECTION: chargebacks, fraud and caps on the filing fees Submit pays on a customer's behalf

## Operator assertions (verbatim)

> Create another plan for this that will be included in the commet wave set: ```Should I board it as a machine-only row?``` Decision: "policy choice" - "contest filing-fee disputes". and "Flag the account on any dispute, and refuse further fee-bearing filings until the dispute closes." and "Optionally, ask Stripe to authenticate every fee payment". I also want to make the filing fee paying services only available to users on paid subscription plans and I want a per subscriber cap on fee paying per (suggest safe cooling off period) (so ideally a frauster would have tripped a google/microsoft or stripe fraud check before they could do too much damage) and create a per environment cap for a filing fee combined cap (which can be equal to a user cap right now I suggest 150 GBP and a we need this on the operator dashbard and an email notification (like we do for subscribers).

> Sorry, here I should have said the bramble wave set

(operator, 2026-11-26.)

## Status

defined 2026-11-26; its rows are in wave set bramble (`PLAN_WAVE_SET_BRAMBLE.md`), which is off `NEXT.md` until the operator boards it. Run `/plan-review-loop` on this plan before the rows are boarded.

## Why

A filing fee is money Submit pays to Companies House from its own presenter credit account before the customer's payment can be clawed back. A confirmation statement costs the customer £61.35, of which £50 is Companies House's fee; a change of company name carries Companies House's standard or same-day fee. Today every Stripe dispute is accepted at once (`app/functions/billing/billingWebhookPost.js`, the `charge.dispute.created` case, `stripeClient.disputes.close`), the dispute flags only a subscription record, and any signed-in account with the right bundle can pay a fee the moment it signs up. A fraudster with stolen cards could file and leave Submit with the Companies House fees, the refunds and Stripe's dispute fees.

The fee-bearing activities today: the confirmation statement (`STRIPE_PRICE_ID_FILE_CONFIRMATION_STATEMENT`, `app/functions/companies-house/companiesHouseConfirmationStatementPost.js`, the 402 "pay before submitting" at line ~358) and the change of company name, standard and same day (`STRIPE_PRICE_ID_CHANGE_COMPANY_NAME_STANDARD` and `_SAME_DAY`, `app/services/companiesHouseFormFiling.js` `feeChoice` and `paidCharge`, line ~185). Fees are bought through `app/functions/billing/billingActivityCheckoutPost.js` and marked used on Companies House's acceptance (`app/services/companiesHouseSubmissionStatus.js`).

## The rules

1. **Contest filing-fee disputes; accept subscription disputes.** A dispute on a fee payment whose filing Companies House accepted is contested automatically with the evidence: the submission number and acceptance time, the receipt, the account's sign-in record (provider and time, no IP address stored beyond what the logs already hold), and the terms' fee and refund clauses. A fee payment whose filing was never accepted is refunded and the dispute accepted. A subscription dispute keeps today's auto-accept.
2. **Any dispute or early fraud warning holds the account.** On `charge.dispute.created` and `radar.early_fraud_warning.created` for any of the account's payments, the account is held: no fee checkout and no fee-bearing filing until every dispute on it has closed. A closed dispute that the customer won (Submit lost) keeps the hold until the operator lifts it.
3. **Paid subscribers only.** A fee checkout and a fee-bearing filing need a live paid Stripe subscription (Resident Ltd, Resident Pro or Resident Tax Agent, monthly or yearly). A bundle from a pass (the comp, guest and invited bundles) does not qualify. Accounts on the operator list (`app/lib` operator emails) are exempt from this rule only.
4. **Cooling-off.** The first fee checkout is allowed 72 hours after the subscription's first successful payment. Card fraud usually shows within that time as a Stripe early fraud warning, a Radar block or a failed renewal, and a sign-in provider's own account checks have run. 72 hours is the suggestion; it is one setting per environment.
5. **Caps.** Per subscriber: £150 of fee payments in any rolling 30 days. Per environment: £150 of fee payments by all subscribers together in any rolling 30 days. Both are settings per environment and can differ later; both count the customer's payment (£61.35 for a confirmation statement), not only Companies House's share. A refused payment says which cap and when it lifts.
6. **Authenticate every fee payment.** The fee checkout asks Stripe for card authentication on every payment (`payment_method_options.card.request_three_d_secure: "any"`), so an authenticated fraudulent payment's chargeback is normally the card issuer's loss.
7. **Visible to the operator.** The operator dashboard shows the fee payments in the window against both caps, the subscribers nearest their cap, the held accounts and the open disputes and warnings. The operator gets an email (the same mechanism as the subscriber copy, `OPERATOR_COPY_KINDS` in `app/functions/email/customerEmailSend.js`) for each fee payment, each cap reached (and at 80% of the environment cap), each dispute and each early fraud warning.

## Tasks

| Id | Task | Model | Size | Bramble wave and batch |
|---|---|---|---|---|
| FFP1 | Disputes and early fraud warnings: contest fee disputes with evidence, hold the account | Opus design, Sonnet build | ~6 files | W1 fee-disputes |
| FFP2 | The fee gate: paid subscribers only, cooling-off, the two caps, authentication on every fee payment | Opus design, Sonnet build | ~12 files | W3 fee-gate (PAY2 owns `DataStack.java` in W2) |
| FFP3 | The operator dashboard panel and the operator emails | Sonnet | ~8 files | W4 fee-ops (AC7 owns `operatorSnapshotGet.js` in W2; DUE10 and DUE11 own the email files in W2 and W3) |
| FFP4 | The pages, terms, FAQ and Welsh for the refusals and the rules | Sonnet | ~8 files | W5 fee-ui |

### FFP1. Disputes and early fraud warnings

In `billingWebhookPost.js`: for `charge.dispute.created`, find the payment's kind from the checkout session or payment intent metadata (the activity checkout records the activity id and subject key; read `billingActivityCheckoutPost.js` for the field names). A fee payment whose charge is marked used (`markChargeUsed`) is contested: build the evidence from the Companies House receipt (submission number, acceptance time, company number) and the account record, and submit it with `stripe.disputes.update(id, { evidence, submit: true })` (a new `app/services/disputeEvidence.js`, unit-tested with a recorded dispute object). A fee payment that is not used is refunded through the existing refund path and the dispute accepted. A subscription payment keeps the auto-accept. For every dispute and for `radar.early_fraud_warning.created` (add it to the webhook's events in `infra/stripe/stripe-sync.js` or wherever the endpoint's enabled events are set), write a hold on the account (an attribute on the account's record, keyed by the hashed sub, queried by key, never scanned) with the dispute or warning id; `charge.dispute.closed` with status `won` (Submit won) clears that id's hold; `lost` keeps it for the operator. Publish activity events `fee-dispute-contested`, `account-held`, `account-hold-cleared`. Gates: `npm test`, the webhook unit tests extended for each branch.

### FFP2. The fee gate

One module (`app/services/filingFeeGate.js`, new) answers "may this account pay this fee now?" with a reason and a time it lifts: the hold (FFP1), a live paid Stripe subscription (rule 3, with the operator exemption), the cooling-off from the subscription's first successful payment (rule 4), and the two caps over the rolling 30 days (rule 5). Both `billingActivityCheckoutPost.js` (before a fee checkout) and the two filing paths (`companiesHouseConfirmationStatementPost.js`, `companiesHouseFormFiling.js`) call it, so a fee bought before a hold or a cap still cannot file while the account is held. The caps need the fee payments by account and by environment over 30 days without a Scan: record each paid fee in a small ledger table with the account as key and a date sort key, plus one item per environment and day holding that day's total (atomic `ADD`), so the environment total is 30 key reads; the table goes in `DataStack.java` with its names in `DataNames.java` and the counts in `infra/test/java` named "from -> to". Settings per environment through the stack's Lambda environment: `FILING_FEE_COOLING_OFF_HOURS` (72), `FILING_FEE_CAP_PENCE_PER_SUBSCRIBER` (15000), `FILING_FEE_CAP_PENCE_PER_ENVIRONMENT` (15000), `FILING_FEE_CAP_WINDOW_DAYS` (30). The fee checkout session sets `payment_method_options.card.request_three_d_secure: "any"`. The refusal is a 403 JSON with `code` (`fee-account-held`, `fee-needs-paid-subscription`, `fee-cooling-off`, `fee-subscriber-cap`, `fee-environment-cap`) and `until` where it applies. The simulator and the mock billing (`app/functions/non-lambda-mocks/mockBilling.js`) honour the gate. Gates: `npm test`, `./mvnw clean verify`, `npm run test:fileConfirmationStatementBehaviour-simulator` with a step for each refusal.

### FFP3. The operator dashboard panel and the operator emails

The operator snapshot (`app/functions/analytics/operatorSnapshotGet.js`) gains a `filingFees` block from FFP2's ledger and FFP1's holds: the window's environment total and cap, the five subscribers nearest their cap (hashed, with their total), the held accounts with their dispute or warning ids, and the open disputes. The dashboard page shows it as one panel. The operator email gains the kinds `filing-fee-paid`, `filing-fee-cap` (subscriber cap reached, environment cap at 80% and reached), `fee-dispute` and `early-fraud-warning`, through the same send path as `subscription-started` (`OPERATOR_COPY_KINDS`, `app/lib/customerEmailTemplates.js`), with no customer email, card or name in the subject. Gates: `npm test`, the dashboard's browser test, the snapshot's unit tests.

### FFP4. The pages, terms, FAQ and Welsh

The confirmation statement and change of company name pages show each refusal in plain words before the person pays: "Filing fees are for paid subscribers", "Your first filing fee can be paid from <date and time>", "You have paid £X in filing fees in the last 30 days, the limit is £150; you can pay again from <date>", "Filing fees are paused across Submit until <date>", "Your account is on hold while a payment dispute is open". The terms' section 10 (fees and refunds) states the rules: paid subscribers only, the cooling-off, the caps, card authentication, that a disputed fee payment for an accepted filing is contested with the filing's evidence, and that an account with an open dispute cannot pay fees. The FAQ gains one answer. Welsh for every new string. Gates: the pages' browser tests, `npm test`, `npm run build:welsh`, the Welsh proof in bramble's look wave.

## Proof

- ci: a subscriber within 72 hours of subscribing is refused a fee checkout with `fee-cooling-off`; a pass-only account is refused with `fee-needs-paid-subscription`; with the caps set low on ci (an environment setting for the proof), a second fee is refused with `fee-subscriber-cap`; a Stripe test dispute on a used fee payment (the test card that disputes) is contested with evidence and holds the account, and the dashboard and the operator email show it.
- prod: the dashboard panel shows the environment total and cap; no customer is refused who should not be (read the refusals in the lake for a week).
