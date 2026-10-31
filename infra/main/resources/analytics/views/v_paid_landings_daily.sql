-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- @capability DATA-58 Count paid landings from CloudFront access logs
-- - **Use when:** paid landing page requests must be counted per day, landing page, utm_source and utm_campaign.
-- - **Does:** v_paid_landings_daily counts successful GET requests to pages whose query string carries a gclid (Google Ads click id), msclkid (Microsoft Advertising click id) or utm_source parameter, read from the CloudFront access log's cs_uri_query field. Only page requests for site pages (/ or *.html) count; crawlers and synthetic traffic are filtered by user agent. The click id itself is never selected, so no lake row contains a value gclid sends to Google. Consent does not gate the count because nothing is stored on the visitor's device. BusinessViews.java registers the view. operatorSnapshotPublish.js measures paid-landings and ads-cost-per-paid-landing-gbp observations from it.
-- - **Run:** no command; see Does and Entry
-- - **Entry:** `infra/main/resources/analytics/views/v_paid_landings_daily.sql:`
-- - **Files:** infra/main/resources/analytics/views/v_paid_landings_daily.sql, infra/main/java/co/uk/diyaccounting/submit/stacks/analytics/BusinessViews.java, app/functions/analytics/operatorSnapshotPublish.js, app/unit-tests/analytics/operatorSnapshotPublish.test.js, infra/test/java/co/uk/diyaccounting/submit/stacks/analytics/BusinessViewsTest.java
-- - **Keywords:** paid landings, gclid, utm_source, utm_campaign, cloudfront access log, page requests, no consent needed, operator objective
-- - **Related:** DATA-59, DATA-32
-- @end-capability

-- Page requests each day whose query string carries an advertising click id (gclid for Google,
-- msclkid for Microsoft) or a utm_source, by landing page, utm_source and utm_campaign. The
-- query string is read from the CloudFront access log's own record of the request; nothing is
-- stored on the visitor's device, so consent does not gate the count. The click id itself is
-- never selected, so no value from this view can be uploaded to Google or Microsoft. Only
-- successful GET requests for a page count; crawlers, AI agents, scanners, the probe monitor, headless browsers and the
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
         regexp_like(query, '(^|&)msclkid=[^&]+') AS has_msclkid,
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
       count_if(has_msclkid) AS msclkid_landings,
       count_if(has_utm_source) AS utm_landings
FROM   tagged
WHERE  has_gclid OR has_msclkid OR has_utm_source
GROUP  BY 1, 2, 3, 4
