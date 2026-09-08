-- How does each month's spend compare against the $64.77 steady-state target
-- (_developers/archive/PLAN_COST_OPTIMISATION.md)?
CREATE OR REPLACE VIEW v_cost_vs_target_monthly AS
SELECT date_trunc('month', day)         AS month,
       sum(billed_cost_usd)             AS billed_cost_usd,
       cast(64.77 AS double)            AS target_usd,
       sum(billed_cost_usd) - 64.77     AS variance_usd
FROM   v_cost_daily
GROUP  BY 1
