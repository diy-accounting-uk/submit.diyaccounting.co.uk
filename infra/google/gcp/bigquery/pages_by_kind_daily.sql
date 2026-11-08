-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- Visitors and engaged time for one day of the GA4 export, by hostname, page and visitor kind.
-- The page is the path of page_location without its query string or fragment. engagement_msec
-- adds the engagement_time_msec parameter of every event on the page, the milliseconds the page
-- was in the foreground. visitor_kind is the user property the client sets to classify
-- authenticated, operator, human, bot and synthetic traffic. Events such as user_engagement
-- and scroll, which carry nearly all the engaged time, can arrive without the property. Each event
-- therefore takes the kind of its visitor for the
-- day: the first of bot, synthetic, operator, authenticated, human that any of that visitor's
-- events carries. It reads as "(unclassified)" only when no event of the visitor that day carries it.
SELECT day,
       hostname,
       page,
       visitor_kind,
       count(distinct user_pseudo_id)  AS users,
       sum(engagement_msec)            AS engagement_msec
FROM (
  SELECT day,
         hostname,
         page,
         coalesce(
           first_value(event_kind IGNORE NULLS) OVER (
             PARTITION BY user_pseudo_id, day
             ORDER BY CASE event_kind
                        WHEN 'bot' THEN 1 WHEN 'synthetic' THEN 2 WHEN 'operator' THEN 3
                        WHEN 'authenticated' THEN 4 WHEN 'human' THEN 5 ELSE 6 END
             ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
           ),
           '(unclassified)'
         )                                                                  AS visitor_kind,
         user_pseudo_id,
         engagement_msec,
         page_location
  FROM (
    SELECT parse_date('%Y%m%d', event_date)                                 AS day,
           device.web_info.hostname                                        AS hostname,
           (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_location') AS page_location,
           coalesce(regexp_extract(
             (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_location'),
             r'^https?://[^/?#]+(/[^?#]*)'), '/')                          AS page,
           (SELECT value.string_value FROM UNNEST(user_properties) WHERE key = 'visitor_kind') AS event_kind,
           user_pseudo_id,
           coalesce((SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'engagement_time_msec'), 0) AS engagement_msec
    FROM   `diyaccounting-ga4.analytics_523400333.events_*`
    WHERE  _TABLE_SUFFIX = format_date('%Y%m%d', date_sub(current_date(), interval 2 day))
  )
)
WHERE  page_location IS NOT NULL
GROUP  BY 1, 2, 3, 4
