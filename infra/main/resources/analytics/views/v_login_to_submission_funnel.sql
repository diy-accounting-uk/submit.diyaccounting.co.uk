-- Of the customers active on a day, how many reach a submission within 7 days?
--
-- The cohort used to require a fresh 'login' or 'new-session' event, but a returning
-- customer's Cognito session rarely re-authenticates: real usage shows up as
-- 'hmrc-token-exchanged', 'vat-obligations-queried' and similar events, not a repeated login.
-- That left the cohort near-empty (a handful of genuine logins a week against dozens of daily
-- active customers) and the conversion reading zero most days. The cohort now matches
-- v_active_users_daily's own definition of "active": any customer event carrying a hashed sub.
CREATE OR REPLACE VIEW v_login_to_submission_funnel AS
WITH active AS (
  SELECT hashed_sub, date(event_ts) AS cohort_day
  FROM   activity_events_all
  WHERE  actor = 'customer' AND hashed_sub IS NOT NULL
  GROUP  BY hashed_sub, date(event_ts)),
subs AS (
  SELECT hashed_sub, event_ts AS submission_ts
  FROM   activity_events_all
  WHERE  actor = 'customer' AND event = 'vat-return-submitted')
SELECT a.cohort_day,
       count(DISTINCT a.hashed_sub) AS logged_in,
       count(DISTINCT s.hashed_sub) AS submitted_within_7d,
       cast(count(DISTINCT s.hashed_sub) AS double) / nullif(count(DISTINCT a.hashed_sub), 0) AS conversion
FROM   active a
LEFT JOIN subs s
  ON s.hashed_sub = a.hashed_sub
 AND s.submission_ts >= cast(a.cohort_day AS timestamp)
 AND s.submission_ts <  cast(a.cohort_day AS timestamp) + interval '7' day
GROUP  BY 1
