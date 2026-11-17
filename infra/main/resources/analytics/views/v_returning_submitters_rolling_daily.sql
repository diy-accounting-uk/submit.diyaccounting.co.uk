-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- Retention as a daily line: of the customers who submitted in the 90 days up to a day, how many
-- also submitted in the 90 days before that, and where did the others come from?
--
-- v_returning_submitters_quarterly answers the first question once a quarter. This view slides
-- the windows one day at a time, so the operator dashboard can draw a daily line. A submission
-- is a receipt's INSERT change record by a customer, in an account v_account_class reads as a
-- customer.
--
-- A quarterly VAT filer returns once in 90 days, so the 90 days before the window hold the
-- submitters due in it:
--   due_submitters_90d       submitted in the 90 days before the window.
--   returning_submitters_90d of those, submitted in the window too.
--   dormant_submitters_90d   of those, did not submit in the window.
-- The window's submitters are new, returning or resurrected, and the three add up to
-- submitters_90d:
--   new_submitters_90d         made their first submission in the window.
--   resurrected_submitters_90d submitted in the window and earlier than the 90 days before it,
--                              but not in those 90 days.
-- The 7 day window counts the customers who submitted in the 7 days up to the day, and of
-- those the ones who had also submitted before the 7 days.
--
-- The days run from 180 days back to today, which covers the dashboard's 90-day chart with the
-- earlier window already full.
CREATE OR REPLACE VIEW v_returning_submitters_rolling_daily AS
WITH submissions AS (
  SELECT r.hashed_sub,
         date(from_iso8601_timestamp(r.created_at)) AS submitted_on
  FROM   aliased_dynamo_receipts r
  JOIN   v_account_class c ON c.hashed_sub = r.hashed_sub AND c.actor_class = 'customer'
  WHERE  r.change_type = 'INSERT' AND r.actor = 'customer' AND r.hashed_sub IS NOT NULL
  GROUP  BY r.hashed_sub, date(from_iso8601_timestamp(r.created_at))),
calendar AS (
  SELECT cast(day AS date) AS day
  FROM   UNNEST(sequence(date_add('day', -180, current_date), current_date, interval '1' day)) AS t(day)),
account_days AS (
  SELECT calendar.day,
         s.hashed_sub,
         bool_or(s.submitted_on > date_add('day', -90, calendar.day)) AS in_window_90d,
         bool_or(s.submitted_on > date_add('day', -180, calendar.day)
                 AND s.submitted_on <= date_add('day', -90, calendar.day)) AS in_previous_90d,
         bool_or(s.submitted_on <= date_add('day', -180, calendar.day)) AS before_previous_90d,
         bool_or(s.submitted_on > date_add('day', -7, calendar.day)) AS in_window_7d,
         bool_or(s.submitted_on <= date_add('day', -7, calendar.day)) AS before_window_7d
  FROM   calendar
  JOIN   submissions s ON s.submitted_on <= calendar.day
  GROUP  BY calendar.day, s.hashed_sub)
SELECT calendar.day                                                                  AS day,
       count_if(a.in_window_90d)                                                     AS submitters_90d,
       count_if(a.in_window_90d AND a.in_previous_90d)                               AS returning_submitters_90d,
       count_if(a.in_previous_90d)                                                   AS due_submitters_90d,
       count_if(a.in_previous_90d AND NOT a.in_window_90d)                           AS dormant_submitters_90d,
       count_if(a.in_window_90d AND NOT a.in_previous_90d AND NOT a.before_previous_90d) AS new_submitters_90d,
       count_if(a.in_window_90d AND NOT a.in_previous_90d AND a.before_previous_90d) AS resurrected_submitters_90d,
       count_if(a.in_window_7d)                                                      AS submitters_7d,
       count_if(a.in_window_7d AND a.before_window_7d)                               AS returning_submitters_7d
FROM   calendar
LEFT JOIN account_days a ON a.day = calendar.day
GROUP  BY calendar.day
