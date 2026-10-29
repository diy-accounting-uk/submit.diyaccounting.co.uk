-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- How many Submit sessions came from the spreadsheets site and from the gateway site?
--
-- GA4 sessions on a Submit hostname whose session source is the spreadsheets site (utm_source
-- or referrer "spreadsheets") or the gateway site (www.diyaccounting.co.uk or the bare domain),
-- by that origin, from sessions_by_host_source_daily. The GA4 property is shared by every site,
-- so the Submit hostname is a filter.
CREATE OR REPLACE VIEW v_submit_referrals_daily AS
SELECT dt AS day,
       CASE WHEN session_source LIKE 'spreadsheets%' THEN 'spreadsheets' ELSE 'www' END AS origin,
       sum(sessions) AS sessions,
       sum(users)    AS users
FROM   sessions_by_host_source_daily
WHERE  hostname LIKE '%submit.diyaccounting.co.uk'
  AND  (session_source LIKE 'spreadsheets%'
        OR session_source LIKE 'www.diyaccounting.co.uk%'
        OR session_source = 'www'
        OR session_source = 'diyaccounting.co.uk')
GROUP  BY 1, 2
