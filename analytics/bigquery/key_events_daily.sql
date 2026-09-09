-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- Key events for one day of the GA4 export, by hostname. The four events are read from what
-- each site sends: a "purchase" on submit.diyaccounting.co.uk is a subscription, a "purchase"
-- on spreadsheets.diyaccounting.co.uk is a donation, "file_download" (GA4's enhanced
-- measurement of a zip link) is a download, and "submit_vat_return" is a filed VAT return.
-- Add a row to the CASE below when a new key event or submission type is wired up.
SELECT day,
       hostname,
       key_event,
       count(*)                       AS events,
       count(distinct user_pseudo_id) AS users
FROM (
  SELECT parse_date('%Y%m%d', event_date) AS day,
         device.web_info.hostname         AS hostname,
         user_pseudo_id,
         CASE
           WHEN event_name = 'purchase' AND device.web_info.hostname LIKE '%submit.diyaccounting.co.uk' THEN 'subscribe'
           WHEN event_name = 'purchase' AND device.web_info.hostname = 'spreadsheets.diyaccounting.co.uk' THEN 'donate'
           WHEN event_name = 'submit_vat_return' THEN 'submit'
           WHEN event_name = 'file_download'     THEN 'download'
         END AS key_event
  FROM   `diyaccounting-ga4.analytics_523400333.events_*`
  WHERE  _TABLE_SUFFIX = format_date('%Y%m%d', date_sub(current_date(), interval 2 day))
    AND  event_name IN ('purchase', 'submit_vat_return', 'file_download')
)
WHERE  key_event IS NOT NULL
GROUP  BY 1, 2, 3
