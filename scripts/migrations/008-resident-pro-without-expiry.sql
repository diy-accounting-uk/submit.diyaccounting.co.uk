-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- The prod resident-pro rows with no expiry: the latest change per account is not a REMOVE, carries no
-- expires_at, was granted in 2026-02 or 2026-03, and the account holds no other bundle. Migration 008
-- runs this query on the lake (workgroup prod-env-analytics, database prod_env_analytics) and deletes
-- the rows named by its hashed_sub column.
WITH latest AS (
  SELECT hashed_sub,
         bundle_id,
         max_by(change_type, change_ts) AS change_type,
         max_by(expires_at, change_ts)  AS expires_at,
         max_by(granted_at, change_ts)  AS granted_at
  FROM   dynamo_bundles
  WHERE  env = 'prod' AND bundle_id NOT LIKE '#%'
  GROUP  BY hashed_sub, bundle_id),
no_expiry AS (
  SELECT hashed_sub, granted_at
  FROM   latest
  WHERE  bundle_id = 'resident-pro'
    AND  change_type <> 'REMOVE'
    AND  (expires_at IS NULL OR expires_at = '')
    AND  granted_at >= '2026-02' AND granted_at < '2026-04')
SELECT n.hashed_sub, n.granted_at
FROM   no_expiry n
WHERE  NOT EXISTS (
  SELECT 1 FROM latest o
  WHERE  o.hashed_sub = n.hashed_sub
    AND  o.bundle_id <> 'resident-pro'
    AND  o.change_type <> 'REMOVE')
ORDER  BY n.hashed_sub
