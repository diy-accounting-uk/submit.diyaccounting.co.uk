-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- Sessions and users each hour by visitor kind (human, operator, bot, synthetic, or
-- "(unclassified)"), counted from GA4's raw export: the intraday table while a day streams and
-- the daily table once GA4 replaces it (app/functions/analytics/ga4DailyPull.js, hourly mode).
-- v_visitors_by_kind_daily reads GA4's daily aggregates, which land two days late, so the
-- operator dashboard's Last 1 hour, 1 day and 7 days visitor columns read this view instead.
-- A property without streaming export (ci) writes empty objects, so those columns read null.
-- The partition predicate keeps it to the last 8 days: the dashboard reads at most 7, and
-- without it every query lists every projected dt prefix the table carries.
CREATE OR REPLACE VIEW v_visitors_by_kind_hourly AS
SELECT from_iso8601_timestamp(hour) AS hour,
       visitor_kind,
       sum(sessions) AS sessions,
       sum(users)    AS users
FROM   sessions_by_hour_kind
WHERE  dt >= current_date - interval '8' day
GROUP  BY 1, 2
