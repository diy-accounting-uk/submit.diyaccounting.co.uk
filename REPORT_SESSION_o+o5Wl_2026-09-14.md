<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Session report o+o5Wl, 2026-09-14

Session `session_016tMHMpNP32QQya5Vfts93V`, 2026-09-14 11:47 to 16:05 UTC.

**Result.** 1 PR merged (#209, batch b31, 8 commits, one per task) at 14:37 UTC, promoted to
prod as `prod-658f986` at 15:30 UTC (3h43m after the session's first tool call, 3h32m after
the first agent dispatch); 9 board rows closed (B25c, B47, B147, B148, B149, B150, B151, B152,
and #11, #197, #210, #211, #212 closed on GitHub) and 7 opened (B153, B154, B155, B156, B157,
plus B47 opened and closed inside the session); 26 non-merge commits, 1,102 lines added and 49
removed in code, tests, workflows and skills across 11 files, 194 added and 183 removed across 5
Markdown files (`NEXT.md` carried 22 of the commits). Two changes are held on local branches
until cool-down lifts: `claude/ltd-status-poll` (B34.6b's experiment) and `claude/b31-videos`
(B17v.1's manifest). The board holds 29 open rows: 3 in flight, 18 ready, 8 blocked. Cool-down
is on since 13:40 UTC.

## Method

> I use Claude Code as a coordinator. I write the plan and the rules into the repo, it
> dispatches several agents in parallel on separate branches, merges what passes the tests,
> and I make the decisions it can't (which design, what gets merged, anything that spends
> money, files against my own company or deletes things). In this session that landed eight
> tracks in one batch to production in under four hours for roughly $18 of tokens, then cooled
> the repository down with two experiments parked on local branches. I spend my time reviewing
> evidence and fixing the process when it wastes cycles, not writing code or even looking at
> it. Today the wave-then-push shape became reliable (six agents, six clean commits, one push,
> one PR) and my next areas to develop are a ci set that lives long enough for a second wave,
> and probes and recordings that do not fight the deploy for the apex.

## What worked

| Efficiency | Figure | Mechanism |
|---|---|---|
| Elapsed, dispatch to prod | 3h32m (11:58 dispatch, 15:30 promoted) | one batch branch, one push after the full local suite, one PR, `/auto-merge` |
| Elapsed, wave 1 | 44 min from four dispatches to the last landing (11:58 to 12:42) | worktree per agent off the batch branch; file-ownership boundaries in every brief |
| LLM, sub-agents | 973,834 tokens: 891,084 Sonnet 5 across five agents, 82,750 Haiku 4.5 across one; $1.86 at input list rates ($2/M, $1/M), less where cache reads applied | tier per task: Haiku for four one-file rules, Sonnet for the bounded code changes, none at Opus |
| LLM, main session | estimated $16: ~120 tool rounds at a 150–250k context, mostly cache reads at $0.50/M on Opus 5, plus ~150k output at $25/M; the subscription's marginal cost is $0 | the main session coordinated only; no code written in chat |
| GitHub Actions | 614 billable job-minutes across 30 runs; $0 on a public repository, $4.91 at the private Linux rate ($0.008/min) | one ci deploy (156 min) and one prod deploy (159 min) for eight items; no duplicate deploy of a head |
| AWS | one ci set (`ci-claud3123`, 12:41 to 14:51, 2h10m); one prod set standing after promotion; the two alarm-triage runs made the session's only metered LLM call (Bedrock, `alarm-triage.yml`), unmeasured | 2-hour self-destruct; the deploy's own destroy of the previous prod set |
| Operator input | 11 messages: 6 skill invocations or instructions, 3 pastes of blocked commands (`aws sso login`, an origin branch delete, eleven local branch deletes), 1 decision (native auth on ci), 2 new requirements (park the unproven change; rank suggestions in this report) | commands the session cannot run are printed in full with the `!` prefix |
| Quality | six agents, six clean worktrees, zero uncommitted work at merge; `npm test` 3170 passed and `./mvnw clean verify` 228 passed before the push; every branch run green on the head; 30 prod probes green on `prod-658f986` | "commit before verifying" in every brief; the full suite once, at the push |

## Room for improvement

| Loss | Size | Cause | Improvement |
|---|---|---|---|
| Three ci video captures failed and a fourth was cancelled | 4 runs, 6 job-minutes, 158k Sonnet tokens ($0.32), 44 min of agent wall time, and the ci set's 2h10m produced no recording | the dispatch passed `deployment-name=ci-claud3123`, so the browser signed in on the set's subdomain while Cognito's `redirect_uri` is the ci apex, and the OAuth state was on the wrong origin | `video-capture.yml` derives the base URL from the apex when the named set is the apex's target, or refuses `deployment-name` on ci with that message (B17v.1 carries the re-dispatch, not the guard) |
| The scheduled prod probe failed during the deploy's apex move | 1 failed run (8 job-minutes), 3 issues opened, 2 triage runs (one failed), 1 re-run, ~15 min of coordinator triage | `probe-test.yml`'s 15:16 schedule ran while `deploy.yml` on main was swapping the apex from `prod-b364438` to `prod-658f986`; the token exchange answered 403 for the seconds the origins disagreed | the scheduled probe checks for a `deploy.yml` run in progress on main and waits or skips; the deploy's own probes already cover that window |
| `/auto-merge` blocked on a recording dispatch | 2 auto-merge passes, 1 cancelled run, ~25 min and one operator round trip | the gate reads every workflow with a run on the head, and a `workflow_dispatch` recording is not a check of the change | the auto-merge and watch probes gate on push and pull_request runs only, and report dispatch runs without counting them |
| B34.6b's experiment could not be proven | one 50-minute ci deploy cycle deferred; the change sits unproven on a local branch | the batch's ci set self-destructed 2 hours after creation, before the lean deploy that would have proven the one-line change | a batch whose second wave depends on its ci set deploys with `selfDestructDelayHours=4` |
| Two `NEXT.md` section headings were deleted by row edits | 3 commits later restored; ~10 min; one render printed a file with the wrong shape | two edits sliced the file from a row's start to the next row's start, swallowing the heading between them | a check that `NEXT.md` carries the five headings in order, run by the board write-back and as a unit test |
| Worktree removals handed to the operator | 4 denied commands, 3 operator pastes | `git worktree remove` and `git branch -D` are outside the session's allowlist | the operator's allowlist decision: `git worktree remove .claude/worktrees/*` and `git branch -D claude/*` after the do-next skill's landed-diff check |
| The capture lane's password and TOTP secret printed in a public log | one run's window per capture (4 runs today) | step outputs are not auto-masked by GitHub | `::add-mask::` in the step that produces them (B155 carries this) |

## Placement

Scales are constructed from three anchors published within the last three months.

| Efficiency | This session | Anchor | Reading |
|---|---|---|---|
| Cost to a merged PR | ~$18 of tokens for one PR of 8 tasks, ~$2.25 a task | Sonnet 4.6 merges a feature for $11.99 on Claude Code, $11.74–16.83 on Copilot, $29.38 on OpenCode ([Insight, 2026-07-06](https://blog.insight-services-apac.dev/2026/07/06/cost-to-a-merged-feature)); $1.60–2.60 a task for Claude Code ([Kunal Ganglani, 2026](https://www.kunalganglani.com/blog/ai-agent-cost-per-task-2026)) | per task at the anchor's band; per PR above it, because the PR carried eight tasks and the coordinator ran on Opus |
| Spend per coding day | ~$18 in a 4h15m session | $35.20 a coding day at the 90th percentile of spend, under 4% of a developer's loaded cost ([LinearB 2026, 2.7M PRs](https://linearb.io/resources/ai-engineering-productivity-gap)) | half the P90 day |
| Merge rate | 1 of 1 PRs merged the same day | autonomous agents merge 79% within 30 days against 92% for human-only PRs (LinearB 2026) | above both, on a sample of one |

## Suggested improvements

Ranked by the loss each removes, most impactful first. Minutes and dollars are this session's
measured figures; where a loss recurs, the rate is stated.

1. **Gate `/auto-merge` and `/watch` on push and pull_request runs only.** Removes ~25 min and
   one operator round trip per batch whose head carries a recording or other dispatch run; the
   same reading blocked the merge twice today. No board row covers it.
2. **Make the scheduled probe yield to a deploy on main.** Removes, per collision, 8 job-minutes,
   3 issues, 2 triage runs and ~15 min of triage; this is the second collision this week (the
   skill's own loss list already names the shape). No board row covers it.
3. **Derive the capture's base URL from the apex when the named ci set is its target.** Removes
   the 4 wasted capture runs, 158k Sonnet tokens ($0.32) and 44 agent minutes per attempt, and
   would have delivered the two ci recordings today. B17v.1 carries the re-dispatch; a workflow
   guard is not on the board.
4. **Deploy a batch with `selfDestructDelayHours=4` when a second wave depends on its ci set.**
   Removes one 50-minute ci deploy cycle per batch with a wave-2 proof; costs about two hours
   of an idle ci set (Lambda, DynamoDB, CloudFront, Cognito at their hourly rates, unmeasured
   here). No board row covers it.
5. **A structure check on `NEXT.md` (five headings, in order) in the board write-back and a unit
   test.** Removes ~10 min and the risk of a lost row per edit that slices across a heading; two
   such edits today. No board row covers it.
6. **The operator's allowlist for `git worktree remove .claude/worktrees/*` and `git branch -D
   claude/*` after the landed-diff check.** Removes 3 operator pastes and 4 denied commands per
   batch. The allowlist is the operator's decision; this is a suggestion, not a pre-authorisation.
7. **`::add-mask::` for the capture lane's credentials.** Removes a one-run exposure window per
   capture in a public log; B155 already carries it.
