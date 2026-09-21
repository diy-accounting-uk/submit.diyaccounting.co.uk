---
name: iterate
description: Run the delivery cycle unattended until the board has no machine-only row that can start — board, a wave of isolated sub-agent batches on one branch and one PR, watch, auto-merge, watch, board, again — with the self-pacing loop, the SSO window and the lessons of the session reports built in. Invoke when the operator says "iterate", "run the cycle", or "keep going until the board is clear".
---

<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# iterate

The cycle this repository has settled on, run under `/loop` in dynamic mode:

```
/rc (operator) → /board → /do-next (one wave) → /watch → /auto-merge → /watch → /board → …
```

until `/board` shows no machine-only row in state `ready`. This skill names the cycle, fixes its
order, and carries the rules the session reports paid for. The parts are the existing skills;
this one is the conductor.

## The name

It is a **Plan–Do–Check–Act cycle** (the Deming cycle, from Shewhart) in the
**orchestrator–workers** shape: the coordinator plans (the board), workers do (the wave), CI
checks (the watch), the merge acts (auto-merge), and the next board is the next plan. The delivery
practice around it is **trunk-based development with short-lived branches**, one batch branch per
wave and `main`'s own deploy as the integration proof, with a **work-in-progress limit** in the
Kanban sense: a wave holds as many batches as file ownership and the SSO window allow, and no more.

## Before the first cycle

1. **Remote Control.** Read the state before saying anything about it. A `/remote-control is
active` line carrying a `https://claude.ai/code/session_…` URL means the session is connected,
   and `/rc` is then never printed or suggested: on a connected session `/rc` opens the disconnect
   panel, and the `/rc` that follows reconnects under a new session URL, which leaves a phone or
   browser still on the old URL showing the session as disconnected. Only when nothing says the
   session is connected, print `/rc` once for the operator; it is their command, not the session's.
   The `/config` toggle "Enable Remote Control for all sessions" (user settings; a `true` in a
   project's `.claude/settings.local.json` is ignored) connects every new session on its own.
2. **SSO.** `aws --profile submit-ci sts get-caller-identity`. If it fails, print
   `aws sso login --sso-session diyaccounting` and wait; the window it opens (8 to 12 hours) is the
   budget every wave is sized to. Note the login time; read every AWS fact a cycle needs while the
   token is fresh, and when a render finds it expired, say so on the prod line and print the login
   command once, not on every tick.
3. **Inboxes.** `~/.claude/inboxes/submit.md`, `~/.claude/inboxes/diyaccounting.md` and the
   workspace `INBOX.md`, every `[unread]` block acted on before the first dispatch.
4. **Start the loop.** `/loop` with this skill's cycle as the prompt, no interval. The loop's
   `ScheduleWakeup` is a fallback heartbeat only; agent completions, Monitor events and background
   commands are the wake signals.

## One cycle

### 1. Board

`/board`, in full, with its write-back. The write-back is a docs commit pushed straight to `main`
(the docs exception, which the Admin bypass on ruleset 16057564 allows); commit first, then push
as its own command. Read the Part 1 rows whose State is `ready` and Needs is `machine-only`: that
is the wave's input, in board order. Rows whose remainder is a scheduled run, a nightly, or a date
are not startable; leave them.

### 2. Wave

`/do-next`'s shape, sized by these rules:

- **One batch branch per wave** (`claude/b<n>-board`, its own worktree under
  `.claude/worktrees/b<n>`), every agent worktree branched from it, `NEXT.md` never on it.
- **One agent per row.** Rows that share a file go to one agent in one brief, in the order the
  plan fixes, a commit per row. A row over about 25 files is a two-agent chain (design, then
  build), never one long-context agent. Size from the row's `Size`, not from plan prose.
- **Fill until file contention stops you**, then stop; there is no target count. Every batch
  must finish inside what is left of the SSO window, including its ci deploy (35 to 45 minutes)
  and one redeploy for a fix.
- **Lowest tier that fits**: Haiku for a one-file mechanical change or a dispatch-and-read,
  Sonnet for a bounded change against an existing pattern, Opus only for a design a Sonnet could
  then build from. A hard row never shares a batch with mechanical ones.
- **Every brief carries** the worktree path and branch, absolute paths for every file tool,
  `cd <worktree>` in every Bash call, the evidence (run ids, log lines, file:line), "commit before
  a long verification", "a wait is a sleep loop inside one Bash call, never a Monitor", the
  licence header rule for new files, and the report-back contract. A brief that touches a workflow
  carries the called-workflow checklist: inherited `github.event_name`, permissions the callers
  must grant, `--repo` on `gh` with no checkout, grep the siblings for the same defect. A brief
  that dispatches a workflow names the exact inputs (`destroy-ci.yml` needs
  `-f sweep-for-stacks=true` to sweep).
- **Land each report as it arrives**: `git status --short` in the worktree first, then
  `git merge --squash` onto the batch, one commit per row with the why in its body, and the
  content proof (`git diff <agent-branch> <batch> -- <its files>` empty). Read the diff before
  landing it; a test that asserts a count across the whole stack, or a comment that restates the
  code, is fixed on the batch, not sent back.
- **Once per batch before its first push**: `npm test` and `./mvnw clean verify` on the merged
  tree, in the background, both. Then one push, one PR whose body says what each row turned out
  to be, and `/watch`.

### 3. Watch

`/watch` arms `scripts/watch-ci.sh` as a Monitor for 30 minutes; re-arm on every expiry notice
while anything in scope is in flight. A red is diagnosed from the run's own jobs and logs
(`gh api .../jobs/<id>/logs --allow-escape-sequences`, tee'd, then grep), the whole run's failures
gathered before any fix, the layer named. The fix rides on the same batch branch as a second
commit; never push while a deploy of that branch is in flight, and remember a redeploy of the same
branch reuses its deployment name and the first set's self-destruct clock. A scheduled deploy of a
head the push deploy already covered is cancelled before its first stack job; a duplicate that has
started a stack job is left to finish.

### 4. Merge

On the watch's `MERGEABLE` event, `/auto-merge`: every gate re-read, `gh pr merge <n> --merge` as
a command on its own (the classifier refuses it chained with anything), the merge verified, local
`main` updated, then `/watch` over `main`'s deploy. One PR at a time; a second merge waits for the
first deploy's terminal state.

### 5. Close the cycle

When `main` is stable (the watch's tally with no red), `/board` again with its write-back. Print
the removal block for the wave's worktrees and branches in full with the `!` prefix; the operator
runs it or leaves it. Close any alarm issue the wave's deploy settled, with the evidence in the
closing comment.

## Pacing

- An agent completion, a Monitor event or a background command's exit is the wake signal;
  `ScheduleWakeup` at 1200 to 1800 seconds is the fallback while anything runs.
- With nothing running and the next unblock at a known time inside the SSO window (a triage
  budget freeing, a scheduled run), hold with hourly ticks and wake just after it.
- With nothing startable and the next unblock past the SSO window or on another day, stop the
  loop: one push notification with the outcome, `ScheduleWakeup` with `stop`, and any Monitor
  stopped. The notification names every operator decision that would restart the loop (a parked
  list to triage, a URI to register, an email to send, a `machine-ask` row's approval), not only
  the next scheduled event: on 2026-09-21 the loop stopped at 14:12 naming a snapshot run due the
  next day, while the `PARKED.md` triage that restarted it at 19:08 sat unmentioned in an earlier
  reply. The loop still stops; the operator restarts it with `/iterate`.
- A direct question from the operator gets its answer as the whole reply, and the cycle resumes
  on the next turn.

## Blocked commands

`git worktree remove`, `git branch -D`, `git push --delete`, a ruleset or Actions-settings write,
an AWS write outside a workflow, and a Cognito or Step Functions invocation are the operator's.
Print each as one fenced block with the `!` prefix at the moment it arises, collect them again in
the next board's Part 5, and carry on; nothing waits on them. Never ask another session to run
one.

## Report

Each cycle ends with one line per PR merged (number, rows, merge commit), the live prod set, the
open alarm issues, and what the next cycle starts with or why the loop stopped.
