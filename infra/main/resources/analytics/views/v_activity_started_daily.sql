-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- activity-started (activityStartedPost.js) carries the catalogue's own activity id directly,
-- so this view needs no event-name-to-activity mapping the way v_submissions_by_activity_daily
-- does -- activity_id is already the id the operator dashboard's table keys by.
CREATE OR REPLACE VIEW v_activity_started_daily AS
SELECT date(event_ts) AS day, activity_id AS activity, app_client,
       count(*)                   AS starts,
       count(DISTINCT hashed_sub) AS customers
FROM   activity_events_all
WHERE  actor = 'customer' AND event = 'activity-started' AND activity_id IS NOT NULL
GROUP  BY 1, 2, 3
