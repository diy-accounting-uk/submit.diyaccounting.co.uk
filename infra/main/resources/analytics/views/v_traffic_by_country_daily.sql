-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- Where are sessions coming from, and which convert?
--
-- Sessions are anonymous: a new-session event carries no hashed_sub and no id shared with a
-- later login, so a session cannot be joined to what it went on to do. This reports sessions
-- by country, with ai-agent traffic and automated traffic apart. Automated sessions are those whose
-- bot_class (classifyBot in app/lib/visitorClassifier.js) names an automated client: a headless
-- browser, an HTTP library or a bot the crawler list does not name. Events written before the bot
-- class existed carry none and count as human.
CREATE OR REPLACE VIEW v_traffic_by_country_daily AS
SELECT date(event_ts) AS day,
       coalesce(country, 'unknown') AS country,
       count(*) AS sessions,
       count_if(visitor_type <> 'ai-agent' AND coalesce(bot_class, 'none') <> 'automated') AS human_sessions,
       count_if(visitor_type = 'ai-agent') AS ai_agent_sessions,
       count_if(visitor_type <> 'ai-agent' AND bot_class = 'automated') AS automated_sessions
FROM   activity_events_all
WHERE  event = 'new-session' AND actor IN ('visitor', 'ai-agent')
GROUP  BY 1, 2
