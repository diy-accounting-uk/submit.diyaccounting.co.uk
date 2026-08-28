-- Every WP-6 query reads this view, never the two base tables directly, so the day-one
-- query keeps working across the JSON era and the Parquet era with no change on cutover.
CREATE OR REPLACE VIEW activity_events_all AS
SELECT event_id, event_ts, ingest_ts, event, site, summary, actor, flow, outcome, failure,
       request_id, hashed_sub, bundle_id, pass_type_id, subscription_id, visitor_type,
       country, page, hmrc_status, env, year, month, day
FROM   activity_events
UNION ALL
SELECT event_id,
       cast(from_iso8601_timestamp(event_ts) AS timestamp),
       cast(from_iso8601_timestamp(ingest_ts) AS timestamp),
       event, site, summary, actor, flow, outcome, failure, request_id, hashed_sub,
       bundle_id, pass_type_id, subscription_id, visitor_type, country, page, hmrc_status,
       env, year, month, day
FROM   activity_events_raw
WHERE  concat(cast(year AS varchar), lpad(cast(month AS varchar), 2, '0'), lpad(cast(day AS varchar), 2, '0'))
       < '__CUTOVER_DATE__'
