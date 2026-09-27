-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- Same rows as v_activity_started_daily, grouped by hour instead of day. The operator
-- dashboard's Last 1 hour and Last 1 day activity columns need a real hour boundary: a
-- day-grain "day" column compared against "1 hour ago" only ever reads as "today" or "not
-- today", never a genuine trailing hour, so those two columns read from this view instead.
-- The partition predicate keeps it to the last 8 days: the dashboard reads at most 7, and
-- without it every query lists every projected year/month/day prefix of both base tables.
CREATE OR REPLACE VIEW v_activity_started_hourly AS
SELECT date_trunc('hour', event_ts) AS hour, activity_id AS activity, app_client,
       count(*)                   AS starts,
       count(DISTINCT hashed_sub) AS customers
FROM   activity_events_all
WHERE  actor = 'customer' AND event = 'activity-started' AND activity_id IS NOT NULL
       AND concat(cast(year AS varchar), lpad(cast(month AS varchar), 2, '0'), lpad(cast(day AS varchar), 2, '0'))
           >= date_format(current_date - interval '8' day, '%Y%m%d')
GROUP  BY 1, 2, 3
