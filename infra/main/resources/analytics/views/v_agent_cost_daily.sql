-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- What the agents' Claude on Bedrock spend came to for each run that posted a result and for each
-- agent pull request a person merged: the day's Bedrock cost from v_cost_daily over the day's
-- posted runs and accepted pull requests from v_agent_runs_daily. A day with no posted run or no
-- accepted pull request has no ratio, so the figure is null there, never zero. The FOCUS export
-- lands a day or two late, so the newest days can show runs with no cost yet.
CREATE OR REPLACE VIEW v_agent_cost_daily AS
WITH bedrock AS (
  SELECT day, sum(billed_cost_usd) AS bedrock_cost_usd
  FROM   v_cost_daily
  WHERE  service_name LIKE '%Bedrock%'
  GROUP  BY 1
),
agent AS (
  SELECT day, sum(posted) AS posted_runs, sum(prs_accepted) AS prs_accepted
  FROM   v_agent_runs_daily
  GROUP  BY 1
)
SELECT coalesce(bedrock.day, agent.day)               AS day,
       coalesce(bedrock.bedrock_cost_usd, 0)          AS bedrock_cost_usd,
       coalesce(agent.posted_runs, 0)                 AS posted_runs,
       coalesce(agent.prs_accepted, 0)                AS prs_accepted,
       CASE WHEN coalesce(agent.posted_runs, 0) = 0 THEN NULL
            ELSE bedrock.bedrock_cost_usd / agent.posted_runs
       END                                            AS cost_per_posted_run_usd,
       CASE WHEN coalesce(agent.prs_accepted, 0) = 0 THEN NULL
            ELSE bedrock.bedrock_cost_usd / agent.prs_accepted
       END                                            AS cost_per_accepted_pr_usd
FROM        bedrock
FULL JOIN   agent ON bedrock.day = agent.day
