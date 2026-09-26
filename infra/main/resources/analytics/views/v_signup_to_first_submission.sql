-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- How long does a new account take to file its first return?
--
-- Neither the login nor the vat-return-submitted activity event carries a hashed sub today
-- (only the failure path does), so this reads the two DynamoDB change tables instead: a
-- user's first bundle grant stands in for signup, and their first receipt stands in for their
-- first submission. Both tables carry a reliable hashed_sub straight off the DynamoDB item.
--
-- dynamo_bundles itself carries no actor at all, so a signup cannot be filtered from that table
-- alone. The bundle-granted and subscription-activated activity events publish a reliable actor
-- for the same hashed_sub at the moment the grant happened, so this joins to those instead. A
-- signup with no matching event (a grant path that does not publish either event) is counted as
-- a customer rather than dropped, the same fail-safe-to-LIVE default resolveActorClass() itself
-- uses.
CREATE OR REPLACE VIEW v_signup_to_first_submission AS
WITH signup_actor AS (
  SELECT hashed_sub, arbitrary(actor) AS actor
  FROM   activity_events_all
  WHERE  event IN ('bundle-granted', 'subscription-activated') AND hashed_sub IS NOT NULL
  GROUP  BY hashed_sub),
signups AS (
  SELECT hashed_sub, min(from_iso8601_timestamp(granted_at)) AS signup_at
  FROM   dynamo_bundles
  WHERE  change_type = 'INSERT' AND hashed_sub IS NOT NULL
  GROUP  BY hashed_sub),
first_submissions AS (
  SELECT hashed_sub, min(from_iso8601_timestamp(created_at)) AS first_submission_at
  FROM   dynamo_receipts
  WHERE  change_type = 'INSERT' AND actor = 'customer' AND hashed_sub IS NOT NULL
  GROUP  BY hashed_sub)
SELECT date(s.signup_at) AS signup_day,
       count(*) AS new_accounts,
       count(f.hashed_sub) AS submitted,
       approx_percentile(date_diff('hour', s.signup_at, f.first_submission_at), 0.5)
         AS median_hours_to_first_submission
FROM   signups s
LEFT JOIN signup_actor sa ON sa.hashed_sub = s.hashed_sub
LEFT JOIN first_submissions f ON f.hashed_sub = s.hashed_sub
WHERE  coalesce(sa.actor, 'customer') NOT IN ('test-user', 'probe', 'synthetic')
GROUP  BY 1
