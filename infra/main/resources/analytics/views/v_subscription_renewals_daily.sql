-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- How many subscriptions renewed each day, by bundle?
--
-- dynamo_subscriptions carries one change record per write to the subscriptions table. A
-- renewal shows up as a MODIFY whose current_period_end moved forward with the status staying
-- "active" (a cancellation also modifies the row, but leaves current_period_end where it was
-- until the period actually ends, or sets cancel_at_period_end instead of moving the date).
--
-- dynamo_subscriptions.actor is unreliable the same way v_subscription_cancellations_daily's
-- comment explains: it is only ever set by the checkout write, and prod carries subscriptions
-- inserted before that write shipped with no actor at all. This joins to activity_events_all's
-- subscription-lifecycle events for the same subscription_id instead, which carry a reliable
-- actor set at the moment each webhook fired. A subscription with no matching event anywhere is
-- counted as a customer rather than dropped, the same fail-safe-to-LIVE default
-- resolveActorClass() itself uses.
CREATE OR REPLACE VIEW v_subscription_renewals_daily AS
WITH subscription_actor AS (
  SELECT subscription_id, arbitrary(actor) AS actor
  FROM   activity_events_all
  WHERE  subscription_id IS NOT NULL AND actor IS NOT NULL
  GROUP  BY subscription_id),
history AS (
  SELECT change_ts,
         change_type,
         subscription_id,
         bundle_id,
         status,
         current_period_end,
         lag(current_period_end) OVER (PARTITION BY subscription_id ORDER BY change_ts) AS previous_period_end
  FROM   dynamo_subscriptions)
SELECT date(h.change_ts) AS day,
       coalesce(h.bundle_id, 'unknown') AS bundle_id,
       count(*) AS renewals
FROM   history h
LEFT JOIN subscription_actor sa ON sa.subscription_id = h.subscription_id
WHERE  h.change_type = 'MODIFY'
  AND  h.status = 'active'
  AND  h.previous_period_end IS NOT NULL
  AND  h.current_period_end > h.previous_period_end
  AND  coalesce(sa.actor, 'customer') NOT IN ('test-user', 'probe', 'synthetic')
GROUP  BY 1, 2
