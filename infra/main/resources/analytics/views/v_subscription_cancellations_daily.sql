-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- How many subscriptions were cancelled each day, by bundle?
--
-- Two ways a subscription's change history shows a cancellation: cancel_at_period_end flips
-- from false to true (the customer cancelled but the period runs out), or status changes to
-- "canceled" outright (an immediate cancellation, or the period ending after the flag was set).
-- Counting both from the same lag() avoids double-counting a subscription that shows both in
-- sequence: only the first change of either kind counts as the cancellation event.
--
-- dynamo_subscriptions.actor is only as reliable as the checkout write that first set it: on
-- prod, every subscription inserted before that write shipped carries no actor at all, and a
-- later cancellation or renewal update never backfills it (only the SET clauses for the fields
-- that update touch the item). activity_events_all's own subscription-lifecycle events (fed by
-- resolveActorClass at the moment each webhook fires, not by a value copied off the DynamoDB
-- item) still carry a reliable actor for the same subscription_id, so this joins to that instead
-- of trusting the item's own column. A subscription with no matching event anywhere is counted
-- as a customer rather than dropped, the same fail-safe-to-LIVE default resolveActorClass()
-- itself uses.
CREATE OR REPLACE VIEW v_subscription_cancellations_daily AS
WITH subscription_actor AS (
  SELECT subscription_id, arbitrary(actor) AS actor
  FROM   activity_events_all
  WHERE  subscription_id IS NOT NULL AND actor IS NOT NULL
  GROUP  BY subscription_id),
history AS (
  SELECT change_ts,
         subscription_id,
         bundle_id,
         status,
         cancel_at_period_end,
         lag(status) OVER (PARTITION BY subscription_id ORDER BY change_ts) AS previous_status,
         lag(cancel_at_period_end) OVER (PARTITION BY subscription_id ORDER BY change_ts) AS previous_cancel_at_period_end
  FROM   dynamo_subscriptions
  WHERE  change_type = 'MODIFY')
SELECT date(h.change_ts) AS day,
       coalesce(h.bundle_id, 'unknown') AS bundle_id,
       count(*) AS cancellations
FROM   history h
LEFT JOIN subscription_actor sa ON sa.subscription_id = h.subscription_id
WHERE  ((h.status = 'canceled' AND (h.previous_status IS NULL OR h.previous_status <> 'canceled'))
   OR   (h.cancel_at_period_end = true AND (h.previous_cancel_at_period_end IS NULL OR h.previous_cancel_at_period_end = false)))
  AND  coalesce(sa.actor, 'customer') NOT IN ('test-user', 'probe', 'synthetic')
GROUP  BY 1, 2
