<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Session report yQdSoM, 2026-09-23

Session `session_01KBX98KbzoAP2g5FTJJyGrz`, 2026-09-21 23:22 to 2026-09-23 10:13 UTC (34 h 51 min,
across two context compactions).

**Result.** 14 PRs merged here (#323 to #329, #331 to #336, #338) plus two in siblings
(spreadsheets #133, www #32); 65 board rows closed and 75 added (79 labels left `NEXT.md`, 14 of
them renamed and back); 204 commits on `main` (199 non-merge: 77 code, 122 docs); hand-written
change 434 files, +15,594 −2,286 lines; 38 Markdown files, +1,023 −4,278; 220 files (126,952
lines) moved out to `../developers/submit` and `reference/`. Prod serves `prod-1b6c3e2` with the
deploy of `prod-184afec` (PR #335's merge) in flight. Board: 29 rows open, 0 in flight, 10
blocked; no pull request open; no alarm issue open.

## Method

I use Claude Code as a coordinator. I write the plan and the rules into the repo, it dispatches
several agents in parallel on separate worktrees, lands what passes onto one batch branch, and I
make the decisions it can't: which design, what merges, anything that spends money, files
against my own company or deletes things. In this session that landed fourteen batches to
production in a day and a half for roughly $300 to $390 of tokens at list rates, on a subscription
whose marginal cost is nil: the practice licence end to end (client-scoped submissions, the MCP's
client tools, an unlimited grant, its behaviour test), the developer archive out of the public
repos, the assessment's lint, format and coverage gates, and five fixes to the ci pipeline it
found on the way. I spend my time answering questions, merging, and running the commands the
session may not, not writing or reading code. Today the cool-down mode proved itself as a way to
land a stacked batch one branch at a time, and my next areas to develop are the ci slot pool's
release and sweep rules, and probes that clean up after themselves.

## What worked

| Efficiency | Measured | Mechanism |
| --- | --- | --- |
| Elapsed to first prod | 2 h 21 min from the first tool call to `prod-bc09c1b` (PR #323, 01:43 UTC) | `/iterate`: board, one wave, watch, `/auto-merge`, `main`'s deploy as the proof |
| Throughput | 14 PRs in 34.9 h; 11 prod sets, each replaced within hours, none left spare | one batch branch per wave; `--merge` to `main`; `destroy previous` in the deploy |
| Sub-agent spend | 58 agents, 11.83 M tokens: Sonnet 10.17 M (43), Haiku 1.25 M (13), Opus 0.41 M (2) | lowest tier that fits, chosen per row on the board |
| Main-session spend | 1,387 turns; 693 M cache-read, 3.8 M cache-write, 1.06 M output tokens; $274 at Fable list rates | prompt caching (cache reads are 99.5 % of input tokens at $0.25 per M) |
| Stacked merges | four PRs green and merged in 4 h 45 min after cool-down, no rebase of the queue | cool-down's one-branch-at-a-time rule; each branch took `main` only when it needed a fix on it |
| Operator input | 46 messages for 14 PRs: 12 questions, 14 instructions, 13 decisions, 7 state reports | direct questions answered as whole replies; the board's `!` blocks for denied commands |
| Quality | 0 open alarm issues; 2 real probe defects found and fixed (book limit, cleanup key) | the watch reads the run's own jobs and logs before any fix |
| Repository hygiene | 220 private files out of a public repo; skill symlinks and cross-repo `../CLAUDE.md` references gone from five repos | one agent per repo with the same brief |

## Room for improvement

| Loss | Measured | Cause | Improvement |
| --- | --- | --- | --- |
| ci deploys that proved nothing | 1,907 deploy job-minutes on failed or cancelled runs (35 % of deploy minutes, 17 % of all) | four causes below | see each |
| DIYA-GL probe left a book per run | 4 red deploys over 14 h, about 600 job-minutes; one wrong product diagnosis (`isBookVisible`) shipped first | the probe's cleanup deleted by `book.id` where the API returns `bookId`; the sandbox book was never deleted | landed (abaf5d4d): delete by `bookId`, delete the sandbox book |
| Slot claims held by ended runs | PR #335's push deploy waited 30 min then failed (35831692141); two named dispatches to bypass it, 610 dispatch-failure minutes | claims released only after 5 h until B30as; a named dispatch bypasses the pool | B30as landed on `main` with PR #335; B30at adds the sweep's claim check |
| Named probe sets could not sign in | `ci-b79-probe` and `ci-b80-probe`: 2 runs, about 150 job-minutes, two sets standing 12 h | only the pool's hosts and the apex are Cognito callbacks | `deploy.yml` refuses a `deployment-name` outside the pool unless probes are off |
| Sweep destroyed a set mid-deploy | PR #333's deploy 35773445604 lost `ci-set1` at 19:25; one rerun | the sweep checks age, not claims | B30at |
| Coverage gate at the measured floor | PR #335's test run red after taking `main`; 2 local coverage runs, 1 extra CI test run (about 70 job-minutes), 40 min wall | AS1 set `functions: 86` from an 86.x measurement; the merge moved it to 85.9 | thresholds one point under the measurement, or measured on the merge candidate |
| A gate landed while a PR carried an unformatted file | `main`'s test red for 47 min; hotfix PR #338; 2 red test runs (about 140 job-minutes) | PR #334's prettier gate and PR #336's new file merged without either seeing the other | `/auto-merge` runs the gates the merged PR added (`prettier --check`) on each remaining candidate before merging it |
| Scheduled probe superseded, then red | 2 red scheduled runs of `probe-test` | the upload job ignores the suite's `superseded` output | B30av |
| Alarm re-fired on a two-day-old datapoint | 1 duplicate issue (#337), one triage-bot diagnosis that read it as recurring | 24-hour metric period re-evaluated at its edge | B30au |
| Video capture on every `main` deploy | 31 runs, 195 job-minutes, on batches that changed no scene page | `video-capture-on-deploy` fires on each `main` deploy | row 72: gate on a scene-script page in the deploy's diff |
| Sweep after every deploy | 65 `destroy-ci` runs, 315 job-minutes, most with nothing to delete | `workflow_run` trigger on each deploy completion | run the sweep only when a set is past its age, from the deploy's own last job |
| SSO expiry mid-session | Part 4 unverified for 3 h 5 min; 2 operator pastes | the 8 to 12 h window ran out under cool-down | refresh at the start of each wave; print the login once per expiry, as done |
| Worktree removal blocked by agent locks | 15 operator command pastes, 5 of them failed on a lock | `worktree remove --force` needs `--force --force` for an agent-locked tree | print `--force --force` for agent worktrees from the first render |
| Two context compactions | the transcript was summarised twice; each re-read cost one board's worth of context | 34 h of a single session | end a session at the wake, with this report; start the next from the board |

## Placement

Scales are constructed from the anchors cited; each is a ratio of this session's measurement to
the anchor's figure.

| Efficiency | This session | Anchor | Position |
| --- | --- | --- | --- |
| Throughput | 14 PRs in 1.45 days = 9.6 a day | 3.3 to 5.67 merged PRs per developer per week (LinearB 2026 benchmarks) | about 12× the AI-scaled weekly rate, per day, for one operator |
| Cost per merged PR | $300 to $390 list across 14 PRs = $21 to $28 | $52 median, $65 mean per single-ticket PR across a dozen agents (Insight, July 2026); $7 to $70 range | below the median, inside the range |
| Cost per operator day | $274 main + $24 to $118 agents over 1.45 days = $205 to $270 a day | $35.20 per coding day at the 90th percentile of developer spend (LinearB); $500 to $2,000 a month for heavy agentic use (Morph) | 6 to 8× the 90th-percentile developer, with 14 PRs a day |
| GitHub Actions | 11,426 job-minutes, $0 billed (public repo); $69 at the private rate | $0.006 per minute, Linux, private repos (GitHub, January 2026) | 816 minutes a PR; the 1,907 wasted deploy minutes are $11 |
| AWS ci sets | 8 ci sets, longest standing 12 h 26 min; 11 prod sets, none spare | $35.28 a month per spare prod set (PLAN_COST_OPTIMISATION) | $0 in spare sets |
| Operator input | 46 messages, 3.3 a PR; 2 corrections | none published | the two corrections were the same fault (tables collapsing in the terminal) |

## Suggested improvements

Ranked by the job-minutes each removes; the operator-message losses rank after them because a
message costs seconds and a wasted deploy costs an hour of runners.

1. Gate `video-capture-on-deploy` on a scene page in the deploy's diff: 195 job-minutes (row 72).
2. Run the sweep only when a set is past its age: about 250 of `destroy-ci`'s 315 job-minutes.
3. `/auto-merge` runs the merged PR's new gates on each remaining candidate before merging it: about 140 job-minutes and a hotfix PR per gate landed.
4. Refuse a `deployment-name` outside the pool unless probes are off: 150 job-minutes and two 12-hour sets (memory note exists; no row).
5. The sweep checks slot claims before destroying: one lost deploy, about 150 job-minutes (B30at).
6. Coverage thresholds one point under the measurement: 70 job-minutes and 40 minutes of wall time per merge that moves a figure (no row).
7. Guard the upload job on the suite's `superseded` output: one red scheduled run per coincidence (B30av).
8. Alarm period one hour: one duplicate issue and one triage run per re-fire (B30au).
9. Print `--force --force` for agent worktrees in every removal block: 5 operator messages (skill edit, no row).
10. Refresh SSO at each wave's start: 2 operator messages and 3 hours of unverified Part 4 (rule exists; no row).
11. End a session at the wake with this report and start the next from the board: two compactions' re-reads (no row).
