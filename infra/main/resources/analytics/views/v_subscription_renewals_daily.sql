-- How many subscriptions renewed each day, by bundle?
--
-- dynamo_subscriptions carries one change record per write to the subscriptions table. A
-- renewal shows up as a MODIFY whose current_period_end moved forward with the status staying
-- "active" (a cancellation also modifies the row, but leaves current_period_end where it was
-- until the period actually ends, or sets cancel_at_period_end instead of moving the date).
CREATE OR REPLACE VIEW v_subscription_renewals_daily AS
WITH history AS (
  SELECT change_ts,
         change_type,
         bundle_id,
         status,
         current_period_end,
         lag(current_period_end) OVER (PARTITION BY subscription_id ORDER BY change_ts) AS previous_period_end
  FROM   dynamo_subscriptions)
SELECT date(change_ts) AS day,
       coalesce(bundle_id, 'unknown') AS bundle_id,
       count(*) AS renewals
FROM   history
WHERE  change_type = 'MODIFY'
  AND  status = 'active'
  AND  previous_period_end IS NOT NULL
  AND  current_period_end > previous_period_end
GROUP  BY 1, 2
