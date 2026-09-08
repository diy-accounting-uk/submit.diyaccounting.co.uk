CREATE OR REPLACE VIEW v_traffic_sources_daily AS
SELECT date(parse_datetime(date, 'yyyyMMdd')) AS day,
       coalesce(sessionDefaultChannelGroup, 'unassigned') AS channel,
       sum(sessions)        AS sessions,
       sum(newUsers)        AS new_users,
       sum(engagedSessions) AS engaged_sessions,
       if(sum(sessions) = 0, NULL,
          cast(sum(engagedSessions) AS double) / sum(sessions)) AS engagement_rate
FROM   ga4_traffic
GROUP  BY 1, 2
