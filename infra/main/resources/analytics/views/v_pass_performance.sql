-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- How did each referral pass perform: uses, new accounts, accounts that filed, subscribers, paid
-- charges and the last use?
--
-- One row per pass code. A redemption is one "redemption#<code>#<hashedSub>" item in the passes
-- table, which dynamo_passes carries as redeemed_by, redeemed_at and redemption_code; the item is
-- written again on a repeat redemption by the same account, so redemptions group on code and
-- account. A test or operator account is left out, read off activity_events_all, which names an
-- account's actor from any of its events.
--
-- A new account is a redeemer whose first bundle record names the pass code as its acquisition
-- ref: the pass grant is that account's first grant. Filed counts new accounts with at least one
-- submission or filing event. A subscriber is a new account with at least one live, paid,
-- unrefunded Stripe charge; the charge reaches the account through the Stripe customer, joined to
-- stripe_subscriptions by the subscription id that dynamo_subscriptions keys on hashed_sub.
-- Paid charges counts those charges.
CREATE OR REPLACE VIEW v_pass_performance AS
WITH excluded_accounts AS (
  SELECT DISTINCT hashed_sub
  FROM   activity_events_all
  WHERE  hashed_sub IS NOT NULL AND actor IN ('test-user', 'operator')),
redemptions AS (
  SELECT redemption_code AS code,
         redeemed_by AS hashed_sub,
         arbitrary(pass_type_id) AS pass_type_id,
         max(redeemed_at) AS redeemed_at
  FROM   dynamo_passes
  WHERE  redemption_code IS NOT NULL AND redeemed_by IS NOT NULL
  GROUP  BY redemption_code, redeemed_by),
first_grant AS (
  SELECT hashed_sub, min_by(acq_ref, change_ts) AS first_ref
  FROM   dynamo_bundles
  WHERE  change_type = 'INSERT' AND hashed_sub IS NOT NULL
  GROUP  BY hashed_sub),
filers AS (
  SELECT DISTINCT hashed_sub
  FROM   activity_events_all
  WHERE  actor = 'customer' AND hashed_sub IS NOT NULL AND regexp_like(event, '-(submitted|filed)$')),
subscription_owner AS (
  SELECT subscription_id, arbitrary(hashed_sub) AS hashed_sub
  FROM   dynamo_subscriptions
  WHERE  hashed_sub IS NOT NULL
  GROUP  BY subscription_id),
account_customer AS (
  SELECT o.hashed_sub, s.customer, s.bundle_id
  FROM   stripe_subscriptions s
  JOIN   subscription_owner o ON o.subscription_id = s.id
  GROUP  BY o.hashed_sub, s.customer, s.bundle_id),
account_charges AS (
  SELECT ac.hashed_sub, count(DISTINCT c.id) AS paid_charges
  FROM   stripe_charges c
  JOIN   account_customer ac ON ac.customer = c.customer AND ac.bundle_id = c.bundle_id
  WHERE  c.livemode = true AND c.paid = true AND c.refunded = false
  GROUP  BY ac.hashed_sub)
SELECT r.code,
       arbitrary(r.pass_type_id) AS pass_type_id,
       count(*) AS uses,
       count_if(g.first_ref = r.code) AS new_accounts,
       count_if(g.first_ref = r.code AND f.hashed_sub IS NOT NULL) AS filed,
       count_if(g.first_ref = r.code AND coalesce(ch.paid_charges, 0) > 0) AS subscribers,
       coalesce(sum(CASE WHEN g.first_ref = r.code THEN ch.paid_charges END), 0) AS paid_charges,
       max(r.redeemed_at) AS last_used
FROM   redemptions r
LEFT   JOIN excluded_accounts x ON x.hashed_sub = r.hashed_sub
LEFT   JOIN first_grant g ON g.hashed_sub = r.hashed_sub
LEFT   JOIN filers f ON f.hashed_sub = r.hashed_sub
LEFT   JOIN account_charges ch ON ch.hashed_sub = r.hashed_sub
WHERE  x.hashed_sub IS NULL
GROUP  BY r.code
