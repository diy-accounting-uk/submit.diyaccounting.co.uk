-- How many VAT returns went to HMRC each day, split by outcome?
CREATE OR REPLACE VIEW v_submissions_daily AS
SELECT date(event_ts) AS day,
       coalesce(outcome, 'success') AS outcome,
       count(*) AS submissions,
       count(DISTINCT hashed_sub) AS submitters
FROM   activity_events_all
WHERE  actor = 'customer' AND event IN ('vat-return-submitted', 'vat-return-failed')
GROUP  BY 1, 2
