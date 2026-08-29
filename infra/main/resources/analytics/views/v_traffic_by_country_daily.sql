-- Where are sessions coming from, and which convert?
--
-- Sessions are anonymous: a new-session event carries no hashed_sub and no id shared with a
-- later login, so a session cannot be joined to what it went on to do. This reports sessions
-- by country; splitting out ai-agent traffic is the closest available proxy for how much of a
-- country's traffic is worth counting, until a shared session identifier or GA4 closes the gap.
CREATE OR REPLACE VIEW v_traffic_by_country_daily AS
SELECT date(event_ts) AS day,
       coalesce(country, 'unknown') AS country,
       count(*) AS sessions,
       count_if(visitor_type <> 'ai-agent') AS human_sessions,
       count_if(visitor_type = 'ai-agent') AS ai_agent_sessions
FROM   activity_events_all
WHERE  event = 'new-session' AND actor IN ('visitor', 'ai-agent')
GROUP  BY 1, 2
