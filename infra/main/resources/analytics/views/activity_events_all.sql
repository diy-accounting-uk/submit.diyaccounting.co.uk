-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- @capability DATA-27 SQL views: activity and traffic
-- - **Use when:** a question is about daily active users, HMRC auth/bundle activity, GA4 sessions, visitor kind or funnel steps.
-- - **Does:** Seven Athena views answer traffic and activity questions over activity_events_all. That view unions the JSON- and Parquet-era event tables into one queryable shape. They cover active users, HMRC activity, GA4 sessions by country and source, visitor kind, and GA4 funnels.
-- - **Run:** no command; see Does and Entry
-- - **Entry:** `infra/main/resources/analytics/views/activity_events_all.sql:`
-- - **Files:** infra/main/resources/analytics/views/activity_events_all.sql, infra/main/resources/analytics/views/v_active_users_daily.sql, infra/main/resources/analytics/views/v_business_activity_daily.sql, infra/main/resources/analytics/views/v_traffic_by_country_daily.sql, infra/main/resources/analytics/views/v_traffic_sources_daily.sql, infra/main/resources/analytics/views/v_visitors_by_kind_daily.sql, infra/main/resources/analytics/views/v_ga4_funnel_daily.sql
-- - **Keywords:** active users daily, business activity, traffic by country, traffic sources, visitors by kind, ga4 funnel, activity_events_all
-- - **Related:** DATA-10, DATA-01, DATA-23
-- @end-capability

-- Every WP-6 query reads this view, never the curated table directly, so a future change
-- to the underlying table needs no change to those queries.
--
-- The actor belongs to the account. An event that carries no email is written as 'customer', so
-- an account that any of its events shows to be a test user, synthetic or probe account has its
-- 'customer' events read as 'test-user' here, and an account that any event shows to be an
-- operator's has them read as 'operator', so every v_* view that filters on actor = 'customer'
-- counts real customers only.
CREATE OR REPLACE VIEW activity_events_all AS
SELECT e.event_id, e.event_ts, e.ingest_ts, e.event, e.site, e.summary,
       CASE WHEN e.actor = 'customer' AND s.account_actor IS NOT NULL THEN s.account_actor ELSE e.actor END AS actor,
       e.flow, e.outcome, e.failure,
       e.request_id, e.hashed_sub, e.bundle_id, e.pass_type_id, e.subscription_id, e.visitor_type,
       e.country, e.page, e.hmrc_status, e.client_id, e.env, e.detail_json, e.app_client, e.session_id,
       e.activity_id, e.dt
FROM   activity_events e
LEFT   JOIN (
         SELECT hashed_sub,
                CASE WHEN bool_or(actor IN ('test-user', 'synthetic', 'probe')
                                  OR regexp_like(summary, '@test\.diyaccounting\.co\.uk'))
                     THEN 'test-user' ELSE 'operator' END AS account_actor
         FROM   activity_events
         WHERE  hashed_sub IS NOT NULL
           AND  (actor IN ('test-user', 'synthetic', 'probe', 'operator')
                 OR regexp_like(summary, '@test\.diyaccounting\.co\.uk'))
         GROUP  BY hashed_sub
       ) s ON e.hashed_sub = s.hashed_sub
