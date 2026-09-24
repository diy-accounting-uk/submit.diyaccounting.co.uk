<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Session report VWPXGf, 2026-09-24

Session `session_018ammFSHtXRV6JkS8CnQB6E`, 2026-09-23 about 20:15 UTC to 2026-09-24 about 22:15 UTC, in three segments: segment 1 to 06:25 (measured in `fec7105d`), segment 2 from 06:31 to 14:40 (the build waves), segment 3 from 14:40 (operator-led: decisions, emails, cleanup, the O11 check).

## Result

6 PRs merged here (#346, #347, #348, #349, #350, #351) and 5 in spreadsheets (#137, #138, #139,
#140, #141). 108 session commits on `main` (62, 37 and 9). 49 board rows closed (27, 16 and 6). Hand-written
change: about 11,760 lines added and 580 removed in code, tests, workflows and skills (2,632/304 and
9,126/274); 22 Companies House schema and example files downloaded as fixtures (9,773 lines); 78
lines of generated `openapi.json`. Prod serves `prod-0fdfb15`, carrying the whole confirmation
statement build (CS-1 to CS-8, CS-12), listed on ci only. The board: 18 rows open, none in flight, 4 machine-only rows ready (ITSA-R1, ITSA-R2, CS-10a, B52i), 1 operator row ready (CS-H2), 13 blocked; O11 waits on ITSA-R1 and ITSA-R2.

## Method

I use Claude Code as a coordinator. I write the plan and the rules into the repo; it refines the
board, dispatches agents in parallel on separate worktrees, lands their commits on one batch branch
per wave, and merges what passes every gate. I make the decisions it can't: the fee model, the
sends to HMRC and Companies House, anything that files against my own company, deletes, or spends
money. In the second segment that took the confirmation statement from fixtures to a built,
tested, deployed (ci-listed) feature across three waves, reconciled my company's book as a real
spreadsheets package at 1,444 of 1,444 checks, and recovered a half-published diya-gl release,
with six operator messages, all commands. Today the wave-per-dependency-level loop became
reliable, and my next areas to develop are the pre-push hook's cost in spreadsheets and catching
browser-security findings before CI does.

## Segment 3, 14:40 to about 22:15 UTC

About 37 operator messages: 5 decisions (CS-H5 option C at £61.35, ITSA-R2's real multi-factor header, board-only, keep the background test run, the XML reply sent masked), 7 commands the operator ran (two bucket commands after the classifier refused the delete, four worktree clean-ups removing 22 submit and 6 spreadsheets worktrees, one merged-branch removal), 11 questions, 5 corrections, 6 new requirements (the credit account email, three CS-10 rows, HTTP headers in the XML reply, an unmasked copy, failures as board rows, a runbook refresh). 6 board rows closed, 5 opened (CS-10a, CS-10b, CS-10c, ITSA-R1, ITSA-R2). No code change; 24 CI runs, 13 job-minutes, all from docs pushes. One sub-agent (the runbook refresh, Sonnet) was still running when this was written.

The O11 readiness check found that `itsaAnnualSubmission` and `itsaFinalDeclaration`, both cited by the approvals checklist, time out on the simulator, and that none of the eight ITSA behaviour suites runs in `test.yml`; O11 slipped from 2026-09-24 to ITSA-R1 and ITSA-R2.

## What worked

| Efficiency | Figure (segment 2) | Mechanism |
|---|---|---|
| Elapsed | 3 waves, each dispatch to prod about 3 hours (b92 08:27 to 11:30, b93 11:05 to 14:10) | One batch branch per wave; the next wave branched from the open PR's head (b93 from b92) so it built while the previous deploy ran |
| Operator input | 6 messages, all commands (`/iterate`, 4 `/board`, `/session-report`); 0 corrections, 0 pastes | `/iterate` under `/loop`; the board as the only interface; every blocked command printed with `!` |
| LLM | 16 agents, 4.12M sub-agent tokens: 3 Haiku (0.28M), 13 Sonnet (3.84M), no Opus | Lowest tier per row; the coordinator reviewed diffs and fixed small defects on the batch instead of re-dispatching |
| Quality | 4 defects caught before merge: a global vitest timeout, a committed `node_modules` symlink, the schema choice not wired through the Lambdas, 15 unescaped HTML interpolations | Read-the-diff-before-landing; "don't narrow scope" folded each adjacent bug into its row |
| Recovery | diya-gl 1.2.34 image, tag and roll recovered in one PR and one dispatch | The fix keyed the image step on the registry, the way the finish step already keyed on the tag |
| GitHub Actions | 2,553 job-minutes (2,036 submit, 517 spreadsheets), 141 runs | B30bb's changes job kept docs-only `test` runs to 86 job-minutes across 33 runs |

## Room for improvement

| Loss | Size | Cause | Improvement |
|---|---|---|---|
| b93 redeploy for CodeQL alert 74 | 169 job-min, about 55 min to merge | The page interpolated register data into HTML unescaped; only CI's CodeQL saw it | A DOM-XSS lint rule (`eslint-plugin-no-unsanitized`) on `web/public` in the lint gate, and "escape every interpolation" in page briefs |
| Spreadsheets pre-push hook | 108 min of local runs (65 and 43) for a 2-file and a 6-file change, each followed by a refused push | The hook runs the browser tier for small changes, and its router rewrites `app/lib/provenance-data.js` from the installed engine version, which the hook then refuses | Make the router leave `provenance-data.js` alone when only the local engine differs; scope the browser tier to the changed pages |
| CS-7 built before CS-12 | 1 extra agent, 0.22M tokens | Two rows dispatched in parallel although CS-7's steps depend on CS-12's form fields | Sequence rows whose files touch the same page, or give the later brief the earlier row's field changes |
| CS-12 left the schema choice unwired | 1 resume, about 5 min | The brief's file list excluded the Lambdas the feature needed | Briefs name the call sites a new function must reach, not only the files it lives in |
| Monitor misreports | 6 wakes checked by hand (4 stale reds, 2 early "all terminal" tallies) | `watch-ci.sh` reads each workflow's latest run in a window, not the current head's, and misses a delegated deploy | Key the tally on the current head's runs, and include `deploy` runs whose `headSha` is the head |
| Mistyped tag SHA | 1 failed publish run, about 8 min | A ten-character SHA typed by hand | Resolve every SHA with `git rev-parse` before passing it to a workflow input |
| Docs push over a merge's runs | 1 cancelled `test` run on `fcd84d59` | The board push waited on a check that read an empty result as idle | Push board commits only after the merge head's runs are terminal, by head, not by a count |
| O11 found unready at send time | The send slipped from 2026-09-24; 2 proof suites red | The ITSA behaviour suites run only on ci deploys (six) or nowhere (two), never on the simulator in `test.yml` | Every suite a checklist cites runs in `test.yml`'s simulator jobs (ITSA-R1) |
| The O11 browser proof step ran twice without running a test | About 1 hour to the O11 answer | Background commands run under zsh, which does not split `$B`; the first try also passed prefixed paths | Run background test commands with `bash -c`, the rule already in memory for monitor scripts |
| The XML reply drafted three times, 2 extra gateway calls | 3 drafts; the operator sent a version that hid the empty echoed `Value` | The poll saved only masked XML bodies, not HTTP headers or the raw exchange | The poll tool saves the raw and masked exchange, headers included, on every call |
| Work started after "board only" | 3 corrections ("NO", "No more work", "don't start fixing" twice); a batch worktree to remove; the test run killed and restarted | Mid-turn decisions were acted on as instructions to continue | On a mid-turn stop, finish the current write, stop, and ask before stopping or starting anything running |
| A board fact wrong at the delete | 2 operator commands and 1 refused delete | OB30bk said "empty"; the bucket held 30 objects | The refine pass lists objects before a delete row says empty |
| A status claimed before it was written | 1 correction | The reply said the B34.6c row was updated before the edit ran | Write, then report |
| SSO expired before the last render | Part 4 unverified, OB30bk undone | The token lasted about 8 hours | Read every AWS fact a render needs in the first hours of the window |

## Placement

Scales are constructed from the cited anchors; the positions are this session's measured figures.

| Efficiency | Anchor | This session |
|---|---|---|
| Lead time | DORA 2026 elite: under a day, often under an hour ([CI/CD Watch](https://cicd.watch/blog/dora-metrics-benchmarks-2026), [Taskade](https://www.taskade.com/blog/dora-metrics-explained)) | About 3 hours dispatch to prod per wave: inside elite's one-day line |
| Deploy frequency | DORA 2026 elite: on demand, several a day ([Keploy](https://keploy.io/blog/community/how-to-improve-dora-metrics)) | 2 prod deploys and 3 ci deploys in segment 2: elite |
| LLM cost | Claude Code about $13 per developer per active day, 90% under $30 ([Claude Code docs](https://code.claude.com/docs/en/costs), [Tokenade](https://tokenade.net/en/stats/ai-coding-cost-per-developer)) | Estimated $95 to $110 for segment 2 (below): 3 to 4 times the 90th percentile, for a team's worth of throughput |

## Costs

- **LLM, estimated.** Sub-agents: 3.84M Sonnet and 0.28M Haiku tokens; at an assumed 85% cache
  read, about $6 at list rates. Main session: about 250 turns over a context that grew to about
  650k tokens, about 50M cache-read tokens and 0.15M output, about $90 at Opus-class list rates
  ($1.50/M cache read, $75/M output). The subscription's marginal cost is nil. Segment 1: about $35.
- **GitHub Actions.** Both repositories are public, so billed $0; at the private Linux rate
  ($0.008/min) the 2,553 job-minutes would be $20.42. Six `deploy` runs at 163 to 171 job-minutes
  each were 999 of them.
- **AWS.** 3 ci deploys (b92 once, b93 twice) onto `ci-set1`; `ci-set2` stood from 23:27 until the
  12:34 sweep. 2 prod sets built (`prod-1031515`, destroyed about 14:30; `prod-0fdfb15`, live);
  each old set stood about 30 minutes beside its successor, about $0.05 at $35.28 a month. Not
  measured further. The workflows make no metered LLM call.

## Suggested improvements

1. Every suite a checklist cites runs in `test.yml`'s simulator jobs: removes a send-day slip like O11's. Covered by ITSA-R1.
2. The spreadsheets router leaves `provenance-data.js` alone for a local engine difference, and the browser tier covers only changed pages: removes about 108 minutes and 2 refused pushes a session.
3. On a mid-turn stop, finish the current write and ask before starting or stopping anything: removes 3 corrections.
4. A DOM-XSS lint rule on `web/public` in the lint gate: removes a 169 job-minute redeploy and about 55 minutes per finding.
5. Background test commands run under `bash -c`: removes about 1 hour of rerun.
6. The XML Gateway poll saves the raw and masked exchange with HTTP headers: removes 2 drafts and 2 gateway calls.
7. `watch-ci.sh` tallies the current head's runs, delegated deploys included: removes 6 manual checks.
8. Dependent rows are sequenced, or the later brief carries the earlier row's changes: removes 1 agent (0.22M tokens) per pair.
9. Briefs name the call sites a new function must reach: removes 1 resume per feature.
10. The refine pass lists a bucket's objects before a delete row says empty: removes 1 refused delete and 2 operator commands.
11. SHAs are resolved with `git rev-parse` before any workflow input: removes 1 failed run.
12. Board pushes wait on the merge head's terminal runs: removes 1 cancelled `test` run.
13. Write, then report: removes 1 correction.
14. AWS facts are read early in the SSO window: keeps the deployments section verifiable to the end.

Ranking: 1 first because a missed send date costs more than any minutes figure; 2 to 5 by minutes and corrections removed; the rest by single runs.
