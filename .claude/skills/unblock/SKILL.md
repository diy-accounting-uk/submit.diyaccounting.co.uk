---
name: unblock
description: Check every blocked, machine-ask and human-driven row on NEXT.md for a stale state, correct it, then ask the operator each open decision, record the answers, and print the commands that unblock or part-deliver a row. Runs at the end of every /board render and every /iterate cycle. Invoke when the operator says "unblock", "what do you need from me", "what can I run", or asks whether the board's blockers are still true.
---
<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

<!-- @capability DEV-59 Check blockers and ask the operator what moves the board
- **Use when:** the operator asks what is needed from them, or a board render or an iterate cycle reaches its end.
- **Does:** unblock tests every blocked, machine-ask and human-driven row against evidence, and moves each row whose state is stale. It then asks each open decision, records the answers on NEXT.md, and prints in full each command that unblocks or part-delivers a row.
- **Run:** `/unblock`
- **Entry:** `.claude/skills/unblock/SKILL.md`
- **Files:** .claude/skills/unblock/SKILL.md
- **Keywords:** unblock, stale blocker, operator asks, operator commands, machine-ask, human-driven, decisions
- **Related:** DEV-27, DEV-29, DEV-30
@end-capability -->

# unblock

A blocker is a claim about the present. This skill tests each claim, corrects the board, and then
puts in front of the operator only what moves a row.

`/refine`'s Pass 5 tests dependencies before a wave. This skill tests the same claims every render,
and adds the operator's side: the question to answer or the command to run.

## When it runs

- At the end of every `/board` render, after the write-back and before `/compact-ready`.
- At the end of every `/iterate` cycle, through that cycle's `/board`.
- When the operator invokes it.

## 1. Read

Read `NEXT.md` in full, then take every row under `## Machine-ask`, `## Human-driven` and
`## Blocked`. Take the in-flight rows too when a row names one as its blocker.

## 2. Test each row against evidence

Name the evidence for each row. Never mark a row current from memory.

| The row waits on | Read |
|---|---|
| Another row | Is it still on `NEXT.md`, or open in its plan? |
| A date | Today's date. A date that has passed is a stale blocker |
| A merge or a deploy | `gh pr list --state all --head <branch>`, `gh run list`, the prod line |
| A secret or a variable | `gh secret list --env <env>`, `gh variable list --env <env>` |
| A GitHub setting, an alarm or an issue | `gh issue list`, `gh api`, read-only `aws cloudwatch describe-alarms` |
| A mail, a reply or a send | The mail mirror under `../mail/`, or `corpus-loom` search, and the inboxes |
| A vendor console value | The repository's read-only API script or CLI first (`look-it-up-via-api`) |
| A count, for example clicks | The script the row names |
| A third-party release | `npm view <package> <field>` |

Each row then has one result:

- **Current**: the evidence shows the state holds. Leave the row.
- **Stale**: the blocker has cleared, or the ask has been answered. Remove the blocker. A row left
  with no live blocker moves to its class's section.
- **Wrong class**: a `human-driven` row a session can now drive moves to `## Machine-ask` or
  `## Machine-only`. A `machine-ask` row whose ask is answered moves to `## Machine-only`.
- **Splittable**: part of the row can run now. Split it as `/refine` Pass 4 says.
- **Unknown**: the read needs a login or a console. Say what would settle it, and leave the row.

Read-only commands need no approval. Never write to AWS, GitHub settings or a vendor in this
pass, and never change an issue during a `/board` render.

An SSO login is never an ask on recall. Run `aws --profile diya-submit-ci sts get-caller-identity`
and the same for `diya-submit-prod` first, and print the login only when one fails, naming the
profile and the error.

## 3. Sort what the operator can move

From the rows that stay open, make two lists, ordered by how many rows each item unblocks:

- **Decisions**: a choice between named alternatives that only the operator can make.
- **Commands**: an action the session's policy denies, or one needing the operator's identity,
  that a single command delivers or part-delivers.

Leave out a row whose only wait is a date, a third party, or a machine step. Leave out a choice
already built, or a recommendation already followed (`ask-only-open-questions`). Never re-ask a
decision that `NEXT.md` or the plan already records.

## 4. Ask and print

**Decisions.** With the operator present, ask through `AskUserQuestion`, at most four to a call.
Each question stands alone, names the row, and puts the recommended option first. During an
unattended `/iterate` tick, print the decisions as a numbered list and carry on, because a dialog
in an empty room holds the loop.

**Commands.** Print each in full, in its own fenced block with the `!` prefix, with one line above
it saying what it unblocks. Print only a command that can run now with no condition attached
(`ready-means-ready-now`). An email, a console walk-through or a physical step has no command: name
the exact action with its URL.

## 5. Record

An answer lands on `NEXT.md` in the same turn:

- Delete the operator's row when the answer closes it, and write the decision into the row it
  unblocks, with the date.
- Move that row to its class's section.
- Add a machine row for any work the answer creates.

Run `npx vitest run app/unit-tests/nextShape.test.js`, commit `NEXT.md` alone, and push it as its
own command. Public rows name a security finding by its id only.

## Output

Open with one line: the count of rows moved, questions asked and commands printed. Then:

1. The rows moved, one line each, with the evidence.
2. The rows left as Unknown, with what would settle each.
3. The commands, then the decisions.

Say nothing about a row whose state is current.
