-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

CREATE OR REPLACE VIEW v_availability_sli_daily AS
SELECT date(from_iso8601_timestamp(finished_at)) AS day,
       suite,
       count(*)                                     AS runs,
       count_if(passed)                             AS passes,
       cast(count_if(passed) AS double) / count(*)  AS pass_rate,
       count(*) - count_if(passed)                  AS failed_runs,
       0.001 * count(*)                             AS budget_runs,
       (0.001 * count(*)) - (count(*) - count_if(passed)) AS budget_remaining_runs
FROM   probe_runs
GROUP  BY 1, 2
