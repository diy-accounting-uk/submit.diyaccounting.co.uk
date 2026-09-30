-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

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
CREATE OR REPLACE VIEW v_revenue_daily AS
SELECT date(from_unixtime(created)) AS day,
       coalesce(bundle_id, 'unknown') AS product,
       count(*) AS charges,
       sum(amount - amount_refunded) / 100.0 AS revenue_gbp
FROM   stripe_charges
WHERE  paid = true
GROUP  BY 1, 2
UNION ALL
SELECT date(date_parse(p.date, '%Y-%m-%d')) AS day,
       coalesce(p.product, o.product, 'paypal-other-receipt') AS product,
       count_if(p.refund_of IS NULL) AS charges,
       sum(p.amount) AS revenue_gbp
FROM   paypal_donations p
LEFT   JOIN paypal_donations o ON p.refund_of = o.id
GROUP  BY 1, 2
