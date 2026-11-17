-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- The class of each account: customer, test, synthetic, other or unknown, the classes of
-- actorClassOf in app/lib/operatorSnapshot/dataSection.js.
--
-- Every record that names an actor for the account is evidence: its activity events, and the
-- receipts, bundles, subscriptions and passes it owns or issued. A test user, a probe or an
-- operator record wins over a customer record, in that order, because an event or an item
-- written with no email reads 'customer'. A 'system' record (a webhook or a scheduled job acting
-- for the account) says nothing about who owns the account, so it is not evidence. An account
-- with no evidence reads unknown, and unknown is never counted as a customer.
--
-- Each hash is read through hash_aliases (activity_events_all and the aliased_* views), so one
-- account has one row across a salt rotation.
CREATE OR REPLACE VIEW v_account_class AS
WITH evidence AS (
  SELECT hashed_sub, actor FROM activity_events_all WHERE hashed_sub IS NOT NULL AND actor IS NOT NULL
  UNION ALL
  SELECT hashed_sub, actor FROM aliased_dynamo_receipts WHERE hashed_sub IS NOT NULL AND actor IS NOT NULL
  UNION ALL
  SELECT hashed_sub, actor FROM aliased_dynamo_bundles WHERE hashed_sub IS NOT NULL AND actor IS NOT NULL
  UNION ALL
  SELECT hashed_sub, actor FROM aliased_dynamo_subscriptions WHERE hashed_sub IS NOT NULL AND actor IS NOT NULL
  UNION ALL
  SELECT issued_by AS hashed_sub, actor FROM aliased_dynamo_passes WHERE issued_by IS NOT NULL AND actor IS NOT NULL)
SELECT hashed_sub,
       CASE WHEN bool_or(actor = 'test-user') THEN 'test'
            WHEN bool_or(actor IN ('probe', 'synthetic')) THEN 'synthetic'
            WHEN bool_or(actor = 'operator') THEN 'other'
            WHEN bool_or(actor = 'customer') THEN 'customer'
            ELSE 'unknown' END AS actor_class
FROM   evidence
GROUP  BY hashed_sub
