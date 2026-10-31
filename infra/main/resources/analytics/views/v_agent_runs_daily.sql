-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- Unattended agent workflow runs each day, by workflow and outcome, plus two rates that read
-- past the run itself into what happened to its work afterwards: the share of the runs that
-- opened a pull request which a person then merged, and the share of the issues an agent
-- answered that a person then closed, with the median hours that took. prs_accepted counts the
-- runs whose pull request a person merged.
--
-- pr_merges and issue_closes fold github_issue_events down to one row per PR or issue, since a
-- PR carries several "merged" or "closed" timeline entries when a branch is pushed to more than
-- once; min(created_at) is the first of those, which is the one that answers "did this land".
-- GitHub's timeline API carries a PR's own number in the same issue_number field an issue uses,
-- so a run's pr_number joins straight into it with no separate PR table.
--
-- run_closes pairs each run with the first operator close of its issue at or after the run
-- finished. An issue closed before the run (a reused or reopened one) is not that run's close;
-- taking the issue's first close at all gave negative hours.
CREATE OR REPLACE VIEW v_agent_runs_daily AS
WITH pr_merges AS (
  SELECT issue_number AS pr_number, min(created_at) AS merged_at
  FROM   github_issue_events
  WHERE  event_type = 'merged'
  GROUP  BY 1),
run_closes AS (
  SELECT r.run_id, min(from_iso8601_timestamp(c.created_at)) AS closed_at
  FROM   agent_runs r
  JOIN   github_issue_events c
    ON   c.issue_number = r.issue_number
   AND   c.event_type = 'closed' AND c.is_operator = true
   AND   from_iso8601_timestamp(c.created_at) >= from_iso8601_timestamp(r.finished_at)
  GROUP  BY 1),
enriched AS (
  SELECT r.workflow,
         date(from_iso8601_timestamp(r.finished_at))                                    AS day,
         r.outcome,
         r.pr_number,
         (m.merged_at IS NOT NULL)                                                      AS pr_accepted,
         date_diff('second', from_iso8601_timestamp(r.finished_at), c.closed_at) / 3600.0
                                                                                          AS hours_to_close
  FROM   agent_runs r
  LEFT JOIN pr_merges m ON r.pr_number = m.pr_number
  LEFT JOIN run_closes c ON r.run_id = c.run_id)
SELECT day,
       workflow,
       count(*)                                                        AS runs,
       count_if(outcome = 'posted')                                    AS posted,
       count_if(pr_accepted)                                           AS prs_accepted,
       count_if(outcome = 'skipped-budget')                            AS skipped_budget,
       count_if(outcome = 'skipped-role')                              AS skipped_role,
       count_if(outcome = 'skipped-kill-switch')                       AS skipped_kill_switch,
       count_if(outcome = 'verify-failed')                             AS verify_failed,
       count_if(outcome = 'no-answer')                                 AS no_answer,
       count_if(outcome = 'max-turns')                                 AS max_turns,
       count_if(outcome = 'closed')                                    AS closed,
       count_if(outcome = 'no-action')                                 AS no_action,
       cast(count_if(outcome = 'posted') AS double) / count(*)         AS posted_rate,
       cast(count_if(pr_accepted) AS double)
         / nullif(count_if(pr_number IS NOT NULL), 0)                  AS pr_accepted_rate,
       approx_percentile(hours_to_close, 0.5)                          AS median_hours_to_close
FROM   enriched
GROUP  BY 1, 2
