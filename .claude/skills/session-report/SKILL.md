---
name: session-report
description: Write the session's report as REPORT_SESSION_<id>_<date>.md at the repo root — what the session landed, the mechanisms that made it efficient, where it lost time or money, and one board row per recommended optimisation — from measured figures (git, GitHub Actions job minutes, agent token counts, the deploy runs, the transcript), never from memory. Invoke when the operator asks for a session report, an account of the session, or "how did this session do".
---
<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# session-report

One file per session, at the repo root: `REPORT_SESSION_<id>_<YYYY-MM-DD>.md`. It leads with the
result and the mechanisms that produced it, then the losses, each loss tied to a board row that
would remove it. Every figure in it is measured in this session; nothing is recalled.

## The file name

`<id>` is the first six characters of the base64 SHA-256 of the session id (the
`Claude-Session:` URL's last path segment), so the same session always names the same file:

```bash
printf '%s' "$SESSION_ID" | shasum -a 256 | cut -d' ' -f1 | xxd -r -p | base64 | cut -c1-6
```

`<date>` is today's UTC date. Re-running the skill in the same session overwrites the file.

## Gather, do not recall

Run these before writing a line. Tee each to a file under the scratchpad before filtering.

**Output.** Session commits, PRs, and the diff, with generated output separated from
hand-written change. `web/public-simulator/` is a generated export of `web/public/`, and
`_developers/*.md` reports written at the end of an investigation are prose, not code; count
both apart:

```bash
git log --since="<session start ISO>" --format='%h' --grep="<session id>" --no-merges | wc -l
gh pr list --state merged --search "<session id>" --json number,title,mergedAt
git diff --shortstat <main at session start>..<main now> -- . ':!web/public-simulator' ':!_developers' ':!fixtures'
git diff --shortstat <main at session start>..<main now>
```

Board rows closed: the rows that left `NEXT.md` between the session's first and last `/board`
render (`git log -p --since=<start> -- NEXT.md` shows each `- [ ] **<label>.` line removed).
Sibling-repository PRs the session opened (`spreadsheets.diyaccounting.co.uk`,
`homebrew-diya-gl`) count separately; they are not this repository's output.

**Elapsed.** Session start is the first tool call's timestamp; batch dispatch to prod is the first
agent dispatch to the prod deploy that promoted the batch (`set last known good deployment`
succeeded). Both from timestamps, not estimates.

**LLM.** Every sub-agent's completion notification carries `subagent_tokens`; sum them and list
them per agent with its model. The main session's usage is not exposed to the session: estimate it
from turn count and context size, say it is an estimate, and price at the current list rates
(input, output, cache read) with the subscription's marginal cost stated beside it.

**GitHub Actions.** Billable job-minutes, not wall-clock run minutes; jobs run in parallel inside
a run, and a `deploy.yml` run here fans out into ten stack jobs and twenty-odd probe jobs:

```bash
for id in $(gh run list --limit 200 --created ">=<session start ISO>" --json databaseId --jq '.[].databaseId'); do
  gh api "repos/diy-accounting-uk/submit.diyaccounting.co.uk/actions/runs/$id/jobs?per_page=100" \
    --jq '[.jobs[] | select(.completed_at!=null) | ((.completed_at|fromdate)-(.started_at|fromdate))] | add // 0'
done | paste -sd+ | bc
```

Also count runs per workflow and note which were duplicates (push and pull_request on one
commit), supersessions, cancellations made on purpose (a push deploy cancelled in favour of a
named dispatch), reruns after contention, or docs-only triggers. A public repository bills
nothing; say so and give the private-rate figure beside it.

**AWS.** Count the deploys (`gh run list --workflow deploy.yml` and `deploy-environment.yml`, by
environment), the ci sets created and how long each stood (`SelfDestructStack` creation to
deletion, from CloudFormation), and any prod set left standing beside the live one (`$35.28` a
month each, `_developers/archive/PLAN_COST_OPTIMISATION.md`). Every ci set costs its hours of
Lambda, DynamoDB, CloudFront and Cognito; name the source for any figure. The workflows make no
metered LLM call; say so if that is still true.

**Operator.** Count the operator's messages in the transcript and class each: a decision between
named alternatives, a paste of a command the session could not run (`aws sso login`, a
`gh workflow run` the permission system blocked, a `git branch -D`), a question, a correction of
the session's behaviour, a new requirement. The pastes and corrections carry the lessons; the
new requirements become rows.

## The report's shape

In this order. Lead with the result; the operator reads the first line and decides whether to
read on.

1. **Result line**: PRs merged, rows closed, commits, hand-written lines, generated files, what
   prod serves (the deployment name), the board's state (rows open, in flight, blocked).
2. **Method, in prose.** First person, the operator's voice, four to six sentences, so it can be
   sent as it stands. State what the operator does, what the sessions do, what the operator
   decides, what this session landed and for what, and what the operator's next area to develop
   is. The shape:

   > I use Claude Code as a coordinator. I write the plan and the rules into the repo, it
   > dispatches several agents in parallel on separate branches, merges what passes the tests,
   > and I make the decisions it can't (which design, what gets merged, anything that spends
   > money, files against my own company or deletes things). In this session that landed
   > thirteen tracks in one batch and three follow-up fixes to production in one day for roughly
   > $100 of tokens. I spend my time reviewing evidence and fixing the process when it wastes
   > cycles, not writing code or even looking at it. Today the batch-and-watch loop became
   > reliable and my next areas to develop are the ci contention between concurrent deploys and
   > the sandbox proofs that need a real service round trip.

   Every figure in it is this session's; the last sentence names what became reliable this
   session and the one or two areas the losses table points at.
3. **What worked**: one table, a row per efficiency (elapsed time, LLM cost, AWS cost, GitHub
   Actions minutes, operator input, quality), the measured figure, and the mechanism that produced
   it. Mechanisms are named things the next session can repeat: a skill, a rule, a brief shape, a
   file boundary, a worktree-per-agent, a named ci deployment with a long self-destruct.
4. **Room for improvement**: one table, a row per loss, the measured size of the loss, the cause,
   and the board row that removes it. A loss with no board row is not finished being reported.
   Losses this repository produces by shape: concurrent ci deploys contending for the apex alias
   or a shared Cognito lane user; a sandbox proof that burns a permanent submission number on
   code that could not be deployed in time; an agent that ends its turn on a long foreground
   build; a scheduled workflow colliding with a deploy's probes.
5. **Placement**: where the session sits on each efficiency against published anchors, with the
   anchors cited and the scales labelled as constructed. Do a web search for anchors dated within
   the last three months; do not reuse last report's numbers.
6. **Recommended optimisations**: the board rows this report opened, by label, one line each.

## The board rows

Every loss in the "Room for improvement" table gets a row on `NEXT.md` (`B<n>`, the next free
number; **Source** the report's file name; **Owner** and **Model** named; placed in the section
its class dictates, in the position the header's ordering rule gives it) unless a row already
covers it, in which case name that row. Write them in the `/board` skill's row format. A loss
whose remedy is an action the operator has kept for themselves (a command that spends money,
deletes, files, or refreshes a credential) becomes a guidance row about handling the block
efficiently, never a row that pre-authorises the command.

Under cool-down the board is closed: the rows go to `PARKED.md` with the report naming them,
unless the operator asks for them on the board in their own words.

## Write-back

Prettier the report alone (`npx prettier --write REPORT_SESSION_*.md`; never reformat
`NEXT.md`), run `npx vitest run app/unit-tests/licenceHeaders.test.js` (the report needs the
header comment), commit the report and the board rows together as a docs-only commit to `main`,
and push. Then say, in the reply: the file name, the result line, and the rows opened.

## What the report is not

Not a transcript, not a log of tool calls, not a place for the session to grade itself in prose.
Figures, mechanisms, losses, rows. Where a figure could not be measured, the report says
"estimated" beside it and how; it never fills the gap with a confident number.
