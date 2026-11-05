-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- stripe_subscriptions with each hash read through hash_aliases, so one account, pass or customer keeps one
-- hash across a salt rotation. A row with no alias keeps the hash it was written with.
CREATE OR REPLACE VIEW aliased_stripe_subscriptions AS
SELECT t.id,
       t.status,
       t.created,
       t.current_period_start,
       t.current_period_end,
       t.cancel_at_period_end,
       t.canceled_at,
       coalesce(a_customer.current_hash, t.customer) AS customer,
       t.price_id,
       t.unit_amount,
       t.bundle_id,
       t.actor,
       t.dt
FROM   stripe_subscriptions t
LEFT JOIN hash_aliases a_customer ON a_customer.old_hash = t.customer
