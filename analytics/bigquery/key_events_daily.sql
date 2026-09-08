-- Key events for one day of the GA4 export, by hostname: subscribing (a completed Stripe
-- checkout, GA4 event "purchase"), submitting (a filed VAT return, "submit_vat_return"),
-- donating and downloading (the spreadsheets and gateway sites' own event names). Add a row to
-- the CASE below when a new key event or submission type is wired up; nothing else here needs
-- to change.
SELECT day,
       hostname,
       key_event,
       count(*)                       AS events,
       count(distinct user_pseudo_id) AS users
FROM (
  SELECT parse_date('%Y%m%d', event_date) AS day,
         device.web_info.hostname         AS hostname,
         user_pseudo_id,
         CASE event_name
           WHEN 'purchase'          THEN 'subscribe'
           WHEN 'submit_vat_return' THEN 'submit'
           WHEN 'donate'            THEN 'donate'
           WHEN 'download'          THEN 'download'
         END AS key_event
  FROM   `diyaccounting-ga4.analytics_523400333.events_*`
  WHERE  _TABLE_SUFFIX = format_date('%Y%m%d', date_sub(current_date(), interval 2 day))
    AND  event_name IN ('purchase', 'submit_vat_return', 'donate', 'download')
)
WHERE  key_event IS NOT NULL
GROUP  BY 1, 2, 3
