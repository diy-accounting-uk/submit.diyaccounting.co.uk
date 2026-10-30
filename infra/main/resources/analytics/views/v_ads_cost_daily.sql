-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- What each advertising platform charged each day, and what it bought, by campaign and ad group.
-- One row per day, platform (google or microsoft), campaign and ad group, read from the nightly
-- pulls of the Google Ads API and the Microsoft Advertising Reporting service. cost_gbp is in
-- pounds as the account reports it. Microsoft rows have no ad group. conversions is what the
-- platform counts as a conversion and is null for Google rows, which the pull does not read. A
-- row written before the platform column existed is a Google row. The table is empty in an
-- environment with no Ads credentials.
CREATE OR REPLACE VIEW v_ads_cost_daily AS
SELECT date(date_parse(date, '%Y-%m-%d')) AS day,
       coalesce(platform, 'google') AS platform,
       campaign_id,
       campaign_name,
       ad_group_id,
       ad_group_name,
       sum(impressions) AS impressions,
       sum(clicks) AS clicks,
       sum(cost_gbp) AS cost_gbp,
       sum(conversions) AS conversions
FROM   ads_cost
GROUP  BY 1, 2, 3, 4, 5, 6
