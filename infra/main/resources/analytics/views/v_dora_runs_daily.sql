-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- @capability DATA-31 SQL views: DORA and operations
-- - **Use when:** a question is about deploy success rate, agent workflow outcomes, probe pass rate, alarm activity or operator interventions.
-- - **Does:** Five Athena views cover deploy and destroy run counts, success rate and lead time. They cover agent workflow runs, and the share leading to a merged PR or closed issue. They cover probe pass rate and error budget, alarms by family, and operator interventions.
-- - **Run:** no command; see Does and Entry
-- - **Entry:** `infra/main/resources/analytics/views/v_dora_runs_daily.sql:`
-- - **Files:** infra/main/resources/analytics/views/v_agent_runs_daily.sql, infra/main/resources/analytics/views/v_alarm_state_changes_daily.sql, infra/main/resources/analytics/views/v_availability_sli_daily.sql, infra/main/resources/analytics/views/v_dora_runs_daily.sql, infra/main/resources/analytics/views/v_operator_interventions_daily.sql
-- - **Keywords:** dora runs daily, agent runs daily, alarm state changes daily, availability sli, operator interventions, error budget, lead time
-- - **Related:** DATA-15, DATA-03, DATA-07
-- @end-capability

CREATE OR REPLACE VIEW v_dora_runs_daily AS
SELECT date(from_iso8601_timestamp(finished_at)) AS day,
       workflow,
       environment,
       count(*)                                          AS runs,
       count_if(conclusion = 'success')                  AS successes,
       approx_percentile(duration_seconds, 0.5)          AS median_duration_seconds,
       approx_percentile(lead_time_seconds, 0.5)         AS median_lead_time_seconds,
       cast(count_if(conclusion <> 'success') AS double) / count(*) AS failure_rate
FROM   dora_runs
GROUP  BY 1, 2, 3
