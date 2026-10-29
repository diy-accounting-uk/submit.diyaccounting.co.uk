-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- What each charge cost each day, down to the resource: the charge description (log ingestion,
-- log storage, metrics, alarms, dashboards, Logs Insights queries and so on), the SKU, and the
-- resource id and name, by AWS account and service.
--
-- Same source and same choice of partition as v_cost_daily: AWS writes the whole month-to-date
-- FOCUS bill again in a new dt= partition each day, so latest_dt_per_period keeps only the newest
-- dt for each billing_period_start. A charge with no resource id (tax, support) reads
-- '(no resource)'; the export names no resource at all in some accounts, so a missing
-- resource_name reads '(no name)' and resource_id is the identifier to group on.
CREATE OR REPLACE VIEW v_cost_by_resource_daily AS
WITH latest_dt_per_period AS (
  SELECT billing_period_start, max(dt) AS dt
  FROM   cost_focus
  GROUP  BY billing_period_start
)
SELECT date(cf.charge_period_start)                        AS day,
       cf.sub_account_id                                   AS sub_account_id,
       cf.service_name                                     AS service_name,
       coalesce(cf.charge_description, '(no description)') AS charge_description,
       coalesce(cf.sku_id, '(no sku)')                     AS sku_id,
       coalesce(cf.resource_id, '(no resource)')           AS resource_id,
       coalesce(cf.resource_name, '(no name)')             AS resource_name,
       sum(cf.billed_cost)                                 AS billed_cost_usd
FROM   cost_focus cf
JOIN   latest_dt_per_period ldp
       ON  cf.billing_period_start = ldp.billing_period_start
       AND cf.dt                   = ldp.dt
WHERE  cf.charge_category <> 'Credit'
GROUP  BY 1, 2, 3, 4, 5, 6, 7
