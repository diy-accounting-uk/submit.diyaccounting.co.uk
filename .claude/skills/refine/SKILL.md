---
name: refine
description: Refine every open row on NEXT.md in the main context before a wave is dispatched — check each reference against origin/main, make each brief complete enough for its sub-agent and pick the lowest model that fits, share the facts one row's check turns up with every row they help, split the human step out of any row that mixes one with machine work, and test every declared dependency (live, stale, cyclic, or splittable so part of the row can start) — then write the file back and render /board. Invoke when the operator asks for a readiness, feasibility or context pass over the board, or says "refine the board".
---
<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# refine

Five passes over `NEXT.md`, in the main context and with no sub-agents, then the write-back and
`/board`. A sub-agent reads only its brief; every fact it would otherwise have to rediscover costs
tokens, and every fact it gets wrong costs a redeploy. The passes move that discovery into one
place, once.

## Before the passes

```bash
git fetch -q origin && git pull -q --ff-only origin main && git log --oneline -1
```

Every check below runs against that commit. Read the inboxes (`~/.claude/inboxes/submit.md`,
`~/.claude/inboxes/diyaccounting.md`, the workspace `INBOX.md`) and act on each `[unread]` block:
a row's facts may have changed in another repository.

## Pass 1 — references

For every row, every path, symbol, line number, run id, issue number, plan section and external
fact it names:

- **Paths exist**: one loop over every backtick path in the file, `[ -e "$f" ] || echo MISS`,
  including paths in sibling repositories (`../spreadsheets.diyaccounting.co.uk/…`) and at the
  workspace root. A missing file is usually a moved one: `find . -name '<basename>'` before
  rewriting.
- **Line numbers match**: `sed -n '<n>p' <file>` for each. Line numbers drift after every merge,
  so a row names the anchor text as well as the line (`resolveActorClass` (line 101)), and this
  pass corrects the number, never the anchor.
- **Symbols exist**: `grep -n '<symbol>' <file>` for each function, constant, env var, workflow
  job and input the row names. A label another row or a plan once used (`B11.T7b.1`) is not a
  reference; replace it with the command or file it stood for (`git log -S'<label>' -- NEXT.md`
  finds the text).
- **Counts are current**: a row that quotes a count (findings, files, alerts, resources) gets the
  count re-run (`npx eslint <dir> --no-ignore -f json`, `gh api …/code-scanning/alerts`, the
  synth's resource total) and the number replaced.
- **External state is current**: alarm states, OAM links, SSM parameters, open alerts, issue
  timelines, a workflow run's jobs. Read-only AWS and `gh` reads need no approval. A blocker that
  has cleared (an OAM link now attached, an alarm now OK) moves the row up a section in the
  write-back.
- **The prod line and the ci line** match the live sets (`/submit/<env>/last-known-good-deployment`).

Write each correction into the row as you go; do not keep a separate list.

## Pass 2 — feasibility

For every row a sub-agent will run, read the code the row points at and ask what the agent would
have to discover to finish. Then put that in the brief. The checks that paid for themselves:

- **The mechanism is the one the code uses.** A row that says "set `payment_intent_data`" on a
  subscription-mode checkout, or "device-code grant" on Cognito, describes a mechanism the
  platform refuses; read the call site and name the mechanism that works, with the line. A test
  the row asks for has to be able to reach what it asserts: a JS unit test cannot read a CDK synth,
  so the case goes in the Java test class; a workflow's proof is a dispatch after merge, not a unit
  test.
- **The diagnosis comes first when the cause is unknown.** A view with 0 rows, an actor tagged
  wrong: the brief names the query that settles the cause (the Athena database and workgroup, the
  table's projection file, the writer's line) and the two or three causes it can find, so the agent
  fixes the layer it finds rather than the one the row guessed.
- **The runtime the agent will find.** A fresh worktree has no `node_modules` (symlink the main
  checkout's), no `submit.bundle.js` (`npm run bundle` first), no `mcp/node_modules` (`npm ci` in
  `mcp/`), no spreadsheet reader on the machine (the diya-gl package bundles one), and
  `spotless:apply` reformats files the row does not own (format only its own). A Maven proof
  names the test class; the batch runs the full verify once.
- **The lint and the format gate.** CI's `eslint` job and `prettier --check` fail a PR on a line
  break; every brief that writes JS carries `npm run linting` on its files, and every workflow
  brief carries `prettier --check` and a js-yaml parse.
- **What the change exposes.** A change that lists, links or sells an unfinished feature on prod
  (a catalogue flip, a nav link, a `listedInEnvironments` change) is held for the row's launch
  step; the brief says which part lands now and which waits.
- **Limits the change can hit.** A stack near CloudFormation's 500 resources, a redirect-URI cap at
  HMRC, a concurrency group two runs share: name it and the headroom, because the ci deploy is
  where it fails otherwise.
- **A gate or threshold a CI job enforces is set from runs on that job's runner.** When a row
  changes one, dispatch the job and read its scores first before writing the row.
- **The call site and forbidden patterns.** A brief must name the exact call site (file:line) the
  change lands on, and list the patterns the rules forbid that the change could reach: compatibility
  aliases, a setting applied wider than the call that needs it, whole-tree formatting or deletion
  tools, broad ignore rules.
- **Shell scripts name `/bin/bash` 3.2.** A brief for a shell script names the runtime, asks for
  `/bin/bash -n` and `shellcheck` before commit, and avoids bash-4+ features (associative arrays,
  `mapfile`, `${var,,}`). Test on macOS or in CI that runs `/bin/bash 3.2`.
- **Query briefs carry the schema source.** A brief for an SQL query names the table's column
  list from its schema source (e.g. `AnalyticsStack.java` `buildActivityEventColumns` for
  `activity_events`), asks for an `EXPLAIN` against ci to verify the plan, and states the projected
  scan size and estimated cost.
- **Test allow-lists are scoped to the case.** An allow-list that exempts a test case names only
  that case and never exempts a whole class, module or pattern.
- **The model**, the lowest that fits, from the work not the label: a one-file mechanical edit or
  a dispatch-and-read is Haiku; a bounded change against an existing pattern is Sonnet; a design a
  Sonnet then builds from, or a change to a deploy's ordering and rollback, is Opus. A row over
  about 25 files is a two-agent chain. Change the row's **Model** when the check disagrees with it.
- **Parser briefs carry a real source month and residual.** A brief for a statement parser names
  one real source month by its path under `../drive/…/finance/`, and the first test asserts the
  expected reconciliation residual (0), to catch a parse that loses detail to a later heading and
  takes several rounds to surface.
- **The brief's constants**: worktree path and branch, `cd <worktree>` in every Bash call,
  absolute paths, the evidence (run ids, log lines, file:line), "commit before a long
  verification", "a wait is a sleep loop inside one Bash call, never a Monitor", the licence header
  for new files, no NEXT/plan/label/date references in comments or test names, `git add` only its
  own files, push nothing, and the report-back contract (branch, worktree, commit hashes, files,
  proof lines, anything undone). A brief that touches a workflow carries the called-workflow
  checklist; a brief that dispatches one names the exact inputs.

## Pass 3 — context

A fact one row's check turned up usually serves another row. Add it to every row it helps, in one
sentence, and name the other row:

- rows that share a file (`skip-deploy-check`, `IdentityStack.java`'s host lists,
  `PLAN_COMPANIES_HOUSE.md`) say so in both places, so the wave puts them in one agent or lands the
  second on the first;
- rows that touch the same page or module run in sequence in one agent, or the later brief carries the earlier row's changes, so the dependencies land in one commit or the second agent sees the first agent's work.
- rows over the same data name the same facts once each (the Athena database and workgroup, the
  projection file, the view directory, the schema paths, the Drive mirror's folder shape);
- a row whose output another row consumes names the shape it writes and the row that reads it
  (F1c's JSON is F2a's input), so the sequence is in the file, not in a coordinator's memory;
- a fact that removes a blocker or a whole sub-task (the Ads account already exists as code; the
  OAM link is attached) rewrites the blocked row's blocker line.

## Pass 4 — the human step, split out

A row that mixes a human step with machine work stalls at the human step while the machine work
waits, and the board reads it as one blocked lump. Split it:

- **The human row** is the smallest step a person must take: a decision between named
  alternatives, a credential created in a console, a send from the operator's address, a sign-in
  with a second factor, a file downloaded behind MFA. It names exactly what to do, where, and
  where the result lands (a GitHub environment secret by name, a date written into the machine
  row, a file under `../staging/`). It goes to `## Human-driven` when the person must navigate
  it, `## Machine-ask` when a session drives it with the person present. Label it `O<row>`, or
  `OF<n>` for a finance row.
- **The machine row** keeps everything a session can build or verify without that step: a script
  with a recorded fixture before the credential exists, an assembly and its verification before
  the cloud save, a draft before the send, a poll-and-pin after the answer. It is `ready` unless it
  truly cannot proceed, and its blocker line names only the human row.
- A row whose every step is human stays whole (`O17`, `F1d`). A row whose only human step is
  merging its PR is machine-only already.

## Pass 5 — dependencies

Every "Blocked on …" and every row another row names as its blocker is a claim about the
present. Test each one:

- **Live or stale.** A blocker is live while its row is open on `NEXT.md` or in `BACKLOG.md`,
  its date is in the future, or the outside event it waits for (a reply, a send) has no record
  yet in the repository, the board, the mail mirror or the inboxes. It is stale when its row has
  closed, its PR merged, its date passed, or something on the board says it happened. Remove a
  stale blocker from the row; a row left with no live blocker moves to its class's section.
- **Cycles.** Two rows that each name the other (a config row and the go it needs, say) cannot
  both be first. Split the part each needs from the other so the chain runs one way: the config
  that must exist before the go, then the go, then the listing that follows it.
- **Splittable.** A row blocked for one step can often do the rest now: the build before its
  sandbox proof, the fixture-backed code before the credential, the draft before the send. Split
  it into a ready row and a blocked row (`CS-13a` builds, `CS-13b` proves); the blocked row
  names only what it truly waits on.
- **Missing links.** A blocker that names a row nobody has written (a design row a backlog entry
  cites, a label that closed on other work) is a gap: write the row, or rewrite the blocker to
  what it stood for.
- **Where a plan keeps the graph** (a `## Dependency graph` section, as `PLAN_COMPANIES_HOUSE.md`
  does), update it in the same commit so the plan and the board say the same thing.

Record each change in the commit message: the stale blockers removed, the cycles broken, the
splits made.

## Write-back

`NEXT.md` in board order (in flight, machine-only, machine-ask, human-driven, blocked; within a
section by size, fewest files first), the prod and ci lines current, then the shape test
(`npx vitest run app/unit-tests/nextShape.test.js`), one commit whose message carries the
corrections, the decisions and the splits, and a push straight to `main` as its own command (the
docs exception). The rows carry only what is open. Then `/board`, whose render is the proof that
the file and the table agree.

## What this pass has caught

Kept as the checklist's evidence, one line each: a plan file moved to a sibling repository's
archive; draft emails that had moved under `_developers/hmrc/`; a product-catalogue module under
`app/services/` not `app/lib/`; lint counts of 8 and 16 that were 11 and 33; an OAM link attached
since the row was written; a developer-token blocker Google had removed; a subscription-mode
checkout that refuses `payment_intent_data`; a view's 0 rows caused by the webhook writing null;
a JS test that could not read a synth; a device grant Cognito does not have; an unfinished
practice page linked from every prod nav; a nightly deploy of a docs-only head; two probe jobs
holding each other's lock; six corrected agent results (knip deleting a used file, a Stripe API pin
on every client, a `GITHUB_ENV` name clash, a compatibility alias, a stack-update heuristic, a
`.dockerignore` excluding `infra/`). A dispatched workflow's checks never count toward a pull request's required checks
(GitHub leaves `workflow_dispatch` suites out of the PR's rollup); a required check must come from a push
or pull_request run, skipped by `if:` when it has nothing to do.
