-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- stripe_charges with each hash read through hash_aliases, so one account, pass or customer keeps one
-- hash across a salt rotation. A row with no alias keeps the hash it was written with.
CREATE OR REPLACE VIEW aliased_stripe_charges AS
SELECT t.id,
       t.amount,
       t.amount_refunded,
       t.currency,
       t.created,
       t.paid,
       t.refunded,
       t.status,
       t.failure_code,
       coalesce(a_customer.current_hash, t.customer) AS customer,
       t.invoice,
       t.livemode,
       t.bundle_id,
       t.dt
FROM   stripe_charges t
LEFT JOIN hash_aliases a_customer ON a_customer.old_hash = t.customer
