-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- Same rows as v_integration_calls_daily, grouped by UTC hour instead of day. The operator
-- dashboard's Today column starts at UK midnight, which a day-grain "day" column cannot
-- answer. The partition predicate keeps it to the last 9 days: a call lands in the partition of
-- its delivery, up to a quarter of an hour after the call, and the dashboard reads at most 7.
CREATE OR REPLACE VIEW v_integration_calls_hourly AS
SELECT date_trunc('hour', started_at) AS hour,
       org,
       target,
       api,
       outcome,
       status,
       status_label,
       count(*)         AS calls,
       sum(duration_ms) AS total_ms
FROM   dynamo_calls
WHERE  change_type = 'INSERT' AND record_type = 'call' AND started_at IS NOT NULL
       AND dt >= current_date - interval '9' day
GROUP  BY 1, 2, 3, 4, 5, 6, 7
