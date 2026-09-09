-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- ga4ReportPull.js reformats GA4's "YYYYMMDD" date dimension to "YYYY-MM-DD" before it ever
-- reaches the lake (formatGa4Date), so this column already parses as an ISO date, unlike the
-- raw GA4 API response.
CREATE OR REPLACE VIEW v_traffic_sources_daily AS
SELECT date(date) AS day,
       coalesce(sessionDefaultChannelGroup, 'unassigned') AS channel,
       sum(sessions)        AS sessions,
       sum(newUsers)        AS new_users,
       sum(engagedSessions) AS engaged_sessions,
       if(sum(sessions) = 0, NULL,
          cast(sum(engagedSessions) AS double) / sum(sessions)) AS engagement_rate
FROM   ga4_traffic
GROUP  BY 1, 2
