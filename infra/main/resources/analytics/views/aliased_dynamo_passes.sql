-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- dynamo_passes with each hash read through hash_aliases, so one account, pass or customer keeps one
-- hash across a salt rotation. A row with no alias keeps the hash it was written with.
CREATE OR REPLACE VIEW aliased_dynamo_passes AS
SELECT t.change_ts,
       t.change_type,
       t.source_table,
       t.env,
       coalesce(a_pass_id.current_hash, t.pass_id) AS pass_id,
       t.pass_type_id,
       t.bundle_id,
       coalesce(a_issued_by.current_hash, t.issued_by) AS issued_by,
       t.created_at,
       t.updated_at,
       t.use_count,
       t.revoked_at,
       t.actor,
       coalesce(a_redeemed_by.current_hash, t.redeemed_by) AS redeemed_by,
       t.redeemed_at,
       t.redemption_code,
       t.dt
FROM   dynamo_passes t
LEFT JOIN hash_aliases a_pass_id ON a_pass_id.old_hash = t.pass_id
LEFT JOIN hash_aliases a_issued_by ON a_issued_by.old_hash = t.issued_by
LEFT JOIN hash_aliases a_redeemed_by ON a_redeemed_by.old_hash = t.redeemed_by
