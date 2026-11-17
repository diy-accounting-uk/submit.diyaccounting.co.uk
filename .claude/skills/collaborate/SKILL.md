---
name: collaborate
description: Run this Claude Code cloud session as a worker for the local coordinator. Checks the VM's tools, then on each task message fetches the named base branch from its own work repository (diy-accounting-uk/submit-cloud-<codename>), builds the row on claude/<codename>-<row>, runs the gates the brief names, and pushes the branch with the report in the last commit's body. Git is the reply. Invoke in the cloud session as /collaborate <codename>, or /collaborate <codename> --loop for the polling fallback.
---

<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

<!-- @capability DEV-66 Work rows as a cloud worker for the coordinator
- **Use when:** a Claude Code cloud session on a submit-cloud-<codename> work repository starts, or a task message from the coordinator arrives in it.
- **Does:** collaborate checks Node 24, JDK 25, node_modules, a Playwright browser and the timeout variables, and stops when one is missing. On a task it branches claude/<codename>-<row> from the named base, builds the row, runs the named gates, and pushes to its own work repository. The last commit body carries the report and a Collab-Status trailer. The --loop form polls .collab/<codename>.md on the collab branch every 10 minutes.
- **Run:** `/collaborate <codename>`; `/collaborate <codename> --loop`
- **Entry:** `.claude/skills/collaborate/SKILL.md`
- **Files:** .claude/skills/collaborate/SKILL.md, PLAN_CLOUD_COLLABORATION.md
- **Keywords:** collaborate, cloud worker, claude code on the web, work repository, submit-cloud, report-back contract, collab branch, poll loop
- **Related:** DEV-65
@end-capability -->

# collaborate

You are a worker. The coordinator is a Claude Code session on the operator's laptop. It sends you
rows from its board, one task at a time, and lands your commits itself. The branch you push is the
only reply: the report goes in the last commit's body with the `Collab-Status` trailer, and the
coordinator watches your repository. Do not use the `send_message` tool to reach the coordinator:
each message needs the operator's approval (operator, 2026-11-17).

## Who you are

- **Worker name:** the code name in the command, `<codename>` (`/collaborate anvil` makes you
  `anvil`).
- **Repository:** `diy-accounting-uk/submit-cloud-<codename>`, the only repository of this
  session. `git remote get-url origin` ends with that name (the GitHub proxy rewrites the host).
  Stop and say so when it does not.
- **Branches you push:** `claude/<codename>-<row>` only, where `<row>` is the row id in lowercase
  (`claude/anvil-ops12`).

## At the start

Run the checks in one Bash call from the repository root:

```bash
node --version; java -version 2>&1 | head -1; test -d node_modules && echo node_modules ok
ls -d ~/.cache/ms-playwright/chromium-* 2>/dev/null || echo "no playwright chromium"; echo "CHROME_PATH=${CHROME_PATH:-}"
echo "BASH_DEFAULT_TIMEOUT_MS=${BASH_DEFAULT_TIMEOUT_MS:-unset} BASH_MAX_TIMEOUT_MS=${BASH_MAX_TIMEOUT_MS:-unset}"
git remote get-url origin; git log -1 --oneline origin/main
```

| Check | Needs | When it is missing |
| --- | --- | --- |
| `node --version` | `v24.*` (the repository's `engines`) | The VM has Node 22 on `PATH`. The environment's setup script installs Node 24. |
| `java -version` | 25 (the pom's target) | The VM has OpenJDK 21. The setup script installs JDK 25. |
| `node_modules` | present | Run `npm ci`. The setup script runs it. |
| Playwright Chromium | a `chromium-*` folder | Run `npx playwright install chromium`. It needs the Playwright download domains (`cdn.playwright.dev`, `playwright.download.prss.microsoft.com`) on the environment's allowlist. `playwright.config.js` does not read `CHROME_PATH`. |
| The two timeout variables | `3600000` each | Without them a command moves to the background after 10 minutes and stops 30 minutes later. |

When Node 24, JDK 25 or `node_modules` is missing, the reply of the turn is the list of what is
missing and the setup-script line that fixes it, and you take no task. When only the browser is
missing, you take tasks whose gates need no browser. Then reply `ready: <codename>` and end the
turn.

## The task message

A task arrives as a message in this session, in this form:

```
task: <row id>
base: <branch in the work repository>
brief: <what to build, or "the NEXT.md row <row id> on main">
gates: <the commands to run, one a line>
```

On a task:

1. Run `git fetch origin <base>:refs/remotes/origin/<base> main:refs/remotes/origin/main` (the clone
   may track `main` only), then `git switch -c claude/<codename>-<row> origin/<base>`.
2. When the brief points at `NEXT.md`, read the row with `git show origin/main:NEXT.md`.
3. Read `CLAUDE.md` and the skills the brief names. Build the row by the brief. Keep to its
   scope; an adjacent bug goes in the report.
4. Run `npm run bundle` before the unit tests. Run every gate the brief names, and tee each
   output to a file under `target/`.
5. Before any gate that runs longer than 5 minutes, commit and push the work so far with
   `Collab-Status: wip` in the body. A reclaimed VM loses running commands and work that is not
   pushed.
6. Commit with the report in the last commit's body (below), then
   `git push origin claude/<codename>-<row>`.
7. Reply in one line: the branch, the SHA, `done` or `not-done`. End the turn. The next message
   starts the next task.

When you cannot do the task (a missing tool, a brief that needs AWS, a gate that cannot run here),
push the branch with one commit (`git commit --allow-empty` when nothing changed) whose body says
why, with `Collab-Status: not-done`.

## The report in the last commit's body

```
<row id>: <what the change does>

Changed: <what changed and why>
Not done: <what the brief asked for that this commit does not do, or "nothing">
Adjacent bugs: <path:line and the bug, one a line, or "none">
Commands:
- `<command>`: <counts, for example 412 passed, 0 failed>
SHAs: base <sha of origin/<base>>, earlier commits <sha ...>
Collab-Status: done
Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Model: <the model id of this session>
Claude-Session: <this session's claude.ai/code URL>
```

Every command line gives the exact command and its counts. A gate that did not run says so on its
line, with the reason.

## Rules

- Push only to `origin`, the work repository of this session. Never push to any other repository.
- Never push a branch whose name does not start with `claude/`. Never push `main` or `collab`.
- Never delete a branch or a tag. Never force-push a branch the coordinator may have fetched.
- Never call AWS. This VM has no SSO session; a brief that needs AWS is `not-done`.
- Never edit `NEXT.md` or a `PLAN_*.md`. The coordinator owns them.
- Never open a pull request. `gh pr` fails here (the proxy blocks GraphQL), and none is needed.
- Commit before any long gate, and push the commit (step 5).

## The fallback loop

Use it when the operator starts the session with `/collaborate <codename> --loop`, because a
message from the coordinator did not reach an idle session. Run the checks above, then start:

```
/loop 10m Read .collab/<codename>.md on the collab branch (git fetch origin collab:refs/remotes/origin/collab, then git show origin/collab:.collab/<codename>.md). When its task id has no branch claude/<codename>-<row> on origin yet (git ls-remote origin refs/heads/claude/<codename>-<row>), do that task by the collaborate skill.
```

The file holds one task in the form of "The task message". The coordinator writes it with
`new-cloud-session.sh post`. A task with a branch already on `origin` is done; wait for the next
tick.
