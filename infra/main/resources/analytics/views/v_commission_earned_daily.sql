-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- How much commission did the referred payments of each day earn, by cost group?
--
-- Earned is the amount of the commission lines written when the referred payment landed, whatever
-- their hold or payout state: held, payable and paid all count. A line in the reversed state (a
-- held or payable line reversed by a refund or a dispute) counts for nothing, and a reversal of a
-- paid line is a separate line with a negative amount that subtracts. The day is the day of the
-- charge. Live-mode lines only.
--
-- A commission line is one "line#<id>" item under "commission#<referrer>" in the commissions
-- table, and dynamo_commissions carries every change to it, so each line reduces to its latest
-- state: the row with the newest change_ts.
--
-- cost_group maps the tier ids of referrals.toml: customer is a credit against the customer's own
-- bill, casual and creator pay cash through Stripe Connect, family pays cash by bank transfer. A
-- tier id the mapping does not name lands in the group 'other', so a new tier shows up instead of
-- vanishing.
CREATE OR REPLACE VIEW v_commission_earned_daily AS
WITH latest_lines AS (
  SELECT referrer_hash,
         line_id,
         max_by(tier, change_ts) AS tier,
         max_by(state, change_ts) AS state,
         max_by(amount_pence, change_ts) AS amount_pence,
         max_by(charged_at, change_ts) AS charged_at,
         max_by(livemode, change_ts) AS livemode
  FROM   dynamo_commissions
  WHERE  change_type <> 'REMOVE'
  GROUP  BY referrer_hash, line_id)
SELECT date(from_iso8601_timestamp(charged_at)) AS day,
       CASE WHEN tier = 'customer' THEN 'referral-credit'
            WHEN tier IN ('casual', 'creator') THEN 'affiliate-cash'
            WHEN tier = 'family' THEN 'family-cash'
            ELSE 'other' END AS cost_group,
       coalesce(sum(CASE WHEN state = 'reversed' THEN 0 ELSE amount_pence END), 0) AS earned_pence
FROM   latest_lines
WHERE  livemode = true AND charged_at IS NOT NULL
GROUP  BY 1, 2
