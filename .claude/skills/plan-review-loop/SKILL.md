---
name: plan-review-loop
description: Make a multi-task plan correct before anyone builds it — loop zero-context Opus reviewer-editors over PLAN_<NAME>_vN.md, each writing vN+1, until one returns CHANGES: no; then board the tasks. Invoke when the operator asks to review, harden or "loop" a plan, before boarding any plan of more than a few tasks, or when a plan has failed a review.
---
<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# plan-review-loop — review a plan until a review comes back clean

A plan reaches the operator only after a fresh reviewer with no context finds nothing in it to change. The writer of a plan is the last one fit to judge it, so the session coordinates the loop and never edits the plan's substance itself, except to apply the operator's own decisions.

## Before the loop

1. The plan is a file at the repository root, `PLAN_<NAME>_v1.md`. It has a header, `## Operator assertions (verbatim)`, `## Goals`, `## Where it stands` (facts with evidence) and `## Tasks` (labelled rows, each with what it waits on). Goals are outcomes the operator owns; the loop never changes them.
2. Delete dead text first: rejected options, history, narrative. Every line serves a task or a goal.
3. Rename the plan to carry a version (`git mv`), and point `NEXT.md` at it. Take the plan's task rows off `NEXT.md` while the loop runs; they come back from the clean version.
4. Write down the operator's design decisions as a short numbered list. Every reviewer brief carries it, so no round undoes one.

## One round

Dispatch one Opus `general-purpose` agent in the background with the brief below, filled in. It writes `PLAN_<NAME>_v<N+1>.md` or nothing. When it reports, commit the new version (Markdown, straight to `main`) and dispatch the next round on it at once. Never summarise a round's findings into the plan yourself.

```
You are an independent reviewer and editor. You have no context beyond this brief.

Background: another Claude session wrote the plan you are given, and <k> reviews have revised it. <One or two sentences on why its author's competence is in doubt, if it is.> Do not trust the plan's reasoning, file references, line numbers or claims about the code. Check each one against the repositories yourself.

Earlier review rounds kept adding detail and mechanism, and each round then found defects in what the last one added. Your rules:
- Change only what would make a task fail, break something, or miss a goal in the plan's `## Goals` section. Do not add detail, options, optimisations or mechanism that a goal does not require.
- Prefer the simplest design that meets the goals. Where a task's mechanism is complex or defect-prone and a simpler one meets the same goal, use the simpler one. Removing mechanism is a valid change.
- Delete text that serves no task.
- These design decisions are the operator's and stay: <numbered list>.
- Where something is unknown, make the assumption that achieves the goals and state it. Do not change the header, `## Operator assertions (verbatim)` or `## Goals`.

Files:
- Input plan: <absolute path of vN> (read it in full).
- Code: <absolute repository paths>; run `git fetch -q origin` and read origin/main with `git show origin/main:<path>`<; the plan is applied after <state>, commit <sha>; read it with `git show <sha>:<path>`>. You may run read-only git, gh reads and greps. Do not run test suites, LibreOffice or browsers. Do not commit, push or dispatch anything.

If changes are required: write the complete revised plan to <absolute path of vN+1>. Edit no other file.
If no change is required: write no file.

Your final message, and nothing else: first line exactly `CHANGES: yes` or `CHANGES: no`; then, for yes, a numbered list of the changes, each one line with its reason tied to a goal and its evidence (file:line); last line the word count of the file you wrote.
```

## Watching the loop

Keep one line per round: changes made, word count, and which tasks changed. Two readings need action:

- **Growth.** Words rising by more than about 10% a round while the change count holds means reviewers are elaborating, not fixing. Check the brief's rules are in it; if they are, take the plan back to the last good version, apply the real defects found since by hand as `v<M>.1`, delete the later versions, and restart from there.
- **One volatile task.** A task that changes in most rounds is usually new mechanism the plan does not need to carry. Take it out as its own board row (note it in the plan's status line and drop it from the goals it alone served), write `v<N>.1`, and restart the loop from it.

An operator decision mid-loop: stop the running round, apply the decision by hand as the next `.1` version (quote the operator's words in the assertions section), delete any version written after the one you edited, and restart.

## Ending

The loop ends on the first `CHANGES: no`. Then:

1. Put the clean version's tasks on `NEXT.md`, each row carrying its brief from the plan, in the order the plan gives.
2. Report to the operator only the task list: label, one line, what it waits on. No round count, no review narrative.

Nothing in the plan is built while the loop runs. Starting work waits for the operator's go.
