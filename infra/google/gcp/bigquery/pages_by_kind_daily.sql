-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- Visitors and engaged time for one day of the GA4 export, by hostname, page and visitor kind.
-- The page is the path of page_location without its query string or fragment. engagement_msec
-- adds the engagement_time_msec parameter of every event on the page, the milliseconds the page
-- was in the foreground. visitor_kind is the user property the client sets to classify
-- authenticated, operator, human, bot and synthetic traffic; it reads as "(unclassified)" when
-- the property is not set.
SELECT day,
       hostname,
       page,
       visitor_kind,
       count(distinct user_pseudo_id)  AS users,
       sum(engagement_msec)            AS engagement_msec
FROM (
  SELECT parse_date('%Y%m%d', event_date)                                   AS day,
         device.web_info.hostname                                          AS hostname,
         coalesce(regexp_extract(
           (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_location'),
           r'^https?://[^/?#]+(/[^?#]*)'), '/')                            AS page,
         coalesce(
           (SELECT value.string_value FROM UNNEST(user_properties) WHERE key = 'visitor_kind'),
           '(unclassified)'
         )                                                                  AS visitor_kind,
         user_pseudo_id,
         coalesce((SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'engagement_time_msec'), 0) AS engagement_msec
  FROM   `diyaccounting-ga4.analytics_523400333.events_*`
  WHERE  _TABLE_SUFFIX = format_date('%Y%m%d', date_sub(current_date(), interval 2 day))
    AND  (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_location') IS NOT NULL
)
GROUP  BY 1, 2, 3, 4
