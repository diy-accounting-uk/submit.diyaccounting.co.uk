-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- Who read each page each day, and for how long?
--
-- One row per day, page (host and path, without the query string) and visitor kind: the distinct
-- visitors who had the page open and the milliseconds it was in the foreground for them. Built
-- from the GA4 daily aggregate, so it counts only visitors who accepted analytics. A visitor who
-- reads the page on two days counts once on each day.
CREATE OR REPLACE VIEW v_ga4_pages_by_kind_daily AS
SELECT dt AS day,
       concat(hostname, page)   AS page,
       visitor_kind,
       sum(users)               AS visitors,
       sum(engagement_msec)     AS engagement_msec
FROM   pages_by_kind_daily
GROUP  BY 1, 2, 3
