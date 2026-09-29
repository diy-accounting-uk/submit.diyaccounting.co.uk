-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- Sessions and users each day, by hostname and visitor kind (human, operator, bot,
-- synthetic, or "(unclassified)" until analytics.js's tagging reaches a given session),
-- collapsing sessions_by_host_source_daily's session source and medium split. A browser
-- is operator once it has fetched the operator bundle, so the first page after sign-in
-- counts as human and later pages as operator; sessions before the tagging stay human.
CREATE OR REPLACE VIEW v_visitors_by_kind_daily AS
SELECT dt AS day,
       hostname,
       visitor_kind,
       sum(sessions) AS sessions,
       sum(users)    AS users
FROM   sessions_by_host_source_daily
GROUP  BY 1, 2, 3
