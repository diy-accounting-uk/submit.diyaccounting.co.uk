<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Session report gHU+3J, 2026-09-21

Session `session_0121i8hjrBAwPpeD5wd68yep`, 2026-09-20 17:00 UTC to 2026-09-21 12:30 UTC (19.5 hours,
of which about 9 were spent holding for deploys with no agent running).

## Result

5 pull requests merged (#309, #311, #312, #315, #316), 1 open (#317, stacked, checks green); 23
board rows closed and 1 opened (B30ao); 56 commits on `main` from this session, 19 of them
board write-backs; 8,495 hand-written lines added and 817 removed across 160 files (excluding
`web/public-simulator/`, `_developers/`, `fixtures/` and Markdown), plus 116 lines in one
`_developers` runbook and 1,109 lines across 17 Markdown files; no generated simulator export
changed. Prod serves prod-4fef66c, with prod-0d00bdeb deploying. Board: 18 rows open, 2 in
flight (B49.16, B11.T7b.6 on #317), 3 ready (1 machine-only held by cool-down, 2 machine-ask),
1 human-driven, 10 blocked. Cool-down is on since 11:52 UTC.

## Method

I use Claude Code as a coordinator. I write the plan and the rules into the repo, it dispatches
several agents in parallel on separate worktrees, squashes each one onto a batch branch, merges
what passes the tests and the ci deploy, and I make the decisions it can't: which design, a live
Stripe write, a Google access level, a token it cannot mint, a delete. In this session that landed
twenty-three board rows in five pull requests over nineteen hours for about $5 of agent tokens
and an estimated $40 of coordinator tokens, all inside the subscription. I spend my time on the
asks it surfaces and on the process when it wastes a cycle, not on the code. Today the
board-wave-watch-merge loop ran four full cycles unattended and my next areas to develop are the
ci contention that costs a redeploy per shared-resource collision and the daily scheduled prod
deploy that rebuilds an unchanged head.

## What worked

| Efficiency | Measured | Mechanism |
|---|---|---|
| Elapsed, first dispatch to prod | 5h 20m (17:10 to 22:30 UTC, prod-d2f94db live) | one batch branch, ten agents in one wave, `/watch` monitor with re-arm, `/auto-merge` gates |
| Rows per wave | 10, 11, 3, 4, 4 rows across five PRs | file-ownership boundaries in every brief; rows that share a file go to one agent |
| Agent tokens | 5.05M over 25 agents (Sonnet 4.35M, Opus 0.45M, Haiku 0.25M), $5.38 estimated at 80% cache reads, $15.70 with no cache | lowest tier per row; two Opus design rows only; Haiku for one-file edits |
| Coordinator tokens | estimated $40 (about 300 turns at ~150k cached context, Opus 5 rates), $0 marginal on the subscription | 1-hour cache TTL; wakeups only on events |
| GitHub Actions | 5,376 billable job-minutes across 207 runs, $0 on a public repository ($43 at the private rate of $0.008/min); 2,025 on this session's branches, 2,363 on `main`, 987 on the sibling session's `dg-*` branches | one push per wave; no redeploy for docs-only heads (paths filters) |
| AWS | 20 `deploy.yml` runs (8 on `main`); 6 ci sets stood 5 to 15 hours; 8 prod sets created, 7 destroyed by the next deploy, none left standing beside the live one | `SelfDestructStack`, `destroy previous`, the slot pool |
| Operator input | 21 messages: 6 skill invocations, 3 decisions, 3 pastes of blocked commands, 3 questions, 2 corrections, 3 new requirements, 1 help request | every ask named in one line with its command in full; `/board` write-backs as the record |
| Quality | 0 reverts; every fix rode the batch that broke it; 3 production defects found by sandbox runs (header name, `STATEFUL`, 429 retry) | commit-before-verify; blast-radius tests in worktrees; full suites once per batch |

## Room for improvement

| Loss | Size | Cause | Improvement |
|---|---|---|---|
| ci apex re-aliased under a running probe | 7 of 13 probe suites red on b62's first deploy, one rerun (~40 job-minutes, ~35 min) | `main`'s deploy of #307 moved the ci apex while b62's probes ran | B30af.5's P4 (probes on the set's own host); until then, serialise branch probes behind `main`'s set-origins |
| Four ci slots held by merged branches | dg-3c's deploy waited 30 minutes and failed; b63 waited for a 5-hour stale-claim window | slot records outlived their branches | landed: `destroy-ci.yml` on `delete` (B30af.7) |
| A slot's previous set left a named log group | b63's second deploy failed at `deploy api` (~45 min, ~70 job-minutes) | cleanup Lambda logs after CloudFormation deletes its group | landed: generated log-group names |
| Cross-account alarms before the source linked | b63's `deploy environment` failed once (~20 min) | CloudWatch refuses an alarm on an unlinked account's metric | landed: alarms wait for the link (B52.D3's remainder) |
| ci probe followed a sibling repository's redirect to a dead host | b63's third deploy red on one suite (~45 min); one inbox round trip | the spreadsheets ci site 301'd `/diya-gl/` to an unresolvable host mid-cut-over | inbox protocol worked (fixed within the hour); a probe that asserts the spreadsheets host before navigating would name the cause in one line |
| Budget action called before checkout | alarm triage for #313 failed; the hourly closer would have too (~5 min, one fix commit) | extracting inline steps into a local action in a job with no checkout | brief checklist item: a local action needs a checkout (added to this session's briefs after the fact) |
| Daily scheduled prod deploy of an unchanged head | prod-a15fe51 built and destroyed for a docs-only commit (~120 job-minutes, one prod set's hours) | `deploy.yml`'s 09:16 schedule has no "head already deployed" guard | parked: skip the schedule when the head equals the last deployed head |
| Ten video captures from one comment change | 52 job-minutes of captures, 3 failed | `web/public/lib/**` counts as a shared asset; ci-only scripts dispatched at prod | landed: `environments` on scene scripts; the shared-asset rule could ignore comment-only diffs |
| Main session held for deploys | ~9 of 19.5 hours with no agent running | one PR at a time; each ci deploy 35 to 45 minutes; redeploys after fixes | overlap the next wave's agent work with the current deploy (dispatch on b(n+1) while b(n) deploys), which this session did only once |
| Agent report claimed a comment it had not written | one coordinator edit | report trusted over diff | the landing step already reads the diff; keep it |
| Console instructions from memory | one correction ("Tools → API Center" does not exist; developer tokens sunset 2026-09-09) | no web check before naming a Google console path | memory saved: web-search the current layout first |

## Placement

Scales are constructed from the cited anchors; they place one session, not a team.

- **Deployment frequency**: 8 `main` deploys in 19.5 hours, five of them PR merges. DORA's 2026
  guides put elite at "on demand, multiple times per day" ([DevX](https://www.devx.com/uncategorized/dora-metrics-2026-benchmarks-high-performing-teams/),
  [CI/CD Watch](https://cicd.watch/blog/dora-metrics-benchmarks-2026)); this session sits inside
  that band for one repository.
- **Lead time for changes**: first dispatch to prod 5h 20m; elite is "under one hour" on the same
  guides. The ci deploy (35 to 45 minutes) and the serialised merge set the floor; two of the five
  batches needed a redeploy.
- **Change failure rate**: 3 of 20 deploy runs failed, none on `main` (0 of 8); the guides' elite
  band is 0 to 15% per deployment.
- **Cost per merged PR**: $5.38 of agent tokens over 5 PRs is about $1.08 per PR, or $0.23 per
  row; task-priced anchors put an agent task at $0.03 to $2.60 and Codex CLI at $0.71 per solved
  task ([Kunal Ganglani](https://www.kunalganglani.com/blog/ai-agent-cost-per-task-2026),
  [Octomind](https://octomind.run/blog/best-ai-coding-agents-2026)). With the estimated $40 of
  coordinator tokens the figure is $9 per PR and $2 per row.
- **Token prices used**: Sonnet 5 $2/$10, Opus 5 $5/$25, Haiku 4.5 $1/$5 per million input/output,
  cache reads at 10% of input ([Claude platform docs](https://platform.claude.com/docs/en/about-claude/pricing),
  [BenchLM](https://benchlm.ai/anthropic/api-pricing)).

## Suggested improvements

Ranked by value; minutes of elapsed time rank above job-minutes, which rank above operator
messages, because elapsed time is what serialises everything else.

1. Overlap the next wave with the current deploy: dispatch b(n+1)'s agents while b(n) deploys.
   Value: up to ~9 hours of the 19.5 elapsed. No board row; a rule for `iterate`.
2. Probes on the set's own host, not the ci apex. Value: one redeploy (~40 min, ~40 job-minutes)
   per apex collision. Covered by B30af.5 (blocked on B30af.6).
3. Skip the scheduled `main` deploy when the head is already the last deployed head. Value:
   ~120 job-minutes and one prod set's hours per unchanged day. Parked in `PARKED.md`.
4. Add "a local action needs a checkout" to the workflow checklist in `do-next` and `iterate`.
   Value: one fix commit and a failed triage per extraction. No board row.
5. Ignore comment-only diffs in the video dispatcher's shared-asset rule. Value: up to 52
   job-minutes per such deploy. No board row.
6. A guard in `diyaGlSubscriptionBehaviour` naming a dead spreadsheets host. Value: one
   inbox round trip's clarity; the redirect itself was the sibling's. No board row.
