<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Session report uOKRjk, 2026-09-21

Session `session_01JCMbEEZkKav1UF1N1xbdFu`, 2026-09-21 12:20 UTC to 19:45 UTC (7.4 hours, of
which 5.0 were an idle hold from 14:12 to 19:08 with the loop stopped and no agent running).

## Result

4 pull requests merged (#317, #319, #320, #321) and 1 docs batch pushed straight to `main`; 8 board
rows closed (B52.D2, B49.20, B49.16, B11.T7b.6, B11.T7b.7, B49.17, B11.T10a, B30af.6) and 4 opened
from the operator's `PARKED.md` triage (B49.24, B43a, B69a, B46a); 15 commits on `main` from this
session; 1,065 hand-written lines added and 140 removed across 13 code files, 255 added and 207
removed across 9 Markdown files; no generated output. Prod serves `prod-a7a0d6b`. The board holds
1 row in flight (O38, proof run in progress), 5 machine-only ready, 1 machine-ask ready, 7 blocked,
under cool-down since 19:32 UTC.

## Method

I use Claude Code as a coordinator. I write the plan and the rules into the repo, it wakes the
board from cool-down, merges what is green, dispatches one agent per ready row on its own
worktree, squashes each onto a batch branch, proves the batch locally, and merges through the one
sanctioned path; I make the decisions it can't: which parked discoveries become work, which
sandbox redirect URI to give up, when to delete the last personal access tokens, and when to cool
down. In this session that landed four pull requests and a docs batch, closed eight rows and
finished the ITSA phase 2 sandbox proof end to end (three tax years, simulator corrected, the
recognition pack evidenced) for about $0.35 of agent tokens and an estimated $10 of coordinator
tokens, all inside the subscription. I spend my time answering its questions and fixing the
process when it drifts. Today the wake, iterate and cool-down cycle ran as written, and my next
areas to develop are keeping sandbox transcripts outside disposable worktrees and stopping a
scripts-only change from deploying a ci set.

## What worked

| Efficiency | Measured | Mechanism |
|---|---|---|
| Elapsed to prod | #319 pushed 12:26, merged 13:18, `prod-a7a0d6b` live by 14:10 (1h 44m); #320 pushed 13:24, merged 13:32 (8 min, no deploy under `paths:`) | `/auto-merge` gates re-read on the watch's `MERGEABLE`; `deploy.yml` `paths:` filter |
| Agent tokens | 361,617 over 2 agents (Sonnet 245,659 for B11.T7b.7, Haiku 115,958 for B11.T10a), $0.35 estimated at 80% cache reads, $0.85 with none | lowest tier per row; the docs-only row on Haiku |
| Coordinator tokens | estimated $10 (about 130 turns at ~120k cached context, Opus 5 rates), $0 marginal on the subscription | 1-hour cache TTL; wakeups only on events; loop stopped when nothing was startable |
| GitHub Actions | 849 billable job-minutes across 54 runs (the sibling session's `dg-1k` runs excluded), $0 on a public repository ($6.79 at the private rate of $0.008/min); 486 on `test`, 276 on the two `deploy` runs | one push per batch; docs batch b70 to `main` with no PR; `paths:` kept #320 and #321 off `deploy.yml` |
| AWS | 2 `deploy.yml` runs (ci-set1 for #319, prod for its merge); ci-set1 stood 4h 00m (12:31 to 16:31) and self-destructed; `prod-0d00bde` stood 1h 24m before `prod-a7a0d6b` replaced it; no spare prod set standing; no metered LLM call in any workflow | self-destruct on the ci set; main's deploy destroys the previous prod set |
| Operator input | 19 messages: 6 skill invocations, 4 questions, 4 decisions (triage, the HMRC URI to drop, the deletes, cool-down), 3 command pastes the session cannot run (worktree removal, the secret deletes twice), 2 corrections (exit the loop on cool-down; put the rule in both repos) | `/wake`'s eight steps; PARKED handed back as a table with a recommendation per line; every operator command printed in full |
| Quality | 0 of 3 deploy runs failed; 3661 unit and system tests green on the batch; the phase 2 simulator now matches HMRC on the three fields the transcripts disagreed on | local proof before push; the agent brief's "compare against the transcript" shape from `ITSA_SPIKE.md` |

## Room for improvement

| Loss | Size | Cause | Improvement |
|---|---|---|---|
| Sandbox transcripts regenerated | 3 sandbox runs (~11 min) and ~100k of the T7b.7 agent's tokens | the previous session's transcripts lived under a worktree's `target/`, removed with it | `itsa-sandbox-year.js` defaults `ITSA_SANDBOX_OUT_DIR` to a path outside the worktree (`../analytics/`-style workspace dir) |
| A scripts-only change deployed a ci set | 142 job-minutes and a 4-hour ci set for #319 | `package.json` is in `deploy.yml`'s `paths:`, and #319 added one npm script | a `paths-ignore` cannot express it; move `deploy.yml`'s trigger to a `dorny/paths-filter`-style job that ignores `scripts.*` edits in `package.json`, or accept the cost |
| Batch proof re-run | ~25 min waiting on Maven, then a 5-file re-run | `npm test` and `./mvnw clean verify` ran concurrently and five vitest files hit the 5000 ms timeout at load average 107 | `iterate` runs the two proofs serially on the batch, or the system tests get a 30 s timeout |
| A PR merged under cool-down | one `infra-apply` run on `main` (12 job-minutes) and one operator interruption | the skill said "merge its verified commit as usual" about agent commits and nothing about PRs | landed: the skill now leaves a green PR for `/wake` and stops the loop and watch on the way down |
| Idle hold | 5h 0m of the 7.4 elapsed | nothing startable after 14:12 until the operator triaged `PARKED.md` at 19:08 | the stop notification names the operator decision that would restart the loop (it named the parked list only in the earlier reply) |
| Fast-forward that moved the tree, not the ref | 3 extra commands | `git merge --ff-only` on the main checkout printed "Updating" and stopped before moving `main`; the four files were left modified in the tree | land a docs batch by `git cherry-pick <sha>` on `main`, not `merge --ff-only` |

## Placement

Scales are constructed from the cited anchors; they place one session, not a team.

- **Deployment frequency**: 2 `main` deploys in 7.4 hours (one inherited deploy also concluded).
  2026 guides put elite at "on demand, multiple times per day"
  ([DevX](https://www.devx.com/uncategorized/dora-metrics-2026-benchmarks-high-performing-teams/),
  [CI/CD Watch](https://cicd.watch/blog/dora-metrics-benchmarks-2026)); inside that band for one
  repository.
- **Lead time for changes**: push to prod 1h 44m for #319; 8 minutes to `main` for #320. Elite is
  "under one hour" on the same guides; the prod deploy (134 job-minutes, ~52 minutes wall) is the
  floor.
- **Change failure rate**: 0 of 3 deploy runs failed; the elite band is 0 to 15%.
- **Cost per merged PR**: $0.35 of agent tokens over 4 PRs is $0.09 per PR, $0.04 per row closed;
  task-priced anchors put an agent task at $0.03 to $2.60
  ([Kunal Ganglani](https://www.kunalganglani.com/blog/ai-agent-cost-per-task-2026),
  [PointFive](https://www.pointfive.co/blog/the-pointfive-coding-task-index)) and Claude Code
  enterprise use at $13 per developer per active day
  ([getdx](https://getdx.com/blog/ai-coding-assistant-pricing/)). With the estimated $10 of
  coordinator tokens the figure is $2.60 per PR and $1.30 per row.
- **Token prices used**: Sonnet 5 $2/$10, Opus 5 $5/$25, Haiku 4.5 $1/$5 per million input/output,
  cache reads at 10% of input, as the previous report; not re-verified this session.

## Suggested improvements

Ranked by value; elapsed minutes rank above job-minutes, which rank above operator messages.

1. Name the restarting decision in the loop's stop notification. Value: up to the 5h 0m idle hold,
   when the operator is reachable. No board row; one line in `iterate`.
2. Keep sandbox transcripts outside the worktree. Value: ~11 minutes and ~100k tokens per lost
   run, and B11.T10's re-run then has a baseline to diff. No board row.
3. Run the batch proofs serially. Value: ~25 minutes per batch. No board row; one line in
   `iterate`.
4. Keep a `package.json` scripts-only edit off `deploy.yml`. Value: 142 job-minutes and a 4-hour ci
   set per such change. No board row; B43a covers the scheduled-deploy half of the same cost.
5. Land docs batches by cherry-pick. Value: 3 commands. No board row.
6. Cool-down leaves green PRs open and stops the loop. Value: 12 job-minutes and 1 operator
   interruption per cool-down. Landed this session in both repositories' skills.
