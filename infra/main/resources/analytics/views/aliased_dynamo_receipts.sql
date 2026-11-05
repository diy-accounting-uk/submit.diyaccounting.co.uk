-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- dynamo_receipts with each hash read through hash_aliases, so one account, pass or customer keeps one
-- hash across a salt rotation. A row with no alias keeps the hash it was written with.
CREATE OR REPLACE VIEW aliased_dynamo_receipts AS
SELECT t.change_ts,
       t.change_type,
       t.source_table,
       t.env,
       coalesce(a_hashed_sub.current_hash, t.hashed_sub) AS hashed_sub,
       t.receipt_id,
       t.created_at,
       t.actor,
       t.form_bundle_number,
       t.processing_date,
       t.charge_ref_number,
       t.dt
FROM   dynamo_receipts t
LEFT JOIN hash_aliases a_hashed_sub ON a_hashed_sub.old_hash = t.hashed_sub
