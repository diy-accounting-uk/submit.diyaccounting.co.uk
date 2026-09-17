-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- Of the sessions GA4 saw each day, how many reached each funnel step?
--
-- A session key is user_pseudo_id joined to ga_session_id, because ga_session_id alone repeats
-- across users (it is a per-device counter, not a global id). Counts distinct sessions, not
-- events, so a session firing begin_checkout twice still counts once.
--
-- The stream_id filter scopes this to submit.diyaccounting.co.uk's data stream (13497119809 in
-- google/analytics.toml): ga4_bq_events carries all three sites on the shared property, and the
-- login/checkout/purchase steps here feed v_purchase_reconciliation_daily's comparison against
-- submit's own Stripe charges and activity events, not the spreadsheets donation checkout.
CREATE OR REPLACE VIEW v_ga4_funnel_daily AS
SELECT dt AS day,
       count(distinct if(event_name = 'session_start',   session_key, null)) AS sessions,
       count(distinct if(event_name = 'login',           session_key, null)) AS logins,
       count(distinct if(event_name = 'begin_checkout',  session_key, null)) AS checkouts,
       count(distinct if(event_name = 'purchase',        session_key, null)) AS purchases
FROM   (SELECT dt, event_name,
               concat(user_pseudo_id, '.', cast(ga_session_id as varchar)) AS session_key
        FROM   ga4_bq_events
        WHERE  stream_id = '13497119809')
GROUP  BY 1
