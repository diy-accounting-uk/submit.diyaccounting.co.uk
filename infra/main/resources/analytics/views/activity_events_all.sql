-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- Every WP-6 query reads this view, never the curated table directly, so a future change
-- to the underlying table needs no change to those queries.
--
-- The actor belongs to the account. An event that carries no email is written as 'customer', so
-- an account that any of its events shows to be a test user, synthetic or probe account has its
-- 'customer' events read as 'test-user' here, and every v_* view that filters on actor = 'customer'
-- counts real customers only.
CREATE OR REPLACE VIEW activity_events_all AS
SELECT e.event_id, e.event_ts, e.ingest_ts, e.event, e.site, e.summary,
       CASE WHEN e.actor = 'customer' AND s.hashed_sub IS NOT NULL THEN 'test-user' ELSE e.actor END AS actor,
       e.flow, e.outcome, e.failure,
       e.request_id, e.hashed_sub, e.bundle_id, e.pass_type_id, e.subscription_id, e.visitor_type,
       e.country, e.page, e.hmrc_status, e.client_id, e.env, e.detail_json, e.app_client, e.session_id,
       e.activity_id, e.dt
FROM   activity_events e
LEFT   JOIN (
         SELECT DISTINCT hashed_sub
         FROM   activity_events
         WHERE  hashed_sub IS NOT NULL
           AND  (actor IN ('test-user', 'synthetic', 'probe')
                 OR regexp_like(summary, '@test\.diyaccounting\.co\.uk'))
       ) s ON e.hashed_sub = s.hashed_sub
