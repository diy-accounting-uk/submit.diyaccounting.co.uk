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
-- actor is written once at checkout (billingWebhookPost.js) and carried unchanged on every
-- later row for the same subscription_id, so filtering on it does not disturb the lag()
-- ordering above. A row with no actor predates that field; it is counted as a customer rather
-- than dropped, the same fail-safe-to-LIVE default resolveActorClass() itself uses.
CREATE OR REPLACE VIEW v_subscription_cancellations_daily AS
WITH history AS (
  SELECT change_ts,
         bundle_id,
         status,
         cancel_at_period_end,
         actor,
         lag(status) OVER (PARTITION BY subscription_id ORDER BY change_ts) AS previous_status,
         lag(cancel_at_period_end) OVER (PARTITION BY subscription_id ORDER BY change_ts) AS previous_cancel_at_period_end
  FROM   dynamo_subscriptions
  WHERE  change_type = 'MODIFY')
SELECT date(change_ts) AS day,
       coalesce(bundle_id, 'unknown') AS bundle_id,
       count(*) AS cancellations
FROM   history
WHERE  ((status = 'canceled' AND (previous_status IS NULL OR previous_status <> 'canceled'))
   OR   (cancel_at_period_end = true AND (previous_cancel_at_period_end IS NULL OR previous_cancel_at_period_end = false)))
  AND  coalesce(actor, 'customer') NOT IN ('test-user', 'probe')
GROUP  BY 1, 2
