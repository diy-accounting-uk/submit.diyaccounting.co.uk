-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- For each referrer: tier, state of the newest line, referrals, paying accounts, and commission held,
-- payable, paid and payable this month, in pence. Live-mode lines only.
--
-- A commission line is one "line#<id>" item under "commission#<referrer>" in the commissions table,
-- and dynamo_commissions carries every change to it, so each line reduces to its latest state: the
-- row with the newest change_ts. The tier is the tier of the referrer's newest line. A referral is a
-- redeemer with at least one line; a paying account is a redeemer with at least one line that is not
-- reversed. A reversal of a paid line is a separate line with reversal_of set and a negative amount;
-- it counts in neither payable nor paid, as v_affiliate_commissions_monthly counts it. Payable this
-- month is the payable pence of lines whose charge fell in the current UTC month: the figure the
-- operator pays by bank transfer for a family referrer.
CREATE OR REPLACE VIEW v_affiliate_referrers AS
WITH latest_lines AS (
  SELECT referrer_hash,
         line_id,
         max_by(redeemer_hash, change_ts) AS redeemer_hash,
         max_by(tier, change_ts) AS tier,
         max_by(state, change_ts) AS state,
         max_by(amount_pence, change_ts) AS amount_pence,
         max_by(reversal_of, change_ts) AS reversal_of,
         max_by(charged_at, change_ts) AS charged_at,
         max_by(livemode, change_ts) AS livemode,
         max(change_ts) AS changed_at
  FROM   dynamo_commissions
  WHERE  change_type <> 'REMOVE'
  GROUP  BY referrer_hash, line_id)
SELECT referrer_hash,
       max_by(tier, changed_at) AS tier,
       max_by(state, changed_at) AS latest_line_state,
       count(DISTINCT redeemer_hash) AS referrals,
       count(DISTINCT CASE WHEN state <> 'reversed' AND reversal_of IS NULL THEN redeemer_hash END) AS paying_accounts,
       coalesce(sum(CASE WHEN state = 'held' THEN amount_pence END), 0) AS held_pence,
       coalesce(sum(CASE WHEN state = 'payable' AND reversal_of IS NULL THEN amount_pence END), 0) AS payable_pence,
       coalesce(sum(CASE WHEN state = 'paid' THEN amount_pence END), 0) AS paid_pence,
       coalesce(sum(CASE WHEN state = 'payable' AND reversal_of IS NULL
                          AND date_trunc('month', from_iso8601_timestamp(charged_at)) = date_trunc('month', current_timestamp)
                         THEN amount_pence END), 0) AS payable_this_month_pence
FROM   latest_lines
WHERE  livemode = true AND charged_at IS NOT NULL
GROUP  BY referrer_hash
