-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- Same rows as v_submissions_by_activity_daily, grouped by hour instead of day: see
-- v_activity_started_hourly.sql for why the dashboard's Last 1 hour and Last 1 day columns
-- cannot read that day-grain view's own "day" column.
CREATE OR REPLACE VIEW v_submissions_by_activity_hourly AS
SELECT hour, activity, outcome, client_id,
       count(*)                   AS completions,
       count(DISTINCT hashed_sub) AS customers
FROM  (SELECT date_trunc('hour', event_ts) AS hour, hashed_sub, client_id,
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
