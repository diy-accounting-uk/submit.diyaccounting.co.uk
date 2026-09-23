<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Session report Mc+ncD, 2026-09-23

## Result

6 PRs merged (#339, #340, #342, #343, #344, #345), 37 board rows closed, 54 commits (21 of them board, refine or cool-down commits), +5,453/−597 hand-written lines across 61 files, 1 generated file (`REPORT_CAPABILITIES.md`, +6,738). Prod serves `prod-d458f02`. The board holds 22 open rows: 6 machine-only (held by cool-down), 5 human-driven, 11 blocked; nothing in flight, no PR open, no alarm open. Sibling repositories: www #33 and spreadsheets #136 merged.

## Method

I use Claude Code as a coordinator. I keep the plan and the rules in the repository; the session refines the board, sends a wave of agents out on separate worktrees, lands what passes onto one batch branch, and merges it through a gated skill once CI is green. I make the calls it cannot: which design, what to spend, what the company's books say, and anything filed or deleted. In this session that landed six batches to production in about ten hours, closed 37 board rows, rebuilt the capabilities index into a searchable file with three new skills behind it, and produced the company's own verified 2026-27 book, for an estimated $120 to $150 of tokens. My time went on decisions and on correcting the process when it wasted cycles, not on reading code. The batch-merge-watch loop and the ci slot pool became reliable today; my next areas are the push-to-prod gap for Markdown-only heads and keeping agents from duplicating each other's work.

## What worked

| Efficiency | Measured | Mechanism |
|---|---|---|
| Elapsed | 6 prod-promoted PRs, 11:07 to about 20:30 UTC | One batch branch per wave; squash per row; `/auto-merge` then `/watch` |
| LLM cost | Sub-agents 8.46M tokens; main session estimated | Lowest tier per row: Haiku walk (13 agents, 1.21M), Sonnet rebuild (9 agents, 1.69M) |
| GitHub Actions | 122 runs, 95 success, 3 failure | Docs-only pushes to `main`; duplicate-push cancel (B30ba) |
| AWS | 13 submit deploys, 4 environment deploys, no spare prod set | Slot pool (ci-set1/ci-set2); self-destruct skips last-known-good (B30az) |
| Operator input | About 30 messages, most of them decisions or source paths | `/refine`'s human-step split; board rows name the operator's exact step |
| Quality | Every merged PR green on every gating workflow; the book reconciled to residual 0 April to August | `/auto-merge` gates; the book's seven `VERIFICATION.md` checks |

## Room for improvement

| Loss | Size | Cause | Improvement |
|---|---|---|---|
| Capabilities report forked recursively | 0.78M tokens reported, more unreported; duplicate writers | The agent's brief allowed `fork`; forks inherited the task | Briefs forbid `Agent`/`fork` for workers; the coordinator owns fan-out |
| ci-x proof dispatch cancelled main's prod deploy | 1 prod deploy lost, alarm #341 opened, 1 redeploy | The named-dispatch cancel matched across environments | Fixed: cancel limited to the same environment |
| Self-destruct deleted ci-set1 during b84 | 1 failed deploy, 1 redeploy (about 40 min) | Timer anchored to first creation; no claim check | Fixed: 3-hour claim window and last-known-good skip |
| PR #344 blocked on a Markdown-only head | 1 force-push, 1 cherry-pick, about 20 min | CodeQL `paths-ignore: **.md` leaves a required check absent | B30bb: `workflow_dispatch` on CodeQL and an auto-merge step |
| Spreadsheets pre-push hook | 3 push attempts, one 41-minute run | Empty `node_modules` in the worktree; the hook writes 100 files | Symlink `node_modules` in the brief; hook to fail on its own writes |
| PayPal parser took 4 rounds | 0.67M tokens | The activity-summary parser was overwritten by a later heading; not caught by a fixture | Brief carries one real month as a fixture with the expected residual |
| Agent errors fixed by the coordinator | 6 corrections (knip, Stripe pin, `GITHUB_ENV`, alias, heuristic, `.dockerignore`) | Briefs lacked the rule or the call site | `/refine` pass 2 names the call site and the forbidden patterns |
| Operator corrections of source locations | 5 messages (Drive path, `authuser`, MCP meaning, Polycode, mail path) | Facts not recorded before the task | Now in memory and in the company-book skill |

## Placement

The scales are constructed; anchors are published within the last three months.

- **Delivery.** DORA-style 2026 benchmarks put top teams at several deployments a day with lead times in hours ([DevX](https://www.devx.com/uncategorized/dora-metrics-2026-benchmarks-high-performing-teams/)). Six prod promotions in one day, each proven by `main`'s own deploy, sits at the top tier on frequency. Change failure: 1 of 6 main deploys was lost to the pipeline itself (the cancel), about 17%, above the under-5% top-tier mark.
- **Agent throughput versus stability.** Larridin reports agent adoption lifting deployments while failures rise ([Larridin](https://larridin.com/blog/ai-coding-agent-dora-metrics)). This session's 3 failed runs out of 122 all came from pipeline design (the cancel scope, the self-destruct timer, the duplicate push), each fixed in the same session.
- **Cost.** Anthropic's multi-agent PR review costs $15 to $25 a PR ([DEV Community](https://dev.to/umesh_malik/anthropic-code-review-for-claude-code-multi-agent-pr-reviews-pricing-setup-and-limits-3o35)). This session's estimated $120 to $150 across 6 merged PRs and 37 rows is $20 to $25 a PR, or $3 to $4 a row, for design, build and review together.

**LLM figures.** Sub-agent tokens are measured from completion notifications. Main-session cost is estimated from about 400 turns at 200K to 400K context, priced at Opus 5.5 list rates ($4 input, $20 output, $0.20 cache read per million); the subscription's marginal cost is nil. Sub-agents priced at Sonnet 5 ($2/$10/$0.20) and Haiku 4.5 ($1/$5/$0.10).

**GitHub Actions.** 2,990 billable job-minutes across 122 runs. The repositories are public, so GitHub bills nothing; at the private Linux rate of $0.008 a minute that is $23.92.

## Suggested improvements

1. Forbid `Agent`/`fork` in worker briefs; the coordinator owns all fan-out. Value: 0.78M+ tokens and a duplicate-writer cleanup per occurrence. Not on the board.
2. B30bb: CodeQL `workflow_dispatch` plus an auto-merge step for Markdown-only heads. Value: about 20 minutes and a force-push per Markdown-only PR head. Board row B30bb.
3. Put the call site and the forbidden patterns (aliases, broad pins, whole-tree formatting) in every brief during `/refine` pass 2. Value: 6 coordinator corrections this session.
4. Every parser brief carries one real month as a fixture with its expected residual. Value: 3 of the PayPal parser's 4 rounds, about 0.5M tokens.
5. Sibling-repository briefs symlink `node_modules`; the spreadsheets pre-push hook fails on files it writes. Value: 2 push attempts and one 41-minute run.
6. Record every source location the operator names in memory at the moment it is named. Value: 5 operator corrections. Done for this session's five.
