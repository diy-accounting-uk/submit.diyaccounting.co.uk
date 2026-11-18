-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- How many subscriptions were cancelled each day, by bundle and by the class of the account?
--
-- Two ways a subscription's change history shows a cancellation: cancel_at_period_end flips
-- from false to true (the customer cancelled but the period runs out), or status changes to
-- "canceled" outright (an immediate cancellation, or the period ending after the flag was set).
-- Counting both from the same lag() avoids double-counting a subscription that shows both in
-- sequence: only the first change of either kind counts as the cancellation event.
--
-- actor_class is the account's class from v_account_class (the subscription's own actor is part
-- of that evidence), else the class of the subscription's lifecycle events. A cancellation with
-- neither is unknown and is never counted as a customer.
--
-- A day since the first subscription record with no customer cancellation carries one customer
-- row with bundle "none" and 0, so the source reads as measured and a window with no
-- cancellations is 0 rather than absent. Without the spine the view held no rows at all while
-- every cancellation was test traffic, and every window read as not measured.
CREATE OR REPLACE VIEW v_subscription_cancellations_daily AS
WITH subscription_actor AS (
  SELECT subscription_id,
         CASE WHEN bool_or(actor = 'test-user') THEN 'test'
              WHEN bool_or(actor IN ('probe', 'synthetic')) THEN 'synthetic'
              WHEN bool_or(actor = 'operator') THEN 'other'
              WHEN bool_or(actor = 'customer') THEN 'customer' END AS actor_class
  FROM   activity_events_all
  WHERE  subscription_id IS NOT NULL AND actor IS NOT NULL
  GROUP  BY subscription_id),
history AS (
  SELECT change_ts,
         subscription_id,
         hashed_sub,
         bundle_id,
         status,
         cancel_at_period_end,
         lag(status) OVER (PARTITION BY subscription_id ORDER BY change_ts) AS previous_status,
         lag(cancel_at_period_end) OVER (PARTITION BY subscription_id ORDER BY change_ts) AS previous_cancel_at_period_end
  FROM   aliased_dynamo_subscriptions
  WHERE  change_type = 'MODIFY'),
cancellations AS (
  SELECT date(h.change_ts) AS day,
         coalesce(h.bundle_id, 'unknown') AS bundle_id,
         coalesce(c.actor_class, sa.actor_class, 'unknown') AS actor_class,
         count(*) AS cancellations
  FROM   history h
  LEFT JOIN v_account_class c ON c.hashed_sub = h.hashed_sub
  LEFT JOIN subscription_actor sa ON sa.subscription_id = h.subscription_id
  WHERE  ((h.status = 'canceled' AND (h.previous_status IS NULL OR h.previous_status <> 'canceled'))
     OR   (h.cancel_at_period_end = true AND (h.previous_cancel_at_period_end IS NULL OR h.previous_cancel_at_period_end = false)))
  GROUP  BY 1, 2, 3),
days AS (
  SELECT cast(d AS date) AS day
  FROM   (SELECT min(date(change_ts)) AS first_day FROM aliased_dynamo_subscriptions)
  CROSS JOIN UNNEST(sequence(first_day, current_date, INTERVAL '1' DAY)) AS t(d)),
quiet_days AS (
  SELECT day, 'none' AS bundle_id, 'customer' AS actor_class, cast(0 AS bigint) AS cancellations
  FROM   days
  WHERE  day NOT IN (SELECT day FROM cancellations WHERE actor_class = 'customer'))
SELECT day, bundle_id, actor_class, cancellations FROM cancellations
UNION ALL
SELECT day, bundle_id, actor_class, cancellations FROM quiet_days
