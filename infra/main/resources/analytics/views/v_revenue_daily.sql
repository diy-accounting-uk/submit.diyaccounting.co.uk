-- How much money arrived each day, by product, from Stripe?
--
-- Reads the charges table directly rather than balance transactions: charges carry bundle_id
-- (the product), balance transactions do not. Amounts are minor units; divide by 100 once,
-- here, rather than in every caller. Stripe test-mode traffic lives under separate test-mode
-- API keys and never reaches this table, so no actor-style filter applies.
CREATE OR REPLACE VIEW v_revenue_daily AS
SELECT date(from_unixtime(created)) AS day,
       coalesce(bundle_id, 'unknown') AS product,
       count(*) AS charges,
       sum(amount - amount_refunded) / 100.0 AS revenue_gbp
FROM   stripe_charges
WHERE  paid = true
GROUP  BY 1, 2
