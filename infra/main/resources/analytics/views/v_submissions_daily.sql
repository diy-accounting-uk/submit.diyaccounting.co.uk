-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- @capability DATA-29 SQL views: submission and compliance
-- - **Use when:** a question is about VAT/ITSA/Companies House completions, HMRC failures, signup funnels, repeat filers or accessibility.
-- - **Does:** Seven Athena views cover VAT, ITSA and Companies House completions, by outcome and by activity. They also cover HMRC failures by class, and time to first submission for active or new customers. They cover quarter-on-quarter repeat filers, and the compliance headline of open accessibility and fraud-header findings.
-- - **Run:** no command; see Does and Entry
-- - **Entry:** `infra/main/resources/analytics/views/v_submissions_daily.sql:`
-- - **Files:** infra/main/resources/analytics/views/v_submissions_daily.sql, infra/main/resources/analytics/views/v_submissions_by_activity_daily.sql, infra/main/resources/analytics/views/v_hmrc_failures_by_class.sql, infra/main/resources/analytics/views/v_login_to_submission_funnel.sql, infra/main/resources/analytics/views/v_signup_to_first_submission.sql, infra/main/resources/analytics/views/v_returning_submitters_quarterly.sql, infra/main/resources/analytics/views/v_compliance_status.sql
-- - **Keywords:** submissions daily, hmrc failures by class, login to submission funnel, signup to first submission, returning submitters, compliance status
-- - **Related:** DATA-04, DATA-14
-- @end-capability

-- How many VAT returns went to HMRC each day, split by outcome?
CREATE OR REPLACE VIEW v_submissions_daily AS
SELECT date(event_ts) AS day,
       coalesce(outcome, 'success') AS outcome,
       count(*) AS submissions,
       count(DISTINCT hashed_sub) AS submitters
FROM   activity_events_all
WHERE  actor = 'customer' AND event IN ('vat-return-submitted', 'vat-return-failed')
GROUP  BY 1, 2
