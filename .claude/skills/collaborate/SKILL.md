---
name: collaborate
description: Run this Claude Code cloud session as a worker for the local coordinator. Checks the VM's tools, then on each task message fetches the named base branch from its own work repository (diy-accounting-uk/submit-cloud-<codename> or spreadsheets-cloud-<codename>), builds the row on claude/<codename>-<row>, runs the gates the brief names, and pushes the branch with the report in the last commit's body. Git is the reply. Invoke in the cloud session as /collaborate <codename>, or /collaborate <codename> --loop for the polling fallback.
---

<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

<!-- @capability DEV-66 Work rows as a cloud worker for the coordinator
- **Use when:** a Claude Code cloud session on a submit-cloud-<codename> or spreadsheets-cloud-<codename> work repository starts, or a task message from the coordinator arrives in it.
- **Does:** collaborate checks Node 24, JDK 25, node_modules, a Playwright browser and the timeout variables, and stops when one is missing. It makes an ssh-ed25519 key pair once per VM and pushes the public key to .collab/<codename>.pub on the collab branch, so the coordinator can hand it AWS credentials. On a task it branches claude/<codename>-<row> from the named base, builds the row, runs the named gates, and pushes to its own work repository. The last commit body carries the report and a Collab-Status trailer. The --loop form polls .collab/<codename>.md on the collab branch every 10 minutes.
- **Run:** `/collaborate <codename>`; `/collaborate <codename> --loop`
- **Entry:** `.claude/skills/collaborate/SKILL.md`
- **Files:** .claude/skills/collaborate/SKILL.md
- **Keywords:** collaborate, cloud worker, claude code on the web, work repository, submit-cloud, spreadsheets-cloud, npm test router, verdict, report-back contract, collab branch, poll loop, aws credentials, age, aws-handoff
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
- **Repository:** `diy-accounting-uk/submit-cloud-<codename>` or
  `diy-accounting-uk/spreadsheets-cloud-<codename>`, the only repository of this session.
  `git remote get-url origin` ends with one of those names (the GitHub proxy rewrites the host).
  Stop and say so when it does not. A `spreadsheets-cloud-` repository is a spreadsheets clone:
  follow "In a spreadsheets clone", below, where it differs from this file.
- **Branches you push:** `claude/<codename>-<row>` only, where `<row>` is the row id in lowercase
  (`claude/anvil-ops12`).

## At the start

Run the checks in one Bash call from the repository root:

```bash
node --version; java -version 2>&1 | head -1; test -d node_modules && echo node_modules ok
ls -d ~/.cache/ms-playwright/chromium-* 2>/dev/null || echo "no playwright chromium"; echo "CHROME_PATH=${CHROME_PATH:-}"
echo "BASH_DEFAULT_TIMEOUT_MS=${BASH_DEFAULT_TIMEOUT_MS:-unset} BASH_MAX_TIMEOUT_MS=${BASH_MAX_TIMEOUT_MS:-unset}"
git remote get-url origin; git log -1 --oneline origin/main
age --version; aws --version
```

| Check | Needs | When it is missing |
| --- | --- | --- |
| `node --version` | `v24.*` (the repository's `engines`) | The VM has Node 22 on `PATH`. The environment's setup script installs Node 24. |
| `java -version` | 25 (the pom's target) | The VM has OpenJDK 21. The setup script installs JDK 25. |
| `node_modules` | present | Run `npm ci`. The setup script runs it. |
| Playwright Chromium | a `chromium-*` folder | Run `npx playwright install chromium`. It needs the Playwright download domains (`cdn.playwright.dev`, `playwright.download.prss.microsoft.com`) on the environment's allowlist. `playwright.config.js` does not read `CHROME_PATH`. |
| The two timeout variables | `3600000` each | Without them a command moves to the background after 10 minutes and stops 30 minutes later. |
| `age --version` | `v1.3.2` | The setup script installs it. Without it you cannot decrypt AWS credentials, so you take no task that needs AWS. |
| `aws --version` | `aws-cli/2.*` | `scripts/proxy-secrets.sh` calls the AWS CLI. Without it you take no task that runs that script. |

When Node 24, JDK 25 or `node_modules` is missing, the reply of the turn is the list of what is
missing and the setup-script line that fixes it, and you take no task. When only the browser is
missing, you take tasks whose gates need no browser.

Then make sure the coordinator has your public key for AWS credentials. Make the key pair once per
VM, and push the public key when `collab` does not hold this VM's key:

```bash
test -f ~/.ssh/aws-handoff || ssh-keygen -q -t ed25519 -N '' -C aws-handoff-<codename> -f ~/.ssh/aws-handoff
git fetch origin collab:refs/remotes/origin/collab
git show origin/collab:.collab/<codename>.pub 2>/dev/null | cmp -s - ~/.ssh/aws-handoff.pub && echo "key on collab"
```

When the last line prints nothing, push the key from a temporary worktree, so your own branch does
not change:

```bash
git worktree add --detach /tmp/collab-key origin/collab
mkdir -p /tmp/collab-key/.collab && cp ~/.ssh/aws-handoff.pub /tmp/collab-key/.collab/<codename>.pub
git -C /tmp/collab-key add .collab/<codename>.pub
git -C /tmp/collab-key commit -q -m "<codename>: public key for the AWS credentials handoff"
git -C /tmp/collab-key push origin HEAD:collab
git worktree remove /tmp/collab-key
```

When the push is rejected, the coordinator pushed to `collab` first: remove the worktree, fetch
`collab` again and repeat. The private key `~/.ssh/aws-handoff` never leaves the VM. Do not print
it, copy it or commit it.

Then reply `ready: <codename>` and end the turn.

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
   `git push origin claude/<codename>-<row>`. Then send the one-line reply of step 7 to the
   coordinator by the relay ("Report by the relay", below).
7. Reply in one line: the branch, the SHA, `done` or `not-done`. When the task file or message
   holds a further task (below), start it now. End the turn only when no task is left. The next
   message starts the next task.

**A queue of tasks.** A message, or `.collab/<codename>.md` on `collab`, may hold several tasks,
each starting with `task:`, separated by a line `---`. Do them in order, each on its own branch.
After the push and the relay line of one task, run `git fetch origin collab` and read the file
again, because the coordinator appends tasks to it; a task whose branch is already on `origin`
with `Collab-Status: done` is done. A base named `claude/<codename>-<row>` is your own branch of
an earlier task.

**An integration task** (`task: integrate-<row>`) builds no row. Merge the named branch onto the
base with one merge commit (`git merge --no-ff`), never taking a `.collab/` file. In a registry
file (`i18n/cy.toml`, the catalogue, `app/bin/server.js`, a Java names class) keep both sides.
Rebuild a generated file with its generator and never merge it by hand. Set each count in
`infra/test/java` from a run of `./mvnw clean verify`, and name it "from -> to". For a conflict
in any other file, resolve it only when the tests of both rows then pass; otherwise push
`not-done` and name the two rows and the file. The report lists each conflict and how it was
resolved. With no task left, run the wave's gate on your newest head, as the brief of your first
integration task names it.

When you cannot do the task (a missing tool, a brief that needs AWS with no credentials for you, a
gate that cannot run here),
push the branch with one commit (`git commit --allow-empty` when nothing changed) whose body says
why, with `Collab-Status: not-done`.

## In a spreadsheets clone

A `spreadsheets-cloud-<codename>` repository holds the spreadsheets repository. These rules
replace the rules above where they differ:

- At the start, check `node --version`, `node_modules`, the Playwright Chromium and
  `soffice --version`. JDK 25 and `mcp/node_modules` are not needed. Without `soffice` the router's
  calc tier does not run and its verdict is `PARTIAL`: take no task whose gate needs a `PASS`, and
  give the setup-script line that installs LibreOffice (`environment-setup.sh`).
- On a task, read that repository's own `CLAUDE.md` (sections "Testing", "Reconciliation-bug
  method" and the ones the brief names) in place of this repository's. Read the `CONTEXT_*.md` file
  of the product the row touches.
- The gate is `npm test`, the router `scripts/test-scope.mjs`. Do not run `npm run bundle`. Run
  `npm test 2>&1 | tee /tmp/npm-test.log`, outside `target/`, because the infra tier's
  `./mvnw clean verify` deletes `target/`. Before it, commit and push with
  `Collab-Status: wip`, because the router can run for most of an hour.
- Copy the router's `VERDICT` line into the report as it stands. `Collab-Status: done` needs a
  `PASS` verdict, unless the brief accepts another.
- The repository's `.githooks/pre-push` runs the router again over what the push adds. When the
  router has already given its verdict on the commit you push, push with `SKIP_PUSH_TESTS=1`, which
  runs the hook's gates tier only. Say so in the report.
- The relay needs `.collab/coordinator.pub` on that repository's `main`. When it is missing, the
  push is the reply ("Report by the relay").

## Report by the relay

The relay wakes the coordinator at once; without it the coordinator finds your push only on its
next poll. The relay is in use when `collab` holds `.collab/relay` (the coordinator writes it after
it registers your key) and `main` holds `.collab/coordinator.pub`. When either is missing, skip
this section: the push is the reply. The commands need `age`, `jq`, `curl` and `ssh-keygen`.

The message is one line, `<branch> <sha> <done|not-done|wip>`. It carries no file: git stays the
store, and for a large result the line can name a file in the commit with its SHA-256. Put the
line in `/tmp/relay-msg.txt`, then run in one Bash call from the repository root:

```bash
cn=<codename>
git fetch -q origin collab:refs/remotes/origin/collab main:refs/remotes/origin/main
url=$(git show origin/collab:.collab/relay)
git show origin/main:.collab/coordinator.pub > /tmp/relay-coordinator.pub
age -a -R /tmp/relay-coordinator.pub -o /tmp/relay-body.age /tmp/relay-msg.txt
seq=$(date +%s%3N); ts=$(date +%s)
{ printf 'send|%s|coordinator|%s|%s|' "$cn" "$seq" "$ts"; cat /tmp/relay-body.age; } |
  ssh-keygen -Y sign -n submit-collab -f ~/.ssh/aws-handoff - 2>/dev/null | sed '1d;$d' | tr -d '\n' > /tmp/relay-sig
jq -n --arg from "$cn" --argjson seq "$seq" --argjson ts "$ts" --rawfile sig /tmp/relay-sig --rawfile body /tmp/relay-body.age \
  '{from: $from, to: "coordinator", seq: $seq, ts: $ts, sig: $sig, body: $body}' |
  curl -sS --fail-with-body -X POST -H 'content-type: application/json' --data-binary @- "$url/send"
```

- The answer `{"id":"…","delivered":N}` means the relay stored the message for seven days.
  `delivered` 0 means the coordinator was not connected; it gets the message when it connects.
- `401` means the signature or the clock failed: check `date -u` and that `.collab/<codename>.pub`
  on `collab` is `~/.ssh/aws-handoff.pub`. `409` means the seq was not newer; send again.
- A failed send does not change the task's status. Say in the reply that the relay send failed.
- The message is ciphertext that only the coordinator's key opens, and the signature is made with
  your private key, which never leaves the VM.

## AWS credentials

When a task says to load AWS credentials, the coordinator has pushed
`.collab/<codename>.aws.age` to `collab`: one-hour credentials for the role
`submit-ci-cloud-worker-role` in the ci account, encrypted to your public key. Load them in one Bash
call, and print nothing of the decrypted file:

```bash
git fetch origin collab:refs/remotes/origin/collab
mkdir -p ~/.aws && chmod 700 ~/.aws
(umask 077 && git show origin/collab:.collab/<codename>.aws.age | age -d -i ~/.ssh/aws-handoff > ~/.aws/credentials)
chmod 600 ~/.aws/credentials
printf '[default]\nregion = eu-west-2\n[profile diya-submit-ci]\nregion = eu-west-2\n' > ~/.aws/config
env -u AWS_ACCESS_KEY_ID -u AWS_SECRET_ACCESS_KEY -u AWS_SESSION_TOKEN AWS_PROFILE=diya-submit-ci aws sts get-caller-identity --query Arn --output text
```

The last line must print an ARN with `assumed-role/submit-ci-cloud-worker-role/`. When it does not,
or `age` fails, the task is `not-done` with the error in the body.

- The credentials expire within the hour. The first line of the file is a comment with the expiry
  time: read it with `head -1 ~/.aws/credentials`, which prints no key. When they expire, push the
  work so far with `Collab-Status: wip` and say in the body that the task needs new credentials.
- The file holds the same keys under two profiles: `default`, which the Polly narration uses, and
  `diya-submit-ci`, which `scripts/proxy-secrets.sh` and the npm scripts name. Both run unchanged.
- The VM's environment sets `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`, which take precedence
  over the file and fail with `InvalidClientTokenId`. Start every command that calls AWS (the CLI,
  `scripts/proxy-secrets.sh`, a narrated `npm run video:record`) with
  `env -u AWS_ACCESS_KEY_ID -u AWS_SECRET_ACCESS_KEY -u AWS_SESSION_TOKEN`.
- The role may call `polly:SynthesizeSpeech` in eu-west-2 and read the two `ci/` secrets that
  `scripts/proxy-secrets.sh` reads. Every other AWS call is denied.
- Never print, `cat`, copy or commit `~/.aws/credentials`, and never echo a variable that holds a
  key. A key in your transcript stays readable after the file expires.

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
line, with the reason. Keep the body under 60 lines; longer detail goes in `docs-out/<task>.md` on
the branch, and the body names the file.

The three trailers are exact, in this order, on every commit you make: `Co-Authored-By: Claude
<noreply@anthropic.com>` (never a model name in it), `Claude-Model: <your exact model id>`, and
`Claude-Session: <this session's claude.ai/code URL>`. Never copy another session's trailers.

## Rules

- Push only to `origin`, the work repository of this session. Never push to any other repository.
- Never push a branch whose name does not start with `claude/`. Never push `main`. Push to
  `collab` only the commit that adds `.collab/<codename>.pub`.
- Never delete a branch or a tag. Never force-push a branch the coordinator may have fetched.
- Call AWS only with the credentials of "AWS credentials", and only for the task that asked for
  them. This VM has no SSO session; a brief that needs AWS before the coordinator has pushed
  credentials is `not-done`.
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
