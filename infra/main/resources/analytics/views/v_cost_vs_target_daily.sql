-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- Month-to-date spend versus the $64.77 steady-state target, one row per day with cost.
--
-- month_to_date_usd is submit-prod's billed cost from the 1st of the day's month to that day.
-- target_to_date_usd is the monthly target spread evenly over the days of the month, so
-- variance_usd on any day says whether the month is running above or below the target pace.
-- Read the newest day in a window for the current month's position. v_cost_vs_target_monthly
-- keeps the one-row-per-month form.
CREATE OR REPLACE VIEW v_cost_vs_target_daily AS
WITH submit_prod_days AS (
  SELECT day, sum(billed_cost_usd) AS billed_cost_usd
  FROM   v_cost_daily
  WHERE  sub_account_id = '972912397388'
  GROUP  BY day
)
SELECT day,
       sum(billed_cost_usd) OVER (PARTITION BY date_trunc('month', day) ORDER BY day) AS month_to_date_usd,
       cast(64.77 * day(day) / day(last_day_of_month(day)) AS double)                  AS target_to_date_usd,
       sum(billed_cost_usd) OVER (PARTITION BY date_trunc('month', day) ORDER BY day)
         - 64.77 * day(day) / day(last_day_of_month(day))                              AS variance_usd
FROM   submit_prod_days
