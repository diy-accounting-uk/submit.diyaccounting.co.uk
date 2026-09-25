-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- How much did each day cost, by AWS account, service, and by the deployment and stack that
-- spent it?
--
-- cost_focus holds the FOCUS export for the whole organisation (all six AWS accounts under the
-- management account 887764105431), not just one deployment account's spend, so sub_account_id
-- is carried through here and a caller comparing this view's total against a single-account
-- figure (Cost Explorer, a budget) must filter by it; this view does not narrow to one account.
--
-- AWS writes the whole month-to-date FOCUS bill again in a new dt= partition each day, so summing
-- every partition would multiply each day's cost by however many partitions have been written
-- since. latest_dt_per_period keeps only the newest dt for each billing_period_start. At a month
-- boundary a dt's file can hold rows for two billing periods (the outgoing month's final bill and
-- the new month's first day), so the newest dt is chosen per billing_period_start, not once for
-- the whole table.
--
-- Reads cost_focus directly rather than through billing_period, since charge_period_start
-- carries the day a charge actually happened; billing_period only says which month's bill it
-- landed on, which is the same thing except at a month boundary. tags is the FOCUS 1.2 Tags
-- column: DeploymentName and Stack are the two keys CostAllocationTags.java applies to every
-- resource this repository's CDK apps create, so a charge with neither is bootstrap, Route 53,
-- Amazon Registrar, tax, or something created by hand rather than deployed.
CREATE OR REPLACE VIEW v_cost_daily AS
WITH latest_dt_per_period AS (
  SELECT billing_period_start, max(dt) AS dt
  FROM   cost_focus
  GROUP  BY billing_period_start
)
SELECT date(cf.charge_period_start)                   AS day,
       cf.sub_account_id                              AS sub_account_id,
       cf.service_name                                AS service_name,
       coalesce(cf.tags['DeploymentName'], 'untagged') AS deployment,
       coalesce(cf.tags['Stack'], 'untagged')          AS stack,
       sum(cf.billed_cost)                             AS billed_cost_usd
FROM   cost_focus cf
JOIN   latest_dt_per_period ldp
       ON  cf.billing_period_start = ldp.billing_period_start
       AND cf.dt                   = ldp.dt
WHERE  cf.charge_category <> 'Credit'
GROUP  BY 1, 2, 3, 4, 5
