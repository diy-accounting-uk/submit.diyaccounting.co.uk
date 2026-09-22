<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Session report Kjw4C, 2026-09-13

Session `session_01Vx9PgRm6ZftqKnYoAmehzz`, 11:40 to 22:50 UTC.

**Result.** 5 PRs merged (#198 batch b29 with 13 tracks, #199, #200, #201, #202), 9 board rows
closed (B129, B130, B133, B134, B135, B138, B139, B71.S3e, B73) and B132 removed by decision,
6 opened (B140, B141, O44–O47), 81 non-merge commits, 3,225 lines added and 663 removed in code
and tests (1,975 added in tests), 499 lines of fixtures and developer records, 153 files in all.
Prod serves `prod-a8cb1ea` with `prod-e371587` deploying. Board: 36 rows open, 0 in flight,
10 blocked. Sibling repositories: 4 PRs opened and merged (spreadsheets #109, #110;
homebrew-diya-gl #2; plus docs commits to five repositories).

## Method

I use Claude Code as a coordinator. I write the plan and the rules into the repo, it dispatches
several agents in parallel in separate worktrees, merges what passes the tests, and I make the
decisions it can't: which design, where a fix ships, anything that spends money, files against my
own company or deletes things. In this session that landed thirteen tracks in one batch and four
follow-up fixes to production in one day for roughly $45 of tokens, three of the fixes being
defects the batch itself found by exercising code paths for the first time against real
services. I spend my time reviewing evidence and fixing the process when it wastes cycles, not
writing code or even looking at it. Today the batch-and-watch loop carried five merges to prod
with one automatic rollback and no customer-facing breakage, and my next areas to develop are
the ci contention between concurrent deploys and the cost of a sandbox proof that needs a deploy
per attempt.

## What worked

| Efficiency | Measured | Mechanism |
|---|---|---|
| Elapsed | 11h10 session; first agent dispatch 12:33 to the batch promoted on prod 20:15 (7h42) | `/do-next` wave of 13 agents, one worktree each, one batch branch, one PR |
| LLM cost | 23 agent dispatches, 4.77M tokens (Sonnet 4.14M, Opus 0.44M, Haiku 0.19M) ≈ $15 at list; main session estimated $25–30 (see below); subscription marginal cost $0 | lowest-tier-that-fits per brief; briefs carry the evidence so agents verify rather than rediscover |
| AWS cost | 8 ci sets, each 2–8 h; no prod set left standing beyond `destroy previous`; no metered LLM call in any workflow | self-destruct on ci sets; a named 8-hour set (`ci-b29w2`) for the whole of wave 2 |
| GitHub Actions | 102 runs, 4,252 billable job-minutes, $0 on a public repository ($34 at the private Linux rate); 20 deploys of which 14 ci | cancelling a push deploy in its first minute when a named dispatch covers the head (3 times) |
| Operator input | 31 messages: 7 decisions, 4 pastes, 3 corrections, 5 questions, 6 new requirements, 6 skill invocations | decisions asked once with named alternatives (B129, B139's route, the merge strategy) |
| Quality | 4 deployment defects found by live exercise before customers did: happy-dom missing from the Lambda image, presenter secret ARNs never set, the Companies House scope-less token loop, the ITSA dashboard's authorise button; 3 lint findings that were real defects | sandbox proofs and captures run against real services from a ci set, with the row's evidence pasted into the brief |

Main-session estimate: about 250 turns over a context that grew past 300k tokens, most of it
cache reads; at Opus 5 list rates ($5 in, $25 out, cache read at a tenth of input) that is
roughly $25–30. Not measured; the session cannot see its own usage.

## Room for improvement

| Loss | Size | Cause | Row |
|---|---|---|---|
| Three ci deploys at once | 3 reruns, ~300 job-minutes, ~1h30 wall: PR #199 lost the apex alias (`CNAMEAlreadyExists`), the `ci-b29w2` deploy lost the lane user's TOTP, #201 lost the pass-generation user's password | concurrent branch deploys share the ci apex and one Cognito user per lane | #202 (lane users, landed); B140; B127 |
| Prod rollback | 1 failed prod deploy, ~130 job-minutes, 1 redeploy (40 min), a spare prod set for an hour | the scheduled `probe-test` purged the prod lane user mid-probe | #202 (landed); B141 opens an issue next time |
| Self-destruct mid-redeploy | 1 failed deploy of `ci-claud20c8` (~130 job-minutes), 1 named redeploy | a redeploy of the same branch keeps its first set's timer | B127 |
| Sandbox filing took three passes and two burned submission numbers | ~690k agent tokens, 3 ci redeploys (~35 min each), 000002 and 000003 spent on pre-fix code | each fix needed a full `deploy.yml` to reach the ci set; the two-submission budget was spent before a redeploy was possible | B142 |
| Agents ending their turn on a build | 4 agents stopped 1–3 times each waiting on `./mvnw clean verify`; ~8 resume messages, ~45 min wall | a long foreground command is promoted to the background and ends the turn; the brief said "commit first" but not "report before the build returns" | B143 |
| Watch script died twice | ~10 min, one red missed until re-armed | bash 3.2 on this host has no associative arrays; the script was written for bash 4 | B144 |
| Redundant push deploys that ran to completion | 2 of the 14 ci deploys (b29 at 13:44 and 16:53) duplicated a named dispatch, ~260 job-minutes | the push-triggered deploy runs whenever a named dispatch is not issued in the first minute | B140 |
| Duplicate CI per commit | 16 `test` and 16 CodeQL runs for 12 pushed commits, ~1,150 job-minutes | `push` and `pull_request` both trigger `test` and CodeQL | B146 |
| Operator pastes | 4: `aws sso login` twice, `destroy-prod` for a set already gone, `git branch -D` | SSO expiry; the classifier blocks `-D` even after the squash-proof rule allows it | B145 (guidance) |

## Placement

Scales constructed from the anchors named; the anchors are for teams, this is one operator and
one coordinator.

| Efficiency | This session | Anchor | Placement |
|---|---|---|---|
| Deployment frequency | 6 prod deploys in one day | DORA elite: on demand, multiple per day | elite |
| Lead time for changes | 7h42 from first dispatch to prod for the batch; 1h30 for PR #199 (dispatch 14:0x, prod 15:5x… promoted 16:23 after its merge deploy) | DORA elite: under one day; top teams under one hour | elite band, not the top |
| Change failure rate | 1 rollback in 6 prod deploys (17%) | DORA elite 0–15%, strong under 10% | just outside elite; the failure was test contention, not a code defect |
| Time to restore | apex rolled back inside the failed run (under 5 minutes) | DORA elite under one hour | elite |
| LLM spend per merged PR | ~$9 per PR ($45 / 5) | no published anchor found for coordinator-plus-agents sessions; constructed | — |
| Actions minutes per merged PR | ~850 job-minutes per PR | GitHub free private tier is 2,000 minutes a month; constructed | a day of this would exhaust a free private tier twice over; public billing makes it $0 |

Anchors: [DORA metrics and 2026 benchmarks (Taskade)](https://www.taskade.com/blog/dora-metrics-explained),
[DORA benchmarks (Keploy)](https://keploy.io/blog/community/how-to-improve-dora-metrics),
[Claude API pricing, September 2026 (BenchLM)](https://benchlm.ai/anthropic/api-pricing),
[Claude API pricing guide 2026 (DevTk)](https://devtk.ai/en/blog/claude-api-pricing-guide-2026/).

## Recommended optimisations

- B140 — `deploy.yml` cancels a push deploy a named dispatch already covers (opened earlier today).
- B141 — a prod rollback and a failed scheduled probe each raise a GitHub issue (opened earlier today).
- B142 — sandbox proofs iterate on a lean deploy, not a full `deploy.yml`.
- B143 — agents report before a long build returns; the coordinator reads the surefire reports.
- B144 — the watch script lives in the repository, written for this host's bash 3.2.
- B145 — guidance for the blocks the operator keeps: SSO expiry and forced branch deletion.
- B146 — one trigger per commit for `test` and CodeQL.
