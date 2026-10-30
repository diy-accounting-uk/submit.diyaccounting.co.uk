-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- What did each day contribute?
--
-- Revenue (Stripe and PayPal, in pounds) less the day's AWS bill (dollars from v_cost_daily,
-- converted at that day's rate from v_usd_gbp_daily) less the day's Google Ads cost (pounds).
-- A day with no AWS cost row contributes no AWS cost; a day before the first exchange rate
-- reads NULL, because its dollar bill cannot be put into pounds.
CREATE OR REPLACE VIEW v_contribution_daily AS
WITH revenue AS (
  SELECT day, sum(revenue_gbp) AS revenue_gbp FROM v_revenue_daily GROUP BY 1
),
aws_cost AS (
  SELECT day, sum(billed_cost_usd) AS cost_usd FROM v_cost_daily GROUP BY 1
),
ads_cost AS (
  SELECT day, sum(cost_gbp) AS cost_gbp FROM v_ads_cost_daily GROUP BY 1
),
days AS (
  SELECT day FROM revenue UNION SELECT day FROM aws_cost UNION SELECT day FROM ads_cost
)
SELECT days.day AS day,
       coalesce(revenue.revenue_gbp, 0)                            AS revenue_gbp,
       coalesce(aws_cost.cost_usd, 0) * fx.gbp_per_usd             AS aws_cost_gbp,
       coalesce(ads_cost.cost_gbp, 0)                              AS ads_cost_gbp,
       coalesce(revenue.revenue_gbp, 0)
         - coalesce(aws_cost.cost_usd, 0) * fx.gbp_per_usd
         - coalesce(ads_cost.cost_gbp, 0)                          AS contribution_gbp
FROM        days
LEFT JOIN   revenue  ON revenue.day  = days.day
LEFT JOIN   aws_cost ON aws_cost.day = days.day
LEFT JOIN   ads_cost ON ads_cost.day = days.day
LEFT JOIN   v_usd_gbp_daily fx ON fx.day = days.day
