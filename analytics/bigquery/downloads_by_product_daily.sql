-- Downloads for one day of the GA4 export, by product: the spreadsheets site's "download"
-- event carries a custom "product" parameter naming what was downloaded.
SELECT parse_date('%Y%m%d', event_date) AS day,
       coalesce(
         (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'product'),
         '(not set)'
       )                               AS product,
       count(*)                       AS downloads,
       count(distinct user_pseudo_id) AS users
FROM   `diyaccounting-ga4.analytics_523400333.events_*`
WHERE  _TABLE_SUFFIX = format_date('%Y%m%d', date_sub(current_date(), interval 2 day))
  AND  event_name = 'download'
GROUP  BY 1, 2
