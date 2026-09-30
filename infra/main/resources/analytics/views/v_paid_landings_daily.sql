-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- Page requests each day whose query string carries an advertising click id (gclid) or a
-- utm_source, by landing page, utm_source and utm_campaign. The query string is read from
-- the CloudFront access log's own record of the request; nothing is stored on the visitor's
-- device, so consent does not gate the count. The click id itself is never selected, so no
-- value from this view can be uploaded to Google. Only successful GET requests for a page
-- count; crawlers, AI agents, scanners, the probe monitor, headless browsers and the
-- behaviour tests' marked user agent are left out. The client address is personal data and is
-- not read, so the count is page requests, not distinct visitors.
CREATE OR REPLACE VIEW v_paid_landings_daily AS
WITH page_requests AS (
  SELECT date_parse(date, '%Y-%m-%d') AS request_day,
         cs_uri_stem AS landing_page,
         lower(url_decode(cs_user_agent)) AS ua,
         CASE WHEN cs_uri_query IS NULL OR cs_uri_query = '-' THEN '' ELSE cs_uri_query END AS query
  FROM   cloudfront_requests
  WHERE  cs_method = 'GET'
    AND  sc_status = '200'
    AND  (cs_uri_stem = '/' OR cs_uri_stem LIKE '%.html')
),
tagged AS (
  SELECT request_day,
         landing_page,
         regexp_like(query, '(^|&)gclid=[^&]+') AS has_gclid,
         regexp_like(query, '(^|&)utm_source=[^&]+') AS has_utm_source,
         coalesce(lower(url_decode(nullif(regexp_extract(query, '(^|&)utm_source=([^&]*)', 2), ''))), '') AS utm_source,
         coalesce(lower(url_decode(nullif(regexp_extract(query, '(^|&)utm_campaign=([^&]*)', 2), ''))), '') AS utm_campaign
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
)
SELECT CAST(request_day AS date) AS day,
       landing_page,
       utm_source,
       utm_campaign,
       count_if(has_gclid) AS paid_landings,
       count_if(has_utm_source) AS utm_landings
FROM   tagged
WHERE  has_gclid OR has_utm_source
GROUP  BY 1, 2, 3, 4
