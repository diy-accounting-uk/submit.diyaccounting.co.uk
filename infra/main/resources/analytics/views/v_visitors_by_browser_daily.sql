-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- Page requests each day by browser and operating system, read from the CloudFront access
-- log's user agent, which needs no consent. Only successful GET requests for a page count.
-- Crawlers, AI agents, scanners, the probe monitor, headless browsers and the behaviour
-- tests' marked user agent are left out.
-- Edge and Opera are matched before Chrome because both carry a Chrome token. c_ip is
-- personal data and is not read, so the count is page requests, not distinct visitors.
CREATE OR REPLACE VIEW v_visitors_by_browser_daily AS
WITH page_requests AS (
  SELECT date_parse(date, '%Y-%m-%d') AS request_day,
         lower(url_decode(cs_user_agent)) AS ua
  FROM   cloudfront_requests
  WHERE  cs_method = 'GET'
    AND  sc_status = '200'
    AND  (cs_uri_stem = '/' OR cs_uri_stem LIKE '%.html')
)
SELECT CAST(request_day AS date) AS day,
       CASE
         WHEN ua LIKE '%edg/%' OR ua LIKE '%edga/%' OR ua LIKE '%edgios/%' THEN 'Edge'
         WHEN ua LIKE '%opr/%' OR ua LIKE '%opios/%' THEN 'Opera'
         WHEN ua LIKE '%samsungbrowser/%' THEN 'Samsung'
         WHEN ua LIKE '%firefox/%' OR ua LIKE '%fxios/%' THEN 'Firefox'
         WHEN ua LIKE '%chrome/%' OR ua LIKE '%crios/%' THEN 'Chrome'
         WHEN ua LIKE '%safari/%' THEN 'Safari'
         ELSE 'other'
       END AS browser,
       CASE
         WHEN ua LIKE '%windows%' THEN 'Windows'
         WHEN ua LIKE '%iphone%' OR ua LIKE '%ipad%' OR ua LIKE '%ipod%' THEN 'iOS'
         WHEN ua LIKE '%android%' THEN 'Android'
         WHEN ua LIKE '%mac os x%' OR ua LIKE '%macintosh%' THEN 'macOS'
         WHEN ua LIKE '%linux%' OR ua LIKE '%x11%' THEN 'Linux'
         ELSE 'other'
       END AS os,
       count(*) AS page_requests
FROM   page_requests
WHERE  ua NOT LIKE '%bot%'
  AND  ua NOT LIKE '%crawler%'
  AND  ua NOT LIKE '%spider%'
  AND  ua NOT LIKE '%slurp%'
  AND  ua NOT LIKE '%headless%'
  AND  ua NOT LIKE '%pa11y%'
  AND  ua NOT LIKE '%probe-monitor%'
  AND  ua NOT LIKE '%palo alto%'
  AND  ua NOT LIKE '%diyaccountingprobe%'
  AND  ua NOT LIKE '%claudedesktop%'
  AND  ua NOT LIKE '%chatgpt-user%'
  AND  ua NOT LIKE '%perplexity-user%'
  AND  ua NOT LIKE '%google-extended%'
GROUP  BY 1, 2, 3
