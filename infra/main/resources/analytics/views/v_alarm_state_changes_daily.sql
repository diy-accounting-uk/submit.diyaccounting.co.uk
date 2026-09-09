-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

CREATE OR REPLACE VIEW v_alarm_state_changes_daily AS
SELECT date(event_ts) AS day,
       family,
       env,
       count_if(state = 'ALARM' AND previous_state <> 'ALARM') AS times_fired,
       count_if(state = 'OK'    AND previous_state =  'ALARM') AS times_cleared,
       count(DISTINCT alarm_name)                              AS alarms_in_family,
       max(event_ts)                                           AS last_change_ts
FROM   alarm_state_changes
GROUP  BY 1, 2, 3
