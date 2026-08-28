-- How many distinct people used the service each day?
CREATE OR REPLACE VIEW v_active_users_daily AS
SELECT date(event_ts) AS day,
       count(DISTINCT hashed_sub) AS active_users,
       count(*) AS events
FROM   activity_events_all
WHERE  actor = 'customer' AND hashed_sub IS NOT NULL
GROUP  BY 1
