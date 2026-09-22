<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Session report oVpgsO, 2026-09-14

Session `session_01WsHpWypykZdgpBpaNdihPJ`, 2026-09-13 23:07 to 2026-09-14 06:00 UTC.

**Result.** 1 PR merged here (#207, batch b30, 23 commits, one per task) and 3 opened in sibling
repositories (www #31, root #32, archive #35, awaiting O46); 20 board rows closed (B11.T7r, B122,
B125, B127, B128, B131, B136, B140, B141, B142, B143, B144, B145, B146, B30v, B30w, B52x, O21,
O36, O41x) and 4 opened (B30x, B52v, B52y, B52z); 35 non-merge commits, 1,376 lines added and
283 removed in code, tests and workflows across 62 files, 99 added in `_developers/` records.
Prod serves `prod-5ca7bca` (promoted 02:38 UTC). Board: 25 rows open, 2 in flight (B17v.1 on
`claude/b30-videos`, B80b's three sibling PRs), 9 blocked.

**Method.** I use Claude Code as a coordinator. I write the plan and the rules into the repo; it
renders the board, dispatches agents in parallel on separate worktrees, folds each one's commits
onto one batch branch as a commit per task, runs the suites, opens the PR, merges through the gated
skill and watches the deploy. I make the decisions it cannot: which email signs in, what gets
merged, anything that spends money or refreshes a credential. In this session that landed twenty
rows in one batch to production in three and a quarter hours from dispatch, for about $17 of tokens
(estimated). My time went on three things: answering "where is the dashboard" three times because
the answer kept landing inside a running turn where it was summarised away, one new row, and two
pastes still owed. The batch-and-merge loop is now one command per phase; the next area to develop
is agents that hand a wait to a monitor and never come back.

## What worked

| Efficiency | Measured figure | Mechanism |
|---|---|---|
| Elapsed, dispatch to prod | 23:25 first dispatch, 02:38 `set last known good` on `main`: 3h13m | one batch branch, cherry-pick per task, `/auto-merge` gating, deploy of `main` as the integration proof |
| Elapsed, wave | 13 agents dispatched 23:25 to 23:33; agent durations 1.5 to 20 minutes from their notifications, the drill agent's 77 minutes being its own wait on two workflow runs | file-ownership boundaries in each brief, worktree per agent, sizes read from the board |
| LLM cost | 2.14M sub-agent tokens (1.85M Sonnet, 0.29M Haiku), about $1.90 estimated at blended rates; main session about $15 estimated | Sonnet for bounded changes, Haiku for the three sibling copies and the docs sweep, no Opus agents |
| GitHub Actions | 1,131 billable job-minutes over 45 runs (deploy 566, test 352, environment 96, drill 74); $0 on a public repository, $6.79 at the 2026 private Linux rate | B146 removed the duplicate CodeQL run per commit; docs-only pushes trigger nothing on deploy |
| AWS | one ci set (`ci-claud3386`, 2-hour self-destruct) and one prod set created; the previous prod set destroyed by the same run; no spare prod set standing | `deploy.yml`'s destroy-previous job; the batch's third push touched no deploy path, so no third ci set |
| Operator input | 10 messages: 3 skill invocations, 1 new requirement, 3 questions, 3 corrections, 0 pastes | the board and the do-next brief carried every decision the batch needed |
| Quality | `npm test` 3,166 green and Maven 226 green before the first push; both deploy failures on the branch were caught by the branch deploy, none by `main`'s | full suite once per batch at the push, blast radius per agent |

## Room for improvement

| Loss | Size | Cause | Row |
|---|---|---|---|
| Answers to a direct question lost | 3 operator messages, ~15 minutes, one of them a rebuke | the session answered inside a running turn; the operator's client showed a summary of the turn, and the links were in the summarised part | B147 |
| A deploy dead at startup | 1 deploy run, ~50 minutes before the next head deployed | `probe-test.yml` is a reusable workflow; its new job requested `issues: write` that its 29 callers do not grant. actionlint does not check nested permissions | B148 |
| A deploy failed at OpsStack | 1 full ci deploy (about 180 job-minutes), ~70 minutes | B128's brief assumed a `/aws/lambda/<worker>` log group; the Lambda construct gives workers the ingest function's group, which no synth test could see | B149 |
| An agent stalled six hours on a monitor | 144k tokens, 10 job-minutes, B17v.1 still open, 3 failed captures unread | the videos agent handed each wait to a Monitor that never re-woke it; the ci set it needed expired at 00:48 | B150 |
| An agent edited the primary checkout | one message, ~5 minutes of rescue | the skills agent's shell started in the primary and its edits landed on `main` uncommitted | B150 |
| The batch rebuilt by hand | ~15 minutes, one conflict resolved | `git rebase -i --autosquash` is blocked here, so one-commit-per-task meant a fresh branch and 19 cherry-picks | B151 |
| A false `MERGEABLE` | one line, no action taken | the watch script read the previous head's runs in the minute before the new head's registered | B152 |
| Diagnosis blocked at 05:50 | #208's log unread, Part 4 unverified | the SSO session lapsed at about eight hours; B145's guidance (check before a wave) landed this session and covers the next one | B145 |

## Placement

Scales are constructed from the anchors cited; the session's own figures are measured.

| Efficiency | This session | Anchor | Placement |
|---|---|---|---|
| Lead time, merge to prod | 69 minutes (01:29 merge to 02:38 promotion); 3h13m from first dispatch | DORA elite: under one day, deploy on demand, change failure about 5% ([Taskade, 2026](https://www.taskade.com/blog/dora-metrics-explained), [CI/CD Watch, 2026](https://cicd.watch/blog/dora-metrics-benchmarks-2026)) | elite on lead time and frequency; 2 of 3 branch deploys failed before one passed, so the branch change-failure rate was 67% against elite's 5%, and `main`'s 0% |
| GitHub Actions spend | 1,131 minutes for one merged PR; $6.79 at the private rate | $0.006 per Linux minute after the January 2026 cut; public repositories free ([CICDCost, 2026](https://cicdcost.com/github-actions-pricing), [GitHub changelog, 2025-12](https://github.blog/changelog/2025-12-16-coming-soon-simpler-pricing-and-a-better-experience-for-github-actions/)) | deploy runs are 50% of the bill and two of the four were failures |
| LLM cost per merged task | about $0.85 per closed row (estimated $17 over 20 rows) | list rates: Sonnet 5 $2/$10, Haiku 4.5 $1/$5, Opus 5 $5/$25 per MTok (Anthropic pricing, cached 2026-06-24 in the `claude-api` skill) | the sub-agents were 11% of the estimate; the coordinator's context is the cost |
| Operator input | 10 messages for 20 rows closed | no published anchor found for coordinator-model sessions | 0.5 messages per row; 3 of the 10 were the same question |

## Recommended optimisations

- **B147** guidance: a direct question from the operator gets its answer as the whole reply, and the turn ends there.
- **B148** `validate workflow syntax` checks that no job in a `workflow_call`-able workflow requests a permission its callers do not grant.
- **B149** a CDK test that every `LogGroup.fromLogGroupName` in an app stack names a group a construct in the same synth creates.
- **B150** the do-next brief: every Bash call starts in the worktree, and a wait is a `sleep` loop inside one Bash call, never a Monitor.
- **B151** guidance: the sanctioned squash when `rebase -i` is blocked is a fresh branch and `cherry-pick -n`; whether to allow `git rebase -i --autosquash` is the operator's.
- **B152** `scripts/watch-ci.sh` reports `MERGEABLE` only when the latest runs carry the PR's head sha.
