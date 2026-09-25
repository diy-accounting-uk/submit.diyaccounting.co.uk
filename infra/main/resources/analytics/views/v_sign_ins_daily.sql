-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- Sign-ins and refreshes each day, by Cognito app client, event and actor.
CREATE OR REPLACE VIEW v_sign_ins_daily AS
SELECT date(event_ts) AS day,
       coalesce(app_client, 'submit') AS app_client,
       event,
       actor,
       count(*) AS sign_ins
FROM   activity_events_all
WHERE  event IN ('login', 'session-resumed', 'token-refresh')
GROUP  BY 1, 2, 3, 4
