-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- How many subscriptions renewed each day, by bundle and by the class of the account?
--
-- billingWebhookPost writes one subscription-renewed activity event for each paid renewal
-- invoice, so a renewal is a row here. actor_class is the account's class from v_account_class,
-- else the class of the event's own actor. A renewal with neither is unknown and is never
-- counted as a customer.
CREATE OR REPLACE VIEW v_subscription_renewals_daily AS
SELECT date(e.event_ts) AS day,
       coalesce(e.bundle_id, 'unknown') AS bundle_id,
       coalesce(c.actor_class,
                CASE e.actor WHEN 'customer' THEN 'customer' WHEN 'test-user' THEN 'test' WHEN 'probe' THEN 'synthetic'
                             WHEN 'synthetic' THEN 'synthetic' WHEN 'operator' THEN 'other' ELSE 'unknown' END) AS actor_class,
       count(*) AS renewals
FROM   activity_events_all e
LEFT JOIN v_account_class c ON c.hashed_sub = e.hashed_sub
WHERE  e.event = 'subscription-renewed'
GROUP  BY 1, 2, 3
