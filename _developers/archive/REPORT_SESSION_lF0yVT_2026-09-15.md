<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Session report lF0yVT, 2026-09-15

Session `session_019NgAxZ6ifDtaS8Wijo1SFM`, 2026-09-15 06:46 to 15:55 UTC.

**Result.** 6 PRs merged (#216 b33, #217 b34, #218 b35, #220 b36, #221 b37, #222 b38), 13
board rows closed (B153, B154, B156, B157, B158b, B158c, B158d, B159, B30x, B52aa, B52ab, B52v,
B52y) and 5 opened (B52aa, B52ab, B158c, B158d, B160, of which 4 closed the same day; B52y.2 and
B160's destroy remain); 50 non-merge commits (18 task commits, 32 board write-backs), 992 lines
added and 85 removed across 37 files of code, tests and workflows (14 test files among them), no
generated files touched; prod serves `prod-70b0a8e`; board: 0 in flight, 1 machine-only row
(B52y.2, after the 03:15 UTC nightly), 2 human-and-machine, 10 human-only, 7 blocked.

## Method

I use Claude Code as a coordinator. I write the plan and the rules into the repo, it dispatches
several agents in parallel on separate worktrees, squashes what passes the tests onto one batch
branch, opens the PR, watches CI, merges under the gates and watches the prod deploy, and I make
the decisions it can't: what goes on the board, which AWS writes it may make, what gets destroyed.
In this session one `/loop` ran six batches of one to four rows each to production in nine hours,
eighteen task commits for roughly $45 of tokens at list price and $0 on the subscription, while I
sent fifteen messages, three of them commands the session cannot run itself. I spend my time
reading its evidence and fixing the process when it wastes cycles, not writing code. Today the
board-to-prod loop became reliable end to end, including its own watch script, and my next areas to
develop are the workflow-change brief (both prod incidents came from a called workflow's inherited
event and permissions) and the deploy serialisation that spends half the elapsed time waiting for
`main`'s deploy before the next merge.

## What worked

| Efficiency | Measured | Mechanism |
| --- | --- | --- |
| Elapsed | 9 h 09 m session; first dispatch 07:05 to first prod promotion 08:35 (1 h 30 m); six promotions in the day | `/loop` self-pacing over `/board` → `/do-next` → `/watch` → `/auto-merge`; worktree-per-agent; the next batch's agents dispatched while `main` deploys |
| LLM cost | 17 sub-agent runs, 1.82 M tokens (Haiku 8 runs 562 k, Sonnet 9 runs 1.26 M), ≈ $5 at list; main session estimated ≈ $40 at list (about 200 turns over a cached 250–450 k context, Opus 5 cache-read $0.50/MTok, output $25/MTok); subscription marginal cost $0 | Lowest-tier-that-fits per row (Haiku for one-file mechanical edits, Sonnet for bounded changes); briefs that paste the run ids, log lines and file:line so the agent verifies instead of rediscovering; `SendMessage` to resume an agent with its context (B52y's second cut cost 169 k tokens, a fresh agent would have re-read the workflow) |
| AWS cost | 8 ci app deploys, 8 environment deploys, 6 prod sets built, 5 ci sets each standing 4 h; 1 spare prod set left standing ($35.28 a month until destroyed); no metered LLM call in any workflow | 4-hour ci self-destruct (`selfDestructDelayHours` default); `destroy previous` in `deploy.yml` removed each superseded prod set; the ci set of the previous batch reused for B34.6b's poll (no lean deploy) |
| GitHub Actions | 94 runs, 3,680 billable job-minutes measured plus ≈ 200 for the cancelled rerun's first attempt (its jobs are not returned after a rerun) ≈ 3,880 job-minutes; $0 on a public repository, ≈ $31 at the private ubuntu rate ($0.008/min) | One push per batch (`do-next`'s push discipline); workflow_dispatch only where the paths filter skipped a needed deploy (34954175008); `--merge` per PR keeping one commit per task |
| Operator input | 15 messages: 7 skill invocations, 3 pasted commands (`aws sso login`, `generate-pass.yml`, `gh run download`), 1 decision (go on the Cognito write), 2 new requirements (B52aa, B52ab as board rows), 1 defect report with screenshot (B52z), 1 correction ("to be implemented using the /do-next skill") | Every operator command printed in full with the `!` prefix; AWS writes asked once, in one sentence, with what the script does |
| Quality | 0 review threads; 6 of 6 PRs merged on first `/auto-merge`; local suite green before every first push (3,184 → 3,203 vitest, 229 → 231 Java); 1 change failure in 6 prod promotions (the scheduled deploy of 09:24, rolled back by `deploy.yml` in minutes); prod stayed served throughout | Full local suite once per batch before the first push; `deploy.yml`'s apex rollback; B160's `deploy-ops` gate now on `main` |

## Room for improvement

| Loss | Measured | Cause | Improvement |
| --- | --- | --- | --- |
| B159's first cut broke the daily scheduled prod deploy: every probe's `params` job died, the apex rolled back, `prod-075487d` was left standing, incident #219 opened | 136 job-minutes on the failed run; 1 spare prod set at $35.28 a month until destroyed; 1 incident; the fix cost one more branch cycle (≈ 25 min elapsed, 174 job-minutes) | The wait step's `gh run list` ran in a checkout-less job without `--repo` (the same defect B156 fixed the same morning), and its `schedule` guard matched the called workflow, which inherits the caller's event | A workflow-change checklist in every `.github/workflows/**` brief: a called workflow inherits the caller's `github.event_name` and may request no permission its callers do not grant; `gh` in a checkout-less job needs `--repo`; grep the same defect across sibling workflows before committing |
| B159's very first push failed at startup: the called workflow requested `actions: read` that `deploy.yml`'s 29 caller jobs do not grant | 1 startup_failure, ≈ 25 min elapsed to diagnose and repush | Same cause: called-workflow permission semantics absent from the brief | Covered by the checklist above |
| B52y's first `deploy-security-lake` job used the generic reusable deploy, which deployed the dependency chain with an image tag nothing pushes | 50 job-minutes (failed env deploy) + 164 job-minutes (the old head's app deploy, dropped when the fix pushed) = 214 job-minutes; ≈ 50 min elapsed | The brief named `deploy-security-detection` as the template; the stack has its own container Lambda and needed `deploy-scan-detection`'s build-push-deploy shape | Brief an env-stack job from a Lambda-bearing sibling and say "grep the stack for `baseImageTag` first" |
| The live prod set ran without its OpsStack for ≈ 4 h | 1 runner-level job failure (no steps, no log); a rerun cancelled after the scheduled deploy took the concurrency group | Nothing downstream needed `deploy-ops`, so promotion ignored its failure | Landed: B160's gate (#220). Remaining: the spare set's destroy is the operator's |
| The watch script misreported three times: a NOT-GATING flood (B158b), a gating run hidden behind a newer scheduled run (B158c), an early TALLY on one eventually-consistent answer (B158d) | 3 premature or noisy wake-ups, each re-checked by hand (≈ 10 min coordinator time each); 2 board rows and 2 PRs to fix | Grouping before filtering; a single-cycle exit condition; no dedup on a per-cycle line | Landed in #217, #220, #221 |
| Serial deploys: each merge waited for `main`'s previous deploy to finish | ≈ 4 h 10 m of the 9 h 09 m elapsed spent with a green PR waiting on `main` (5 waits of 40–60 min) | One `deploy-prod` concurrency group; a merge starts a ≈ 50 min deploy | Dispatch the next batch's agents during the wait (done from b34 on); a merge queue that batches two green PRs into one deploy would halve the waits |
| Two agents wrote their change into the primary checkout as well as their worktree | 2 stray modified files on `main` (identical to committed content), found by `/auto-merge`'s inventory | The file tools took repository-relative paths that resolved against the primary checkout | Brief: every Read/Edit path is absolute under the worktree; `/auto-merge`'s `git status` on the primary checkout stays the backstop |
| The email-restricted pass path was found broken by the operator on prod (B52ab) | 1 defect report with a screenshot; 1 PR | `bundles.html`'s public pre-check rejected every restricted pass and no browser test covered the restricted flow | Landed (#217) with unit tests; a browser test for the restricted-pass redeem flow is not yet written |
| SSO expiry mid-session | 2 pastes of `aws sso login`; one board render with Part 4 unverified | 8–12 h token life | Print the login command in the render where AWS was needed (done); nothing else to do |

## Placement

Scales are constructed from the anchors cited; a session is one team-day, so per-day figures
are compared to per-day benchmarks.

| Efficiency | This session | Anchor | Placement |
| --- | --- | --- | --- |
| Deployment frequency | 6 prod promotions in 9 h | DORA 2026 elite: multiple deploys per day ([taskade](https://www.taskade.com/blog/dora-metrics-explained), [koalr](https://koalr.com/blog/dora-metrics-benchmarks)) | Elite |
| Lead time for changes | 1 h 30 m from first dispatch to first promotion; 25–60 min per later batch | DORA 2026 elite: under one day ([gitrecap](https://www.gitrecap.com/blog/dora-metrics-benchmarks)) | Elite |
| Change failure rate | 1 of 6 promotions rolled back (17%) | DORA 2026 elite: under 15%; 5% in the 2024 report; under 2% with mature rollout tooling ([keploy](https://keploy.io/blog/community/how-to-improve-dora-metrics), [taskade](https://www.taskade.com/blog/dora-metrics-explained)) | High, one failure short of elite on a six-deploy sample |
| Time to restore | apex rolled back in minutes; a promoted set with the fix ≈ 3 h later | DORA 2026 elite: under one hour ([koalr](https://koalr.com/blog/dora-metrics-benchmarks)) | Elite for service (the rollback), medium for the fixed promotion |
| LLM cost per merged PR | ≈ $7.50 at list ($45 / 6), $0 marginal | No published per-PR anchor found dated within three months; the previous report's figure is not reused | Unplaced |
| Operator input per PR | 2.5 messages per PR, 0.5 of them pastes | No published anchor | Unplaced |

## Suggested improvements

1. Workflow-change checklist in the brief (inherited event, caller-granted permissions, `--repo` in checkout-less jobs, sibling grep): removes 136 + 174 + 25 min of job-minutes and elapsed, one incident and one spare prod set ($35.28 a month) per recurrence; no board row covers it.
2. Env-stack job briefs name a Lambda-bearing sibling job and a `baseImageTag` grep: removes 214 job-minutes per recurrence; no board row.
3. A merge queue or a two-PR batch per `main` deploy: removes up to half of the ≈ 4 h 10 m waiting on `main` per day; ranks below 1 and 2 because those are certain losses on every recurrence and this is elapsed time the next batch's dispatch already overlaps; no board row.
4. Browser test for the restricted-pass redeem flow on `bundles.html`: removes one operator defect report per regression; no board row.
5. Worktree briefs: absolute paths under the worktree for every file tool: removes two stray files per batch and one inventory check; no board row.
6. Destroy `prod-075487d`: removes $35.28 a month; board row B160 (operator's command).
