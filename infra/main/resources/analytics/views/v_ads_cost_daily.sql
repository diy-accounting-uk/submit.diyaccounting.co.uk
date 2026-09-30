-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- What Google Ads charged each day, and what it bought, by campaign and ad group. One row per
-- day, campaign and ad group, read from the nightly Ads API pull. cost_gbp is in pounds as the
-- Ads account reports it. The table is empty in an environment with no Ads credentials.
CREATE OR REPLACE VIEW v_ads_cost_daily AS
SELECT date(date_parse(date, '%Y-%m-%d')) AS day,
       campaign_id,
       campaign_name,
       ad_group_id,
       ad_group_name,
       sum(impressions) AS impressions,
       sum(clicks) AS clicks,
       sum(cost_gbp) AS cost_gbp
FROM   ads_cost
GROUP  BY 1, 2, 3, 4, 5
