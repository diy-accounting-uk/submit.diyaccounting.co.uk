-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- How many HMRC authentications, bundle grants and bundle deletions happened each day?
--
-- The operations dashboard used to count these as Lambda invocations of the live deployment: a
-- fair proxy on the day, but wrong as history, since a deploy renames the functions and the
-- count resets to zero. These activity events carry the same business facts and outlive any
-- one deployment.
CREATE OR REPLACE VIEW v_business_activity_daily AS
SELECT date(event_ts) AS day,
       event AS activity,
       count(*) AS operations
FROM   activity_events_all
WHERE  actor = 'customer' AND event IN ('hmrc-token-exchanged', 'bundle-granted', 'bundle-deleted')
GROUP  BY 1, 2
