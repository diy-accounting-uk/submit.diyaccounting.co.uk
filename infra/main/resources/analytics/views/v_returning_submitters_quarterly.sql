-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- Of the customers who submitted in a quarter, how many also submitted the previous quarter?
--
-- Reads dynamo_receipts rather than activity_events_all: a receipt's change record carries a
-- reliable hashed_sub straight off the DynamoDB item (see v_signup_to_first_submission.sql),
-- and the quarter is wrapped in date() because Glue cannot store a view column typed
-- 'timestamp with time zone', which is what date_trunc over from_iso8601_timestamp returns.
-- where the activity event does not. One customer can file more than once in a quarter, so
-- submitters is a distinct count, not a row count.
CREATE OR REPLACE VIEW v_returning_submitters_quarterly AS
WITH submitters_by_quarter AS (
  SELECT hashed_sub,
         date(date_trunc('quarter', from_iso8601_timestamp(created_at))) AS quarter
  FROM   dynamo_receipts
  WHERE  change_type = 'INSERT' AND actor = 'customer' AND hashed_sub IS NOT NULL
  GROUP  BY hashed_sub, date(date_trunc('quarter', from_iso8601_timestamp(created_at))))
SELECT this_quarter.quarter                                AS quarter,
       count(DISTINCT this_quarter.hashed_sub)              AS submitters,
       count(DISTINCT previous_quarter.hashed_sub)          AS returning_submitters
FROM   submitters_by_quarter this_quarter
LEFT JOIN submitters_by_quarter previous_quarter
  ON  previous_quarter.hashed_sub = this_quarter.hashed_sub
  AND previous_quarter.quarter = date_add('month', -3, this_quarter.quarter)
GROUP  BY this_quarter.quarter
