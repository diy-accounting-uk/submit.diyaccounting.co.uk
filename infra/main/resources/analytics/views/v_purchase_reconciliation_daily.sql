-- Do GA4, Stripe and our own activity events agree on how many purchases happened each day?
--
-- The three counts are not meant to match exactly: GA4 misses consented-out visitors, Stripe
-- counts renewals no browser session produced, and activity events count only what the webhook
-- processed. The gaps are the signal, not the counts alone — a day where Stripe has charges and
-- activity has none means the webhook path broke. actor = 'customer' matches
-- billingWebhookPost.js, which sets 'customer' for real traffic and 'test-user' for test traffic.
CREATE OR REPLACE VIEW v_purchase_reconciliation_daily AS
WITH ga4 AS (
  SELECT day, purchases FROM v_ga4_funnel_daily
),
stripe AS (
  SELECT date(from_unixtime(created)) AS day, count(*) AS paid_charges
  FROM   stripe_charges WHERE paid = true GROUP BY 1
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
       coalesce(activity.subscriptions_activated, 0) - coalesce(stripe.paid_charges, 0) AS activity_minus_stripe
FROM        ga4
FULL JOIN   stripe   ON ga4.day = stripe.day
FULL JOIN   activity ON coalesce(ga4.day, stripe.day) = activity.day
