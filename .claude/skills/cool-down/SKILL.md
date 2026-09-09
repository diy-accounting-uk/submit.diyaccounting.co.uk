---
name: cool-down
description: Slow the flow of new work and settle what is already in flight, then bring it back up again. Agents commit and stop, PRs and workflows are driven green one branch at a time, and the tracking documents catch up. Holds the revival notes too, so /wake reads from here. Invoke when the operator says "cool down", or when a batch is stacking problems faster than it lands them.
---

<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# cool-down — stop adding, start settling

Cool-down is a **mode**, not a one-shot pass. It stays on until the operator lifts it in their
own words. Turning it on does not stop work; it changes what work is allowed to be.

The failure it exists for: a batch that adds rows faster than it lands them, several agents in
flight at once, workflows failing while more commits arrive, and a board that no longer says
what is true. Cool-down is how that settles without losing anything.

This file holds both directions. Each rule below carries a **Waking** note saying how that
facet comes back. `/wake` is deliberately thin and reads those notes from here, so the way down
and the way up can never drift apart.

## Turning it on

Write the marker at the top of `NEXT.md`'s `## In flight` section, so it survives a compaction
and any other session reads it:

```
**COOL-DOWN is on since <ISO-8601 UTC>.** No new board rows except a degradation. Agents commit
and stop. One branch is driven green at a time. Lifted only by the operator in their own words.
```

Commit that on its own, push it, and say in the reply that it is on and what it forbids.

Then tell every sibling session through its inbox that this repository is cooling down, so they
hold new asks rather than queueing them. Their in-flight work is theirs to finish.

## The five rules while it is on

### 1. No new board rows, with one exception

A new row is allowed only when it unblocks a row already on the board, **or when it records a
degradation**. A degradation is anything that used to work and now does not, or that has never
worked and was believed to: a failing workflow, a broken deploy, a defect in a shipped feature,
a control that turns out not to control anything. It does not have to be customer-facing.

Everything else goes to `PARKED.md` at the repo root, one line each with enough detail to pick
up later, for the operator to triage when cool-down lifts. Create the file if it is missing.
Never let a discovery evaporate into the transcript, and never argue it onto the board because
it feels important. The board is closed; the parking list is open.

**Waking:** hand `PARKED.md` back as a list for the operator to triage. Promote nothing on your
own judgement, however obvious it looks after a night of settling. Each line the operator picks
becomes a board row placed in tier order; each line they drop is deleted, not left to rot. When
the file is empty, remove it.

### 2. A live customer-facing degradation gets its own branch

When the degradation is live and customer-facing, it does not join the batch. Branch from
`main`, carry **only that fix**, open its own PR, and tell the operator plainly to merge that PR
first, before the batch. A one-fix branch off `main` can go to prod without waiting for anything
else to be right, and that is the whole point.

Print the reasoning as well as the branch name. The operator is choosing a merge order.

**Waking:** every hotfix branch is accounted for before anything else starts. Merged means the
branch and its worktree go in the same breath and its board row is deleted. Still open means it
keeps its place at the front of the merge order, and the reply says so again rather than
assuming the operator remembers. A hotfix branch that is neither merged nor open is the first
thing to explain.

### 3. Agents finish the item they are on, commit it, and stop

Message every running agent: land the piece you are on, commit it to your branch, and start
nothing new. Do not interrupt mid-edit. A half-committed branch does not build and becomes the
next session's puzzle; work left uncommitted in a worktree vanishes when the worktree is removed
and the coordinator gets exactly one look.

Dispatch no new agents. When each reports, merge its verified commit as usual, then check
`git status --short` **inside its worktree**, not just its last commit.

**Waking:** before dispatching anything, walk every worktree that is still on disk and check
`git status --short` in each. Uncommitted work found there is recovered first, because the next
dispatch may remove the worktree that holds it. An agent whose worktree is gone is never
resumed; dispatch a fresh one with a brief built from the board, not from memory of what the old
one was doing. Only then does new dispatch resume, and it resumes at the batch's normal width,
not wider to make up lost time.

### 4. One branch at a time, and prove the fix locally before pushing

Per branch:

1. **Wait for every workflow on it to conclude.** Not the first failure, all of them. A branch
   with three failing jobs and one still running is not ready to be fixed.
2. **Gather every observed issue together.** One triage across all of them. Several failures
   usually share one cause, and finding that is cheaper than fixing three symptoms.
3. **Reproduce each failure locally and get a passing result** before pushing anything. A push
   whose fix has not been proven locally is a guess that costs a whole CI cycle, and guesses are
   what turned a batch into a loop in the first place.
4. **Push once, carrying every fix.** Then back to step 1.

Repeat until the branch is green. There is no cap on pushes, because the local-proof rule is
what stops the loop, not a quota.

**Fix only what our own commits broke.** A scheduled run that was already failing before this
batch is not cool-down's work: record it in `PARKED.md` or, if it is a degradation, as a board
row under rule 1, and leave it. Check the workflow's own history before deciding which it is.

**Waking:** the local-proof rule does not lift with the mode. It is the habit cool-down exists
to install, and a warm session pushing an unproven fix is how the next cool-down gets called.
What does lift is the one-branch-at-a-time serialisation, and only once every branch that was
open during cool-down is green or closed. A red branch left behind keeps the whole board
serialised until it is settled.

### 5. The tracking documents catch up

This is the part that is always skipped and always missed later.

- `NEXT.md`: every in-flight and every just-landed item names **its worktree, its branch and its
  PR**. A row that says work is happening without saying where is not a status.
- `NEXT.md`: every open row's status line is made true as of now. Closed rows are deleted, not
  annotated; this file holds open work only.
- `BACKLOG.md`: its live-status block is brought into step with the board. The tier tables stay
  as they are.
- `PLAN_*.md`: any plan whose decisions moved during the batch records them, so the plan and the
  board do not disagree.
- Commit the documents on their own, separately from any code fix, so the history reads.

**Waking:** the documents are current, so they are the source for what to dispatch. Read them;
do not work from memory of what the batch was doing. Where a row and your recollection disagree,
the row wins, or the row is wrong and fixing it is the first action.

## Resequencing and the board

Both directions keep the board honest as they go, not only at the end.

**Resequence as statuses change.** Whenever a row's state, owner or tier position moves, move
the row in `NEXT.md` at the same time. An item whose blocker cleared rises to its ready section;
one that gained a blocker drops to `## Blocked`; a new degradation goes to the top of its
section as tier 1. The order is the one the `board` skill defines, and a row left in the wrong
section is a status that lies.

**Run the `board` skill as the last action.** Cooling down ends with a board render, and so does
waking up. That render is what tells the operator the state settled, or came back, and it writes
its own statuses back as it always does.

**Every 60 minutes, if neither end has been reached**, stop and render anyway: the four-line
status report below, then the `board` skill in full. A cool-down that runs for hours without a
render leaves the operator reading a transcript to find out what is happening, which is the
thing this skill exists to prevent. Then carry on.

## The report

End every cool-down or wake turn with the same four lines, so the operator can see the
temperature without reading the transcript:

- **Agents**: how many were running, how many have committed and stopped, how many remain.
- **Branches**: each one, its workflow state, and what it is waiting for.
- **Board**: rows added and why each was allowed, rows closed, entries parked.
- **Next**: the single thing that would most reduce what is outstanding.

## Waking up

Only the operator lifts cool-down, in their own words. "Carry on" or "resume" is enough; the
absence of new instructions is not. Silence is not consent to resume.

The order matters, because each step depends on the one before:

1. Delete the cool-down marker from `NEXT.md`.
2. Account for every hotfix branch (rule 2's Waking note).
3. Walk every worktree still on disk for uncommitted work (rule 3's Waking note).
4. Confirm every branch that was open during cool-down is green or closed, which is what lifts
   the one-branch serialisation (rule 4's Waking note).
5. Read the tracking documents and work from them (rule 5's Waking note).
6. Hand `PARKED.md` back for triage (rule 1's Waking note).
7. Resequence the board, then run the `board` skill.

Only after all seven does new dispatch resume. If any step cannot be completed, say which and
why, and stay cool until it is: a half-woken session with a red branch and an unaccounted
worktree is worse than one still cooling.
