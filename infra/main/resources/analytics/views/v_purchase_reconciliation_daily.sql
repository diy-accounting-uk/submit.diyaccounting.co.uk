-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- Do GA4, Stripe and our own activity events agree on how many purchases happened each day?
--
-- The three counts are not meant to match exactly: GA4 misses consented-out visitors, Stripe
-- counts renewals no browser session produced, and activity events count only what the webhook
-- processed. The gaps are the signal, not the counts alone. A first charge is one within an hour
-- of its customer's subscription being created; renewals are the rest. A day where Stripe has
-- first charges and activity has fewer activations means the webhook path broke. actor = 'customer' matches
-- billingWebhookPost.js, which sets 'customer' for real traffic and 'test-user' for test traffic.
CREATE OR REPLACE VIEW v_purchase_reconciliation_daily AS
WITH ga4 AS (
  SELECT day, purchases FROM v_ga4_funnel_daily
),
first_charges AS (
  SELECT DISTINCT c.id, c.created
  FROM   stripe_charges c
  JOIN   stripe_subscriptions s ON s.customer = c.customer AND abs(c.created - s.created) <= 3600
  WHERE  c.paid = true
),
stripe AS (
  SELECT date(from_unixtime(c.created)) AS day,
         count(*) AS paid_charges,
         count(f.id) AS first_charges
  FROM   stripe_charges c
  LEFT JOIN first_charges f ON f.id = c.id
  WHERE  c.paid = true
  GROUP  BY 1
),
activity AS (
  SELECT date(event_ts) AS day, count(*) AS subscriptions_activated
  FROM   activity_events_all
  WHERE  event = 'subscription-activated' AND actor = 'customer'
  GROUP  BY 1
)
SELECT coalesce(ga4.day, stripe.day, activity.day)          AS day,
       coalesce(ga4.purchases, 0)                           AS ga4_purchases,
       coalesce(stripe.paid_charges, 0)                     AS stripe_paid_charges,
       coalesce(activity.subscriptions_activated, 0)        AS activity_activations,
       coalesce(ga4.purchases, 0) - coalesce(stripe.paid_charges, 0)   AS ga4_minus_stripe,
       coalesce(activity.subscriptions_activated, 0) - coalesce(stripe.paid_charges, 0) AS activity_minus_stripe,
       coalesce(stripe.first_charges, 0)                    AS stripe_first_charges,
       coalesce(activity.subscriptions_activated, 0) - coalesce(stripe.first_charges, 0) AS activity_minus_first_charges
FROM        ga4
FULL JOIN   stripe   ON ga4.day = stripe.day
FULL JOIN   activity ON coalesce(ga4.day, stripe.day) = activity.day
