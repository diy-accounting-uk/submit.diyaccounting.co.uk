<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Session report uOKRjk, 2026-09-22

Session `session_01JCMbEEZkKav1UF1N1xbdFu`, 2026-09-21 12:20 UTC to 23:00 UTC (10.7 hours, of
which 5.0 were an idle hold from 14:12 to 19:08 with the loop stopped and no agent running). This
file replaces the 14:12 UTC edition written mid-session.

## Result

4 pull requests merged (#319, #320, #321, #322), 2 docs batches pushed straight to `main`; 9 board
rows closed (B52.D2, B49.20, B49.16, B11.T7b.6, B11.T7b.7, B49.17, B11.T10a, B30af.6, O38) and 19
opened (5 from the `PARKED.md` triage and the CodeQL list, 14 from `PLAN_PRICE_UPDATE.md` and its
review); 25 commits on `main` from this session; `main` moved 1,098 code lines added and 236
removed across 22 files (of which #322's DIYA-GL change is 9 files from the sibling session, and 2
of its 3 commits are this session's), and 862 Markdown lines across 12 files, 379 of them two
reports and 150 the operator's price plan; no generated output. Prod serves `prod-a7a0d6b` with
78e3e552's deploy in flight. The board holds 0 rows in flight, 14 machine-only ready, 1 machine-ask
ready, 14 blocked.

## Method

I use Claude Code as a coordinator. I write the plan and the rules into the repo, it wakes the
board, merges what is green, dispatches one agent per ready row on its own worktree, proves each
batch locally and merges through the one sanctioned path; I make the decisions it can't: which
parked discoveries and review suggestions become work, which sandbox redirect URI to give up, when
to delete the last personal access tokens, when to cool down and when to wake. In this session
that merged four pull requests, closed nine rows, finished the ITSA phase 2 sandbox proof end to
end, retired the last personal access tokens, fixed two ci deploy defects on a sibling session's
branch, and produced a breakeven model for the price plan, for $1.45 of agent tokens and an
estimated $26 of coordinator tokens inside the subscription. I spend my time answering its
questions, correcting it when it stands back from a sibling's failure, and fixing the process:
today the cool-down skill learned to stop the loop and leave green PRs alone, and my next areas to
develop are keeping the ci slot reusable after a self-destruct and a suite that proves its Cognito
callbacks against the identity stack before a deploy does.

## What worked

| Efficiency | Measured | Mechanism |
|---|---|---|
| Elapsed to prod | #319 pushed 12:26, merged 13:18, `prod-a7a0d6b` live by 14:10 (1h 44m); #320 8 minutes push to merge under `paths:`; #322's second fix pushed 22:06, green 22:32, merged 22:33 (27 minutes) | `/auto-merge` gates on the watch's `MERGEABLE`; `deploy.yml` `paths:`; a one-file fix pushed only after actionlint and the suite listing |
| Agent tokens | 585,491 over 3 agents (Sonnet 245,659 for B11.T7b.7, Haiku 115,958 for B11.T10a, Fable 223,874 for the price review), $1.45 estimated at 80% cache reads, $3.80 with none | lowest tier per row; Fable once, for the one analysis that had to reason over thin data |
| Coordinator tokens | estimated $26 (about 260 turns at ~170k cached context, Opus 5 rates), $0 marginal on the subscription | 1-hour cache TTL; background waits instead of polling; loop stopped when nothing was startable |
| GitHub Actions | 1,812 billable job-minutes across 88 runs, $0 on a public repository ($14.50 at the private rate of $0.008/min); 555 on `main`, 714 on the sibling's `dg-1k` branch (4 deploys, 2 of them this session's fixes), 365 on this session's three branches; deploy 940, test 763 | one push per batch; docs batches to `main` with no PR; `paths:` kept #320 and #321 off `deploy.yml` |
| AWS | 2 prod deploys (a7a0d6b3 live; 78e3e552 in flight), 4 ci deploys of `ci-set1` (one standing 4h 00m then self-destructed, the slot reclaimed 19:58 and standing since), no spare prod set, no metered LLM call in any workflow | self-destruct on the ci set; main's deploy destroys the previous prod set; the slot pool reuses one name |
| Operator input | 41 messages: 10 skill invocations, 8 command pastes the session cannot run (worktree removals, secret deletes, a dispatch, a rerun), 8 questions, 7 decisions, 4 new requirements, 3 corrections | `PARKED.md` and the review's 13 suggestions handed back as tables with a recommendation per line; every operator command printed in full |
| Quality | 0 of 4 `main` gating runs failed; 3661 unit and system tests green on each batch; the phase 2 simulator matches HMRC on the three fields the transcripts disagreed on; `github.toml` "already match" after the deletes | local proof before push; the agent brief's "compare against the transcript" shape |

## Room for improvement

| Loss | Size | Cause | Improvement |
|---|---|---|---|
| Idle hold | 5h 0m of the 10.7 elapsed | nothing startable after 14:12 until the operator triaged `PARKED.md` at 19:08 | the loop's stop notification names the operator decision that would restart it |
| A slot's previous set left a named log group | 144 job-minutes (deploy 35645085868 failed at EdgeStack), a 72-minute cancelled dispatch, one AWS delete by the operator | `ensureAwsCustomResourceProviderLogGroup` named the provider log group after the stack; the provider Lambda recreated it after CloudFormation deleted it; `ci-set1` was reclaimed 3 hours later | landed: 0dfb5342, a generated name, the same fix as 64a2f347 |
| A Cognito callback removed under a running suite | 155 job-minutes (deploy 35655351050, one probe red on `redirect_mismatch`) | a7e22a95 dropped the spreadsheets hosts from the DIYA-GL client while `diyaGlSubscription` still built its callback on `ci-spreadsheets…/diya-gl/ltd.html` | landed: 0e960f73. To prevent: a unit test that every behaviour suite's callback host is in `IdentityStack`'s list, on `IdentityStackTest`'s pattern |
| Artifact upload 403 | one `test` rerun of 2 jobs (~5 job-minutes) and one operator paste | GitHub's artifact service refused `FinalizeArtifact` after both suites passed | `continue-on-error: true` on the two suites' upload-artifact steps, or a retry action |
| A PR merged under cool-down | 12 job-minutes and 1 operator interruption | the skill said nothing about PRs | landed: the skill leaves a green PR for `/wake` and stops the loop and watch on the way down |
| Sandbox transcripts regenerated | 3 sandbox runs (~11 min) and ~100k of the T7b.7 agent's tokens | the previous session's transcripts lived under a worktree's `target/`, removed with it | `itsa-sandbox-year.js` defaults `ITSA_SANDBOX_OUT_DIR` outside the worktree |
| A scripts-only change deployed a ci set | 142 job-minutes and a 4-hour ci set for #319 | `package.json` is in `deploy.yml`'s `paths:` | a path-filter job that ignores `scripts.*` edits, or accept the cost; B43a covers the scheduled half |
| Batch proof re-run | ~25 min waiting on Maven, then a 5-file re-run | `npm test` and `./mvnw clean verify` ran concurrently at load average 107 | `iterate` runs the two proofs serially |
| Fast-forward that moved the tree, not the ref | 3 extra commands | `git merge --ff-only` on the main checkout stopped before moving `main` | land docs batches by `git cherry-pick` (done for the second docs batch) |
| A review suggestion already done | 1 of 13 suggestions (PU rows on the board) | the Fable agent branched from 95fe276c before ee02df17 added them | brief an analysis agent with `git pull` first, or from the board's current commit |

## Placement

Scales are constructed from the cited anchors; they place one session, not a team.

- **Deployment frequency**: 3 `main` deploys in 10.7 hours. 2026 guides put elite at "on demand,
  multiple times per day"
  ([DevX](https://www.devx.com/uncategorized/dora-metrics-2026-benchmarks-high-performing-teams/),
  [CI/CD Watch](https://cicd.watch/blog/dora-metrics-benchmarks-2026)); inside that band for one
  repository.
- **Lead time for changes**: push to prod 1h 44m for #319; 27 minutes push to merge for #322's fix.
  Elite is "under one hour" on the same guides; the prod deploy (134 job-minutes, ~52 minutes wall)
  is the floor.
- **Change failure rate**: 2 of 7 deploy runs failed, both on the sibling branch and both fixed by
  a following commit; 0 of 3 on `main`. The elite band is 0 to 15% per deployment.
- **Cost per merged PR**: $1.45 of agent tokens over 4 PRs is $0.36 per PR, $0.16 per row closed;
  task-priced anchors put an agent task at $0.03 to $2.60
  ([Kunal Ganglani](https://www.kunalganglani.com/blog/ai-agent-cost-per-task-2026),
  [PointFive](https://www.pointfive.co/blog/the-pointfive-coding-task-index)) and Claude Code
  enterprise use at $13 per developer per active day
  ([getdx](https://getdx.com/blog/ai-coding-assistant-pricing/)). With the estimated $26 of
  coordinator tokens the figure is $6.90 per PR and $3.05 per row.
- **Token prices used**: Sonnet 5 $2/$10, Opus 5 $5/$25, Haiku 4.5 $1/$5, Fable 5.1 assumed at the
  Opus rate, per million input/output, cache reads at 10% of input, as the previous report; not
  re-verified this session.

## Suggested improvements

Ranked by value; elapsed minutes rank above job-minutes, which rank above operator messages.

1. Name the restarting decision in the loop's stop notification. Value: up to the 5h 0m idle hold.
   No board row; one line in `iterate`.
2. A unit test that every behaviour suite's Cognito callback host is in `IdentityStack`'s list.
   Value: 155 job-minutes and one red deploy per dropped host. No board row.
3. Keep a `package.json` scripts-only edit off `deploy.yml`. Value: 142 job-minutes and a 4-hour ci
   set per such change. No board row; B43a covers the scheduled half.
4. Run the batch proofs serially. Value: ~25 minutes per batch. No board row; one line in
   `iterate`.
5. Keep sandbox transcripts outside the worktree. Value: ~11 minutes and ~100k tokens per lost
   run. No board row.
6. `continue-on-error` or a retry on the suites' upload-artifact steps. Value: one rerun and one
   operator paste per GitHub artifact outage. No board row.
7. Brief analysis agents from the board's current commit. Value: one stale suggestion per report.
   No board row; one line in the agent brief shape.
8. Land docs batches by cherry-pick. Value: 3 commands. No board row.
9. Cool-down leaves green PRs open and stops the loop; the provider log group takes a generated
   name. Value: 12 and 216 job-minutes per recurrence. Both landed this session.
