-- Distinct GA4 sessions reaching each login-to-submission funnel step, for one day of the GA4
-- export. The step names match infra/main/resources/analytics/views/v_ga4_funnel_daily.sql,
-- which counts the same steps from the lake's own copy of this export, so the two stay
-- comparable. A session is user_pseudo_id joined to ga_session_id, because ga_session_id alone
-- repeats across users. Only submit's own hostnames count: the spreadsheets site sends the
-- same begin_checkout and purchase events for donations.
SELECT day,
       count(distinct if(event_name = 'session_start',  session_key, null)) AS sessions,
       count(distinct if(event_name = 'login',          session_key, null)) AS logins,
       count(distinct if(event_name = 'begin_checkout', session_key, null)) AS checkouts,
       count(distinct if(event_name = 'purchase',       session_key, null)) AS purchases
FROM (
  SELECT parse_date('%Y%m%d', event_date) AS day,
         event_name,
         concat(
           user_pseudo_id, '.',
           cast((SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS string)
         ) AS session_key
  FROM   `diyaccounting-ga4.analytics_523400333.events_*`
  WHERE  _TABLE_SUFFIX = format_date('%Y%m%d', date_sub(current_date(), interval 2 day))
    AND  event_name IN ('session_start', 'login', 'begin_checkout', 'purchase')
    AND  device.web_info.hostname LIKE '%submit.diyaccounting.co.uk'
)
GROUP  BY 1
