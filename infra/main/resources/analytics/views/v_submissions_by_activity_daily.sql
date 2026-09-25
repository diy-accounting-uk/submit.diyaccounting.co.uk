-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- Activity is the catalogue's own id (web/public/submit.catalogue.toml), not an event name, so
-- one row here can read straight across into the operator dashboard's started/completed table
-- (operatorSnapshotPublish.js) without a second mapping. Every catalogue activity with a
-- completion event is covered; an activity with none (help, operator-dashboard, my-receipts)
-- has no rows here and reads as zero completions.
CREATE OR REPLACE VIEW v_submissions_by_activity_daily AS
SELECT day, activity, outcome, client_id,
       count(*)                   AS completions,
       count(DISTINCT hashed_sub) AS customers
FROM  (SELECT date(event_ts) AS day, hashed_sub, client_id,
              coalesce(outcome, 'success') AS outcome,
              CASE
                WHEN event = 'bundle-granted'                                     THEN 'bundle'
                WHEN event IN ('vat-return-submitted', 'vat-return-failed')       THEN 'submit-vat'
                WHEN event = 'vat-obligations-queried'                            THEN 'vat-obligations'
                WHEN event = 'vat-liabilities-queried'                            THEN 'vat-liabilities'
                WHEN event = 'vat-payments-queried'                               THEN 'vat-payments'
                WHEN event = 'vat-penalties-queried'                              THEN 'vat-penalties'
                WHEN event = 'vat-return-queried'                                 THEN 'view-vat-return'
                WHEN event = 'company-profile-viewed'                            THEN 'company-lookup'
                WHEN event = 'companies-house-registered-office-address-filed'   THEN 'change-registered-office'
                WHEN event = 'companies-house-registered-email-address-filed'    THEN 'change-registered-email'
                WHEN event = 'book-saved'                                        THEN 'diya-gl-storage'
                WHEN event = 'pass-generated' AND pass_type_id = 'digital-pass'  THEN 'generate-pass-digital'
                WHEN event = 'pass-generated' AND pass_type_id = 'physical-pass' THEN 'generate-pass-physical'
              END AS activity
       FROM   activity_events_all
       WHERE  actor = 'customer')
WHERE  activity IS NOT NULL
GROUP  BY 1, 2, 3, 4
