-- Which HMRC failure classes are we hitting, and how often?
CREATE OR REPLACE VIEW v_hmrc_failures_by_class AS
SELECT date(event_ts) AS day,
       coalesce(failure, 'unclassified') AS failure_class,
       coalesce(hmrc_status, 'none') AS hmrc_status,
       count(*) AS failures
FROM   activity_events_all
WHERE  actor = 'customer' AND outcome = 'failure'
GROUP  BY 1, 2, 3
