<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Session report kH0fMd, 2026-09-26

**Result.** 7 PRs merged (#360, #362, #363, #364, #365, #367, #368). 63 commits carry the session's
trailer. 15 board rows delivered. 1,655 hand-written lines of code and tests across 27 files, plus
539 lines of `package-lock.json`; no generated files. Prod serves `prod-cceeba8`. The board holds 20
open rows: 9 machine-only ready, 1 human-driven ready, 10 blocked, none in flight. Session ran from
about 2026-09-25 16:05 UTC to 2026-09-26 13:10 UTC (estimated start: the first commit landed at
16:20 UTC, after one refine pass).

## Method

I use Claude Code as a coordinator. I write the plans and the rules into the repo; it dispatches
agents on separate branches, merges what passes the tests, and I make the calls it can't: which
scope we take, anything that spends money, files against my company, writes to AWS or deletes
things. In this session that landed seven PRs in a day for about $45 of tokens at list rates
(estimated). They covered five process fixes, an SMS alert on prod outages, a snapshot timeout, ci
slot release, deploy diagnostics, the Stripe test price and a live proof of the sweep's claim check.
It also settled where to test Companies House filings by probing the gateway, and rewrote the
Companies House plans around my scope decisions. My time went on decisions and on reading evidence,
not code. The merge-and-watch loop is reliable now. My next areas are the ci slot contention when
three branches deploy at once, and handing the session commands it cannot run so the timing
doesn't depend on me.

## What worked

| Efficiency | Measured | Mechanism |
|---|---|---|
| Elapsed time | 7 PRs merged in about 21 h; first PR merged 3 h 12 min after the first commit (#360, 19:32 UTC) | `/iterate` cycle; merge one PR at a time, then watch `main`'s deploy; background waits in place of polling |
| LLM cost, agents | 13 agent runs, 2.04 M tokens: Sonnet 1.49 M (6 runs), Haiku 0.35 M (4), Opus 0.20 M (1); $1 to $6 at list rates depending on cache share (estimated) | Lowest tier that fits: Haiku for one-file and doc edits, Sonnet for bounded code, Opus only for the Companies House criteria and scope design |
| LLM cost, main session | About 350 turns; roughly 90 M cache-read, 4 M cache-write and 0.3 M output tokens at Opus 5.5 rates ($0.20 / $5 / $20 per M), about $45 (estimated from turn count and context size) | Prompt caching; small edits made in the main context without an agent |
| AWS | 7 prod deploys, all green after one re-run; no spare prod set left standing ($0 of $35.28 a month) | `main`'s deploy destroys the previous set; `destroy-ci.yml` sweeps |
| GitHub Actions | 5,348 billable job-minutes on latest attempts (deploy 3,386, test 1,368, deploy environment 384), about 5,740 with the three re-run first attempts; $0 billed, public repo; $32 at the private $0.006 a minute | SR-9 took the standalone `test` run off `main` merges, proven on the #363 merge push |
| Operator input | About 55 messages (estimated, counted by reading the transcript); the SMS setup, the new presenter's live check and the Stripe price each took one yes | `AskUserQuestion` for decisions between named options; the text skill; commands printed in full with `!` |
| Quality | 0 open alarm issues at close; 4,406 unit tests and the full Maven verify green before each push; no customer-facing regression | Batch verify before push; `LambdaEnvironmentWiringCdkResourceTest` (SR-8) now guards Lambda env and SSM wiring |

## Room for improvement

| Loss | Measured size | Cause | Improvement |
|---|---|---|---|
| B30at1 proof took four branch deploys and three sweeps | 557 job-minutes; about 2 h 10 min elapsed; 6 operator messages | The classifier refused the session's `destroy-ci.yml` dispatch with `sweep-min-age-hours=0`, so the operator timed the sweep by hand and missed the window twice | Commit one script that waits for a live, non-last-known-good claim with stacks standing and then dispatches the sweep, so the operator runs one command once |
| Two branch deploys starved of a ci slot | 170 job-minutes (74 + 96 on failed first attempts); about 1 h wait | Three branches deploying on two slots, then a finished run's claim kept on a set that stopped being last-known-good | B30r landed the release rule; before a wave, check free slots and push at most two deploying branches at once |
| `main`'s deploy of #365 stalled on one CloudWatch alarm | 222 job-minutes on attempt 1; 2 h stall; failed on `ExpiredToken` | CloudFormation issued the alarm's `PutMetricAlarm` 2 h late; the chained role session expires at 1 h | B30s landed the failure-path diagnostics; a stall now shows its own reason |
| Operator snapshot published nothing after PR #354 | 1 missed nightly snapshot averted; 1 manual invoke | Activities added 32 serial Athena queries and crossed the 300 s timeout | B30o landed concurrency and a 900 s timeout; the 03:15 run took 316 s |
| SNS SMS dropped two texts; three false "recovered" texts | 5 texts wasted of a 20-text monthly budget; about 20 min | `sns publish --phone-number` accepts and drops in the SMS sandbox; each new prod set's first OK fired the OK action | The skill uses End User Messaging; B30q texts OK only after ALARM, proven by a silent deploy |
| Agent work reworked by the coordinator | SR-11 script rewritten (5 defects); SR-8 allow-list made per handler (about 93 k extra tokens) | Briefs didn't name bash 3.2 on macOS or the column names; a global allow-list hides the failures the test exists to catch | Add to `/refine` pass 2: scripts run under `/bin/bash` 3.2, and query columns come from the schema file; test allow-lists are scoped to the handler |
| Companies House scope reversed within the session | 2 planning agent runs (about 360 k tokens); 5 operator messages | I framed the ACSP rule as a scope limit instead of a date, so the operator chose own-filings-only, then reversed it | State a regulatory rule as what it forbids and from when, before offering scope options |
| Load-induced test flakes | 3 batch verifies re-checked by hand; 1 PR deploy re-run | `diyaGlStorage.system.test.js` 5 s timeout under full-suite load; a Chromium screenshot protocol error | The system test now has 30 s; the browser flake has no row |
| One commit message claimed a check that was not run | 1 correction | "No reply in the mail mirror" written before reading the mirror, which was a day stale | Write a claim into a commit only from output seen in the same turn |

## Placement

Scales are constructed from the anchors cited; each anchor is dated within the last three months.

- **Cost per merged PR**: about $46 to $51 for 7 PRs (main session estimated plus agents) is $7 a
  PR. Codacy's 2026 survey puts AI review alone at near zero to $25 a PR ([Codacy](https://blog.codacy.com/ai-code-review-cost-per-pull-request-what-engineering-teams-actually-pay-in-2026));
  Morph's token math puts Claude Code at $1.60 to $2.60 a task ([Morph](https://www.morphllm.com/ai-coding-costs)).
  This session sits below the review-cost range per PR and above the per-task range, because each
  PR here carried several tasks and their deploy proofs.
- **Cost per day**: about $50 for one operator day against LinearB's $481 a month at the 90th
  percentile of developer token spend ([LinearB](https://linearb.io/resources/ai-engineering-productivity-gap)):
  about 2.3 times the 90th-percentile daily rate at 21 working days.
- **CI minutes per PR**: 5,348 job-minutes over 7 PRs is 764 a PR against 8 to 15 minutes for a
  typical PR with tests, lint, build and deploy ([CICDCalculator](https://cicdcalculator.com/github-actions));
  about 50 times, because each PR here deploys ten stacks and runs about twenty behaviour suites
  against a real ci set.

## Suggested improvements

Ranked by measured loss; job-minutes and elapsed hours rank above tokens because each deploy-minute
also holds a ci slot other branches wait on.

1. A committed wait-then-sweep script for proofs the session may not dispatch: removes 557
   job-minutes and 2 h 10 min per such proof. No board row.
2. Cap concurrent deploying branches at the slot count before a wave: removes 170 job-minutes and
   about 1 h of slot waits. B30r covers the release rule, not the cap.
3. `/refine` pass 2 names the shell and the schema for script and query briefs, and scopes test
   allow-lists: removes about 93 k tokens and two rework rounds. No board row.
4. Frame a regulatory rule by what it forbids and from when before offering scope options: removes
   2 planning runs (about 360 k tokens) and 5 operator messages. No board row.
5. A row for the Chromium screenshot flake in the browser suite: removes one PR deploy re-run. No
   board row.
6. Claims in commit messages only from output seen in the same turn: removes one correction. No
   board row.
