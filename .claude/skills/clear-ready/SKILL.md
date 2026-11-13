---
name: clear-ready
description: Say whether the operator can run /clear now and whether a restart of Claude Code is safe now, and prepare for each with measures that destroy nothing (commit work, write NEXT.md back, write the handover file). Runs at the end of every /board render, before /compact-ready. Invoke when the operator asks "can I clear", "can I restart", "clear ready", or wants a clean break without a compaction.
---

<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

<!-- @capability DEV-62 Say whether a /clear or a restart is safe now
- **Use when:** the operator asks whether a /clear or a restart of Claude Code is safe, and at the end of every /board render.
- **Does:** clear-ready gathers the session's live work and prepares for each event without destroying anything. It commits work, writes NEXT.md back and writes the handover file. Then it answers yes or not yet for /clear and for a restart.
- **Run:** `/clear-ready`
- **Entry:** `.claude/skills/clear-ready/SKILL.md`
- **Files:** .claude/skills/clear-ready/SKILL.md, .claude/skills/compact-ready/SKILL.md, .claude/skills/board/SKILL.md
- **Keywords:** clear, restart, session handover, compaction alternative, break, resume, continue, handover file
- **Related:** DEV-27
@end-capability -->

# clear-ready

Answer two questions for the state now, and make each answer `yes` where a measure that destroys
nothing can:

1. Can the operator run `/clear` now? `/clear` starts a new conversation with an empty context.
   Nothing is summarised.
2. Can the operator close Claude Code and start it again now? The process ends, and everything the
   process holds ends with it.

Invoke as `/clear-ready`. `/compact-ready` answers the same question for `/compact`.

## 1. What each event loses

Each cell comes from the Claude Code documentation (sources below the table). A cell that the
documentation does not state says "treat as lost", and this skill acts as if the thing is lost.

| Item | `/compact` | `/clear` | Restart |
|---|---|---|---|
| The conversation | Summary kept | Gone from context; resumable | Kept with `--continue` |
| Uncommitted work on disk | Kept | Kept | Kept |
| Background commands | Keep running | Treat as lost | Stopped at exit |
| Monitors | Keep running | Treat as lost | Stopped; not restored |
| Sub-agents and their reports | Keep running | Treat as lost | Stopped; noted as unfinished |
| The `/iterate` wakeup | Still fires | Treat as lost | Not restored |
| The scratchpad path | Kept | Treat as lost | Treat as lost |
| Remote Control URL | Kept | Kept; view resets | Reconnects on `--continue` |

Sources, read 2026-11-13:

- `/clear` starts a new conversation and saves the old one for `/resume`:
  https://code.claude.com/docs/en/commands and https://code.claude.com/docs/en/sessions.
- `/compact` keeps background commands and background sub-agents running:
  https://code.claude.com/docs/en/context-window.
- Background tasks stop when Claude Code exits:
  https://code.claude.com/docs/en/interactive-mode.
- A resume restores the conversation, the permission mode and unexpired `CronCreate` tasks. It
  does not restore background commands, Monitors or a self-paced `/loop`. A sub-agent that ended
  with the process shows as a note that it did not finish:
  https://code.claude.com/docs/en/sessions and https://code.claude.com/docs/en/scheduled-tasks.
- A Monitor stops when the session ends, and every watch has a deadline of at most 30 minutes:
  https://code.claude.com/docs/en/tools-reference.
- `/clear` resets the conversation on devices connected through Remote Control, and a resume
  reconnects to the recorded Remote Control session: https://code.claude.com/docs/en/remote-control.
- Seen in a session on 2026-11-13, and not stated in the documentation: after a `/compact`, a
  Monitor and two background commands kept running, the scheduled wakeup fired, and the scratchpad
  path stayed the same.
- The changelog (2.1.319) says background tasks can keep running after `/clear`. The reference
  pages do not say so, and they do not say whether a sub-agent's report reaches the new
  conversation. This skill therefore treats both as lost.

## 2. Gather

Read, do not recall. Run the commands of `/compact-ready` section 1:

```bash
git status --short                                  # main checkout
git worktree list
for w in $(git worktree list --porcelain | awk '/^worktree /{print $2}'); do
  echo "== $w"; git -C "$w" status --short; git -C "$w" log --oneline -1
done
gh pr list --state open --json number,headRefName,mergeStateStatus
gh run list --limit 15 --json workflowName,status,headBranch,databaseId \
  --jq '.[]|select(.status!="completed")'
```

Then list these from the session:

- Each background command: its label, task id, elapsed time, log file, done-marker and expected
  end. Take the expected end from an earlier run's duration when one exists.
- Each Monitor and what it watches.
- Each running sub-agent: its label, agent id, worktree and branch, and whether its worktree has
  uncommitted changes.
- Whether a `ScheduleWakeup` or a `/loop` is pending.
- Each scratchpad file that a later step names.
- Each decision, rule or source that the operator gave in chat and that no file holds yet.
- Whether a question dialog to the operator is open.
- Unpushed commits on `main` here and in `../private.diyaccounting.co.uk`
  (`git -C <repo> log --oneline origin/main..main`).

## 3. Prepare

Apply each measure for what section 2 found. Every measure destroys nothing.

**Warning:** a stopped process loses its progress. Never stop a process here.

Never remove or overwrite a file other than the handover file. Never push code. Never merge.

| Found | Measure |
|---|---|
| Uncommitted work in a batch worktree or the main checkout | Commit your own files |
| A sub-agent mid-edit | `SendMessage` it to commit what it has and report; wait for the commit |
| A sub-agent that reported, work not landed | Land it as `/compact-ready` section 2 says |
| A `NEXT.md` row whose state changed | Write it back; run `npx vitest run app/unit-tests/nextShape.test.js`; commit; push as its own command |
| A decision, rule or named source from the operator | Write it into its `NEXT.md` row, plan file or memory |
| A running background command, Monitor, sub-agent or wakeup | Write it into the handover file with what a fresh session needs to take it over or start it again |
| A scratchpad file that a later step needs | Write its absolute path into the handover file |
| A scratchpad script that a fresh session must run again | Copy it under `target/` (gitignored); the handover file names the copy |
| Unpushed docs commits on `main`, here or in the private repository | Push each as its own command |

## 4. The handover file

The handover file is `../private.diyaccounting.co.uk/sessions/HANDOVER_SUBMIT.md`. It is one file,
rewritten in place. It lives in the private repository because it holds ids and paths. Commit it
and push it there after each rewrite.

It holds only what is live now. It has these sections, in this order:

1. **Running.** One entry for each background command, Monitor, sub-agent and wakeup: the label,
   the task or agent id, the start time in UTC, the log, the done-marker, what to do at its end,
   and the full command that starts it again.
2. **Batches.** One entry for each batch: the repository, branch, worktree and tip, then the
   ordered next steps to its merge and to its proof on prod.
3. **Operator steps open.** Each step in full, with its URL and its command.
4. **Scratchpad paths.** The absolute path of each file that a later step needs, and its copy under
   `target/` when one exists.
5. **First actions for a fresh session.** A numbered list.

A fresh session reads the file at its start and does the first actions. It deletes each part it
has taken over, in a commit in the private repository. A section with nothing live is empty.

## 5. Answer

Prepare first, then gather again. The answer describes the state at the moment it is printed.

Print two lines. Each is `yes` or `not yet: <cause>`. A conditional answer ("yes after <action>",
"yes once the agent commits") is `not yet`. When an action would make it `yes`, do the action,
gather again, and answer from that result.

**`/clear`** is `not yet` for these causes only:

1. A sub-agent is mid-edit and its work is not committed.
2. A merge is between its gates and its verification.
3. A question dialog to the operator is open.
4. A running sub-agent can report only to this conversation, and its work is not committed.
5. A background command holds progress that exists only in its process, and the rule for a restart
   below makes it `not yet`. The documentation does not say that a background command survives
   `/clear`, so `/clear` takes the same rule.

Everything else is `yes` when the handover file is written and pushed.

**Restart** is `not yet` for the same causes, plus this one: a background command or sub-agent holds
progress that exists only in its process, and that progress takes more than 10 minutes to repeat.
The cause names the command or sub-agent, the minutes done and the expected end in UTC. A run that
repeats in under 10 minutes does not block; the `yes` line names what repeats.

With `yes` for `/clear`, print `/clear` in a fenced block. Then print the first line the operator
types after it: `/iterate` when the loop was running, otherwise a line that tells the new session
to read the handover file.

```
/clear
```

With `yes` for a restart, print these steps:

1. Close Claude Code.
2. In the repository directory, run `claude --continue` to keep the conversation, or `claude` to
   start a new one.
3. Type `/iterate` when the loop was running.

With `not yet`, print neither. The operator runs what is printed, so a line printed before the
state is ready drops the work it was meant to wait for. Run `/clear-ready` again when the cause
clears.

When `/clear` is `yes`, the operator needs no compaction. `/clear` suits a break where the handover
file, `NEXT.md` and the commits hold everything. `/compact` suits a break where the conversation
still holds reasoning that a later turn needs.

## 6. When it runs

- On `/clear-ready`.
- At the end of every `/board` render, after `/unblock` and before `/compact-ready`.
  `/compact-ready` may use the state that this skill gathered in the same render.
