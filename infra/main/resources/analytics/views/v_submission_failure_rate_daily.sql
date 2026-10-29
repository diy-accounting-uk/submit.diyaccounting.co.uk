-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- How many VAT returns went to HMRC each day, how many of them failed, and the share that failed.
-- The failure rate is null on a day with no submissions, never zero.
CREATE OR REPLACE VIEW v_submission_failure_rate_daily AS
SELECT day,
       sum(submissions)                                                    AS submissions,
       sum(CASE WHEN outcome = 'failure' THEN submissions ELSE 0 END)      AS failures,
       cast(sum(CASE WHEN outcome = 'failure' THEN submissions ELSE 0 END) AS double)
         / nullif(sum(submissions), 0)                                     AS failure_rate
FROM   v_submissions_daily
GROUP  BY 1
