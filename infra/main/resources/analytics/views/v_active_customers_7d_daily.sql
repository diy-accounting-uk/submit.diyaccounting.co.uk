-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- How many customers were active on each day, and over the 7 days to it?
--
-- Distinct signed-in customers (hashed sub) from the activity events, by app client and for all
-- clients together (app_client "all"). active_users_1d counts the day; active_users_7d counts
-- each customer once across the day and the six before it, which the per-day counts of
-- v_active_users_daily cannot give because they cannot be added across days. Covers the last 400
-- days.
CREATE OR REPLACE VIEW v_active_customers_7d_daily AS
WITH seen AS (
  SELECT DISTINCT date(event_ts) AS seen_day,
         coalesce(app_client, 'submit') AS app_client,
         hashed_sub
  FROM   activity_events_all
  WHERE  actor = 'customer' AND hashed_sub IS NOT NULL
    AND  date(event_ts) > date_add('day', -406, current_date)
),
calendar AS (
  SELECT cast(d AS date) AS day
  FROM   UNNEST(sequence(date_add('day', -400, current_date), current_date, interval '1' day)) AS t(d)
)
SELECT calendar.day AS day,
       coalesce(seen.app_client, 'all') AS app_client,
       count(DISTINCT CASE WHEN seen.seen_day = calendar.day THEN seen.hashed_sub END) AS active_users_1d,
       count(DISTINCT seen.hashed_sub) AS active_users_7d
FROM   calendar
JOIN   seen ON seen.seen_day BETWEEN date_add('day', -6, calendar.day) AND calendar.day
GROUP  BY GROUPING SETS ((calendar.day, seen.app_client), (calendar.day))
