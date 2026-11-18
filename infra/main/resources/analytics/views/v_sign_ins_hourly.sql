-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- Same rows as v_sign_ins_daily, grouped by hour instead of day.
-- The partition predicate keeps it to the last 15 days: the dashboard graphs read at most 14.
CREATE OR REPLACE VIEW v_sign_ins_hourly AS
SELECT date_trunc('hour', event_ts) AS hour,
       coalesce(app_client, 'submit') AS app_client,
       event,
       actor,
       json_extract_scalar(detail_json, '$.provider') AS provider,
       count(*) AS sign_ins
FROM   activity_events_all
WHERE  event IN ('login', 'session-resumed', 'token-refresh')
       AND dt >= current_date - interval '15' day
GROUP  BY 1, 2, 3, 4, 5
