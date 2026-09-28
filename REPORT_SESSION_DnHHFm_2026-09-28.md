<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Session report DnHHFm, 2026-09-28

**Result.** 28 PRs merged (#369–#405). 292 commits carry the session's trailer. 11 board rows
closed (CS-11a, CS-13a, CS-A2, DB1, DB2, SEC1, SR-12, SR-13, SR-14, TG1, TG2). 21,294 inserted and
7,102 deleted lines across 360 files, hand-written (`package-lock.json` accounts for 53 of the
inserted lines; no other generated output). Prod serves `prod-f8d0065`. The board holds 31 open
rows: 1 in flight, 8 machine-only, 2 human-driven, 20 blocked. Session ran 2026-09-26T13:40:48Z to
2026-09-28T12:58:58Z (47 h 18 m); the first commit landed 6 min in, the first PR merged 3 h 25 min
in (#369, 17:06:06Z).

## Method

I use Claude Code as a coordinator. I write the plan and the rules into the repo, it dispatches
several agents in parallel on separate branches, merges what passes the tests, and I make the
decisions it can't: which design, what gets merged, anything that spends money, deletes things, or
files against my own company. In this session that landed 28 PRs over about 47 hours for roughly
$265 to $423 of tokens at list rates (the main session measured at $224.82, agents estimated at
$40 to $198). They covered the Companies House test-service harness, ten walkthrough videos public
plus a filing-scene batch, several ITSA and analytics fixes, dashboard and Telegram noise cuts, and
ci-reliability work (a merge gate, a reasoned job filter, a teardown that stopped holding its own
ci slot). I spent my time on decisions, corrections and reading evidence, not code. The
batch-and-watch loop held through two full days without me driving it end to end through seven
compactions. My next areas are the class of bug where a resource holds its own lock past its own
teardown (day one's ci-slot contention outlived last session's wave-cap fix because the actual
holder was a different Lambda) and closing a fix's alarm-clearing proof on the fix's own next clean
window rather than on its deploy.

## What worked

| Efficiency | Measured | Mechanism |
|---|---|---|
| Elapsed time | 28 PRs merged over 47 h 18 m; one merge every 1 h 41 m on average; first PR 3 h 25 m after session start | `/iterate` cycle; continuous wave dispatch on worktree-isolated branches; background waits in place of polling |
| LLM cost, agents | 71 agent runs, 19.06 M tokens: Sonnet 15.73 M (55 runs), unmatched model 2.16 M (7), Opus 0.66 M (4), Haiku 0.52 M (5); $40 to $198 at list rates depending on cache share (estimated) | Lowest tier that fits; 12 of 71 runs got a `SendMessage` resume to fold an adjacent finding into the same worktree's second commit instead of a fresh agent (1.12 M of the total tokens), per the fold-in-don't-narrow-scope rule |
| LLM cost, main session | 2,336 assistant turns; 5,580 input + 4.23 M cache-write + 892.14 M cache-read + 1.26 M output tokens at Opus 5.5 rates ($4 / $5 / $0.20 / $20 per M) = $224.82 (measured — `usage` present on every turn) | Prompt caching (99.4% of input-side tokens served from cache); small edits made in the main context without an agent |
| AWS | 24 prod deploys (23 success, 1 failure), 0 spare prod sets at close ($0 of $35.28 a month) | `main`'s deploy destroys the previous set; `destroy-prod.yml` dispatched by hand after each promotion (2 pastes) |
| GitHub Actions | 16,064 billable job-minutes across 813 runs (deploy 9,273, test 3,674, deploy-environment 1,535, the rest under 600 each); $0 billed, public repo; $96 at the private $0.006-a-minute rate | Worktree-per-agent plus one deploy per head keeps 30 branch deploys and 24 prod deploys inside 813 runs for the whole session |
| Operator input | 87 messages/actions over 47.3 h (about one every 33 min): 19 pastes of commands the session couldn't run (worktree and branch removal, `destroy-prod.yml` dispatch, `gh run rerun`), 7 compaction go-aheads, 4 screenshot reviews, 57 decisions, questions and new requirements | Commands printed in full with `!`; prose decisions in place of a form; `/compact-ready`-style check before each compaction |
| Quality | 24 of 25 first-attempt prod deploys succeeded, 25 of 30 first-attempt ci-branch deploys succeeded; 11 board rows closed cleanly | Batch verify before push; `LambdaEnvironmentWiringCdkResourceTest` and the new `mergeGate.mjs` / `select-jobs.mjs` checks landed this session |

## Room for improvement

| Loss | Measured size | Cause | Improvement |
|---|---|---|---|
| Ci slot contention, day one | 8 `No ci slot freed up in 30 minutes` failures, 13:41–18:36 UTC on 2026-09-26; one run (`claude/lynx-ch-filing`, 36251668272) wasted 185 job-minutes before a retry succeeded 52 min later | SR-13's push-time slot cap landed at 13:53 UTC (tightened 14:53 UTC) but didn't stop the failures: the actual holder was the self-destruct Lambda keeping its claim through its own teardown, a different mechanism, fixed later by PRB2 (folded into PR #385/#403) | Name the failure mode a fix actually closes (a holder that never releases) rather than the mechanism it targets (too many pushes), so a same-symptom, different-cause recurrence isn't mistaken for the same bug already fixed |
| One open alarm issue at close | Issue #406, `prod-env-activity-events-data-quality-rules-failed`, opened 11:23:55 UTC, 12 min after B30aa's fix merged (11:09:19 UTC) | The alarm's window (2026-09-27T10:23 to 2026-09-28T12:23) still covers the pre-fix period; DB5's own remainder note says the same thing: no customer event has landed since the 19:38 UTC deploy to prove the fix clean | Hold a data-quality fix's "closed" state until one full post-fix window has reported clean, not until the fix is deployed |
| Scope reversed on where books can be stored | About 6 operator messages, 19:54–20:11 UTC on 2026-09-26, to settle "DIYA cloud store to S3, not Google Drive" | An initial framing conflated "the paid gate" with "the Drive tie", so the operator's first two corrections ("I mean the whole drive store" / "NO we want DIYA cloud store to s3, just not Google Drive") were needed before the third landed | State the boundary (what moves to S3, what stays browser-only Drive) before offering scope options, the same lesson as the previous report's Companies House scope reversal |
| Code-names random-pick logic needed a correction | 1 correction ("You are over complicating it", 2026-09-27T12:24) before Zephyr (#391) shipped it | The initial explanation of "sequential rows, random pick within row" was read back to the operator as something more complex than the rule they gave | Restate a rule back in the operator's own words before designing around it |

## Placement

Scales are constructed from the anchors cited; each anchor is dated within the last three months.

- **Daily LLM spend**: this session's measured-plus-estimated $265 to $423 over 47.3 h (about 2
  operator days) is $132 to $212 a day, against Anthropic's own published enterprise figures — $13
  a day average, $150–250 a month, below $30 a day for 90% of users
  ([Claude Code docs, "Manage costs effectively"](https://code.claude.com/docs/en/costs), current).
  About 4.4 to 7 times the 90th-percentile ceiling, because this is a coordinator running two full
  days without pause, not one interactive developer session.
- **Cost per PR**: $265 to $423 over 28 PRs is $9.46 to $15.11 a PR, against a 225-task benchmark's
  $0.053–$0.067 per task for Claude Sonnet 5, which the same source says to multiply 3 to 5 times
  for real-world context and retries (about $0.16–$0.34 a realistic task)
  ([kunalganglani.com, "AI Agent Cost Per Task 2026", published 2026-07-14, updated 2026-09-16](https://www.kunalganglani.com/blog/ai-agent-cost-per-task-2026)).
  About 30 to 90 times the realistic per-task figure, because each PR here bundles several board
  rows and a full CI and deploy proof, not one isolated task.

## Suggested improvements

Ranked by measured loss; the day-one ci-slot contention ranks first because it cost both job-minutes
and a blocked deploy, ahead of items measured only in operator messages.

1. Treat "SR-13 landed" and "the ci-slot failures stopped" as separate claims, and check the second
   against the actual holder before closing either: removes 185 job-minutes and a 52-minute wait
   the next time a different holder produces the same symptom. No board row.
2. Gate a data-quality fix's board closure on one clean post-fix window, not on deploy: removes the
   open-alarm gap that DB5 already tracks as a remainder. DB5 covers the wait; no new row needed for
   the gating rule itself.
3. State the storage boundary (what moves to S3, what stays Drive-only) before offering scope
   options: removes about 6 operator messages per such reversal. No board row.
4. Restate a rule back in the operator's own words before designing around it: removes 1 correction
   per such mismatch. No board row.
