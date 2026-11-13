-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- Search Console clicks and impressions each day, by host and page family, for both domain
-- properties. position is the average position weighted by impressions. Search Console data
-- lags about two days, and each night's pull rewrites the last three days.
-- family comes from the host and the path; a Welsh page (/cy/...) takes the family of its
-- English page. Rules in order:
--   home         the home page of any site: /, /index.html
--   product      a spreadsheet product page on the spreadsheets site: /products/taxi-driver.html
--   article      a spreadsheets article: /articles/easy-taxi-driver-accounting.html
--   filing page  a Submit page for one filing: /vat-return-from-a-spreadsheet.html,
--                /micro-entity-accounts.html, /small-company-accounts.html,
--                /dormant-company-accounts.html, /confirmation-statement.html
--   tool         a Submit tool: /vat-return-due-date-and-penalty-points.html,
--                /company-filing-deadlines.html, /mtd-income-tax-checker.html
--   event page   a page for a dated event: /mtd-calendar.html, /rates.html, /events/<name>.html
--   other        every other page
CREATE OR REPLACE VIEW v_search_console_pages_daily AS
WITH pages AS (
  SELECT date(date) AS day,
         url_extract_host(page) AS host,
         regexp_replace(url_extract_path(page), '^/cy/', '/') AS path,
         clicks,
         impressions,
         position
  FROM   search_console_queries
)
SELECT day,
       host,
       CASE
         WHEN path IN ('', '/', '/index.html') THEN 'home'
         WHEN host = 'spreadsheets.diyaccounting.co.uk' AND path LIKE '/products/%' THEN 'product'
         WHEN host = 'spreadsheets.diyaccounting.co.uk' AND path LIKE '/articles/%' THEN 'article'
         WHEN host = 'submit.diyaccounting.co.uk' AND path IN (
                '/vat-return-from-a-spreadsheet.html',
                '/micro-entity-accounts.html',
                '/small-company-accounts.html',
                '/dormant-company-accounts.html',
                '/confirmation-statement.html') THEN 'filing page'
         WHEN host = 'submit.diyaccounting.co.uk' AND path IN (
                '/vat-return-due-date-and-penalty-points.html',
                '/company-filing-deadlines.html',
                '/mtd-income-tax-checker.html') THEN 'tool'
         WHEN host = 'submit.diyaccounting.co.uk' AND (
                path IN ('/mtd-calendar.html', '/rates.html') OR path LIKE '/events/%') THEN 'event page'
         ELSE 'other'
       END AS family,
       sum(clicks)      AS clicks,
       sum(impressions) AS impressions,
       if(sum(impressions) = 0, NULL,
          sum(position * impressions) / sum(impressions)) AS position
FROM   pages
GROUP  BY 1, 2, 3
