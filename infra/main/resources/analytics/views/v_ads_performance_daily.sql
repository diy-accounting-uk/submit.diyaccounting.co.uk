-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- How did the Google Ads campaigns perform each day, added together?
--
-- Impressions, clicks and cost from v_ads_cost_daily over every campaign, with the click-through rate (clicks over
-- impressions) and the cost per click in pounds. A day with no impressions has no click-through
-- rate, and one with no clicks has no cost per click.
CREATE OR REPLACE VIEW v_ads_performance_daily AS
SELECT day,
       sum(impressions) AS impressions,
       sum(clicks)      AS clicks,
       sum(cost_gbp)    AS cost_gbp,
       CASE WHEN sum(impressions) = 0 THEN NULL
            ELSE cast(sum(clicks) AS double) / sum(impressions) END AS ctr,
       CASE WHEN sum(clicks) = 0 THEN NULL
            ELSE sum(cost_gbp) / sum(clicks) END                    AS cost_per_click_gbp
FROM   v_ads_cost_daily
GROUP  BY 1
