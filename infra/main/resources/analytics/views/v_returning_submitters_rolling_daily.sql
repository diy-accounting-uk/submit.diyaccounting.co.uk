-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- Retention as a daily line: of the customers who submitted in the 90 days up to a day, how many
-- also submitted in the 90 days before that?
--
-- v_returning_submitters_quarterly answers the same question once a quarter. This view slides
-- the two 90-day windows one day at a time, so the operator dashboard can draw a daily line.
-- Same source and filters as the quarterly view: a receipt's INSERT change record by a customer.
-- The days run from 180 days back to today, which covers the dashboard's 90-day chart with the
-- earlier window already full.
CREATE OR REPLACE VIEW v_returning_submitters_rolling_daily AS
WITH submissions AS (
  SELECT hashed_sub,
         date(from_iso8601_timestamp(created_at)) AS submitted_on
  FROM   dynamo_receipts
  WHERE  change_type = 'INSERT' AND actor = 'customer' AND hashed_sub IS NOT NULL
  GROUP  BY hashed_sub, date(from_iso8601_timestamp(created_at))),
calendar AS (
  SELECT cast(day AS date) AS day
  FROM   UNNEST(sequence(date_add('day', -180, current_date), current_date, interval '1' day)) AS t(day))
SELECT calendar.day                                  AS day,
       count(DISTINCT recent.hashed_sub)              AS submitters_90d,
       count(DISTINCT earlier.hashed_sub)             AS returning_submitters_90d
FROM   calendar
LEFT JOIN submissions recent
  ON  recent.submitted_on >  date_add('day', -90, calendar.day)
  AND recent.submitted_on <= calendar.day
LEFT JOIN submissions earlier
  ON  earlier.hashed_sub   = recent.hashed_sub
  AND earlier.submitted_on >  date_add('day', -180, calendar.day)
  AND earlier.submitted_on <= date_add('day', -90, calendar.day)
GROUP  BY calendar.day
