<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Session report jCZRKP, 2026-09-25

Session `session_013temZ7bYrMtyVL39f2nQye`, from 2026-09-24 22:50 UTC to 2026-09-25 14:40 UTC.

## Result

- **Pull requests merged:** six in this repository (#352, #353, #354, #356, #358, #359), plus two in `spreadsheets.diyaccounting.co.uk` (#142, #143).
- **Board rows closed:** 34. That is 14 of the 29 open at the start, plus 20 opened and closed this session. One row (O52i) was dropped at the operator's request.
- **Commits on `main`:** 101, all non-merge.
- **Hand-written change:** +9,846 / −1,059 lines across 229 files, excluding Markdown, `package-lock.json` and the generated `openapi.json`. Tests are 68 of those files (+4,347 lines).
- **Generated files:** `package-lock.json` and `openapi.json`, +339 / −142.
- **Other repositories:** eight session commits in spreadsheets, one in www.
- **Prod** serves `prod-23d9a7e`.
- **Board at the end:** 16 rows open, none in flight, 13 blocked. The three that can start need the operator: O11, CS-H2, and CS-10d, which needs the operator's go.

## Method

I use Claude Code as a coordinator. I write the plan and the rules into the repo. It refines the board, dispatches agents in parallel on isolated branches, lands what passes the tests on one batch branch per wave, and merges through gates it checks itself. I make the decisions it can't: which design, anything that spends money or writes to a live service, filings against my own company, and deleting worktrees.

In this session that landed six pull requests. They carried:

- the ITSA proof suites into CI
- a clean HMRC sandbox year with a real multi-factor header
- the confirmation statement's per-filing charge
- sign-in events from every client
- an activities table on the operator dashboard
- two prod alarm fixes

It took about sixteen hours and 8.5 million sub-agent tokens. I spent my time answering design questions and pasting the few commands the session may not run.

The batch-and-watch loop is now reliable across three waves. My next areas to develop are the gap between "unit tests green" and "deployed wiring correct", and running the simulator behaviour tier before a batch is pushed.

## What worked

| Efficiency | Measured | Mechanism |
|---|---|---|
| Elapsed time | Batch 1: first dispatch 23:10 UTC, prod `prod-d9ef3c9` last-known-good at 03:50 UTC, 4 h 40 min for 14 rows | One batch branch per wave (`claude/<codename>-<theme>`), agents squash-landed as they reported, one full verify before the push |
| LLM cost | 8.47 M sub-agent tokens across 33 agents: Sonnet 24 (7.29 M), Haiku 7 (0.81 M), Opus 2 (0.37 M) | Lowest tier per row: Haiku for mechanical sweeps and one-file fixes, Opus only for the two designs (B52i identity, SI-1 sign-in parity) that Sonnet then built |
| Quality | Prod deploys 6 of 6 green; every PR's full `./mvnw clean verify` and `npm test` passed locally before push | `/refine` passes over the rows, briefs naming file and line, blast-radius tests per agent, the full suite once per batch |
| Operator input | 2 decision prompts answered in one message each (ITSA-R2's go; OSI-1's four choices) | `AskUserQuestion` with the recommended option first; decisions written into the plan the same turn |
| GitHub Actions | 7,739 billable job-minutes over 274 runs; public repository, billed $0 (about $62 at the $0.008/min private Linux rate) | Deploys only on code heads (`deploy.yml` `paths:`), so board and plan pushes started no deploy |
| AWS | 6 prod deploys, 9 ci branch deploys into the two slots `ci-set1` and `ci-set2`; no spare prod set left standing | Ci slot sets, and the self-destruct cron fix (B30bl) landed this session |

## Room for improvement

| Loss | Measured size | Cause | Improvement |
|---|---|---|---|
| PR #353 needed three rounds of red CI | 858 `test` and 797 `deploy` job-minutes on failing runs; two extra fix agents (0.57 M tokens); about 3 h | The agents proved with unit and CDK tests only. 15 simulator suites failed on a missing local table and SSM read, then on a sign-out that awaited a fetch before navigating (a headless-Chrome hang), then on the practice suite's old token | Run the simulator behaviour suites that touch changed routes (auth, bundle, practice) in the batch verify before the push |
| Two prod alarms from #353's deployed wiring | #355: 103 errors, sign-in events lost for 2 h 50 min. #357: 21 denied calls per book action, 2 h 40 min | Code read `SECURITY_STATE_DYNAMODB_TABLE_NAME` and three SSM parameters that the CDK stacks never gave those Lambdas; unit tests mock both | A CDK test per handler that enumerates the env vars it reads and the SSM names its resolver reads, checked against its synthesized role and environment |
| Docs-only pushes to `main` ran `test` | 52 runs, 696 job-minutes | Every `NEXT.md` write-back triggers `test.yml` on push | `paths-ignore` for `NEXT.md`, `BACKLOG.md`, `PLAN_*.md` and `REPORT_*.md` on `test.yml`'s push trigger for `main` |
| Agents working outside their worktree | 2 incidents: CS-10b wrote into the batch worktree, B30bo into the main checkout; one blocked board write-back | The harness removed CS-10b's unchanged worktree after its first stop, then resumed it elsewhere; B30bo ignored its `pwd` | Dispatch into coordinator-created named worktrees, and brief a `pwd` check that stops the agent on any other path |
| Lighthouse floors from a developer machine | 10 of 16 pages below their gate on the runner; 3 extra compliance runs (about 122 job-minutes); two floors still wrong on the agent's first pass | Floors measured locally, and `continue-on-error: true` hid the gate | Measure gates on the runner that enforces them; the coordinator checks floors against every run before merging |
| An agent called a regression "pre-existing" | One extra agent round (sifix, 0.37 M tokens total) | The claim was not compared with a `main` baseline | Brief rule: before calling a failure pre-existing, run the same test on `origin/main` |
| The automated alarm triage misattributed #355 | One wrong triage comment | The evidence listed log groups without the triggering child | Fixed this session (B30bm, PR #356) |
| Owner lookup blocked as personal-data handling | 4 operator pastes to identify DIYA's cloud book | The classifier blocks Cognito and salt reads that join users to prefixes | A committed read-only lookup script the operator runs in one paste, printing only the book title and the owner's masked login |
| AWS SSO expired mid-session | One alarm diagnosis waited for a login | 8 to 12 hour token lifetime | Record the login time on the board and ask for a refresh before starting a wave that reads AWS |

## Placement

These scales are constructed from the anchors below; they are not a published ranking.

- **Deployment frequency and lead time.** DORA's 2026 guides put elite teams at deploy on demand with lead times under a day ([Taskade DORA guide](https://www.taskade.com/blog/dora-metrics-explained), [Koalr 2026 benchmarks](https://koalr.com/blog/dora-metrics-benchmarks)). Six prod deploys in the session and a 4 h 40 min dispatch-to-prod for batch 1 sit in the elite band.
- **Change failure.** One of five prod code merges (#353) raised two alarms. At 20% this is DORA's "high", not "elite".
- **Agent throughput.** LinearB's 2026 benchmarks report under 5% of PRs coming from autonomous agents even in top organizations, and a 79% 30-day merge rate for agent PRs ([LinearB](https://linearb.io/resources/ai-engineering-productivity-gap)). Here every PR was agent-built, and all eight merged the same day.
- **Cost per task.** Published mid-2026 figures run $0.03 to $0.13 per agent task ([kunalganglani.com](https://www.kunalganglani.com/blog/ai-agent-cost-per-task-2026)), and $35 per coding day at the 90th percentile of developer token spend ([Larridin](https://larridin.com/blog/microsoft-study-ai-coding-agent-roi)).
  - **Estimated:** 8.47 M sub-agent tokens, mostly cache reads, at about $0.80 per million blended for Sonnet ($3 input, $15 output, $0.30 cache read, assuming 90% cache reads). That gives about $8 across 34 closed rows, roughly $0.25 per row.
  - **Main session:** its own usage is not exposed. Estimated from turn count and context at a further $20 to $40.
  - **Subscription:** the marginal cost is nil.

## Suggested improvements

Ranked by value. Job-minutes rank above tokens here because the red CI rounds also cost hours of elapsed time.

1. Run the simulator behaviour suites for changed routes in every batch verify before the push. This removes about 1,655 job-minutes and about 3 h elapsed per incident like #353. No board row covers it.
2. Add a CDK test per handler checking that the env vars and SSM names it reads are set and granted. This removes two prod alarm incidents (2 h 40 to 2 h 50 min each, and lost sign-in events). No row covers it; B30bo fixed one instance.
3. Skip `test.yml` on documentation-only pushes to `main`. This removes about 696 job-minutes per session of this shape. No row covers it.
4. Dispatch agents into coordinator-created named worktrees and brief a `pwd` guard. This removes 2 wrong-checkout incidents per session. No row covers it.
5. Brief rule: compare any "pre-existing" failure with an `origin/main` baseline. This removes one extra agent round (about 0.37 M tokens). No row covers it.
6. Measure performance gates on the runner that enforces them. This removes about 122 job-minutes of recalibration runs. B39a-gate did it once; there is no standing rule.
7. A committed read-only owner-lookup script for the operator to run. This cuts 4 pastes to 1. No row covers it.
8. Record the AWS login time and refresh before a wave that reads AWS. This removes one diagnosis stall. No row covers it.
