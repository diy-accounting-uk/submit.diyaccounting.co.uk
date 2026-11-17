-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- How long does a new account take to file its first return, by the class of the account?
--
-- Neither the login nor the vat-return-submitted activity event carries a hashed sub today
-- (only the failure path does), so this reads the two DynamoDB change tables instead: a
-- user's first bundle grant stands in for signup, and their first receipt stands in for their
-- first submission. Both tables carry a reliable hashed_sub straight off the DynamoDB item.
--
-- actor_class is the account's class from v_account_class: customer, test, synthetic, other or
-- unknown. An account with no actor on any of its records is unknown and is never counted as a
-- customer, so a figure of customers reads actor_class = 'customer'.
CREATE OR REPLACE VIEW v_signup_to_first_submission AS
WITH signups AS (
  SELECT hashed_sub, min(from_iso8601_timestamp(granted_at)) AS signup_at
  FROM   aliased_dynamo_bundles
  WHERE  change_type = 'INSERT' AND hashed_sub IS NOT NULL
  GROUP  BY hashed_sub),
first_submissions AS (
  SELECT hashed_sub, min(from_iso8601_timestamp(created_at)) AS first_submission_at
  FROM   aliased_dynamo_receipts
  WHERE  change_type = 'INSERT' AND hashed_sub IS NOT NULL
  GROUP  BY hashed_sub)
SELECT date(s.signup_at) AS signup_day,
       coalesce(c.actor_class, 'unknown') AS actor_class,
       count(*) AS new_accounts,
       count(f.hashed_sub) AS submitted,
       approx_percentile(date_diff('hour', s.signup_at, f.first_submission_at), 0.5)
         AS median_hours_to_first_submission
FROM   signups s
LEFT JOIN v_account_class c ON c.hashed_sub = s.hashed_sub
LEFT JOIN first_submissions f ON f.hashed_sub = s.hashed_sub
GROUP  BY 1, 2
