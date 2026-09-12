<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# board, inside a GitHub Actions step

Run the repository's `/board` skill and follow it. It is the specification; this file only says how
an unattended run differs from a terminal one.

Run id: `${RUN_ID}`. Run url: `${RUN_URL}`.

## What is different here

**There are no local branches and no worktrees.** Part 5's branch audit covers `origin` only. Say
so in that part rather than reporting an empty local list as though you had swept one; a reader who
sees "no local branches" from a runner learns nothing, and a reader who sees "origin only, this run
has no local checkout to sweep" knows exactly what was and was not examined.

**Nothing local can be pruned**, so the skill's `git branch -d` guidance does not apply. An origin
branch is the operator's to delete, exactly as in the terminal.

**The monitor line in the mode header is always "none".** A background poller cannot outlive this
runner. Do not report one and do not start one.

**Everything else you may read freely**: `NEXT.md`, `BACKLOG.md`, the open alarm issues, the runs on
`main` and on every open PR's head, `origin`'s branches, and read-only AWS for the deployment table.
The AWS role is already assumed for you. If a read fails, render that part as unverified and name
the failure — never as absent.

## The render is the product

Write all five parts into your output in full. That output becomes the job summary, and for a run
nobody watched it is the only account of what the board looked like. Do not abbreviate on the
grounds that nobody is reading; the point is that somebody reads it later.

## Writing back: only when it is worth a commit

You may change **`NEXT.md` and nothing else**. Any other file changed will fail this job.

The skill's write-back rule stands: after rendering, make any row whose status no longer matches
what you just printed true again. But an unattended run adds a caution the terminal does not need —
**do not commit for the sake of committing.** A no-op commit on `main` every few hours is noise that
trains everyone to ignore the file's history.

Commit only when at least one of these is true:

- a row's status is now wrong in a way that would mislead the next reader or agent;
- a row is finished and should be deleted, because this file holds open work only;
- a row's section, owner or tier no longer matches its state, so the board order lies;
- an alarm family has no home on the board and needs one;
- the prod or ci deployment line no longer matches what is actually live.

If none holds, say plainly that the board is already true and commit nothing. That is a good
outcome and the most common one.

## GitHub issues that deserve a row

An open issue with no board row and no plan behind it is invisible to everyone working from
`NEXT.md`. When you find one that genuinely warrants tracking — not every issue does — do both
halves, because either alone leaves the two records disagreeing:

1. **Add the row to `NEXT.md`**, in the right section and tier, with the source, the owner and the
   model tier, exactly as the skill requires of any row.
2. **Comment on the issue** saying it is now tracked, naming the row label and linking this run:

   > Tracked on the board as **&lt;label&gt;** in `NEXT.md`. Added by an unattended board run:
   > ${RUN_URL}

Use the existing label for the issue's class where one applies. Do not close, relabel or edit the
issue body — the skill forbids changing GitHub state during a render, and this is the one narrow
exception it allows, because a tracking comment records a decision rather than altering the thing
being reported.

If an issue clearly does not warrant a row — a duplicate, something already covered by a plan
document, an alarm whose family is already on the board — say so in one line in your output and
leave the issue alone.

## Attribution

Commit with the unattended-agent form, because this is a machine run:

```
Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Model: <your model id>
Claude-Run: ${RUN_URL}
```

`NEXT.md` is a documentation file, so the docs exception applies and the commit goes straight to
`main`. That exception is also the reason the guard below refuses any other path: a change to code
or workflows must never reach `main` this way.
