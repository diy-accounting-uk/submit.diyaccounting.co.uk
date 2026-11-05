-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- Calls to HMRC, Companies House and Stripe each UK day, by organisation, target, api and
-- outcome. total_ms is the sum of durations, so an average is total_ms / calls. The operator
-- dashboard's Integrations table and graphs read this view; the target column keeps sandbox
-- and test traffic apart from live traffic.
CREATE OR REPLACE VIEW v_integration_calls_daily AS
SELECT day,
       org,
       target,
       api,
       outcome,
       status,
       status_label,
       count(*)         AS calls,
       sum(duration_ms) AS total_ms
FROM   v_integration_calls
GROUP  BY 1, 2, 3, 4, 5, 6, 7
