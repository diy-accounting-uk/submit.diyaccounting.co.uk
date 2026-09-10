---
name: do-next
description: Work NEXT.md top to bottom as waves of concurrent worktree sub-agents, land them on one branch, push in batches, raise one PR, and hand over to /watch. Invoke when the operator says "do next", "work the backlog", "clear NEXT.md", or when a landed batch leaves items still open.
---

<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# do-next — work `NEXT.md` with the coordinator model

You are the coordinator. You plan, dispatch, merge, push and answer the operator. You do not
write the code. **Keep the main chat free for chat**: anything long-running goes to a sub-agent
or a background task.

Work `NEXT.md` top to bottom, taking the unblocked items. As an item's blocker clears, promote it
to ready and resequence the board. Then keep going, top to bottom, until the board is empty or the
operator stops you. An approved plan is the authorisation: a green suite, a landed wave and a tidy
summary are the middle of the work, not the end of it.

Plans of record are `PLAN_*.md` at this repo's root. `NEXT.md`'s own shape rules are in
`../NEXT.md` and in this repo's `CLAUDE.md`.

## Start with `/board`

**Invoke `/board` before dispatching anything.** It reads `NEXT.md` and `BACKLOG.md` fresh, puts
the rows in tier order, and reports the things that decide what this batch should contain: which
alarms are open, which deployment sets are standing, and which branches carry unpushed work. It
also writes the sequenced board back, so the order you then work is the order on disk rather than
one you hold in your head.

Do not skip it because you rendered a board earlier in the session. Deploys finish, alarms fire and
PRs merge between renders, and the board is how you find out.

## The shape of a batch

**One branch. One PR. Waves inside it.**

A branch deployment is expensive and slow, so everything that can share a deploy should. The batch
branch is `claude/b<n>-board`, taken from `main`. Every sub-agent worktree branches from **the
batch branch**, not from `main`, so each wave builds on what the last one landed.

Give the batch branch its own worktree (`.claude/worktrees/b<n>`) and leave the primary checkout on
`main`. You merge into the batch worktree; you edit `NEXT.md` on `main`.

**`NEXT.md` never travels on the batch branch.** The board is maintained on `main` under the
docs exception. A second copy on the branch guarantees a conflict at merge time, and two sub-agents
editing it guarantees a lost row. If a merge drags `NEXT.md` onto the batch, restore it to the
branch point in the same commit.

## Waves

A wave is a set of concurrent workstreams grouped by area of the repository, sized so that no two
agents own the same file.

1. **Sequence the board.** Take the unblocked items in board order. Group them by where they live:
   `infra/**` (Java CDK), `app/functions/**` and their tests, `web/public/**` (never
   `web/public-simulator/`, it is a generated export), `web/browser-tests/`, `behaviour-tests/`,
   `.github/workflows/**` and `.github/actions/**`, `scripts/**`, and the root `PLAN_*.md` and
   `REPORT_*.md` documents.
2. **Two agents that need the same file are not two workstreams.** Sequence them, or scope each to
   a region and say so in both briefs. Where a plan already fixes an order — the DIYA-GL naming
   chain, the ITSA shared spine — that order is the specification, not a suggestion.
3. **Run a design wave when the plan is not rich enough to execute.** A higher tier writes the
   design as a document at the repo root; cheaper, faster models then build from it. The test is
   whether a Sonnet or Haiku agent could pick up the document and build without asking a question.
   Do not put a design task and a mechanical sweep in one wave: the hard one prices the batch.
4. **Pick each workstream's tier deliberately**, lowest that fits — Fable, Opus, Sonnet, Haiku.
   Opus for a decision with architectural weight or a comparison the operator will choose from.
   Sonnet for a bounded change against an existing pattern. Haiku for renames, sweeps and
   one-file mechanical edits.

## Briefing a sub-agent

A fresh agent carries none of your context, so the brief stands alone. Every brief says:

- **Its worktree path and branch**, and that it works only there. It may `git add` its own files
  and commit. Never `git stash`, `git reset`, `git checkout --` or `git clean`. Never push, never
  open a PR, never edit `NEXT.md`.
- **What it owns and what it must not touch**, with the reason. Where another agent in the same
  wave is nearby, name it.
- **The evidence, not just the task.** Paste the run ids, the log lines, the timestamps. An agent
  given a diagnosis it can verify beats one given a symptom to rediscover.
- **Commit before the turn ends.** A sub-agent that backgrounds a verification and stops leaves an
  uncommitted tree that vanishes with the worktree. Tell it to run verification in the foreground
  so the result reaches its report, and to commit what it has either way.
- **Blast-radius testing only.** `npm run bundle` first for anything touching `app/` or `web/` —
  the bundle is gitignored and `pretest` fires only for a bare `npm test`, so without it nine
  unrelated tests fail on a missing file. Then the unit, system or browser tests its change
  reaches, or `./mvnw clean verify` for `infra/`. No behaviour tier inside a worktree: that needs a
  live environment and belongs to the deploy.
- **A report-back contract**: what it changed and why, what it deliberately did not do, any
  adjacent bug it found with file and line, the exact commands run with counts, and its commit
  SHAs.
- **Say what would change your mind.** For a design or a judgement call, ask for the rejected
  options and the reasons, not just the chosen one.

## Landing a wave

Merge each workstream as its notification arrives. Do not hold them for the end.

- **A sub-agent's "done" is not proof.** Run `git status --short` in its worktree before anything
  else. Uncommitted work is real and you get one look at it.
- `git merge --no-ff` into the batch worktree, with a message naming the item.
- Run that change's blast radius on the merged tree, not the agent's own report.
- Update `NEXT.md` on `main` in the same breath: mark the item code complete, and remove it only
  once its checks pass. A bug the agent surfaced is that item's remainder, not a new item, unless
  it is genuinely separate work — then say so explicitly rather than deciding quietly.
- Remove the worktree and delete its branch as the merge lands, not in a later sweep.

**Editing `NEXT.md` is where rows get lost.** Never replace the slice between two markers unless
you have checked they are adjacent — an edit that removes what it did not name is invisible until
someone counts the rows. Split on the row boundary, filter by row key, and rejoin.

## Pushing

**Push once per wave, not once per workstream.** Gather what has landed and push it together.

Before any push, check **every** deploy workflow for that branch — this repo has `deploy`,
`deploy environment` and `deploy-app`, and checking only the one you were watching is how you push
into a running deploy. Confirm they are finished by reading the runs, not by assuming elapsed time.

Before the first push of a batch, run the full local suite once: `npm test` and `./mvnw clean
verify`. That is the moment the change becomes someone else's problem.

Raise the PR as soon as the branch is testing and deploying, so its checks and its description grow
together. Keep the description honest about what each item actually turned out to be — a row's
premise is often wrong, and the PR is where that gets recorded.

**Then invoke `/watch`.** Every push hands over to it: it holds the scope, reports every terminal
state, and drives the branch and `main` green. Do not go back to checking runs by hand.

## When something goes red

**Gather the whole run's failures before fixing anything.** One run's worth, diagnosed together,
fixed together, pushed once. A workflow costs minutes per cycle; three pushes for three failures
from one run wastes two of them.

Read the failing job's log, not the check summary. Count the distinct causes: thirteen failing
behaviour tests behind one failed `deploy api` are one failure, not thirteen.

**Name the layer you fixed, not the symptom you saw.** If a fix moves the failure from step 7 to
step 10, the fix worked and a second layer was behind it. Called "the cost export fix" the next
failure reads as a fix that did not take; called "the column fix" it reads as progress.

**Check what changed underneath you.** A run can fail because a registry returned 403, because
another repository's `main` moved, or because a live endpoint changed. The repository is not the
only variable.

**Pipeline fixes ride on top of the next ready batch** rather than getting a branch of their own.

## Merging the PR

The operator merges. Before they do, **compare the PR's head with the branch tip**: a merge takes
the head it was opened or last updated against, and anything pushed after that is left behind. A
batch has lost commits that way twice.

Anything orphaned goes into the next batch immediately, with its own branch off the batch branch
and its own PR to `main`.

## What not to do

- Do not let a sub-agent push, merge, open a PR or edit `NEXT.md`.
- Do not run the behaviour tier inside a worktree.
- Do not give a workstream a branch of its own PR when it could ride the batch.
- Do not push while any deploy workflow for that branch is in flight.
- Do not report a run's state from memory or from `gh pr checks`. Open the run.
- Do not stop at a green suite or a landed wave to ask whether to continue. The board says what is
  next; work it.
