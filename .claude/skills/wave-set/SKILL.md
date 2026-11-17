---
name: wave-set
description: Define a wave set — the largest set of board rows that one pull request per repository can carry, built and tested locally in waves of worktree batches before one push. Writes PLAN_WAVE_SET_<NAME>.md, asks the questions that finalise it, labels the rows on NEXT.md, then runs /refine and /board. Invoke when the operator says "wave set", "plan the waves", "one PR for the board", or asks to batch the board for local delivery.
---

<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

<!-- @capability DEV-64 Define a wave set for local delivery
- **Use when:** the operator wants the board delivered as one pull request per repository, built and tested locally first.
- **Does:** wave-set reads the open rows of NEXT.md and chooses the largest set one pull request per repository can carry. It orders the rows into waves of batches, writes PLAN_WAVE_SET_<NAME>.md, asks the questions that finalise it, and labels the rows on NEXT.md. It then runs refine and board. iterate and do-next deliver the set from the plan.
- **Run:** `/wave-set`
- **Entry:** `.claude/skills/wave-set/SKILL.md`
- **Files:** .claude/skills/wave-set/SKILL.md
- **Keywords:** wave set, waves, batches, local delivery, one pull request, wave branch, set branch, ci cost, local gates
- **Related:** DEV-27, DEV-28, DEV-29, DEV-30
@end-capability -->

# wave-set

## The goal

Use what is already paid for, and spend as little as possible on what is billed by use.

- The laptop and the Claude subscriptions are paid for. Local builds, local tests and sub-agents
  cost nothing more when they run while the laptop is otherwise idle.
- A ci set in AWS costs money for every hour it stands, and each prod deploy leaves an outgoing
  set to destroy.
- So a wave set does all the work it can locally, in as many waves as the work needs, and then
  pays for **one ci deployment** (destroyed after its proofs) and **one prod deployment** (the
  outgoing prod set destroyed) for each repository.

Every choice in this skill and in the plan it writes follows from that goal. More local waves are
cheap. A second push is expensive. When a rule here does not cover a case, choose the option that
keeps the work local for longer.

## Words

- **Wave set**: the rows that reach `main` through one pull request per repository. It has a code
  name (the next one from `CODENAMES.txt`, as `/do-next` picks it).
- **Wave**: a group of batches that run at the same time, each in its own worktree. A wave has a
  **wave branch**. Wave 1 branches from `origin/main`. Each later wave branches from the tip of the
  wave before it.
- **Batch**: the rows one sub-agent (or a chain of sub-agents on one worktree) builds in series,
  one commit per row. Its branch comes from the wave branch and is squash-merged back into it.
- **Set branch**: the branch at the tip of the last wave. It is the only branch that is pushed.
- **Beside**: a row that needs no pull request (a note in the private repository, a read) and runs
  at any time with no branch of the set.

Branch names, for the set `ridge`: wave branches `claude/ridge-w01`, `claude/ridge-w02`, …; batch
branches `claude/ridge-w01-<batch>`; the set branch `claude/ridge-set`. A sibling repository uses
the same names in its own checkout.

## 1. Read the board, and only the board

Read `NEXT.md` in full. The candidates are the rows under `## Machine-only`. **Never take a task
from a `PLAN_*.md` that has no row on `NEXT.md`**: the operator decides what is boarded, and a task
held in a plan is held on purpose. Read the plans only for the facts a boarded row cites.

Run the SSO check of the other skills before any AWS read.

## 2. Choose the rows

A machine-only row is in the set unless one of these tests removes it:

1. **Its input or its proof needs this set to be live first.** A review of prod after the change, a
   clean-up of what the change makes stale. It waits for the next set. Name the row and the reason.
2. **It has no pull request.** It runs beside the set.
3. **Its work cannot be built or tested locally**, and its only proof is on a deployed set. It is
   still in the set when its code can be built locally and its proof is one item on the set's ci or
   prod proof list. It is out only when even the build needs a deployed set.
4. **It waits for a person or a third party.** That row is not machine-only; leave it.

Rows of a sibling repository form that repository's own pull request in the same set.

The set is the largest one: every row that passes the tests is in, unless the operator's answer in
step 5 narrows it. Size is not a reason to leave a row out. A failed set falls back to a prefix of
its waves (see "When the set branch fails").

## 3. Order the rows into waves

Read each row's `Follows` line and the file chains in the shared facts of `NEXT.md`. Then:

- **A batch owns its files for the wave.** Two batches of one wave do not edit the same source
  file. Rows that share a file are one batch in series, or the later row goes to a later wave.
- **A row goes in the first wave where every row it follows is in an earlier wave**, or earlier in
  its own batch.
- **Work that derives from other rows goes after them.** A translation follows every row that
  changes the text it translates. Screenshots, recordings and visual reviews follow the last row
  that changes what a page shows. This puts each derived piece of work in the set once.
- **One model tier in a batch.** A hard row does not share a batch with mechanical ones; where a
  file chain forces them together, the batch is a chain of agents on one worktree, each at its own
  tier.
- **A row over about 25 files** is a two-agent chain, unless it is one scripted replacement.
- **A small change of one row in a file that another batch owns** rides in that batch as its own
  commit, and the plan says so under the wave's table. Do not move a whole row for one line.
- **Check each batch's files against every other batch of its wave** before the plan is written:
  list the files each row names, and move a row to the next wave, or into the other batch, on
  the first shared source file. Hand-written pages are shared more often than generators are.
- **Do not minimise the number of waves.** Waves are local and cheap. Minimise shared files inside
  a wave.

The last wave of a repository whose rows change what a person sees is the **look wave**: the guide
and site screenshots, the recordings that a local lane can make, `visual-review`, and the
`ui-ux-pro-max` review that the definition of done names.

## 4. Name the set

Take the next code name as `/do-next` does (the line after the last batch's letter in
`CODENAMES.txt`). The plan is `PLAN_WAVE_SET_<NAME>.md` at the repository root, with the name in
capitals.

## 5. Ask

Ask through `AskUserQuestion`, at most four questions, each one able to stand alone. Ask only what
the board and the rules above do not decide:

- **Scope**, when a real alternative exists: the largest set first, then one or two named smaller
  sets with the rows and waves each leaves out.
- **Gate depth** of the set branch, when the lanes differ in time or in what they need (Docker, an
  SSO window, a sandbox).
- **A product decision** that a row leaves open and that the build cannot start without.

Never ask about a task that is not on the board. Never ask how the set is delivered (branch names,
merge order, which lane records a video): those follow from the goal, so decide them and write
them in the plan.

## 6. Write the plan

`PLAN_WAVE_SET_<NAME>.md` is a tracking document: it lists rows and their state, and the rows on
`NEXT.md` keep their briefs. Its sections, in this order:

1. **Operator assertions (verbatim)**: the operator's own words that define the set.
2. **Status**: one line. `defined <date>`, then `approved <date>` (the operator's `/iterate` on a
   defined set is the approval), `building wave <n>`, `set branch gated`, `pushed`, `on main`.
3. **The goal**: the paragraph above, in short, so a session that reads only the plan has it.
4. **The set**: the count of rows for each repository, the rows left out with the test that
   removed each, and the rows that run beside.
5. **Waves**: one table for each wave: batch, rows in order, model, the files the batch owns. Then
   a state line for the wave: `pending`, `building`, `landed`, `gated <tip sha>`.
6. **Gates**: what runs on each wave branch, and what runs on the set branch before the push.
7. **The push**: the steps from the set branch to `main`, with the ci proof list and the prod proof
   list (each row's own proof, by label).
8. **After the deploy**: the work that needs the set live (the recordings a local lane cannot
   make, the rows that test 1 removed).
9. **When the set branch fails**: the fallback.

`/iterate` and `/do-next` write the state lines as they go. A row leaves `NEXT.md` when its change
is on `main`, as always; the plan is archived when its last row has left.

## 7. Label the rows

Each row of the set gets one field at the end of its tag line: `**Wave set**: <name> W<n>
<batch>.` (for example `**Wave set**: ridge W2 home.`). A row that runs beside gets `**Wave set**:
<name> beside.` A machine-only row with no label is not in the set. Add one sentence to the shared
facts of `NEXT.md` that names the set, its plan and its branches. Run
`npx vitest run app/unit-tests/nextShape.test.js`, commit `NEXT.md` and the plan together, and push
to `main` as its own command (the docs exception).

## 8. Then `/refine`, then `/board`

`/refine` checks the labels against the plan and the order of the waves against each `Follows`
line. `/board` renders the result, and its `Status` column names each row's wave.

## How a set is delivered

This section is the one source for `/iterate` and `/do-next`; they point here.

**Build, one wave at a time.**

1. Create the wave branch with `scripts/worktree-add.sh .claude/worktrees/<name>-w<nn>
   claude/<name>-w<nn> <base>`. The base is `origin/main` for wave 1 and the tip of the wave before
   for every other wave.
2. Dispatch every batch of the wave at once, each in its own worktree from the wave branch, with
   the brief rules of `/do-next`. A batch's rows run in the order the plan gives, one commit each.
3. Land each batch as it reports: `git status --short` in its worktree, `git merge --squash`, one
   commit per row, the content proof. On a conflict in a generated file, take either side and run
   its generator; never merge a generated file by hand.
4. When the last batch has landed, run the generators the wave touched and commit any change
   (`npm run build:static-content`, `build:filing-pages`, `build:mtd-calendar`, `build:rates-page`,
   `build:welsh`, `marketing:build`, `capabilities:generate`, `scripts:table`).
5. Gate the wave branch: `scripts/batch-check.sh claude/<name>-w<nn>` in one background command,
   then the simulator behaviour suites that the wave's rows reach, in series under the simulator
   lock. Fix every failure on the wave branch.

   **A long gate reports every 15 minutes.** When a gate starts (`scripts/batch-check.sh` or the
   simulator suites), arm a background Monitor on its logs that wakes the coordinator every 15
   minutes. Each wake gives the operator one line: the gates passed, the browser test count (the
   last `✓ <n>` of `<logdir>/browser-tests.log` against its `Running <n> tests` line), the failures
   so far and the expected end time. The Monitor stops when the gate ends.
6. Park the wave: write `gated <tip sha>` in the plan and commit the plan on `main`. The wave
   branch and its worktree stay until the set is on `main`.

**Never push a wave branch or a batch branch.** A push of a branch that touches `app/`,
`web/public/`, `infra/` or `package.json` starts `deploy.yml`, which is a ci set. `NEXT.md` never
travels on these branches.

**Assemble and gate the set branch.** `git branch claude/<name>-set claude/<name>-w<last>`. Run
`scripts/batch-check.sh claude/<name>-set`, then every local gate the plan lists (all simulator
suites; the proxy suites inside an SSO window when the plan says so). All pass before the push.

**Push once.** Read the ci slots, push the set branch, open one pull request whose body lists the
rows by wave, and hand over to `/watch`. Run the ci proof list against the one ci set inside its
self-destruct delay. A candidate fix goes to the standing set by a lean deploy (`fast-deploy`), is
proven there, and then rides one fix push. `/auto-merge` merges with `--merge`. `main`'s deploy is
the one prod deploy, and `deploy-finish.yml` destroys the outgoing set. Run the prod proof list.
A sibling repository's pull request merges after any row it follows is live.

**When the set branch fails** and the cause is not found quickly, push a prefix: the tip of the
last wave whose gates passed and whose rows need nothing from the waves after it. The waves after
it start the next set, rebased on the new `main`.

## What applying it has taught

- 2026-11-17, set `ridge`: the operator stopped a question about a plan task that he had said he
  would board himself. The candidates are the board's rows and nothing else (step 1).
- A row that reviews prod after the other rows are live cannot ride in the same set (test 1:
  DASH45). A row with no pull request runs beside (test 2: OS16d).
- Welsh copies went after every English copy row, and the screenshots after everything. Putting
  derived work last added waves and removed a second translation of each changed string.
- `deploy.yml` runs on a push of any branch, and a ci set self-destructs 4 hours after its
  creation by default. Both facts are why only the set branch is pushed, and why the plan lists
  the ci proofs before the push, so they are ready to run inside the delay.
- Rows that change one generated page from different sources (FAQ text, a generator's template, a
  source file) can share a wave when the generator runs again at assembly.
- The first draft of `ridge` had three rows in the wrong wave (WEB2, WEB24, WEB25). Each shared a
  hand-written file with a batch of its wave: `bundles.page.js`, the legal pages, `package.json`.
  The check of files batch against batch found them; the `Follows` lines alone did not.
- Photographs of pages are derived work too: the marketing row went after the row that puts the
  language option in every page's header.
- A row that reaches the board after the set is defined joins only by the operator's answer. OS18b
  (a vendor's rejection) was asked as one question with three options and the cost of each: in the
  set, alone with its own ci set and prod deploy, or split so the part with no deployment goes now.
  The operator chose the set. On a yes, check the new row's files against its wave like any other.
- The questions that finalised `ridge` were the scope and the depth of the final gates. Branch
  names, the order of the waves and where the recordings run needed no question.
