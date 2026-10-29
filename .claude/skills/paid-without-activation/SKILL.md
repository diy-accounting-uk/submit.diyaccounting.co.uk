---
name: paid-without-activation
description: From a prod-env-charges-without-activation alarm (or its [ALARM] issue), find the Stripe charge that has no activation, the customer and account behind it, and the webhook failure; print the command that re-delivers the event so the bundle is granted; then draft the email to the customer. Read-only until the operator runs the printed command. Invoke when the operator asks who paid and got no bundle, or when that alarm fires.
---

<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# paid-without-activation

The alarm `prod-env-charges-without-activation` fires when `ChargesWithoutActivation` in
`Submit/Analytics` is above 0 for a day. The metric is
`greatest(-activity_minus_stripe, 0)` from `v_purchase_reconciliation_daily` for the
reconciliation day (two days before the run): Stripe has more paid charges than the lake has
`subscription-activated` events from `billingWebhookPost.js`. A customer paid and may hold no bundle.

All lookups are read-only. Use the `diya-submit-prod` SSO profile
(`aws sso login --sso-session diyaccounting` first). Never run a DynamoDB `Scan` on a customer
table; every table below is read with `Query` on a known key. Personal data (email, name) goes to
the operator in chat and nowhere else. The alarm issue is public: write only the date, the charge
count and the request ids.

## 1. Pin the day and the count

The issue body carries the datapoint time. The day is the metric timestamp (midnight UTC of the
reconciliation day). The count is the shortfall. Confirm in Athena (workgroup `prod-env-analytics`,
database `prod_env_analytics`):

```
SELECT * FROM v_purchase_reconciliation_daily WHERE day = DATE '<day>'
```

Start it with `aws athena start-query-execution`, poll `get-query-execution`, then
`get-query-results`.

## 2. Find the charges and their checkout sessions

Read the live key from Secrets Manager (`prod/submit/stripe/secret_key`, `eu-west-2`, as
`infra/stripe/stripe.toml` `[keys.prod].live` names it) into the environment of one process;
never echo or write it. List the paid charges created on that UTC day, then the checkout session
of each:

```
stripe charges list --api-key "$KEY" --created.gte <day-start-unix> --created.lt <day-end-unix> --limit 100
stripe checkout sessions list --api-key "$KEY" --payment-intent <pi_...>
```

Or the same calls with the `stripe` npm package from the repository's `node_modules`. The session
carries `metadata.hashedSub`, `metadata.bundleId`, `subscription`, `customer` and
`customer_details.email`. A charge with no checkout session on a subscription price is a renewal
(`invoice.paid`), not an activation: skip it.

## 3. Which charge has no activation

Query the lake for the day's activations and compare their `subscription_id`/`hashed_sub` with the
sessions from step 2:

```
SELECT CAST(event_ts AS varchar) AS event_ts, hashed_sub, bundle_id, request_id
FROM prod_env_analytics.activity_events_all
WHERE dt = DATE '<day>' AND event = 'subscription-activated' AND actor = 'customer'
```

A session whose `hashedSub` has no row is the charge to repair. Confirm the account holds no paid
bundle by `Query` on `prod-env-bundles` with `hashedSub = :h`; `day-guest` only, or no
`stripeSubscriptionId`, confirms it.

## 4. Why the webhook failed

Read the webhook Lambda's log for the day: log group `/aws/lambda/prod-env-billing-webhook`.

```
aws --profile diya-submit-prod logs filter-log-events \
  --log-group-name /aws/lambda/prod-env-billing-webhook \
  --start-time <day-start-ms> --end-time <day-end-ms> \
  --filter-pattern '"checkout.session.completed"'
```

Search the same window for `missing hashedSub`, `Failed to retrieve subscription`, a signature
failure or a timeout. Log retention is one month. No log line for the session id means Stripe
never delivered it: check the endpoint's delivery attempts on the event in the Stripe dashboard.

## 5. Grant the bundle: re-deliver the event

The grant path is the webhook itself: re-delivery runs `handleCheckoutComplete`, which writes the
bundle, the subscription record and the `subscription-activated` event exactly as a first delivery
would, and it restores any sandboxed books. Find the event and the endpoint:

```
stripe events list --api-key "$KEY" --type checkout.session.completed --created.gte <day-start-unix> --limit 100
stripe webhook_endpoints list --api-key "$KEY"
```

Pick the event whose `data.object.id` is the session from step 2 and the endpoint whose URL is
`https://prod-billing.submit.diyaccounting.co.uk/api/v1/billing/webhook`. A write to prod is the
operator's approval, so print the command in a fenced block with the `!` prefix and stop:

```
! stripe events resend <evt_...> --webhook-endpoint <we_...> --api-key "$(aws --profile diya-submit-prod secretsmanager get-secret-value --region eu-west-2 --secret-id prod/submit/stripe/secret_key --query SecretString --output text)"
```

Stripe keeps events for 30 days. For an older event, or when the log in step 4 shows the handler
rejecting the session (missing `hashedSub`), re-delivery cannot grant: the operator grants by hand
with the account's hashed sub from the activity events, and `scripts/add-bundle.sh` is not a
substitute (it writes a bundle without the Stripe subscription fields). Report that case to the
operator with the evidence instead of improvising a write.

After the operator runs the command, verify: a `Bundle granted via webhook` line in the log, a
`prod-env-bundles` `Query` row with `subscriptionStatus: active`, and the next night's metric back
at 0.

## 6. Tell the customer

Draft the email with `.claude/skills/email-draft/SKILL.md` (Opus at minimum). Facts for the draft:
the date and amount of the charge, the bundle they bought, that the bundle is now active, and an
apology for the delay. Add no technical detail. The operator sends it from his own address.
