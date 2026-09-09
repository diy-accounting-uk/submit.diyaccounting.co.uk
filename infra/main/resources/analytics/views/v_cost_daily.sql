-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- How much did each day cost, by AWS service and by the deployment and stack that spent it?
--
-- Reads cost_focus directly rather than through billing_period, since charge_period_start
-- carries the day a charge actually happened; billing_period only says which month's bill it
-- landed on, which is the same thing except at a month boundary. tags is the FOCUS 1.2 Tags
-- column: DeploymentName and Stack are the two keys CostAllocationTags.java applies to every
-- resource this repository's CDK apps create, so a charge with neither is bootstrap, Route 53,
-- Amazon Registrar, tax, or something created by hand rather than deployed.
CREATE OR REPLACE VIEW v_cost_daily AS
SELECT date(charge_period_start)               AS day,
       service_name,
       coalesce(tags['DeploymentName'], 'untagged') AS deployment,
       coalesce(tags['Stack'], 'untagged')          AS stack,
       sum(billed_cost)                        AS billed_cost_usd
FROM   cost_focus
WHERE  charge_category <> 'Credit'
GROUP  BY 1, 2, 3, 4
