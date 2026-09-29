-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- How many subscriptions renewed each day, by bundle?
--
-- billingWebhookPost writes one subscription-renewed activity event for each paid renewal
-- invoice, so a renewal is a row here. The event's actor is set from the subscription record
-- at the moment the webhook fired; a row with no actor is counted as a customer, the same
-- fail-safe-to-LIVE default resolveActorClass() itself uses.
CREATE OR REPLACE VIEW v_subscription_renewals_daily AS
SELECT date(event_ts) AS day,
       coalesce(bundle_id, 'unknown') AS bundle_id,
       count(*) AS renewals
FROM   activity_events_all
WHERE  event = 'subscription-renewed'
  AND  coalesce(actor, 'customer') NOT IN ('test-user', 'probe', 'synthetic')
GROUP  BY 1, 2
