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
