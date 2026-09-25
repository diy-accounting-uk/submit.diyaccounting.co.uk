-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- Monthly spend versus the $64.77 steady-state target.
--
-- The target is submit-prod alone: PLAN_COST_OPTIMISATION.md's after-figure for "submit prod in a
-- steady state" (../developers/submit/archive/PLAN_COST_OPTIMISATION.md). v_cost_daily covers the
-- whole organisation's six AWS accounts, so this view filters to submit-prod's account
-- (972912397388) to compare like with like.
CREATE OR REPLACE VIEW v_cost_vs_target_monthly AS
SELECT date_trunc('month', day)         AS month,
       sum(billed_cost_usd)             AS billed_cost_usd,
       cast(64.77 AS double)            AS target_usd,
       sum(billed_cost_usd) - 64.77     AS variance_usd
FROM   v_cost_daily
WHERE  sub_account_id = '972912397388'
GROUP  BY 1
