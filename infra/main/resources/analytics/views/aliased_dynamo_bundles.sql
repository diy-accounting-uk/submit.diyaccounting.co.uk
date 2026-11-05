-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- dynamo_bundles with each hash read through hash_aliases, so one account, pass or customer keeps one
-- hash across a salt rotation. A row with no alias keeps the hash it was written with.
CREATE OR REPLACE VIEW aliased_dynamo_bundles AS
SELECT t.change_ts,
       t.change_type,
       t.source_table,
       t.env,
       coalesce(a_hashed_sub.current_hash, t.hashed_sub) AS hashed_sub,
       t.bundle_id,
       t.granted_at,
       t.expires_at,
       t.ttl,
       t.actor,
       t.acq_utm_source,
       t.acq_utm_medium,
       t.acq_utm_campaign,
       t.acq_utm_content,
       t.acq_utm_term,
       t.acq_gclid,
       t.acq_msclkid,
       t.acq_ref,
       t.acq_landed_at,
       t.dt
FROM   dynamo_bundles t
LEFT JOIN hash_aliases a_hashed_sub ON a_hashed_sub.old_hash = t.hashed_sub
