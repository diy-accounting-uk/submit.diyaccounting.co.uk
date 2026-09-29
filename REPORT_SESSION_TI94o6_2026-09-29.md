<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Session report TI94o6, 2026-09-29

**Result:** 5 submit PRs merged (#413, #414, #415, #416, #417) and 1 spreadsheets PR (#145); 2 more
open (#421 security, #419 Drive client); 16 board rows closed as done (DB5, DB6, DB7, DB8, DB8b,
B30v, B30aa, B30ac, B30ad, B-ITSA-CALC, VID16, VID17, F-BS1d, F-BS3, MK-5, MK-9) and 16 moved off
the board into plans or the backlog; 58 commits carrying this session; 2,066 added and 380 removed
lines of code and config across 65 files on `main` (plus 157/98 in Markdown, 52/24 in video
manifests); prod serves `prod-554a499`; the board holds 13 rows, 11 of them in flight on the two
open PRs.

## Method

I use Claude Code as a coordinator. I write the plan and the rules into the repo, it dispatches
several agents in parallel on separate branches, merges what passes the tests, and I make the
decisions it can't: which design, what gets merged, anything that spends money, and anything
touching Google or AWS settings. In this session that closed sixteen board rows through five
production deploys and a spreadsheets release, applied a Google Ads campaign and a GA4 export
change, and ran a security review that turned up three high findings now fixed in an open PR,
for roughly $2 of sub-agent tokens and an estimated $25 to $40 for the coordinator. I spend my
time deciding and correcting the process, not writing or reading code. The refine, iterate and
board loop ran reliably all day; my next areas are the worktree setup that cost two hours of a
red test run, and getting Google access to run as code without my console clicks.

## What worked

| Efficiency | Measured | Mechanism |
|---|---|---|
| Elapsed time | 07:48 UTC first call to 16:40 UTC fourth prod merge: 5 PRs to prod in 8 h 52 min | One batch branch per wave, squash per row, `/auto-merge` gates, watch Monitor |
| LLM cost, sub-agents | 19 agents, 2,893,207 tokens (17 Sonnet 2,443,912; 2 Opus 449,295); estimated $2.00 at list rates (Sonnet 5.5 $2/$10, Opus 5.5 $4/$20, cache read $0.20 per MTok) assuming 90% cache reads and 3% output | Lowest-tier model per row; one shared brief file (`brief-common.md`) so each prompt carried only its row |
| Parallelism | Wave 1: 8 agents across two repositories at once, 6 rows landed inside 12 minutes | File-ownership split per agent; rows sharing a file given to one agent (DB6/DB7/DB8/B30v) |
| Quality | 0 red prod deploys; every PR's prod deploy promoted; 2 test expectations and 1 Athena type error caught on the branch before `main` | Full `mvnw verify` + `npm test` per batch before push; branch deploy of the environment stacks |
| Security | 9 findings from one Opus review, 3 High reachable on prod, fixed on a branch the same day; detail kept off the public repo | Read-only review agent, private findings file at the workspace root, public rows naming only the fix |
| Operator input | Questions put through the ask tool (MK-5, MK-9, DB8b) settled 6 decisions in 3 answers | Asking with the recommended option first, one decision per question |
| Board hygiene | 16 rows moved to `PLAN_REASONED_JOB_FILTER.md`, `PLAN_COMPANIES_HOUSE.md`, `PLAN_BOOKS_TO_SUBMIT.md` and the backlog on request | `/refine` passes with the plan kept as the dependency graph |

## Room for improvement

| Loss | Size | Cause | Improvement |
|---|---|---|---|
| Spreadsheets batch worktree without `node_modules` link | 2 router runs (63 min, then a push-hook run), 1 diagnosis agent (124,551 tokens), about 2 h to PR #145 | The coordinator linked `node_modules` only in agent worktrees, not the batch worktree | Link every worktree the session creates; memory `worktree-node-modules-link` now says so |
| New-branch content scan scanned the whole tree | 1 red on PR #413's first push, 1 fix commit, ~30 min | `content-scan.yml` diffed a first push against the empty tree | Fixed on `main` in 71474ad3 (merge base with `main`) |
| Athena view with a `timestamp with time zone` column | 1 failed environment deploy and rollback, 1 cancelled app deploy, ~45 min | No local check of the view's SQL against Athena's view type rules | A unit or `EXPLAIN` step in the view briefs: create the view on ci before push |
| Google API gaps | PR #419's plan red (API Keys API off in the quota project); 3 operator gcloud commands and 1 blocked browser consent | Service account's own project lacked an API; Google blocks gcloud's client for analytics scopes | Put every API a script calls into `project.toml` for both projects in the same PR; plan runs in CI only (`ga4-sync-runs-in-ci` memory) |
| Scheduled deploy of a docs-only head | 1 run cancelled by hand before its stack jobs | Board pushes to `main` trigger the schedule's head | Skip scheduled deploys whose head differs from the last deployed commit only in `*.md` |
| Worktree-only test failures | 6 system files fail to load `timers/promises` in every linked worktree | vitest resolves from the main checkout's `node_modules` through the link | Run the batch `npm test` in a worktree with its own `npm ci`, or exclude these six files from the linked-worktree run and let CI prove them |
| `compact-ready` answered `not yet` for PRs in CI | 1 operator correction, 3+ renders | The rule's two causes were not explicit | Fixed in 87acd8a3: `not yet` names one of two causes or is `yes` |
| Unapproved AWS write | 1 `CREATE VIEW` on ci's Athena database, then dropped on approval | A type probe run as a view instead of a `SELECT` | Probe types with `SELECT CAST(...)`, never `CREATE`; writes stay behind the ask |
| Video published before the operator watched it | 1 video public without the unlisted review | Brief authorised publishing but did not restate the review step | Briefs that publish name the skill's review step as a stop |
| Review claim that a route had no legitimate caller | Would have broken the prod behaviour suites; caught by the abuse check | The reviewer searched 20 days of logs with 3-day retention | Reviews verify "unused" claims against the repo's callers, not logs |

## Placement

Scales are constructed from the anchors below, not published rankings.

| Efficiency | This session | Anchor |
|---|---|---|
| Deployment frequency | 5 prod deploys in 9 h, on demand | DORA elite: on demand, multiple a day; 16.2% of organisations reach it ([Axify](https://axify.io/blog/deployment-frequency), [Deviniti](https://deviniti.com/blog/leadership-teamwork/40-devops-stats-for-2026/)) |
| Lead time for changes | 58 to 90 min from push to prod for each batch | DORA elite: under one hour; 9.4% of teams ([Taskade](https://www.taskade.com/blog/dora-metrics-explained)) |
| Cost per merged change | about $0.40 sub-agent tokens per PR (estimated) plus the coordinator | $11.99 per merged feature on Claude Code with Sonnet 4.6; $81.79 for 25 PRs with Opus 5 ([Insight](https://blog.insight-services-apac.dev/2026/07/06/cost-to-a-merged-feature), [llmgateway](https://github.com/theopenco/llmgateway/pull/4056)) |
| Change failure | 0 failed prod deploys; incidents per PR rose 242.7% industry-wide with AI assistance | DORA 2025 AI-assisted report ([Kodus](https://kodus.io/en/dora-accelerate-state-of-devops/)) |

## Figures

- **GitHub Actions:** 211 runs, 4,037 billable job-minutes (deploy 2,025, test 1,139, deploy
  environment 522, destroy-prod 115, video capture 129). The repository is public, so this bills
  nothing; at the private Linux rate of $0.008 a minute it would be $32.30. 60 content-scan runs,
  25 CodeQL; 3 cancelled on purpose (a superseded branch deploy, a docs-only scheduled deploy, the
  DB8b app deploy after its environment failed).
- **AWS:** 5 prod deploys promoted (`prod-eb16e78`, `prod-d545004`, `prod-79ca74e`,
  `prod-554a499`, plus the spreadsheets release); 7 branch ci sets; no spare prod set left
  standing. 3 manual Step Functions or Lambda runs on the operator's yes. The workflows make no
  metered LLM call except the triage workflows' Bedrock budget.
- **Operator:** about 45 messages, counted by hand from the transcript: 14 skill invocations
  (`/board` 8, `/iterate` 3, `/refine`, `/session-report`, one more), 11 new requirements, 9
  questions, 6 decisions, 7 pasted commands (gcloud logins and IAM, worktree removals), 2
  corrections of the session's behaviour (`not yet` too strict, the board's LP-24a blocker).
- **Main session:** estimated, not exposed: about 450 turns with context averaging 150K tokens,
  mostly cache reads, priced at Opus 5.5 rates, $25 to $40.

## Suggested improvements

Ranked by the time they would have saved this session.

1. Link `node_modules` into every worktree, batch included, and check `ls -ld node_modules` before a full run: about 2 h and 124,551 tokens (memory updated; no board row).
2. Create each new Athena view on ci (or `EXPLAIN` it) inside the agent's brief: about 45 min and one environment rollback (no board row).
3. List every Google API a script calls in `project.toml` for both the target and the quota project in the same PR: one red plan and one extra push (covered by BS5's PR #419).
4. Run the batch `npm test` where the six linked-worktree files can load, or mark them as CI-proven: removes 6 false failures per batch run (no board row).
5. Skip scheduled deploys of a Markdown-only head: one cancelled run per board push that lands near the schedule (no board row).
6. Publishing briefs name the video-publish skill's unlisted review as a stop: one video published unreviewed (no board row).
