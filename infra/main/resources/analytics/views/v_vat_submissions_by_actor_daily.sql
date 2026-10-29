-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- How many VAT submissions did each account make each day, customers apart from operators and test accounts?
--
-- The same events as the submit-vat rows of v_submissions_by_activity_daily (vat-return-submitted
-- and vat-return-failed), kept at one row per day and account so a caller can count distinct
-- submitters over any window, which a per-day distinct count cannot add up to. actor_group puts
-- customers apart from the operator's own accounts and from the accounts activity_events_all
-- marks as test-user, synthetic, probe or system.
CREATE OR REPLACE VIEW v_vat_submissions_by_actor_daily AS
SELECT date(event_ts)                                  AS day,
       CASE WHEN actor = 'customer' THEN 'customer'
            WHEN actor = 'operator' THEN 'operator'
            ELSE 'test' END AS actor_group,
       hashed_sub                                       AS hashed_sub,
       count(*)                                         AS submissions
FROM   activity_events_all
WHERE  event IN ('vat-return-submitted', 'vat-return-failed')
GROUP  BY 1, 2, 3
