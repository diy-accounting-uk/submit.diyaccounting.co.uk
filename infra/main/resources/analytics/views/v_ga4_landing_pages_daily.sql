-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- Which page did each day's sessions start on, and how many of them signed in?
--
-- One row per day and landing page (host and path, without the query string): the GA4 sessions
-- whose first event was on that page, and the sessions that went on to a login event. Built from
-- the GA4 BigQuery export the same way as v_ga4_funnel_daily, so it counts only visitors who
-- accepted analytics.
CREATE OR REPLACE VIEW v_ga4_landing_pages_daily AS
WITH session_pages AS (
  SELECT concat(user_pseudo_id, '.', cast(ga_session_id AS varchar)) AS session_key,
         min(dt) AS day,
         min_by(page_location, event_ts) FILTER (WHERE page_location IS NOT NULL) AS landing_location,
         count_if(event_name = 'login') > 0 AS signed_in
  FROM   ga4_bq_events
  WHERE  stream_id = '13497119809' AND ga_session_id IS NOT NULL
  GROUP  BY 1
)
SELECT day,
       coalesce(nullif(regexp_replace(landing_location, '^https?://([^?#]*).*$', '$1'), ''), '(not set)') AS landing_page,
       count(*)                  AS sessions,
       count_if(signed_in)       AS sign_ins
FROM   session_pages
GROUP  BY 1, 2
