-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- How much cash commission was paid out in each calendar month?
--
-- A commission line is one "line#<id>" item under "commission#<referrer>" in the commissions
-- table, and dynamo_commissions carries every change to it, so each line reduces to its latest
-- state: the row with the newest change_ts. Only live-mode lines of a cash form that are in the
-- paid state count, in the month of paid_at (UTC). Credit-form lines are account credit, not
-- cash, and stay out. A reversal line has no paid_at and so adds nothing to any month.
CREATE OR REPLACE VIEW v_affiliate_cash_paid_monthly AS
WITH latest_lines AS (
  SELECT referrer_hash,
         line_id,
         max_by(form, change_ts) AS form,
         max_by(state, change_ts) AS state,
         max_by(amount_pence, change_ts) AS amount_pence,
         max_by(paid_at, change_ts) AS paid_at,
         max_by(livemode, change_ts) AS livemode
  FROM   aliased_dynamo_commissions
  WHERE  change_type <> 'REMOVE'
  GROUP  BY referrer_hash, line_id)
SELECT date_trunc('month', date(from_iso8601_timestamp(paid_at))) AS month,
       sum(amount_pence) AS cash_paid_pence
FROM   latest_lines
WHERE  livemode = true AND form = 'cash' AND state = 'paid' AND paid_at IS NOT NULL
GROUP  BY 1
