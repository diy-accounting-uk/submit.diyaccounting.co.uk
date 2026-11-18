-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- Cohort retention: of the accounts opened in a month, how many submitted a VAT return in each
-- month since?
--
-- An account's cohort is the month of its first bundle grant, the signup of
-- v_signup_to_first_submission. Month 0 is the signup month itself, month 1 the month after, and
-- so on to the current month, so every cohort has a row for each month it has lived, with 0
-- submitters where none submitted. A submitter is an account of the cohort with a receipt in that
-- month. A quarterly VAT filer submits once in three months, so a cohort of quarterly filers reads
-- high in months 0, 3 and 6 and low between them. actor_class is the account's class from
-- v_account_class, unknown when no record names one.
CREATE OR REPLACE VIEW v_retention_cohorts_monthly AS
WITH signups AS (
  SELECT b.hashed_sub,
         date(date_trunc('month', min(from_iso8601_timestamp(b.granted_at)))) AS signup_month
  FROM   aliased_dynamo_bundles b
  WHERE  b.change_type = 'INSERT' AND b.hashed_sub IS NOT NULL AND b.granted_at IS NOT NULL
  GROUP  BY b.hashed_sub),
cohort_accounts AS (
  SELECT s.hashed_sub, s.signup_month, coalesce(c.actor_class, 'unknown') AS actor_class
  FROM   signups s
  LEFT JOIN v_account_class c ON c.hashed_sub = s.hashed_sub),
cohorts AS (
  SELECT signup_month, actor_class, count(*) AS accounts
  FROM   cohort_accounts
  GROUP  BY 1, 2),
cohort_months AS (
  SELECT cohorts.signup_month, cohorts.actor_class, cohorts.accounts, months_since_signup
  FROM   cohorts
  CROSS JOIN UNNEST(sequence(0, date_diff('month', cohorts.signup_month, date(date_trunc('month', current_date))))) AS t(months_since_signup)),
submission_months AS (
  SELECT DISTINCT hashed_sub, date(date_trunc('month', from_iso8601_timestamp(created_at))) AS submission_month
  FROM   aliased_dynamo_receipts
  WHERE  change_type = 'INSERT' AND hashed_sub IS NOT NULL AND created_at IS NOT NULL),
submitters AS (
  SELECT a.signup_month,
         a.actor_class,
         date_diff('month', a.signup_month, m.submission_month) AS months_since_signup,
         count(DISTINCT a.hashed_sub) AS submitters
  FROM   cohort_accounts a
  JOIN   submission_months m ON m.hashed_sub = a.hashed_sub AND m.submission_month >= a.signup_month
  GROUP  BY 1, 2, 3)
SELECT cm.signup_month,
       cm.actor_class,
       cm.months_since_signup,
       cm.accounts,
       coalesce(s.submitters, 0) AS submitters
FROM   cohort_months cm
LEFT JOIN submitters s
  ON  s.signup_month = cm.signup_month
  AND s.actor_class = cm.actor_class
  AND s.months_since_signup = cm.months_since_signup
