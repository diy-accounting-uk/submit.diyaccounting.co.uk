-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- Same rows as v_traffic_by_country_daily, grouped by hour instead of day.
-- The partition predicate keeps it to the last 15 days: the dashboard graphs read at most 14.
CREATE OR REPLACE VIEW v_traffic_by_country_hourly AS
SELECT date_trunc('hour', event_ts) AS hour,
       coalesce(country, 'unknown') AS country,
       count(*) AS sessions,
       count_if(visitor_type <> 'ai-agent' AND coalesce(bot_class, 'none') <> 'automated') AS human_sessions,
       count_if(visitor_type = 'ai-agent') AS ai_agent_sessions,
       count_if(visitor_type <> 'ai-agent' AND bot_class = 'automated') AS automated_sessions
FROM   activity_events_all
WHERE  event = 'new-session' AND actor IN ('visitor', 'ai-agent')
       AND dt >= current_date - interval '15' day
GROUP  BY 1, 2
