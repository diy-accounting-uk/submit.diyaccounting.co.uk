---
name: new-cloud-session
description: Lease a work repository (diy-accounting-uk/submit-cloud-<codename>, or spreadsheets-cloud-<codename> with --repo spreadsheets) from its pool, or create the next one when none is free, re-sync it from origin/main (and a base branch), and start or link a Claude Code cloud session on it that runs /collaborate <codename>. Prints the worker, the repository, the base, the session start, the Monitor command and the release command. Invoke as /new-cloud-session [codename] [--base <branch>] [--repo spreadsheets], or when the operator asks for a new cloud session, a cloud worker, or another web Claude to hand rows to.
---

<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

<!-- @capability DEV-65 Lease a cloud work repository and start a worker session
- **Use when:** the coordinator needs a Claude Code cloud session as a worker, or a pool repository must be leased, re-synced, released or watched.
- **Does:** new-cloud-session.sh leases the first free submit-cloud-<codename> repository by a .collab/lease file on its collab branch. With --repo spreadsheets it does the same for the spreadsheets-cloud-<codename> pool, synced from the spreadsheets checkout. It creates the next one with Actions off when none is free. It pushes origin/main and the base branch to it by URL. It starts claude --cloud from a clone in a terminal, or prints the claude.ai/code/new link. Its watch subcommand polls the claude/* branches for the Monitor. Its creds subcommand dispatches cloud-credentials.yml with the worker's public key and pushes the age ciphertext of one-hour ci credentials to the collab branch.
- **Run:** `/new-cloud-session [codename] [--base <branch>]`; `bash .claude/skills/new-cloud-session/new-cloud-session.sh [codename] [--base <branch>] [--repo submit|spreadsheets] [--dry-run]`; `... release <codename>`; `... post <codename> <file>`; `... watch <codename>`; `... creds <codename>`
- **Entry:** `.claude/skills/new-cloud-session/SKILL.md`; `.claude/skills/new-cloud-session/new-cloud-session.sh:cmd_start`
- **Files:** .claude/skills/new-cloud-session/SKILL.md, .claude/skills/new-cloud-session/new-cloud-session.sh, .claude/skills/new-cloud-session/pool.txt, .claude/skills/new-cloud-session/pool-spreadsheets.txt, .claude/skills/new-cloud-session/environment-setup.sh, .github/workflows/cloud-credentials.yml, infra/main/java/co/uk/diyaccounting/submit/stacks/IdentityStack.java
- **Keywords:** cloud session, claude code on the web, claude --cloud, work repository, submit-cloud, spreadsheets-cloud, pool, lease, collab branch, worker, deep link, remote worker, aws credentials, age, cloud worker role
- **Related:** DEV-66, DEV-27, DEV-30
@end-capability -->

# new-cloud-session

The design and the facts behind this skill are in `../private.diyaccounting.co.uk/engineering/submit/archive/PLAN_CLOUD_COLLABORATION.md`. The worker side
is the `collaborate` skill (`.claude/skills/collaborate/SKILL.md`), which reaches each work
repository with `main`.

## Run

```bash
bash .claude/skills/new-cloud-session/new-cloud-session.sh --dry-run                # what it would do
bash .claude/skills/new-cloud-session/new-cloud-session.sh [codename] [--base <branch>]
```

Run it from the primary checkout or from a worktree. Show the operator its output in full. Every
subcommand takes `--repo submit|spreadsheets` (default `submit`); "The spreadsheets pool", below,
says what changes. The other subcommands:

| Subcommand | What it does |
| --- | --- |
| `release <codename>` | Removes `.collab/lease` on `collab`. Keeps every branch. |
| `post <codename> <file>` | Writes the file as `.collab/<codename>.md` on `collab`, for the fallback loop. |
| `watch <codename> [--interval <s>]` | Polls `refs/heads/claude/*` every 120 s and prints one line per new tip. |
| `creds <codename>` | Gives the worker one-hour ci credentials that only it can read (below). |
| `relay-key` | Makes the coordinator key pair once and writes `.collab/coordinator.pub` (below). |
| `relay-url` | Prints the signed `wss://` URL of the coordinator's relay connection, valid for 5 minutes. |
| `relay-register <codename>` | Registers the worker's key with the relay and writes the send URL to `.collab/relay` on `collab`. |
| `relay-send <codename\|coordinator> <file>` | Encrypts the file to the party, signs it and posts it to the relay. |
| `relay-open [frame-file]` | Decrypts one relay frame (a Monitor event) and prints its id and message. |
| `relay-ack <id>...` | Removes messages from the coordinator's inbox on the relay. |

## AWS credentials for a worker

A cloud worker has no AWS SSO session. When a row needs AWS (Polly narration,
`scripts/proxy-secrets.sh`, a ci proof), give the worker credentials before the task message:

1. Check that `.collab/<codename>.pub` is on the worker's `collab` branch. The worker pushes it at
   its start, by the `collaborate` skill.
2. Run `bash .claude/skills/new-cloud-session/new-cloud-session.sh creds <codename>`.
3. Tell the worker in the task message to load the credentials (the `collaborate` skill, "AWS
   credentials").

What `creds` does:

1. It fetches `collab` from `https://github.com/diy-accounting-uk/submit-cloud-<codename>.git` and
   reads `.collab/<codename>.pub`. It stops when the file is missing or is not one `ssh-ed25519` line.
2. It runs `gh workflow run cloud-credentials.yml --repo diy-accounting-uk/submit.diyaccounting.co.uk --ref main -f codename=<codename> -f public_key=<key>`.
3. It finds the new run named `cloud credentials for <codename>` and waits for it with `gh run watch`.
4. It downloads the artifact `<codename>.aws.age` with `gh run download` and pushes it to
   `.collab/<codename>.aws.age` on `collab`.

The workflow assumes `submit-ci-cloud-worker-role` (IdentityStack, ci account only) for 3600 seconds.
The role trusts only `cloud-credentials.yml` on `main` of this repository. It may call
`polly:SynthesizeSpeech` in eu-west-2 and read the two `ci/` secrets that `proxy-secrets.sh` reads,
and nothing else. The workflow encrypts the credentials file to the worker's key with `age -R` and
uploads only the ciphertext, kept for one day. Only the worker's private key decrypts it, so neither
this machine nor the public Actions record holds the plaintext. Run `creds` again for each hour of
AWS work; each run is in the Actions record.

## The relay

The relay (`ci-env-CollabRelayStack`, ci account) wakes the coordinator the moment a worker
reports, with no poll and no approval click. The coordinator holds one WebSocket connection to it
in a `Monitor`; a worker posts to it over HTTPS. Every request carries an SSH signature
(`ssh-keygen -Y sign -n submit-collab`) that the relay checks, and every message body is `age`
ciphertext that only the recipient can read. Git stays the store for large results: a message
names the branch, the commit and the SHA-256 of a file, and the coordinator fetches it.

The keys:

- The coordinator key pair is `~/.ssh/submit-collab-coordinator` (`COLLAB_COORDINATOR_KEY` changes
  the path). Its public half is `.collab/coordinator.pub` on `main`, so every work repository has
  it after the re-sync, and `deploy-environment.yml` gives it to the relay. `relay-key` makes the
  pair once and writes the file; commit the file through a pull request.
- Each worker signs with `~/.ssh/aws-handoff`, the key whose public half it pushes to
  `.collab/<codename>.pub` for `creds`. `relay-register <codename>` sends that key to the relay,
  signed by the coordinator.

The coordinator needs `age` and `jq` (`brew install age jq`) and a current SSO session for the
`diya-submit-ci` profile, because the script reads the relay's two URLs from the stack outputs.

To watch a worker by the relay:

1. Run `relay-register <codename>` once the worker has pushed its key (it says `ready: <codename>`).
2. Run `relay-url`, and arm a Monitor with its output as the WebSocket source:
   `Monitor({ws: {url: "<the URL>"}, description: "relay messages", timeout_ms: 1800000})`.
   Arm it within 5 minutes of `relay-url`. On connect the relay sends every message not yet
   acknowledged.
3. Each event is one JSON frame. A `{"type":"ping"}` frame keeps the connection open (every 9
   minutes); ignore it. For a `{"type":"message"}` frame, save the event text to a file and run
   `relay-open <file>`. Act on the message, then run the `relay-ack <id>` line it prints, so the
   next connection does not send it again.
4. When the Monitor expires or the connection closes, run `relay-url` again and re-arm. A
   connection lasts at most 2 hours.

When the stack or `.collab/coordinator.pub` is missing, `watch <codename>` stays the channel.

## The pool

`pool.txt` holds one code name a line (16 on 2026-11-22). A session's display name is `submit <codename>`: method a sets it with `--name`; after method b or c, type `/rename submit <codename>` in the session (the link has no name parameter). Each name is the repository
`diy-accounting-uk/submit-cloud-<codename>`, and the worker name is the same code name. The
operator adds each repository to the Claude GitHub app once, so a leased repository needs no
permission step.

A repository is free when its `collab` branch has no `.collab/lease`. It is also free when the
lease is older than 24 hours and no `claude/*` branch tip on it is newer than 24 hours. The script
reads this with `gh api` REST and `git ls-remote`, and lists each pool entry as `free`, `stale` or
`busy`. It leases the first free one. With a code name it leases that one, or stops when it is
busy.

The lease is a commit on `collab` that writes `.collab/lease`:

```
worker: anvil
leased: 2026-11-17T22:09:51Z
coordinator: https://claude.ai/code/session_...
base: main
```

The script makes the commit in a scratch repository and pushes it without force, so of two
coordinators that lease at the same time, one push is rejected. The coordinator URL comes from
`--coordinator`, else from `CLAUDE_CODE_BRIDGE_SESSION_ID`.

## When no repository is free

The script creates the next one by steps 1 to 3 of "To add a work repository" in the plan:

1. `gh repo create diy-accounting-uk/submit-cloud-<codename> --private --disable-wiki`.
2. `gh api -X PUT repos/…/actions/permissions -F enabled=false`, then a read that Actions is
   off. It stops before any push when Actions is on.
3. The push of `origin/main` to `main` (the re-sync below).

The code name comes from `CODENAMES.txt` by the `/do-next` rule, in its own sequence: a random
name from the line after the letter of the last pool name, skipping names already in the pool or
on GitHub. The script appends the name to `pool.txt`. Commit `pool.txt` to `main` (a docs commit)
in the same turn.

It then prints the operator's one-time steps:

1. Open the Claude app's installation page on the org, under **Repository access** add
   `submit-cloud-<codename>`, and click **Save**. The script reads the page URL
   (`https://github.com/organizations/diy-accounting-uk/settings/installations/<id>`) from `gh api
   orgs/diy-accounting-uk/installations`. The list of all the org's apps is
   https://github.com/organizations/diy-accounting-uk/settings/installations.
2. `! git -C <primary checkout> remote add cloud-<codename> git@github.com:diy-accounting-uk/submit-cloud-<codename>.git`

Sessions never add a remote. The script pushes and fetches by URL, so nothing waits on step 2.

## The re-sync

After the lease, the script pushes by URL:

- `refs/remotes/origin/main` to the work repository's `main`, after a `git fetch origin main`.
  The work repository then has the current `CLAUDE.md` and `.claude/skills`, `/collaborate` too.
- With `--base <branch>`, the local branch `<branch>` to the same name. The worker builds from it.

Both pushes are fast-forward only. A rejected push stops the script with the lease held, and
prints the release command.

## The spreadsheets pool

`--repo spreadsheets` selects a second pool. Use it to give a cloud worker a spreadsheets row.

| | `--repo submit` | `--repo spreadsheets` |
| --- | --- | --- |
| Work repository | `diy-accounting-uk/submit-cloud-<codename>` | `diy-accounting-uk/spreadsheets-cloud-<codename>` |
| Pool file | `pool.txt` | `pool-spreadsheets.txt` |
| Synced from | this checkout | `../spreadsheets.diyaccounting.co.uk` beside the primary checkout (`SPREADSHEETS_CHECKOUT` names another) |
| Clone | `cloud-sessions/<codename>` | `cloud-sessions/spreadsheets-<codename>` |
| Session name | `submit <codename>` | `spreadsheets <codename>` |

The rules:

- The re-sync, the lease, the release, `post`, `watch`, `creds` and the relay work the same for
  both pools.
- `--base <branch>` names a local branch of the spreadsheets checkout. The script pushes it from
  there.
- The script stops when the spreadsheets checkout is missing or its `origin` is not
  `diy-accounting-uk/spreadsheets.diyaccounting.co.uk`.
- A code name is in one pool only. The relay names a worker by its code name alone. The script
  skips the other pool's names when it chooses a name, and stops when you give one of them.
- The printed `watch`, `post` and `release` commands carry `--repo spreadsheets`. The printed
  `remote add` and land commands name the spreadsheets checkout.
- A new spreadsheets worker can read `/collaborate` only when spreadsheets `main` holds
  `.claude/skills/collaborate/SKILL.md`. The relay works only when spreadsheets `main` holds
  `.collab/coordinator.pub`. The re-sync copies `main` as it is and adds neither file.
- The environment's setup script (`environment-setup.sh`) installs LibreOffice and the Playwright
  Chromium for a `spreadsheets-cloud-*` checkout, and for no other checkout.

## The session

The script keeps a clone of each work repository in
`/Users/antony/projects/diy-accounting-limited/cloud-sessions/<codename>` (outside every git
repository; `git clone --depth 50`). The clone has one remote, `origin`, the work repository. Its
`main` follows the work repository's `main`, fast-forward only. The script stops when the clone
has other remotes or uncommitted changes. It then starts the session by the first method that
applies, and prints the method it used:

| Method | When | What happens |
| --- | --- | --- |
| a. `claude --name "submit <codename>" --cloud "/collaborate <codename>"` from the clone | stdin and stdout are a terminal, no `--no-launch`, no `--dry-run` | The CLI clones the current directory's GitHub remote at the current branch. It shows a live checklist while the VM starts, so it needs a terminal. |
| b. The link `https://claude.ai/code/new?q=%2Fcollaborate%20<codename>&repo=diy-accounting-uk%2Fsubmit-cloud-<codename>&branch=main` | no terminal, which is the case under the Bash tool | The link opens the new-session form with the prompt, repository and branch filled in. The operator checks the environment and presses send. |
| c. The steps | always printed | Open https://claude.ai/code, choose the repository and branch `main`, choose the work environment, type `/collaborate <codename>`. |

Facts behind the table, read on 2026-11-17:

- `claude --cloud` is the documented way to start a cloud session from the terminal. Without the
  Claude app on the repository, it uploads a bundle of the clone in place of a GitHub clone, and the
  session can then push only where the operator's GitHub connection can.
- The `/new` link and its parameters `q` (alias `prompt`), `repo`, `branch` and `mode` are in
  Anthropic's help article "Open the Claude mobile app with a link" (6 May 2026). It fills the
  form; it does not send. That article names no environment parameter.
- `--environment` takes only self-hosted `ccpool_` ids; the CLI rejects Anthropic-hosted `env_`
  ids. The CLI uses `remote.defaultEnvironmentId`, which `/remote-env` sets in
  `~/.claude/settings.json`. When `environment.txt` in this folder holds an `env_` id, the script
  passes it as `--settings '{"remote":{"defaultEnvironmentId":"env_..."}}'`.
- To find the work environment's id: in a local `claude` session run `/remote-env` and pick the
  work environment, then `jq -r .remote.defaultEnvironmentId ~/.claude/settings.json`. Write that
  id to `environment.txt`, or keep the `/remote-env` pick as it is.
- A worker session runs on Opus 5.5 at medium effort (operator, 2026-11-22), whatever model and
  effort the coordinator session uses. A `claude --cloud` start with no `--model` gives the session
  the coordinator's own default (eleven workers started on Fable 5.2 that way), and one with no
  `--effort` takes the effort saved in `~/.claude/settings.json`. The script passes
  `--model claude-opus-5-5 --effort medium --permission-mode auto`; `CLOUD_WORKER_MODEL` and
  `CLOUD_WORKER_EFFORT` change the first two. A model in `--settings`, in the branch's
  `.claude/settings.json`, in `ANTHROPIC_MODEL` or on the start link does not set a cloud session's
  model (mechanical-librarian's `new-cloud-session` skill, "The model", tried 2026-11-20). Without
  `--permission-mode auto` a CLI start shows "Accept edits" where a form start shows "Auto".
- The link of method b and the steps of method c set no model: in the new-session form choose
  **Opus 5.5** and **medium** before sending. In a session that has started, send
  `/model claude-opus-5-5`, confirm **Switch model**, then send `/effort medium`. The model and the
  effort show beside the message box; check both before the first task.

The session URL is the address of the new session in the browser and in the claude.ai/code
sidebar. In method a the CLI shows it.

## After the start

1. Arm a Monitor on the relay ("The relay", above). Without the relay, arm a Monitor with the
   `watch` command the script prints; each line is a new `claude/*` tip.
2. Send the task to the worker by `SendMessage`, by its session name, in the format of "The task
   message" in the `collaborate` skill. When a message does not reach an idle worker, queue it with
   `claude -p "<task message>" --cloud <session-id>` (documented; the CLI posts it and exits).
   When neither wakes it, `post <codename> <file>` writes the task for the worker's fallback loop,
   and the operator types `/collaborate <codename> --loop` in the session.
3. On a new tip, read the last commit: `git fetch git@github.com:diy-accounting-uk/submit-cloud-<codename>.git claude/<codename>-<row>`,
   then `git log -1 --format=%B FETCH_HEAD`. Land only a tip whose body has `Collab-Status: done`:
   `git merge --squash FETCH_HEAD` onto the local wave branch, one commit per row. A tip with
   `Collab-Status: wip` is a save before a long gate; a tip with `Collab-Status: not-done` says why
   in its body.
4. When the worker has no more tasks, run `release <codename>`.

## Rules

- Never delete a branch or a tag on a work repository. The GitHub proxy of a cloud session rejects
  it, and the operator's rules forbid it.
- Never push a work repository's branch to `origin`. Results reach `origin` only through the
  local wave branch and its one push.
- Never add, remove or change a git remote. Print the `!` command for the operator.
- Never turn on Actions in a work repository. A push to one starts nothing.
- Dependabot opens its own `dependabot/*` branches and pull requests on a work repository. Leave
  them; `watch` reads only `claude/*`.
