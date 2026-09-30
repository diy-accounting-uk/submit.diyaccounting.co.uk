-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- What did each paid landing cost that day?
--
-- The day's Google Ads cost from v_ads_cost_daily divided by the day's gclid-carrying page
-- requests from v_paid_landings_daily, summed across every campaign and landing page. The two
-- sources count different events: the Ads account counts clicks, the access log counts the
-- requests that arrived with a click id. A day with cost and no paid landing has no cost per
-- landing.
CREATE OR REPLACE VIEW v_ads_cost_per_paid_landing_daily AS
WITH daily_cost AS (
  SELECT day, sum(cost_gbp) AS ads_cost_gbp
  FROM   v_ads_cost_daily
  GROUP  BY 1
),
daily_landings AS (
  SELECT day, sum(paid_landings) AS paid_landings
  FROM   v_paid_landings_daily
  GROUP  BY 1
)
SELECT coalesce(daily_cost.day, daily_landings.day)            AS day,
       coalesce(daily_cost.ads_cost_gbp, 0)                    AS ads_cost_gbp,
       coalesce(daily_landings.paid_landings, 0)               AS paid_landings,
       CASE WHEN coalesce(daily_landings.paid_landings, 0) = 0 THEN NULL
            ELSE daily_cost.ads_cost_gbp / daily_landings.paid_landings
       END                                                     AS cost_per_paid_landing_gbp
FROM        daily_cost
FULL JOIN   daily_landings ON daily_cost.day = daily_landings.day
