-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- What did each completion (VAT return, ITSA period, Companies House filing, ...) cost that day?
--
-- The day's total FOCUS cost divided by the day's completions from v_submissions_by_activity_daily,
-- summed across every activity rather than split by it: the AWS bill has no per-activity
-- attribution finer than the deployment and stack tags, so a per-activity cost would be a made-up
-- split of one shared number.
CREATE OR REPLACE VIEW v_cost_per_submission_daily AS
WITH daily_cost AS (
  SELECT day, sum(billed_cost_usd) AS billed_cost_usd
  FROM   v_cost_daily
  GROUP  BY 1
),
daily_completions AS (
  SELECT day, sum(completions) AS completions
  FROM   v_submissions_by_activity_daily
  GROUP  BY 1
)
SELECT coalesce(daily_cost.day, daily_completions.day)         AS day,
       coalesce(daily_cost.billed_cost_usd, 0)                 AS billed_cost_usd,
       coalesce(daily_completions.completions, 0)              AS completions,
       CASE WHEN coalesce(daily_completions.completions, 0) = 0 THEN NULL
            ELSE daily_cost.billed_cost_usd / daily_completions.completions
       END                                                     AS cost_per_completion_usd
FROM        daily_cost
FULL JOIN   daily_completions ON daily_cost.day = daily_completions.day
