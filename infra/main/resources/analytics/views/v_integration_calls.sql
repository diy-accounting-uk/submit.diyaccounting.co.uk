-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- One row per outbound attempt to HMRC, Companies House or Stripe, from the integration calls
-- table's change log (dynamoStreamToFirehose.js, "calls" projector). A call item is written
-- once, so the INSERT record is the call; the record expiring from the table is not projected.
-- day is the UK calendar date of started_at. target is live or test (sandbox host, test key,
-- simulator). status is the HTTP status and is null for a timeout, a network error or a refusal;
-- status_label is the status as text or the outcome. api is a path template with no identifier.
-- The raw request and response skeletons stay in the table and never reach the lake.
CREATE OR REPLACE VIEW v_integration_calls AS
SELECT CAST(at_timezone(with_timezone(started_at, 'UTC'), 'Europe/London') AS date) AS day,
       started_at,
       call_id,
       org,
       target,
       api,
       method,
       duration_ms,
       outcome,
       status,
       status_label,
       app_code,
       provider_request_id,
       request_id,
       function_name,
       deployment,
       fph_rules,
       fph_rules_failed,
       fph_shape_hash
FROM   dynamo_calls
WHERE  change_type = 'INSERT' AND record_type = 'call' AND started_at IS NOT NULL
