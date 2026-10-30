-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- How many spreadsheets were downloaded each day, and which?
--
-- The GA4 runner_download events from downloads_by_product_daily, by product, with the people
-- who downloaded. This is the first step of the path from the spreadsheets site to a first
-- filing in Submit.
CREATE OR REPLACE VIEW v_spreadsheets_downloads_daily AS
SELECT dt AS day,
       product,
       sum(downloads) AS downloads,
       sum(users)     AS users
FROM   downloads_by_product_daily
GROUP  BY 1, 2
