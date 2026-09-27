-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- Every WP-6 query reads this view, never the curated table directly, so a future change
-- to the underlying table needs no change to those queries.
CREATE OR REPLACE VIEW activity_events_all AS
SELECT event_id, event_ts, ingest_ts, event, site, summary, actor, flow, outcome, failure,
       request_id, hashed_sub, bundle_id, pass_type_id, subscription_id, visitor_type,
       country, page, hmrc_status, client_id, env, app_client, session_id, activity_id,
       dt
FROM   activity_events
