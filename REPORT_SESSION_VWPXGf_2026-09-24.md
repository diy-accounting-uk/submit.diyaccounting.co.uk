<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Session report VWPXGf, 2026-09-24

Session `session_018ammFSHtXRV6JkS8CnQB6E`, 2026-09-23 about 20:15 UTC (first commit 20:24) to
2026-09-24 06:25 UTC, about 10 hours 10 minutes.

## Result

3 PRs merged here (#346 with 15 rows, #347 the practice licence launch, #348 a prod probe fix) and
2 in spreadsheets (#137 the pre-push hook, #138 credit notes net in the engine, released as diya-gl
1.2.32). 62 session commits on `main`. 27 board rows closed (15 of them rows open at the start, 12
opened and closed within the session). Hand-written change: 2,632 lines added and 304 removed
across 55 files (code, tests, workflows, config), 578 lines of Markdown; 54 lines of generated
fixtures. Prod serves `prod-3703ecf`. The board: 35 rows open, none in flight, 6 machine-only rows
ready, 8 operator rows ready, 21 blocked (most of them the new confirmation-statement build).

## Method

I use Claude Code as a coordinator. I write the plan and the rules into the repo; it refines the
board, dispatches agents in parallel on separate worktrees, lands their commits on one batch
branch, and merges what passes every gate. I make the decisions it can't: which accounts a receipt
belongs to, when the ITSA email goes, the live Stripe prices, the merges during a cool-down, and
anything that files against my own company. In this session that landed 17 board rows across two
PRs and a same-night prod hotfix, rebuilt DIY Accounting Limited's own book to zero failing checks,
launched the practice licence, and designed the confirmation-statement filing, for about $35 of
tokens (estimated). Today the refine-then-wave loop became reliable, and my next areas to develop
are proof on prod paths before merge (two of three prod issues surfaced only after merge) and
keeping concurrent ci deploys off the same test users.

## What worked

| Efficiency | Measured | Mechanism |
|---|---|---|
| Elapsed time | 14 rows from dispatch (20:52 UTC) to prod (`prod-1a2d1c8`, about 00:55 UTC), about 4 hours | `/refine` before the wave: every brief carried file:line anchors, so 8 of 10 agents landed on first report |
| LLM cost | 4.53M sub-agent tokens across 19 agent runs, about $15 (estimated); main session about $20 (estimated) | Lowest tier that fits: 3 Haiku, 13 Sonnet, 1 Opus (brief reconciliation), 1 Fable (the CS01 design) |
| GitHub Actions | 1,729 job-minutes over 107 runs (deploy 768, test 660) | One batch branch per wave, one deploy per head; the docs-only pushes went straight to `main` |
| AWS | 4 branch deploys, 2 prod deploys; one ci set (`ci-set2`, created 2026-09-23 23:27 UTC) standing; no spare prod set | Named ci slots and the self-destruct stack; `destroy previous` on each prod deploy |
| Operator input | About 38 messages (counted from the transcript, approximate): 10 decisions, 9 questions, 8 slash commands, 5 corrections, 3 pastes of commands the session could not run, 3 new requirements | `AskUserQuestion` for the two decisions the board carried (O11's day, the live Stripe go); decisions written into rows the same turn |
| Quality | Content scan found and removed two committed public IP addresses; the B30bb proof exposed that dispatched runs never count toward required checks, fixed before merge | Proofs run on the real PR (docs-only pushes, a dispatched CodeQL) instead of assumed |

## Room for improvement

| Loss | Size | Cause | Improvement |
|---|---|---|---|
| A prod probe opened a live Stripe checkout after merge | 1 failed main deploy (run 35942092607), a hotfix PR (#348), a manual prod probe, about 1 hour 30 minutes | The rewritten `resident-pro` probe skipped the test pass, so the user carried no synthetic qualifier; ci passes either way because ci uses test keys | A probe that reaches checkout asserts the session id starts `cs_test_`, so ci fails the same way prod would |
| Required checks missing on a Markdown-only head | 2 extra CI rounds and a third agent (197,758 tokens), about 2 hours | B30bb assumed a dispatched `test.yml` satisfies required checks; GitHub leaves `workflow_dispatch` suites out of a PR's rollup | Verify the platform semantics a mechanism relies on before building it (recorded in `/refine`'s caught list) |
| Actionlint failed on an undeclared `vars.*` | 1 branch deploy lost to one job, one redeploy, about 1 hour | OF1a's brief named prettier and a YAML parse, not actionlint with `test.yml`'s ignore set | Every workflow brief runs actionlint exactly as `validate workflow syntax` does |
| The PII scan's first build | 161,623 tokens of rework | The brief reused the redactor's `DENY_PATTERNS`, greedy by design; 2,489 hits on the tree | A scan or gate brief states its target figure on the current tree (zero hits) as its first proof |
| The book rebuilt three times | 3 agent rounds (F2k 376,228, F2m 314,251, F2o 326,608 tokens) and 4 operator corrections | Opening balances, labels, VAT status and the members register each surfaced after a build | The company-book skill's Build section reads the prior year's workbook set first (memory written; skill update pending) |
| Concurrent ci deploys shared test users | 1 probe failure and a rerun on #347 | b89 and b90 deployed at the same time against shared Cognito lane users | Serialise branch deploys, or give each ci slot its own lane user |
| The practice licence agent stopped short of the CDK wiring | 1 extra agent round (107,348 tokens) | The agent judged the env-var wiring separate work | A brief that adds env vars names the stack that passes them to the Lambda |
| SSO expired mid-session | 2 operator logins; prod facts unreadable for about 1 hour | The 8 to 12 hour window ran out overnight | Read every AWS fact a cycle needs while the token is fresh, and ask for the login before a wave, not after |

## Placement

Scales constructed from published figures; each anchor cited.

| Efficiency | This session | Anchor |
|---|---|---|
| Deployment frequency | 2 prod deploys in about 10 hours | Elite DORA teams deploy on demand, multiple times a day ([Koalr, 2026](https://koalr.com/blog/dora-metrics-benchmarks)) |
| Lead time for changes | About 4 hours from dispatch to prod | Elite target under one day ([DX, 2026](https://getdx.com/blog/dora-metrics/)) |
| LLM cost | About $35 for 20 rows landed, about $1.75 a row (estimated) | $0.03 to $2.60 per agent task ([Firecrawl, 2026](https://www.firecrawl.dev/blog/best-ai-coding-agents)); $481 per developer per month at the 90th percentile ([LinearB, 2026](https://linearb.io/resources/ai-engineering-productivity-gap)) |

GitHub Actions: the repository is public, so the 1,729 job-minutes bill nothing; at GitHub's
published Linux 2-core rate of $0.008 a minute a private repository would pay about $13.83.
The workflows make no metered LLM call.

## Suggested improvements

Ranked by value; time losses rank above token losses, because a lost hour holds a merge and a
prod deploy, while the token losses are single-digit dollars.

1. A probe that reaches Stripe checkout asserts a `cs_test_` session: removes a failed prod deploy and a hotfix round, about 1 hour 30 minutes.
2. Check the platform semantics a gate relies on before building it: removes about 2 hours and 197,758 tokens (now in `/refine`'s caught list).
3. Workflow briefs run actionlint with `test.yml`'s ignore set: removes a lost deploy, about 1 hour.
4. Ask for `aws sso login` before a wave when the token is older than 6 hours: removes about 1 hour of unreadable prod facts.
5. Company-book skill: read the prior year's workbook set before any build: removes about 2 rebuild rounds (641,000 tokens) and 4 operator corrections.
6. Serialise branch deploys, or one lane user per ci slot: removes a contention failure and rerun per concurrent pair (B30at1 exercises the same case).
7. Scan and gate briefs state the target figure on the current tree: removes a rework round, about 161,623 tokens.
8. Briefs that add env vars name the stack that wires them: removes an agent round, about 107,348 tokens.
