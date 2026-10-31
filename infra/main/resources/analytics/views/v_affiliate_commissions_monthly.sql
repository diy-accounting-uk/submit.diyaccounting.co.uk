-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- How much commission is held, payable, paid and reversed, by month and tier?
--
-- A commission line is one "line#<id>" item under "commission#<referrer>" in the commissions
-- table, and dynamo_commissions carries every change to it, so each line reduces to its latest
-- state: the row with the newest change_ts. Only live-mode lines count. The month is the month of
-- the charge the line came from.
--
-- A reversal of a paid line is a separate line with a negative amount and reversal_of set. It
-- counts in reversed_pence as a positive amount and not in payable_pence; the original line stays
-- in paid_pence.
CREATE OR REPLACE VIEW v_affiliate_commissions_monthly AS
WITH latest_lines AS (
  SELECT referrer_hash,
         line_id,
         max_by(tier, change_ts) AS tier,
         max_by(state, change_ts) AS state,
         max_by(amount_pence, change_ts) AS amount_pence,
         max_by(reversal_of, change_ts) AS reversal_of,
         max_by(charged_at, change_ts) AS charged_at,
         max_by(livemode, change_ts) AS livemode
  FROM   dynamo_commissions
  WHERE  change_type <> 'REMOVE'
  GROUP  BY referrer_hash, line_id)
SELECT date_trunc('month', date(from_iso8601_timestamp(charged_at))) AS month,
       tier,
       coalesce(sum(CASE WHEN state = 'held' THEN amount_pence END), 0) AS held_pence,
       coalesce(sum(CASE WHEN state = 'payable' AND reversal_of IS NULL THEN amount_pence END), 0) AS payable_pence,
       coalesce(sum(CASE WHEN state = 'paid' THEN amount_pence END), 0) AS paid_pence,
       coalesce(sum(CASE WHEN state = 'reversed' THEN amount_pence WHEN reversal_of IS NOT NULL THEN -amount_pence END), 0) AS reversed_pence,
       count(*) AS lines
FROM   latest_lines
WHERE  livemode = true AND charged_at IS NOT NULL
GROUP  BY 1, 2
