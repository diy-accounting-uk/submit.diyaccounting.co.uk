-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- ga4ReportPull.js reformats GA4's "YYYYMMDD" date dimension to "YYYY-MM-DD" before it ever
-- reaches the lake (formatGa4Date), so this column already parses as an ISO date, unlike the
-- raw GA4 API response.
-- ga4_traffic carries no utm_source dimension, only the channel group GA4 derives from it,
-- so this column buckets down to what that report allows: 'direct' and 'organic' for those
-- two groups, 'paid' for the paid and cross-network groups, the channel group itself
-- otherwise. The real per-visit utm_source values M1's landing capture stores reach Athena
-- through activity_events_all's detail_json, not through this GA4-only view.
CREATE OR REPLACE VIEW v_traffic_sources_daily AS
SELECT date(date) AS day,
       coalesce(sessionDefaultChannelGroup, 'unassigned') AS channel,
       CASE
         WHEN sessionDefaultChannelGroup = 'Direct' THEN 'direct'
         WHEN sessionDefaultChannelGroup LIKE 'Organic%' THEN 'organic'
         WHEN sessionDefaultChannelGroup LIKE 'Paid%' OR sessionDefaultChannelGroup = 'Cross-network' THEN 'paid'
         ELSE lower(coalesce(sessionDefaultChannelGroup, 'unassigned'))
       END AS source,
       sum(sessions)        AS sessions,
       sum(newUsers)        AS new_users,
       sum(engagedSessions) AS engaged_sessions,
       if(sum(sessions) = 0, NULL,
          cast(sum(engagedSessions) AS double) / sum(sessions)) AS engagement_rate
FROM   ga4_traffic
GROUP  BY 1, 2, 3
