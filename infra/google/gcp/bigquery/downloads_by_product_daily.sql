-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- Downloads for one day of the GA4 export, by product. A download is GA4's enhanced-measurement
-- "file_download" event on a zip link; its "file_name" parameter is the URL path of the zip,
-- e.g. /zips/GB%20Accounts%20Taxi%20Driver%202027-04-05%20(Apr27)%20Excel%202007.zip, so the
-- product is that path with the directory, the percent-encoding and the extension removed.
SELECT parse_date('%Y%m%d', event_date) AS day,
       coalesce(
         regexp_replace(
           regexp_replace(
             (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'file_name'),
             r'^.*/', ''),
           r'\.[A-Za-z0-9]+$', ''),
         '(not set)'
       )                               AS product,
       count(*)                       AS downloads,
       count(distinct user_pseudo_id) AS users
FROM   `diyaccounting-ga4.analytics_523400333.events_*`
WHERE  _TABLE_SUFFIX = format_date('%Y%m%d', date_sub(current_date(), interval 2 day))
  AND  event_name = 'file_download'
GROUP  BY 1, 2
