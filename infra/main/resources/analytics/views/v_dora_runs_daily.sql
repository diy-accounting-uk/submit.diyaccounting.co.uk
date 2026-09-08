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
