-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- Page requests each day from the two kinds of visitor Google Analytics cannot see: bots and
-- synthetic traffic. GA4 drops known bots before export and the behaviour tests block every
-- GA4 request, but both reach CloudFront, whose access log needs no consent.
--
-- bot: the user-agent patterns of GA4_BOT_USER_AGENT_PATTERNS in web/public/lib/analytics.js
-- (crawlers, AI agents and the probe monitor). synthetic: the DIYAccountingProbe marker that
-- playwright.config.js appends to the user agent of every behaviour test. A request that
-- matches both counts as bot, the order the browser classifier uses. Only successful GET
-- requests for a page count, as in v_visitors_by_browser_daily.
--
-- c_ip is personal data and is not read, so the count is page requests and user agents, not
-- distinct visitors.
CREATE OR REPLACE VIEW v_visitors_cloudfront_daily AS
WITH page_requests AS (
  SELECT CAST(date_parse(date, '%Y-%m-%d') AS date) AS day,
         lower(url_decode(cs_user_agent)) AS ua
  FROM   cloudfront_requests
  WHERE  cs_method = 'GET'
    AND  sc_status = '200'
    AND  (cs_uri_stem = '/' OR cs_uri_stem LIKE '%.html')
),
classified AS (
  SELECT day,
         ua,
         CASE
           WHEN regexp_like(ua, 'googlebot|bingbot|applebot|slurp|duckduckbot|baiduspider|yandexbot|claudedesktop|chatgpt-user|perplexity-user|google-extended|diyaccounting-probe-monitor') THEN 'bot'
           WHEN ua LIKE '%diyaccountingprobe%' THEN 'synthetic'
         END AS visitor_kind
  FROM   page_requests
)
SELECT day,
       visitor_kind,
       count(*)                AS page_requests,
       count(DISTINCT ua)      AS user_agents
FROM   classified
WHERE  visitor_kind IS NOT NULL
GROUP  BY 1, 2
