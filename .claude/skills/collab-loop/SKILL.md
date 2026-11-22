---
name: collab-loop
description: Start or steer the /iterate delivery loop so that the cloud workers (the submit-cloud-<codename> sessions running /collaborate) do the compute, and the laptop only coordinates, lands and proves. Idempotent: every tick rebuilds its state from git, so it is safe to run again after a compaction, a restart or mid-loop. Checks that each worker runs the current collaborate skill and VM setup and brings it up to date first. Invoke as /collab-loop [<wave set name>], or when the operator says "collab loop", "offload to the cloud sessions" or "keep the laptop light".
---

<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

<!-- @capability DEV-67 Run the delivery loop with the cloud workers doing the compute
- **Use when:** the operator says collab loop, offload to the cloud, keep the laptop light, or starts or resumes /iterate with cloud sessions running.
- **Does:** collab-loop primes or steers the /iterate loop under /loop. Each tick rebuilds the state from git (collab-loop.sh state), brings every worker's skill and setup up to date, lands done results onto the batch, sends the next rows and gates to idle workers, and keeps local work to coordination, landing and proofs that need AWS, Chrome or the operator. The state lives in git, so a compaction mid-loop loses nothing.
- **Run:** `/collab-loop [<wave set>]`
- **Entry:** `.claude/skills/collab-loop/SKILL.md`
- **Files:** .claude/skills/collab-loop/SKILL.md, .claude/skills/collab-loop/collab-loop.sh
- **Keywords:** collab loop, cloud offload, cloud workers, submit-cloud, collaborate, iterate, wave set, idempotent loop, laptop load, setup currency, reload skills
- **Related:** DEV-30, DEV-65, DEV-66
@end-capability -->

# collab-loop

`/iterate` with one change of shape: the cloud workers build the rows and run the gates, and the
laptop coordinates. The laptop is the scarce part. One local batch check with local agents took the
load to 177 on 16 cores and the CPU speed limit to 20, made 5 s test timeouts fail, and broke the
spreadsheets pre-push hook three times (2026-11-18). The cloud workers are paid for by the plan:
each is a 4-vCPU VM that never touches the laptop, and the pool (`pool.txt`) holds 16 code names.

The cycle, its order and its rules are those of `.claude/skills/iterate/SKILL.md` and, for a wave
set, `.claude/skills/wave-set/SKILL.md`. Read both. This skill changes only where the work runs and
how the loop survives a compaction.

## Where work runs

| Work | Where | Why |
|---|---|---|
| Build a row (code, tests, docs) | cloud worker | a worker has the repository, Node 24, JDK 25, Chrome and Playwright |
| `npm test` (unit and system), mcp tests, `./mvnw clean verify`, ESLint, Prettier, Spotless | cloud worker | no AWS needed; brief `npm test`, never `npm run test:unit`, so the system tests run too |
| Browser tests (`npm run test:browser`) | cloud worker | the longest gate on the laptop (3.6 h under load) |
| Simulator behaviour suites (`test:<suite>Behaviour-simulator`) | cloud worker, before every push | `.env.simulator` needs no AWS, and the VM runs Linux as CI does: a select that moves on PageDown under Linux Chromium passed on the Mac and failed in CI (2026-11-19) |
| Docker build gate | laptop (29 s) or the CI deploy | the worker VM has no Docker daemon (anvil, 2026-11-18) |
| Proxy behaviour suites, narrated video capture | cloud worker with `creds` | `new-cloud-session.sh creds <codename>` gives one-hour ci credentials that only the worker can read |
| Review of a diff, a Companies House judge, a script proved on the simulator | cloud worker | read and run, no AWS |
| Merging rows onto the wave branch, merging a wave forward, regenerating, resolving registry conflicts, the wave's gate | the integrator worker ("The integrator", below) | each landing cost the laptop 3 to 8 commands and a gate cost a builder 85 minutes (2026-11-22) |
| Signing a landing (the content proof, the signed commits), `NEXT.md`, plans, PRs, `/auto-merge` | laptop | the coordinator owns them; commits carry the operator's signature |
| Test-service filings (Companies House test flag 1, HMRC sandbox) and their proofs | cloud worker with `creds` | ci credentials for one hour; the submission numbers and responses come back in the report, and the laptop writes them to the private repository |
| `-ci` and `-prod` proofs, Cognito scripts, `deploy:app-ci`, AWS reads past ci | laptop | SSO; prod is never given to a worker |
| Claude in Chrome, claude.ai connector calls, anything the operator signs in to | laptop | the operator's browser |
| Spreadsheets repository work and its pre-push hook | laptop, one at a time | no worker holds that repository yet; push with `SKIP_PUSH_TESTS=1` when that PR's CI runs the suite (spreadsheets `test.yml` does) |
| A local sub-agent | laptop, only for work in this column (AWS past ci, spreadsheets, corpus-loom, the mail mirror, Chrome) | each local agent adds Node, Vitest and Playwright processes; a code row goes to an idle worker first |

A row goes to the laptop only when its brief needs something in the laptop column. Say which
item when you keep a row local.

## The state is in git

Nothing the loop needs lives only in this conversation. Every tick reads it back:

| Fact | Where it is |
|---|---|
| A worker's current task | `.collab/<codename>.md` on the work repository's `collab` branch, written by `new-cloud-session.sh post` |
| Its result | the branch `claude/<codename>-<row>` and the `Collab-Status` trailer of its tip |
| The worker's setup | the newest `claude/<codename>-setup-<sha7>` branch: `<sha7>` is the `main` it set up from |
| Landed or not | the content proof against the batch branch (`collab-loop.sh state --base <batch>`, column `landed`) |
| Rows, waves, gates | `NEXT.md`, `PLAN_WAVE_SET_<NAME>.md` (state lines `building`, `landed`, `gated <sha>`) |
| CI and deploys | `gh run list`, `scripts/watch-ci.sh` |

So a tick never asks "what did I send?" It reads it. Run it after a compaction, a restart, or
on top of a loop already running, and it does only what the state still lacks.

```bash
.claude/skills/collab-loop/collab-loop.sh state --base <batch-branch>
.claude/skills/collab-loop/collab-loop.sh load
```

## Prime (first run, or after a compaction)

1. `/iterate`'s "Before the first cycle": Remote Control, SSO, inboxes. Read `NEXT.md` in full and
   the wave set plan when one is named. With none, the cycle is `/iterate`'s own, over the board's
   machine-only rows; `/wave-set` defines a set.
2. `ListAgents`. A restarted worker keeps its old session's name, so send to the `[ref]` of the
   newest live row of that name. A worker's session is named `submit <codename>` (`new-cloud-session.sh` starts it with
   `--name`). Five sessions started before 2026-11-22 keep their first titles ("Anvil
   collaboration", "Collaborate Bugle", "Cyclone collaboration", "Dusk collaboration", "Collaborate
   epoch") until `/rename submit <codename>` is typed in each. A pool code name with no live peer has no session: print the
   `/new-cloud-session <codename> --base <batch>` command for the operator, who signs in to start
   it, and carry on with the workers there are.
3. Run `collab-loop.sh state`. For each worker whose `setup` is `needed`, run "Bring a worker up to
   date" before any task.
4. Connect the relay, so a worker's result wakes the loop at once (see "The relay" below):
   for each worker whose `collab` branch has no `.collab/relay`, run
   `new-cloud-session.sh relay-register <codename>` after its key is on `collab`.
5. Arm the Monitors, once each (`TaskList` first; never two of one kind):
   - the relay: a Monitor with a `ws` source on the URL that `new-cloud-session.sh relay-url`
     prints (valid 5 minutes to connect; make a fresh one on every re-arm);
   - the cloud watcher, the fallback when the relay is down: one line per new or moved `claude/*`
     tip, polled every 90 s (`scratchpad/watch-cloud.sh`; write it again from "The cloud watcher"
     below if the scratchpad was cleared);
   - `scripts/watch-ci.sh` over `main` and the open PRs, while anything is in flight.
6. Start the loop: `/loop` with `/collab-loop [<wave set>]` as the prompt and no interval. Monitor
   events and agent completions wake it; `ScheduleWakeup` at 1200 to 1800 s is the fallback.

## One tick

Run these in order, every wake. Each step is a no-op when the state already has its result.

**A tick that ends while anything runs arms its wake first.** It re-arms each expired Monitor and
calls `ScheduleWakeup` (1200 to 1800 s) as the fallback. On 2026-11-18 a turn ended with "when
the batch check ends, I push", no wakeup and three expired Monitors: the loop stood still for
2 h 56 min and the five workers idled for 3 h 58 min.

1. **State.** `collab-loop.sh state --base <batch>` and `collab-loop.sh load`.
2. **Setup.** A worker with `setup needed` gets "Bring a worker up to date" now. It takes no task
   until its setup branch exists.
3. **Land.** For each worker whose status is `done` and `landed` is `no`: `collab-loop.sh fetch
   <codename> <row>` and read the diff and the report in the tip's body. Then hand the row to the
   integrator ("The integrator", below) and sign what it returns. With no integrator session, or
   for one row that touches no shared file, squash it here onto the batch worktree without
   `.collab/`, one commit per row with the why in its body:
   ```bash
   git -C <batch-worktree> merge --squash --no-commit refs/remotes/cloud-<codename>/claude/<codename>-<row>
   git -C <batch-worktree> reset -q -- .collab; git -C <batch-worktree> checkout -- .collab 2>/dev/null
   ```
   The commit uses this session's own trailers, never the worker's `Claude-Session`. Then the
   content proof: `git diff <cloud-ref> <batch> -- <its files>` is empty. A `wip` tip is not
   landed. A `not-done` tip is read: give the cause to the next task, or move the row to the
   laptop when the cause is in the laptop column.
4. **Re-sync.** After a landing, push the batch to every worker that will build on it next:
   `collab-loop.sh sync <codename> <batch>` (fast-forward only). When the worker's copy of the
   batch has moved, push the new head under a new name, `claude/<batch>-<sha7>`, and name that as
   the base; never force-push a work repository.
5. **Dispatch.** Keep every worker busy: a worker that pushes `done` gets its next task in the
   same tick, before any landing that can wait. Worker use was 12.1% when tasks waited on the
   coordinator (2026-11-18). For each idle worker (status `idle`, or its last task `done` and
   landed), take the next item in this order and send it as a task:
   1. a gate of a batch that is about to be pushed (see "Gates in the cloud");
   2. a red CI job's fix on the batch;
   3. the next machine-only row of the wave in board order whose files no running task touches;
   4. a review of a landed row by a worker that did not build it.
   Send each task twice: `new-cloud-session.sh post <codename> <task-file>` (the record), then
   `SendMessage` to the worker's peer name with a short wake that names the file (`git show
   origin/collab:.collab/<codename>.md`). The task text is in "The task message" below.
   **Post a queue, never one task.** A worker's file holds its next two tasks or more ("The
   queue", below), so a finished task never waits for a tick.
6. **Stale.** A worker that is `stale` (no push 60 minutes after its task, `COLLAB_STALE_MINUTES`)
   gets one `SendMessage`: "Push what you have with Collab-Status: wip, then carry on." A worker
   still stale after a second interval loses the task: post it to another worker, and name the
   stale worker to the operator with its claude.ai/code session (Chrome shows it in the operator's
   Claude tab group; read only).
7. **Local.** Run only what is in the laptop column, one heavy command at a time, behind one lock
   and with the Mac held awake: `lockf -k /tmp/submit-heavy.lock caffeinate -i <command>`. Before
   one, read `collab-loop.sh load`. When the load is over 16 or `CPU_Speed_Limit` is under 100,
   send the command to a worker if it can run there, or wait for the load. Four heavy jobs at once
   took the load to 177 and the CPU limit to 20, and 34 tests failed on timeouts (2026-11-18).
8. **Push and merge.** As in `/iterate`: the batch gets one push after its gates pass in the
   cloud, then `/watch`, the ci proofs, `/auto-merge`, `/watch` over `main`, the prod proofs.
9. **Board.** When a wave lands or a PR merges, `/board` with its write-back, then `/unblock`,
   `/clear-ready` and `/compact-ready`.

## Gates in the cloud

`scripts/batch-check.sh` runs every gate serially on one machine. Split it across workers
instead, all on the same batch head, so the gates run in parallel and the laptop runs none:

| Worker task | Gates |
|---|---|
| `gate-unit` | `npm run bundle`, `npm test`, `cd mcp && npm test` |
| `gate-java` | `./mvnw clean verify` |
| `gate-browser` | `npm run test:browser` |
| `gate-lint` | Prettier, Spotless, the two ESLint ratchets, ESLint on added files (the commands in `scripts/batch-check.sh`) |
| `gate-sim` | `npm run test:<suite>Behaviour-simulator` for each suite the batch touches, serially |

The docker build stays on the laptop (`scripts/batch-check.sh`'s docker gate alone, 29 s) or is
left to the CI deploy. Each is a task with `base: <batch>`, no code change, and the gate output in the tip's body. A gate
task's branch is `claude/<codename>-gate-<name>-<sha7>`, so a second run on a new head is a new
task. The batch is gated when every gate task on its head is `done` with no failure. A failed gate
gets its fix as a task on the batch, then the gates run again on the new head.

## The queue

A task file holds several tasks, in order, each in the form of "The task message", separated by a
line `---`. The worker does them in order and starts the next when it has pushed the last (the
`collaborate` skill, "The task message"). Each task has its own branch. In a chain, the base of a
task is the worker's own branch of the task before it (`claude/<codename>-<row>`), so the chain
needs no landing between its rows.

- Keep two tasks or more in every builder's file. When a worker pushes `done`, append to its queue
  in the same tick; do not replace a task that it has started.
- Give a chain to one worker (the DUE rows, the report rows, one family of forms). Give rows with
  no shared source file to different workers.
- Rows that share only registry files (`i18n/cy.toml`, the catalogue, `app/bin/server.js`, the Java
  names classes, the counts in `infra/test/java`) run in parallel on different workers. Each brief
  says: append your entries, keep a count change in its own commit, and name each count as
  "from -> to". The integrator merges the registries by union and recounts.
- A worker's report body stays under 60 lines. Longer detail goes in `docs-out/<task>.md` on its
  branch, which never lands.

## The integrator

One worker holds the wave branch and nothing else. It builds no row.

1. The coordinator pushes each `done` row to the integrator's repository under a wave name
   (`git branch -f claude/<set>-<row> <fetched ref>`, then `collab-loop.sh sync <integrator>
   claude/<set>-<row>`) and appends one task to its queue: `task: integrate-<row>`, `base:` its own
   branch of the integration before it (the first one names the wave branch).
2. For each row the integrator merges the row's branch onto its integration branch with one merge
   commit (`git merge --no-ff`), without `.collab/`. It resolves a conflict in a registry file by
   keeping both sides, and in a generated file by rebuilding it (`npm run build:welsh`,
   `npm run scripts:table`, `npm run capabilities:generate`, `npm run build:static-content`,
   `npm run fixtures:ixds`, the OpenAPI file by `./mvnw package`). A conflict in any other file it
   resolves only when both sides' tests then pass; otherwise it pushes `not-done` and names the two
   rows. It sets each count in `infra/test/java` from the run, and names it "from -> to".
3. A merge of one wave into the next (`integrate-wave-<n>`) is the same task with a wave branch as
   the row.
4. **The rolling gate.** When its queue is empty, the integrator runs the whole gate on its
   newest head: the merge checks and gates of `scripts/batch-check.sh` without the docker build, the
   Welsh proof, and the simulator suites that the wave touches. It fixes a break by the set as its
   own commit. With idle workers, split the gate across them ("Gates in the cloud") on the
   integrator's head, and split all 42 simulator suites across every free worker for the set's
   final gate.
5. **The laptop signs.** For each merge commit of the integrator's branch, in order, the
   coordinator reads the conflict notes, proves the row's content
   (`git diff <row ref> <merge commit> -- <the row's own files>` is empty, or each difference is a
   named registry or generated file), and makes the landing commit from that commit's tree, with
   this session's trailers and the row's why in its body:
   ```bash
   c=$(git commit-tree -S "<merge commit>^{tree}" -p <wave head> -m "<message>")
   git -C <wave-worktree> merge --ff-only "$c"
   ```
   The wave branch then equals the integrator's tree, commit for commit, and the gate that the
   integrator ran on that tree is the wave's gate.
6. A change that the laptop makes on a wave branch itself (a landing by hand, a fix) goes to the
   integrator before its next task: push the wave head under a new name and name it as the base.

## Test-service filings from a worker

A filing on a test service needs only ci's credentials: the Companies House test submissions of a
new form type, the revised accounts cases, an HMRC sandbox proof. Run `new-cloud-session.sh creds
<codename>` when the task is sent, tell the worker to load the credentials, and ask for each
submission number and response in the report. The operator's approval of the filings is on the
row before the task is sent. The laptop writes the numbers under
`../private.diyaccounting.co.uk/`. A filing or a proof on prod stays on the laptop.

## Bring a worker up to date

A worker loads `CLAUDE.md` and `.claude/skills` when its session starts and runs the environment's
setup script once. When `collab-loop.sh setup-needed <codename>` names a changed file, the worker
runs an older skill or setup. Do these in order:

1. `collab-loop.sh sync <codename>`, so its `main` is the current one.
2. `SendMessage` to the worker: `/reload-plugins` then, as a separate message, `/reload-skills`.
   A cloud session may take these as text and not as commands; step 3 does the work either way.
3. Post and send the task `setup-<sha7>` (sha7 of `origin/main`) with this brief:
   - `git fetch origin main` and `git switch -c claude/<codename>-setup-<sha7> origin/main`, so the
     working tree holds the current skills and `CLAUDE.md`.
   - Read `.claude/skills/collaborate/SKILL.md` and `CLAUDE.md` again from the working tree. They
     replace the copies loaded at the start of the session.
   - When `.claude/skills/new-cloud-session/environment-setup.sh` changed since the last setup,
     run it: `sudo bash .claude/skills/new-cloud-session/environment-setup.sh` (or without `sudo`
     as root).
   - Run the checks of the collaborate skill's "At the start" and put their output in the body.
   - Commit with `--allow-empty` and `Collab-Status: done`, and push.
4. The worker is current when its setup branch exists with `done`. A `not-done` names what the
   VM lacks; when a session restart is the fix, print the `/new-cloud-session <codename>` command
   for the operator.

Every task message also starts with the reload line (below), so a worker that missed a change
still reads the current skill before it builds.

## The task message

```
task: <row id, or gate-<name>-<sha7>, or setup-<sha7>>
base: <branch in the work repository>
brief: First run `git fetch origin main <base>` and read .claude/skills/collaborate/SKILL.md from origin/main; it replaces your loaded copy. Then: <what to build, with file:line evidence, or "the NEXT.md row <id> on main">
gates: <one command a line>
report: the last commit body by the collaborate skill, with Collab-Status: done|wip|not-done
```

The brief carries everything a local sub-agent's brief would: the evidence, the files, the
licence-header rule, the comment and test-name rules, and that the worker never edits `NEXT.md`
or a plan. A task that needs AWS says "load AWS credentials", after
`new-cloud-session.sh creds <codename>` has pushed them.

## The cloud watcher

```bash
#!/bin/bash
# One line per new or moved claude/* tip in the work repositories.
d=$(mktemp -d)
snap() { for c in $(grep -v '^#' .claude/skills/new-cloud-session/pool.txt | awk 'NF{print $1}'); do
  git ls-remote "https://github.com/diy-accounting-uk/submit-cloud-$c.git" 'refs/heads/claude/*' 2>/dev/null |
    sed "s|refs/heads/||; s|^|$c |"; done | sort; }
snap > "$d/old"
while true; do
  sleep 90; snap > "$d/new"; [ -s "$d/new" ] || continue
  comm -13 "$d/old" "$d/new" | awk '{print $1, $3, substr($2,1,9)}'; mv "$d/new" "$d/old"
done
```

Run it as a Monitor with the 30-minute maximum from the repository root, and arm it again on each
expiry while any worker has a task. It is the fallback for the relay.

## The relay

`ci-env-CollabRelayStack` (CW2 in `../private.diyaccounting.co.uk/engineering/submit/archive/PLAN_CLOUD_COLLABORATION.md`) carries one signed, encrypted
line from a worker to the coordinator: `<branch> <sha> <done|not-done|wip>`. The collaborate skill
sends it after each push when `collab` holds `.collab/relay`. Proved 2026-11-19: anvil's message
arrived 9 s after its push.

- Register a worker once per key: `new-cloud-session.sh relay-register <codename>`. A new session
  makes a new key, so register again after a restart.
- Connect: a Monitor with `ws: {url: <relay-url>}`. On connect the relay sends every stored,
  unacknowledged message, so a restart loses nothing.
- A message event is a wake signal. Its frame may arrive truncated in the event, so do not decrypt
  it there: run the tick, which reads the state from git. Then acknowledge the message id:
  `new-cloud-session.sh relay-ack <id>...`, so the next connection does not resend it.
- `ping` frames carry nothing.

## Rules

- `/iterate`'s rules hold, and so do the `CLAUDE.md` rules on merges, removals, AWS writes and
  prose.
- The coordinator dispatches and never builds a row in the main session. Under this skill a
  local sub-agent is the exception, used only for work in the laptop column.
- Never give a worker prod credentials, a customer identifier or a security finding.
- Never force-push a work repository. A refused sync is read, never overridden.
- A worker's own commit never lands as it is: the landing commit is made here, with this
  session's trailers and the operator's signature. The tree of a landing commit may be the
  integrator's, after the content proof.
- `.collab/` files never land on the batch.
- Name a worker by its code name in prose, never by a session id.

## Report

Each tick that changed something ends with one line per worker (code name, task, status), the
batch head and its gate state, the laptop's load line, and what the next tick does.
