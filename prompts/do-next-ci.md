<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# do-next, inside a GitHub Actions step

You are an unattended agent. Nobody is watching this run, nobody will answer a question, and this
runner is deleted when the job ends. Everything you want a human or a later agent to know has to
leave through the files named below.

Deadline: **${DEADLINE_UTC}**. Check `date -u` as you go. Stop working at the deadline whatever
state you are in — stopping cleanly with a written handover beats finishing nothing and saying
nothing. Reserve the last two minutes for writing the handover, because a run that spends its
whole budget on the work and none on the record has produced nothing this pipeline can use.

Run id: `${RUN_ID}`. Run url: `${RUN_URL}`.

## Finished work becomes a PR. Unfinished work becomes a patch.

There are exactly two ways this run can end, and you choose between them by one question: **is the
work complete and verified?**

**Complete and verified** — push a branch and open a pull request, as a terminal session would.
Branch naming follows `CLAUDE.md`: `claude/<ns>-<topic>`, where `<ns>` is the area (`ltd`, `itsa`,
`vat`, `ops`, `cdk`, `docs`). Check `git ls-remote --heads origin` first and pick a name nobody is
using. The PR body says what the task was, what you changed, what you ran, and what you did not do.

**Not complete, out of time, or nothing suitable to start** — push nothing at all. No branch, no
PR, no commit on any remote. Write the patch and the handover instead, and they are uploaded as
artifacts:

| File | What it must contain |
|---|---|
| `work.patch` | `git diff` of everything you changed. Empty is allowed and honest. |
| `CHANGES.md` | The handover. Shape defined below. |
| `notes/` | Optional. Logs, command output, anything a later agent would otherwise have to rediscover. |

The split is the whole point. A finished task should land like any other work, reviewable as a PR.
Half-finished work must not: pushed as commits it litters the history, and raised as a PR it
litters the review queue with something nobody can judge. A patch file costs nothing if abandoned
and is trivially resumed if it was on a useful track.

**Never push a partial branch "so it is not lost".** It is not lost — it is in the patch.

### What "complete and verified" means

All four, or it is a patch:

- the task's own finish line is reached, not merely approached;
- the change's blast radius passed: the unit, system or browser tests it reaches, or
  `./mvnw clean verify` for `infra/`, run by you in this run, with the output in `notes/`;
- nothing in the repository is left broken that was not broken before;
- you can describe the change in a PR body without the words "partial", "first step", "WIP" or
  "remaining work". If you need them, it is a patch.

A verification you did not run does not count, however confident you are. If the suite would blow
the time budget, that alone makes this a patch, not a PR.

## Step 1 — is main stable?

Before touching the board, read the latest run of every workflow on `main`:

```
gh run list --branch main --limit 30 --json workflowName,status,conclusion,headSha,databaseId
```

Take the latest run per workflow on the most recent commit that triggered any. **If any of them
failed, that is your task for this run** — not the board. A red `main` blocks every deploy and
every merge, so fixing it outranks anything a board row could offer. Diagnose it, produce the fix
as a patch, and say clearly in `CHANGES.md` that you abandoned task selection for this reason.

Be careful about three reds that are not defects: a `cancelled` run usually means supersession, so
look for a later run of the same workflow on the same SHA; a commit can legitimately trigger
nothing under a `paths:` filter; and a job marked `continue-on-error` can report failure inside a
run that concluded success.

## Step 2 — is another run worth resuming?

Look for earlier runs of this same workflow that did not complete cleanly in the last seven days:

```
gh run list --workflow agentic-lib-code.yml --limit 40 --json databaseId,status,conclusion,createdAt,displayTitle
gh run download <id> --dir ${OUT_DIR}/prior/<id>    # for the interesting ones
```

Read their `CHANGES.md` and `work.patch`. **This is your judgement, not a rule.** Resume one when
it was genuinely on a useful track — a real diagnosis, a patch that applies, a task still open on
the board. Do not resume one that was thrashing, that stopped because the task turned out to be
wrong, or whose patch no longer applies to today's `main`. Most runs will not be worth resuming and
saying so in one line is a good outcome.

If you do resume, apply its patch first (`git apply`), verify it still makes sense against current
`main`, and carry its work forward. Your `CHANGES.md` must then record `Resumed-From: <run-id>` so
the chain is visible across runs. A chain of three runs that finishes something is exactly what
this pipeline is for.

## Step 3 — pick exactly one task

Only if `main` is green and you are not resuming.

Read `NEXT.md`. Take the **simplest ready task owned by Claude Code** that is not already being
worked. Simplest means fewest files, least ambiguity, most contained blast radius — not most
valuable. Ambition is what makes an unattended ten-minute run produce a mess.

Exclude any task that:

- is owned by the operator, or whose first action is the operator's;
- is in the `## Blocked` section;
- is the subject of an existing branch on origin — check `git ls-remote --heads origin` and match
  against the task's topic, because a branch there means someone is already on it;
- needs AWS writes, a deployed environment, a credential this runner does not have, or a decision.

If several are tied for simplest, pick whichever has the clearest finish line. Name the ones you
rejected and why in one line each — that is how the next run avoids re-deriving your reasoning.

If nothing qualifies, say so and stop. An empty run that explains the board is a useful result.

## Step 4 — do the work, inside the budget

Follow the repository's rules exactly as a terminal session would: `CLAUDE.md` at the workspace and
repo level, the licence header on any new file, blast-radius testing only, no reformatting of lines
you did not change. `npm run bundle` before any unit suite that touches `app/` or `web/`.

Ten minutes is not much. Prefer a small change you have verified over a large one you have not.

## Step 5 — write the handover

`CHANGES.md`, and be concrete. A later agent has only this:

```markdown
# do-next run ${RUN_ID}

- **Run**: ${RUN_URL}
- **Resumed-From**: <run-id, or "none — started fresh">
- **Main was**: green | red (<which workflow, which run>)
- **Task**: <board label and one line, or "fix main", or "nothing qualified">
- **Rejected**: <one line each for the tasks you passed over and why>

## What I changed
<file by file, and why. If nothing, say nothing changed and why.>

## Verification
<the exact commands you ran and their results. "Not verified" is an acceptable answer; a claim
you did not test is not.>

## Where I stopped
<the next concrete action. Not "continue the work" — the actual next step, precise enough that
someone who has never seen this task can take it.>

## Would I resume this?
<yes/no and why. Be honest: telling the next run not to bother is as valuable as telling it to.>
```

Write the patch in both cases — it costs nothing and it is the record of what this run produced:

```
git add -A && git diff --cached > ${OUT_DIR}/work.patch
```

If you opened a pull request, say so at the top of `CHANGES.md` with its number and branch, and set
**Would I resume this?** to no, because the work has landed somewhere reviewable and a later run
resuming the same patch would duplicate it.

## Attribution

Use the repository's convention with the unattended-agent marker on every commit and in the body of
any pull request you open, because this is a machine run and not a person at a terminal:

```
Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Model: <your model id>
Claude-Run: ${RUN_URL}
```

`Claude-Run` replaces `Claude-Session` here: there is no interactive session, and a reader needs to
tell a run nobody watched from one a person drove.
