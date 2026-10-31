-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- @capability DATA-28 SQL views: revenue and subscription
-- - **Use when:** a question is about Stripe revenue, subscription renewals/cancellations, purchase reconciliation or pass redemptions.
-- - **Does:** Five Athena views answer money questions. They cover daily Stripe revenue by product, and subscription renewals and cancellations from the change log. They also cover a daily GA4/Stripe/activity-event purchase reconciliation, and passes issued versus redeemed.
-- - **Run:** no command; see Does and Entry
-- - **Entry:** `infra/main/resources/analytics/views/v_revenue_daily.sql:`
-- - **Files:** infra/main/resources/analytics/views/v_revenue_daily.sql, infra/main/resources/analytics/views/v_subscription_renewals_daily.sql, infra/main/resources/analytics/views/v_subscription_cancellations_daily.sql, infra/main/resources/analytics/views/v_purchase_reconciliation_daily.sql, infra/main/resources/analytics/views/v_pass_redemptions_daily.sql
-- - **Keywords:** revenue daily, subscription renewals, subscription cancellations, purchase reconciliation, pass redemptions, stripe revenue
-- - **Related:** DATA-09, DATA-10
-- @end-capability

-- How much money arrived each day, by product, from Stripe and PayPal?
--
-- Stripe: reads the charges table directly rather than balance transactions: charges carry
-- bundle_id (the product), balance transactions do not. Amounts are minor units; divide by 100
-- once, here, rather than in every caller. Stripe test-mode traffic lives under separate
-- test-mode API keys and never reaches this table, so no actor-style filter applies.
--
-- PayPal: settled receipts, labelled donation-paypal (a donation payment) or
-- paypal-other-receipt (any other incoming payment), and refunds as negative rows. amount is
-- already pounds, gross of PayPal's fee: for a receipt in another currency it is the pound
-- figure PayPal's conversion credited (the pull job leaves out a receipt it cannot match to a
-- conversion). A refund row names its receipt in refund_of and takes that receipt's product, so
-- a refund on a later day lowers the same product's revenue; charges counts receipts only.
-- The table is empty in an environment with no PayPal credentials.
--
-- net_revenue_gbp is revenue_gbp after payment fees. Stripe's fee comes from the charge's balance
-- transaction (joined on source_id), taken in full because Stripe does not return the fee on a
-- refund; a charge whose balance transaction has not landed yet carries no fee until it does.
-- PayPal's fee comes from the receipt row; a refund row carries no fee.
CREATE OR REPLACE VIEW v_revenue_daily AS
WITH stripe_fees AS (
  SELECT source_id, max(fee) AS fee_minor
  FROM   stripe_balance_transactions
  WHERE  type IN ('charge', 'payment')
  GROUP  BY source_id
)
SELECT date(from_unixtime(c.created)) AS day,
       coalesce(c.bundle_id, 'unknown') AS product,
       count(*) AS charges,
       sum(c.amount - c.amount_refunded) / 100.0 AS revenue_gbp,
       sum(c.amount - c.amount_refunded - coalesce(f.fee_minor, 0)) / 100.0 AS net_revenue_gbp
FROM   stripe_charges c
LEFT   JOIN stripe_fees f ON f.source_id = c.id
WHERE  c.paid = true
GROUP  BY 1, 2
UNION ALL
SELECT date(date_parse(p.date, '%Y-%m-%d')) AS day,
       coalesce(p.product, o.product, 'paypal-other-receipt') AS product,
       count_if(p.refund_of IS NULL) AS charges,
       sum(p.amount) AS revenue_gbp,
       sum(p.amount - CASE WHEN p.refund_of IS NULL THEN coalesce(p.fee, 0) ELSE 0 END) AS net_revenue_gbp
FROM   paypal_donations p
LEFT   JOIN paypal_donations o ON p.refund_of = o.id
GROUP  BY 1, 2
