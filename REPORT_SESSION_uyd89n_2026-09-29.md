<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Session report uyd89n, 2026-09-29

**Result.** 6 PRs merged (submit #408–#412, spreadsheets #144). 87 commits carry the session's
trailer (83 submit, 4 spreadsheets). 12 board rows left NEXT.md (B82b, F-BS1, OVID1, OYT1,
VID14a–g, VID14z; several split into lettered successor rows still open). 8,162 inserted and 395
deleted lines across 93 files in submit, hand-written (`videos/publish.json`, duplicated at two
paths, accounts for about 242 of the inserted lines; no other generated output); spreadsheets
carries 50 files, +1,186/-2,379 (its NEXT.md and PLAN docs moved to submit, hence the deletions).
Prod serves `prod-d6f7537`. The board holds 31 open rows: 0 in flight, 9 machine-only, 1
machine-ask, 3 human-driven, 18 blocked. Session ran 2026-09-28T13:03:08Z to
2026-09-29T07:15:26Z (18h 12m); the first commit landed 11 min in, the first PR merged 6h 25m in
(#408, 19:27:59Z), the last (spreadsheets #144) 13h 54m in.

## Method

I use Claude Code as a coordinator. I write the plan and the rules into the repo, it dispatches
several agents in parallel on separate branches, merges what passes the tests, and I make the
decisions it can't: marketing strategy, which aggregator or referral partner, affiliate pricing,
anything that spends money or touches my own company. In this session that landed 6 PRs across two
repos in just over 18 hours for about $430 of tokens: ten ITSA walkthrough videos published to the
channel, the videos page split into per-product listings, the DIYA-GL account panel and a free
browser-only Drive save on the spreadsheets side, and a marketing-strategy plan whose affiliate
fee, attribution window and aggregator shortlist I set myself over a long run of small decisions.
I spent my time on those decisions and on reading evidence, not on code. The board closed 12 rows
this session, several split into lettered successors still in flight, and my next area to develop
is proving a ci-facing fix (an ITSA capture, an HMRC scope change) against the local proxy before
spending a capture run on it, not after — the session had to be asked whether it was doing that.

## What worked

| Efficiency | Measured | Mechanism |
|---|---|---|
| Elapsed time | 6 PRs merged over 18h 12m; one merge every 3h 2m on average; first PR 6h 25m after session start | `/iterate` cycle; worktree-isolated wave dispatch; background waits in place of polling |
| LLM cost, agents | 19 agent runs, 974.8M tokens: Sonnet 929.0M (17 runs, $222.75), Fable 41.6M (1 run, $40.89), Haiku 4.1M (1 run, $0.63); $264.27 at list rates (measured — `usage` present on every sub-agent turn) | Lowest tier that fits; only one task (the marketing-strategy pass) earned Fable |
| LLM cost, main session | 1,562 assistant turns; 3,376 input + 3.10M cache-write + 649.21M cache-read + 1.02M output tokens at Opus 5.5 rates ($4 / $5 / $0.20 / $20 per M) = $165.77 (measured — `usage` present on every turn) | Prompt caching (99.4% of non-output tokens served from cache); small edits made in the main context without dispatching an agent |
| AWS | 5 prod deploys from `main` (4 of 5 succeeded on the first attempt), 0 spare prod sets at close ($0 of $35.28 a month) | `main`'s deploy destroys the previous set; `destroy-prod.yml` dispatched by hand twice |
| GitHub Actions | 4,101.6 billable job-minutes across 243 runs (submit 3,920.3 over 231, spreadsheets 181.3 over 12); $0 billed, both repos public; $24.61 at the private $0.006-a-minute rate | Worktree-per-agent plus one deploy per head keeps 5 prod deploys and 14 branch deploys inside 231 submit runs |
| Operator input | 90 messages/actions over 18h 12m (about one every 12 min): 15 pastes of commands the session couldn't run (7 worktree/branch removals, 2 `destroy-prod.yml` dispatches, 4 `.env`/`node_modules` checks), 9 screenshot reviews, 2 interrupts, 16 slash-command invocations, 38 decisions, questions, corrections and new requirements | Commands printed in full with `!`; marketing and pricing decisions taken as short prose answers rather than a form |
| Quality | 4 of 5 first-attempt prod deploys succeeded (1 reran on a chromedriver timeout); 12 board rows closed; DG-IFM's If-Match fix landed the same session it was found | Board discipline (VID14 split into lettered sub-rows as its captures diverged); batch verify before push |

## Room for improvement

| Loss | Measured size | Cause | Improvement |
|---|---|---|---|
| Main deploy's image jobs fetch an unneeded chromedriver | Run 36509338934 attempt 1 wasted 9,752s (162.5 job-min) on `push images us-east-1` and the dependent EdgeStack deploy; attempt 2 spent the same again to succeed | `npm ci` in the image-build jobs runs install scripts that fetch chromedriver and ffmpeg the jobs never use; two other jobs in the same workflow already pass `--ignore-scripts` | Pass `--ignore-scripts` on the image jobs' `npm ci` (board row B30ac, still open) |
| ITSA video captures spent ci time before local proof | 6 failed runs, 2,487s (41.5 job-min): typing cadence, read-only HMRC scope 403, country-changed deny ×2, tax year outside HMRC's range, ci-set1 torn down mid-capture | Fixes were iterated against ci recordings instead of the local proxy; the operator asked "you should be verifying the flow locally first via the proxy environment. Are you doing that?" (22:02 UTC) | Prove ITSA capture and API fixes on `npm run start:proxy` + `.env.proxy` before spending a ci capture run (the `iterate-hmrc-fixes-against-local-proxy` lesson exists but wasn't applied at the start of this work) |
| spreadsheets pre-push hook wall time far above its own tier cost | The mistral branch's push (dispatched 20:20 UTC, read back 21:16 UTC) ran about 56 min wall while its own calc tier logged 1m56s standalone | Machine contention from concurrent local worktree processes, not the calc tier itself — "the earlier timeouts were machine contention, not this" | Serialize local pushes that carry the calc tier, or move it off the interactive machine |
| Two wait loops reported a run done before it was | 01:27:13 UTC ("my wait loop read an eight-run window that missed it") and 01:47:54 UTC ("that wait loop filtered on a run count and stopped early") | The completion check filtered on a fixed window or run count instead of the specific run id | Wait on the named run id or a log line, never a window/count filter — the same shape as the existing "wait loops must not pgrep themselves" lesson, not yet generalised past `pgrep` |
| A stray symlink broke a worktree's module resolution | Found and removed at 22:23:29 UTC; blocked that worktree's vitest run until then | An earlier `ln -sf` targeted an existing symlink instead of the directory, nesting `node_modules/node_modules` | `rm -f` the link target before `ln -s`, never `ln -sf` onto a path that may already be a symlink |
| spreadsheets PR #144 smoke test failed once before merge | Run 36484993051 (471s) failed; 36491522113 attempt 2 (449s) passed | A test race, then a real Submit If-Match quoting bug (DG-IFM) | Fixed the same session (`ec6ad559`); no further action |

## Placement

Scales are constructed from the anchors cited; each anchor is dated within the last three months.

- **Daily LLM spend**: this session's measured $430.04 over 18h 12m is $566.93 a day
  normalized to 24 hours, against Anthropic's own published enterprise figures — $13 a day
  average, 90% of users under $30 a day
  ([Claude Code Usage Limits and Pricing, Explained](https://ccforeveryone.com/guides/claude-code-limits-and-pricing),
  August 2026, citing Anthropic's enterprise data). About 18.9 times the 90th-percentile ceiling,
  because this is a coordinator running continuously for 18 hours across two repositories and a
  marketing plan, not one interactive developer session.
- **Cost per PR**: $430.04 over 6 PRs is $71.67 a PR, against a 200-task benchmark's $0.01–$0.47
  per task across Claude, GPT-4o, Gemini and Haiku
  ([Ivern AI, "AI Agent Cost Per Task in 2026: 200 Tasks Benchmarked"](https://ivern.ai/blog/ai-agent-cost-benchmark-report-2026),
  updated 2026-07-02). Far above the raw per-task range, because each PR here bundles several
  board rows (2 on average this session) and a full CI and deploy proof, not one isolated task.

## Suggested improvements

Ranked by measured loss; the chromedriver deploy failure ranks first on job-minutes lost and
because its board row (B30ac) is still open.

1. Pass `--ignore-scripts` on the image-build `npm ci` jobs in `deploy.yml`: removes 162.5
   job-minutes the next time a chromedriver or ffmpeg fetch times out. Board row B30ac covers
   this.
2. Prove ITSA capture and API fixes against the local proxy before spending a ci capture run:
   removes 41.5 job-minutes and the operator correction it took to enforce this session. No board
   row.
3. Serialize or relocate pre-push-hook calc-tier runs so machine contention doesn't inflate wall
   time about 25 times over the tier's own cost (1m56s vs ~56 min): removes the wait a concurrent
   push otherwise imposes. No board row.
4. Wait on the named run id, never a window or run-count filter, in every wait loop: removes the
   two early "done" reports and the re-check each one cost. No board row.
5. `rm -f` before `ln -s` in any worktree module-linking script: removes the stray
   `node_modules/node_modules` class of self-inflicted worktree breakage. No board row.
