-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- dynamo_commissions with each hash read through hash_aliases, so one account, pass or customer keeps one
-- hash across a salt rotation. A row with no alias keeps the hash it was written with.
CREATE OR REPLACE VIEW aliased_dynamo_commissions AS
SELECT t.change_ts,
       t.change_type,
       t.source_table,
       t.env,
       coalesce(a_referrer_hash.current_hash, t.referrer_hash) AS referrer_hash,
       t.line_id,
       t.invoice_id,
       t.charge_id,
       t.subscription_id,
       coalesce(a_redeemer_hash.current_hash, t.redeemer_hash) AS redeemer_hash,
       t.referral_code,
       t.tier,
       t.form,
       t.payout,
       t.rate_bps,
       t.gross_pence,
       t.net_pence,
       t.amount_pence,
       t.currency,
       t.eligible_months,
       t.line_months,
       t.state,
       t.hold_reasons,
       t.charged_at,
       t.release_at,
       t.payable_at,
       t.paid_at,
       t.reversed_at,
       t.reversal_reason,
       t.reversal_of,
       t.livemode,
       t.dt
FROM   dynamo_commissions t
LEFT JOIN hash_aliases a_referrer_hash ON a_referrer_hash.old_hash = t.referrer_hash
LEFT JOIN hash_aliases a_redeemer_hash ON a_redeemer_hash.old_hash = t.redeemer_hash
