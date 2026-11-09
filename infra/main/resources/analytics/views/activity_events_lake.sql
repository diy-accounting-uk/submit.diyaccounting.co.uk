-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- The one read path to activity events. This file is the start state: every day reads from the raw
-- Firehose objects. app/functions/analytics/activityEventsCompact.js replaces the view with one that
-- also names the compacted days, so the deployed text differs from this file once that job has run.
-- A deploy that changes this file sets reads back to the raw objects, with the same rows, until the
-- job's next run.
CREATE OR REPLACE VIEW activity_events_lake AS
SELECT event_id, event_ts, ingest_ts, event, site, summary, actor, flow, outcome, failure, request_id,
       hashed_sub, bundle_id, pass_type_id, subscription_id, visitor_type, country, page, hmrc_status,
       client_id, env, detail_json, app_client, session_id, activity_id, dt
FROM   activity_events
