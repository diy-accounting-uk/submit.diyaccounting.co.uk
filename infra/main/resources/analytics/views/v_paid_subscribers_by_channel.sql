-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- Paying subscribers each month by acquisition source and bundle: active base, MRR and ARR.
--
-- A paying subscriber is a Stripe customer with at least one live, paid, unrefunded charge for
-- a subscription bundle in the month. MRR is that month's charged amount in pounds; ARR is MRR
-- times twelve. The charge's Stripe customer joins to stripe_subscriptions, whose id is the
-- dynamo_subscriptions subscription_id, which carries the hashed_sub that dynamo_bundles keys
-- its acquisition columns on. dynamo_bundles holds one change record per write, and the bundle
-- that carried the acquisition (a day pass) is not the paid bundle, so acquisition joins on
-- hashed_sub alone: the earliest record naming a source (utm_source, gclid or ref) wins, and a
-- landing-time-only record names none. Accounts with no sourced record report source 'unknown'.
CREATE OR REPLACE VIEW v_paid_subscribers_by_channel AS
WITH acquisition AS (
  SELECT hashed_sub,
         min_by(acq_utm_source, change_ts) AS utm_source,
         min_by(acq_gclid, change_ts)      AS gclid,
         min_by(acq_ref, change_ts)        AS ref
  FROM   dynamo_bundles
  WHERE  acq_utm_source IS NOT NULL OR acq_gclid IS NOT NULL OR acq_ref IS NOT NULL
  GROUP  BY hashed_sub),
subscription_owner AS (
  SELECT subscription_id, arbitrary(hashed_sub) AS hashed_sub
  FROM   dynamo_subscriptions
  WHERE  hashed_sub IS NOT NULL
  GROUP  BY subscription_id),
customer_account AS (
  SELECT s.customer,
         s.bundle_id,
         arbitrary(o.hashed_sub) AS hashed_sub
  FROM   stripe_subscriptions s
  JOIN   subscription_owner o ON o.subscription_id = s.id
  GROUP  BY s.customer, s.bundle_id),
paid_charges AS (
  SELECT date_trunc('month', from_unixtime(created)) AS month,
         customer,
         bundle_id,
         sum(amount - amount_refunded) AS net_minor
  FROM   stripe_charges
  WHERE  livemode = true
    AND  paid = true
    AND  refunded = false
    AND  bundle_id IN ('resident-vat', 'resident', 'resident-pro')
  GROUP  BY 1, 2, 3)
SELECT date(c.month) AS month,
       coalesce(a.utm_source,
                CASE WHEN a.gclid IS NOT NULL THEN 'google-ads'
                     WHEN a.ref IS NOT NULL THEN 'ref:' || a.ref END,
                'unknown') AS source,
       c.bundle_id,
       count(DISTINCT c.customer) AS active_subscribers,
       sum(c.net_minor) / 100.0 AS mrr_gbp,
       sum(c.net_minor) * 12 / 100.0 AS arr_gbp
FROM   paid_charges c
LEFT JOIN customer_account ca ON ca.customer = c.customer AND ca.bundle_id = c.bundle_id
LEFT JOIN acquisition a ON a.hashed_sub = ca.hashed_sub
GROUP  BY 1, 2, 3
