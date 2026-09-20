-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- Sessions for one day of the GA4 export, by hostname and by the session's last-click source
-- and medium. The property is shared by three hostnames (submit, spreadsheets, the gateway),
-- so hostname is a dimension here rather than a filter. session_traffic_source_last_click is
-- GA4's session-level attribution field; the event-level traffic_source column only carries a
-- user's first-ever acquisition source, which is the wrong thing to group a day of sessions by.
-- visitor_kind is a user property the client sets to classify human, bot and synthetic traffic;
-- it reads as "(unclassified)" until that tagging lands.
SELECT day,
       hostname,
       session_source,
       session_medium,
       visitor_kind,
       count(distinct session_key)     AS sessions,
       count(distinct user_pseudo_id)  AS users
FROM (
  SELECT parse_date('%Y%m%d', event_date)                                   AS day,
         device.web_info.hostname                                          AS hostname,
         coalesce(session_traffic_source_last_click.manual_campaign.source, '(not set)') AS session_source,
         coalesce(session_traffic_source_last_click.manual_campaign.medium, '(not set)') AS session_medium,
         coalesce(
           (SELECT value.string_value FROM UNNEST(user_properties) WHERE key = 'visitor_kind'),
           '(unclassified)'
         )                                                                  AS visitor_kind,
         user_pseudo_id,
         concat(
           user_pseudo_id, '.',
           cast((SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS string)
         )                                                                  AS session_key
  FROM   `diyaccounting-ga4.analytics_523400333.events_*`
  WHERE  _TABLE_SUFFIX = format_date('%Y%m%d', date_sub(current_date(), interval 2 day))
    AND  event_name = 'session_start'
)
GROUP  BY 1, 2, 3, 4, 5
