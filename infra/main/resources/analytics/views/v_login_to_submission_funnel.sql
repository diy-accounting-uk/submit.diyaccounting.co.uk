-- Of the people who logged in on a day, how many reached a submission within 7 days?
CREATE OR REPLACE VIEW v_login_to_submission_funnel AS
WITH logins AS (
  SELECT hashed_sub, min(event_ts) AS first_login, date(min(event_ts)) AS cohort_day
  FROM activity_events_all
  WHERE actor = 'customer' AND event IN ('login', 'new-session') AND hashed_sub IS NOT NULL
  GROUP BY hashed_sub),
subs AS (
  SELECT hashed_sub, min(event_ts) AS first_submission
  FROM activity_events_all
  WHERE actor = 'customer' AND event = 'vat-return-submitted'
  GROUP BY hashed_sub)
SELECT l.cohort_day,
       count(*) AS logged_in,
       count(s.hashed_sub) AS submitted_within_7d,
       cast(count(s.hashed_sub) AS double) / nullif(count(*), 0) AS conversion
FROM   logins l
LEFT JOIN subs s
  ON s.hashed_sub = l.hashed_sub
 AND s.first_submission BETWEEN l.first_login AND l.first_login + interval '7' day
GROUP  BY 1
