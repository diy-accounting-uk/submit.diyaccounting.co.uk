-- Operator interventions each day, by kind: hand-dispatched workflow runs, issue comments the
-- operator wrote and commits with no Claude Code co-author trailer.
--
-- A commit's has_claude_coauthor flag (set by operatorEffortPull.js from the commit message,
-- not from the author, since the operator's own GitHub account authors every commit whether a
-- Claude Code session wrote it or not) is the only reliable signal here: git author identity
-- cannot tell a session's commit from the operator's own.
CREATE OR REPLACE VIEW v_operator_interventions_daily AS
WITH dispatches AS (
  SELECT date(from_iso8601_timestamp(created_at)) AS day,
         'manual-dispatch' AS kind,
         count(*) AS interventions
  FROM   github_workflow_runs
  WHERE  event = 'workflow_dispatch'
  GROUP  BY 1),
comments AS (
  SELECT date(from_iso8601_timestamp(created_at)) AS day,
         'issue-comment' AS kind,
         count(*) AS interventions
  FROM   github_issue_events
  WHERE  event_type = 'commented' AND is_operator = true
  GROUP  BY 1),
commits AS (
  SELECT date(from_iso8601_timestamp(authored_at)) AS day,
         'commit' AS kind,
         count(*) AS interventions
  FROM   github_commits
  WHERE  has_claude_coauthor = false
  GROUP  BY 1)
SELECT day, kind, interventions FROM dispatches
UNION ALL
SELECT day, kind, interventions FROM comments
UNION ALL
SELECT day, kind, interventions FROM commits
