-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- Distinct signed-in customers (hashed sub) who made a call in each hour, by app client and for
-- all clients together (app_client "all"). The hourly counterpart of active_users_1d in
-- v_active_customers_7d_daily.
-- The partition predicate keeps it to the last 15 days: the dashboard graphs read at most 14.
CREATE OR REPLACE VIEW v_active_customers_hourly AS
WITH seen AS (
  SELECT date_trunc('hour', event_ts) AS hour,
         coalesce(app_client, 'submit') AS app_client,
         hashed_sub
  FROM   activity_events_all
  WHERE  actor = 'customer' AND hashed_sub IS NOT NULL
         AND dt >= current_date - interval '15' day
)
SELECT hour,
       coalesce(app_client, 'all') AS app_client,
       count(DISTINCT hashed_sub) AS active_users
FROM   seen
GROUP  BY GROUPING SETS ((hour, app_client), (hour))
