-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- Sign-ins and refreshes each day, by Cognito app client, event, actor and sign-in provider.
-- Only login events carry a provider, so the column is null for native users and other events.
CREATE OR REPLACE VIEW v_sign_ins_daily AS
SELECT date(event_ts) AS day,
       coalesce(app_client, 'submit') AS app_client,
       event,
       actor,
       json_extract_scalar(detail_json, '$.provider') AS provider,
       count(*) AS sign_ins
FROM   activity_events_all
WHERE  event IN ('login', 'session-resumed', 'token-refresh')
GROUP  BY 1, 2, 3, 4, 5
