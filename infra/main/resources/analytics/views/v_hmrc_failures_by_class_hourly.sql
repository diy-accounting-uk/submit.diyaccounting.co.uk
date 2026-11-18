-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- Same rows as v_hmrc_failures_by_class, grouped by hour instead of day, for the 14 days by hour
-- range of the operator dashboard's HMRC submission failures graph.
-- The partition predicate keeps it to the last 15 days: the dashboard graphs read at most 14.
CREATE OR REPLACE VIEW v_hmrc_failures_by_class_hourly AS
SELECT date_trunc('hour', event_ts) AS hour,
       coalesce(failure, 'unclassified') AS failure_class,
       coalesce(hmrc_status, 'none') AS hmrc_status,
       count(*) AS failures
FROM   activity_events_all
WHERE  actor = 'customer' AND outcome = 'failure'
       AND dt >= current_date - interval '15' day
GROUP  BY 1, 2, 3
