-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- GA4 sessions each day by traffic source and host, kept for AI assistants, search engines and
-- gov.uk sources, for every site on the one GA4 property. GA4 counts only visitors who accept
-- the cookie banner, about 13% of visits, so each figure is a floor.
-- referrer names the assistant, search engine or government site. kind is assistant, search
-- or government. Any other source is left out.
CREATE OR REPLACE VIEW v_ai_referrals_daily AS
WITH classified AS (
  SELECT date(date) AS day,
         hostName AS host,
         lower(sessionSource) AS source,
         CASE
           WHEN lower(sessionSource) IN ('chatgpt.com', 'chat.openai.com') THEN 'ChatGPT'
           WHEN lower(sessionSource) IN ('perplexity.ai', 'www.perplexity.ai') THEN 'Perplexity'
           WHEN lower(sessionSource) = 'claude.ai' THEN 'Claude'
           WHEN lower(sessionSource) = 'gemini.google.com' THEN 'Gemini'
           WHEN lower(sessionSource) = 'copilot.microsoft.com' THEN 'Copilot'
           WHEN lower(sessionSource) IN ('google', 'google.com', 'www.google.com') THEN 'Google'
           WHEN lower(sessionSource) IN ('bing', 'bing.com', 'www.bing.com') THEN 'Bing'
           WHEN lower(sessionSource) IN ('duckduckgo', 'duckduckgo.com') THEN 'DuckDuckGo'
           WHEN lower(sessionSource) IN ('ecosia', 'ecosia.org', 'www.ecosia.org') THEN 'Ecosia'
           WHEN lower(sessionSource) IN ('yahoo', 'search.yahoo.com', 'uk.search.yahoo.com') THEN 'Yahoo'
           WHEN lower(sessionSource) IN ('brave', 'search.brave.com') THEN 'Brave'
           WHEN lower(sessionSource) = 'gov.uk' OR lower(sessionSource) LIKE '%.gov.uk' THEN 'gov.uk'
         END AS referrer,
         sessions,
         activeUsers,
         engagedSessions
  FROM   ga4_sources
)
SELECT day,
       host,
       CASE
         WHEN referrer IN ('ChatGPT', 'Perplexity', 'Claude', 'Gemini', 'Copilot') THEN 'assistant'
         WHEN referrer = 'gov.uk' THEN 'government'
         ELSE 'search'
       END AS kind,
       referrer,
       source,
       sum(sessions)        AS sessions,
       sum(activeUsers)     AS active_users,
       sum(engagedSessions) AS engaged_sessions
FROM   classified
WHERE  referrer IS NOT NULL
GROUP  BY 1, 2, 3, 4, 5
