-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- Page requests and distinct visitors each day from the two kinds of visitor Google Analytics cannot see: bots and
-- synthetic traffic. GA4 drops known bots before export and the behaviour tests block every
-- GA4 request, but both reach CloudFront, whose access log needs no consent.
--
-- bot: the user-agent patterns of GA4_BOT_USER_AGENT_PATTERNS in web/public/lib/analytics.js
-- (crawlers, AI agents and the probe monitor). synthetic: the DIYAccountingProbe marker that
-- playwright.config.js appends to the user agent of every behaviour test. A request that
-- matches both counts as bot, the order the browser classifier uses. Only successful GET
-- requests for a page count, as in v_visitors_by_browser_daily.
--
-- c_ip is personal data. It is read only inside the visitors aggregate, as a salted hash, and
-- neither c_ip nor its hash is ever a column of this view or of a step inside it. The salt is
-- the day string joined to a fixed string below: a view cannot read a secret, and a salt that
-- changes each day means a hash from one day matches nothing from another, so a visitor is
-- counted within a day and never followed across days. The query is one step, with no
-- subquery, so c_ip never leaves the aggregate.
CREATE OR REPLACE VIEW v_visitors_cloudfront_daily AS
SELECT CAST(date_parse(date, '%Y-%m-%d') AS date) AS day,
       CASE
         WHEN regexp_like(lower(url_decode(cs_user_agent)), 'googlebot|bingbot|applebot|slurp|duckduckbot|baiduspider|yandexbot|claudedesktop|chatgpt-user|perplexity-user|google-extended|diyaccounting-probe-monitor') THEN 'bot'
         ELSE 'synthetic'
       END AS visitor_kind,
       count(*)                                  AS page_requests,
       count(DISTINCT lower(url_decode(cs_user_agent))) AS user_agents,
       count(DISTINCT to_hex(sha256(to_utf8(c_ip || '|' || date || '|diya-visitors-v1')))) AS visitors
FROM   cloudfront_requests
WHERE  cs_method = 'GET'
  AND  sc_status = '200'
  AND  (cs_uri_stem = '/' OR cs_uri_stem LIKE '%.html')
  AND  (regexp_like(lower(url_decode(cs_user_agent)), 'googlebot|bingbot|applebot|slurp|duckduckbot|baiduspider|yandexbot|claudedesktop|chatgpt-user|perplexity-user|google-extended|diyaccounting-probe-monitor')
        OR lower(url_decode(cs_user_agent)) LIKE '%diyaccountingprobe%')
GROUP  BY 1, 2
