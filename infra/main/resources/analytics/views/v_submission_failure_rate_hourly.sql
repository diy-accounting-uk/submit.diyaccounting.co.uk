-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- Same rows as v_submission_failure_rate_daily, grouped by hour instead of day. The failure rate
-- is null in an hour with no submissions, never zero.
-- The partition predicate keeps it to the last 15 days: the dashboard graphs read at most 14.
CREATE OR REPLACE VIEW v_submission_failure_rate_hourly AS
SELECT date_trunc('hour', event_ts) AS hour,
       count(*)                                                       AS submissions,
       count_if(coalesce(outcome, 'success') = 'failure')             AS failures,
       cast(count_if(coalesce(outcome, 'success') = 'failure') AS double)
         / nullif(count(*), 0)                                        AS failure_rate
FROM   activity_events_all
WHERE  actor = 'customer' AND event IN ('vat-return-submitted', 'vat-return-failed')
       AND dt >= current_date - interval '15' day
GROUP  BY 1
