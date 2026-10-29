-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- How many pounds does one dollar buy on each day?
--
-- The European Central Bank's USD and GBP rates per euro, crossed by fxRatePull.js into pounds
-- per dollar. The ECB publishes on working days only, so every calendar day from the first
-- rate carries the last published rate forward, and a weekend bill converts at Friday's rate.
-- A day before the first rate reads NULL.
CREATE OR REPLACE VIEW v_usd_gbp_daily AS
WITH published AS (
  SELECT date(date_parse(date, '%Y-%m-%d')) AS day,
         max(gbp_per_usd)                   AS gbp_per_usd
  FROM   fx_rates
  GROUP  BY 1
),
calendar AS (
  SELECT cast(d AS date) AS day
  FROM   UNNEST(sequence(date '2026-01-01', current_date, interval '1' day)) AS t(d)
)
SELECT calendar.day AS day,
       last_value(published.gbp_per_usd) IGNORE NULLS OVER (ORDER BY calendar.day) AS gbp_per_usd
FROM   calendar
LEFT   JOIN published ON published.day = calendar.day
