<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN: cloud sessions as workers for the local coordinator

A plan of options, not a board. Nothing here is boarded or tried yet. A part moves to `NEXT.md`
only when the operator boards it.

## Operator assertions (verbatim, 2026-11-17)

> Please look into how Claude Code Web could be used to offload processing and who pays for the compute it uses?

> We give it a fork

> I can human login to n web claude sessions in different tabs, then ask those claudes to contact you as the supervisor for a task on a loop where it completes work and asks for another task, if no answer sleep or set a wakeup or schedule and poll again, you can then hand board tasks to a clade code in web and pull down a commit from the fork. How do we give the cloud session guidance (it's own CLAUDE.md and a skill (which could be in this repo) to /collaborate with <some way to contact you> that includes the poll loop). Web have our own Inbox protocol but it requires a common filesystem, could we use an s3 bucket? Or if there another gheto messaging system we can use small storage in the claude.ai account? Can we run playwright?

> Put all this in a PLAN_*.md doc we might do stuff we don't board or try let.

> Please create it as submit-cloud-<something from a codename file> we we will have 1 fork per cloude session.

## Status

Researched 2026-11-17. The first work repository, `diy-accounting-uk/submit-cloud-anvil`, exists with Actions off. The `/new-cloud-session` and `/collaborate` skills are written; steps 3 to 5, 7 to 9 and the first trial are not started.

## The goal

The laptop is the coordinator. It runs out of CPU when many local agents and a one-hour gate run
at once (load average up to 200 on 16 cores, `CPU_Speed_Limit` 20, on 2026-11-17). Cloud sessions
add compute that the plan already pays for. Each works in its own repository, `submit-cloud-<codename>`, so a push never starts the org's
paid ci deployment. The coordinator lands their commits locally and makes the set's one push, as
it does with local worktrees.

## What a cloud session is

From the Claude Code documentation, read on 2026-11-17 (pages carry no date):

- Each session gets a fresh Ubuntu 24.04 x86_64 VM: about 4 vCPU, 16 GB RAM, 30 GB disk.
- Installed: Node 22, OpenJDK 21 with Maven and Gradle, Python, Docker, PostgreSQL, Redis, Chrome
  for Testing at `/usr/bin/google-chrome` (`CHROME_PATH`), git, gh, jq.
- A foreground command runs 10 minutes at most, then up to 30 minutes in the background.
  `BASH_DEFAULT_TIMEOUT_MS` and `BASH_MAX_TIMEOUT_MS` on the environment raise both.
- An idle VM pauses after a few minutes and can be reclaimed. A reclaim loses running commands and
  uncommitted work.
- A setup script's filesystem is cached as a snapshot when the script ends in about 5 minutes.
- Network: None, Limited (the default) or Full. Limited allows npm, Maven Central, Docker Hub,
  nodejs.org and `*.amazonaws.com`, and not the Playwright browser download.
- AWS SSO is not supported. A network secret is injected only as bearer, token or basic auth, so
  AWS request signing (SigV4) cannot use it.
- The repository's `CLAUDE.md` and `.claude/skills` load in a single-repository session. The
  user's `~/.claude/` does not.
- The GitHub proxy rejects branch deletes and tag pushes, and does not limit which branches a push
  updates. GraphQL is blocked, so `gh pr` fails and `gh api` REST calls work.
- Parallel sessions use rate limits in proportion. There is no fixed cap on sessions.

## Who pays

The VM costs nothing extra on Pro, Max, Ultra and Team. A session's tokens count against the same
plan limits as the CLI. Enterprise bills usage at API rates. The Free plan has no cloud sessions.

| Plan | Price a month | Limit |
| --- | --- | --- |
| Pro | $20 | 1x |
| Max | $100 | 5x Pro |
| Ultra | $200 | 10x Pro weekly, no 5-hour window |
| Team Standard / Premium | $25 / $125 | per seat; Premium 5x Standard |
| Enterprise | $20 a seat | usage at API rates |

The operator's plan is Ultra (operator, 2026-11-17): about 10 workers at today's token use per batch. Ultra fits many parallel workers best. A worker that waits on a test run uses few tokens.

## What can move to the cloud

| Work | Moves | Setup it needs |
| --- | --- | --- |
| `npm test` (Vitest) | yes | Node 24 (the repository's `engines`), installed in the setup script |
| `./mvnw clean verify` | yes | JDK 25 (the pom's target); source of the download not checked |
| Playwright browser tests | yes | the Playwright download domain allowed and `npx playwright install chromium`, or Playwright pointed at `CHROME_PATH` |
| Docker build | yes, slow | the ARM64 stage runs under emulation |
| Simulator behaviour suites | yes | none: `.env.simulator` needs no AWS |
| Proxy behaviour suites | no | they need AWS Secrets Manager through SSO |
| `deploy:app-ci`, `-ci` and `-prod` tests, Cognito scripts | no | AWS SSO |
| corpus-loom MCP, user-level skills | no | local only |

One VM is slower than the laptop for one gate. The gain is several gates and batches in parallel
off the laptop.

## The work repositories

One repository for each cloud session (operator, 2026-11-17): `diy-accounting-uk/submit-cloud-<codename>`.
The code name comes from `CODENAMES.txt` by the rule of `/do-next` ("Naming the batch"), with its
own sequence: the first repository takes a name from the `a` line, the next from the `b` line, and
so on. The local remote for each is `cloud-<codename>`, and the session's worker name is the same
code name.

Each is a plain public repository in the org, made the way `diya-submit-plugin` was. GitHub does
not allow a fork in the same owner. Each holds `main` as pushed from this repository, and its
Actions are off, so a push to it starts nothing.

| Repository | Created | Actions | Remote |
| --- | --- | --- | --- |
| `diy-accounting-uk/submit-cloud-anvil` | 2026-11-17 | off | `cloud-anvil` (not yet added) |

- The submit OIDC roles trust only `repo:diy-accounting-uk/submit.diyaccounting.co.uk` (and
  `root.diyaccounting.co.uk`), read on 2026-11-17, so a workflow in a work repository cannot
  assume them.
- The org's Actions variables (`ROOT_*`, `GATEWAY_*`, `SPREADSHEETS_*` role ARNs) are visible to
  all org repositories. The trust of those roles in the management, gateway and spreadsheets
  accounts is not yet read. Read it before Actions is ever turned on in a work repository.
- A pull request from a work repository is not needed. Results come back by `git fetch`.

To add a work repository (a session runs 1 to 3, the operator 4 and 5):

1. `gh repo create diy-accounting-uk/submit-cloud-<codename> --public --disable-wiki`
2. `gh api -X PUT repos/diy-accounting-uk/submit-cloud-<codename>/actions/permissions -F enabled=false`,
   before the first push.
3. `git push git@github.com:diy-accounting-uk/submit-cloud-<codename>.git origin/main:refs/heads/main`
4. Add the repository to the Claude app's selected repositories on the org.
5. `git remote add cloud-<codename> git@github.com:diy-accounting-uk/submit-cloud-<codename>.git`

## The channel between the coordinator and a worker

| Direction | Mechanism |
| --- | --- |
| Task down | `SendMessage` from the coordinator to the worker by its session name. `ListAgents` here already lists cloud sessions as peers (2026-11-17). `claude -p "<task>" --cloud <session-id>` also queues a message into a cloud session (documented). |
| Result up | The worker pushes `claude/<codename>-<row>` to its work repository. The last commit's body holds the report: what changed, the commands run with counts, what it did not do. |
| Detect a result | A Monitor here polls `git ls-remote cloud-<codename> 'refs/heads/claude/*'` for each worker every 2 minutes and wakes the coordinator on a new tip. |
| Next task | The worker ends its turn after the push. The next `SendMessage` starts its next turn. |
| Fallback | If a message does not wake an idle worker, the worker runs `/loop` with the skill and reads `.collab/<worker>.md` on a `collab` branch of its work repository each tick. The coordinator pushes that file. |

A cloud session cannot message another session back yet, so the result channel is git.

Rejected for now:
- An S3 bucket. It needs static IAM keys in an environment variable that every user of the
  environment can read, and a new IAM user and secret. Git on the work repositories does the same job.
- A claude.ai artifact with a shared database. This session has the tool; a cloud session's access
  to it is not verified.

## The `/collaborate` skill

`.claude/skills/collaborate/SKILL.md` in this repository, pushed to each work repository with `main`. It holds:

1. The worker's name, the code name of its work repository (`/collaborate anvil`).
2. On a task message: fetch the base branch the message names from its work repository, make
   `claude/<codename>-<row>`, build the row by its brief, run the gates the brief names, commit with
   the report in the body, push to its work repository, end the turn.
3. Never push to `origin` or any repository other than its own work repository. Never push a branch that does not
   start with `claude/`. Never delete a branch.
4. Commit before a long gate. A reclaimed VM loses uncommitted work.
5. The fallback loop of the channel table, used only when a message does not arrive.

## Steps

Steps 3 to 5 are the operator's. Steps 1, 2 and 6 to 9 are a session's.

1. Done 2026-11-17: `submit-cloud-anvil` created by steps 1 to 3 of "To add a work repository".
2. For each further worker: `/new-cloud-session` runs steps 1 to 3 of "To add a work repository" when no pool
   repository is free, and adds the name to `.claude/skills/new-cloud-session/pool.txt`.
3. Install the Claude GitHub app (https://github.com/apps/claude) on the `diy-accounting-uk` org,
   with "Only select repositories" set to the `submit-cloud-*` repositories only. Do not run
   `/web-setup`, because it sends the local `gh` token, which can push to the org repository.
4. Add each work repository's remote: `git remote add cloud-<codename> git@github.com:diy-accounting-uk/submit-cloud-<codename>.git`
5. Done 2026-11-17: the claude.ai/code environment "DIY Accounting Submit" holds `submit-cloud-anvil`, with network Full, the environment variables `BASH_DEFAULT_TIMEOUT_MS=3600000`, `BASH_MAX_TIMEOUT_MS=3600000` and `JAVA_HOME=/opt/jdk25`, and the setup script recorded in `.claude/skills/new-cloud-session/environment-setup.sh`. Each new work repository is added to its Repositories list.
6. Done 2026-11-17: `.claude/skills/collaborate/SKILL.md` (the worker) and
   `.claude/skills/new-cloud-session/SKILL.md` (lease, re-sync, start, watch, release).
7. Before each dispatch: `/new-cloud-session [codename] --base <wave branch>` leases a pool repository, pushes
   `origin/main` and the base to it by URL, starts or links the session, and prints the `watch` command. Start the
   Monitor with it.
8. Land a result whose last commit has `Collab-Status: done`: `git fetch cloud-<codename> claude/<codename>-<row>`, then `git merge --squash` onto the local
   wave branch, one commit per row. The local commit carries the operator's signature, which the
   signature check on `main` needs.
9. The set's one push to `origin` still goes from the local checkout.

## The first trial

One tab, one small row. It proves:

1. A `SendMessage` wakes an idle worker. If not, the fallback loop runs, and whether a scheduled
   wakeup resumes a paused VM is measured.
2. The worker cannot push to the org repository: a scratch branch push to
   `diy-accounting-uk/submit.diyaccounting.co.uk` is rejected.
3. A one-hour test run in the background survives the idle pause.
4. Playwright runs on the VM.
5. How long `batch-check.sh` gates take on 4 vCPU against the laptop.

## Open unknowns

- Whether `claude --cloud` starts a session without a terminal, and honours an `env_` id passed by `--settings`.
  `new-cloud-session.sh` runs it only from a terminal and prints the `claude.ai/code/new` link otherwise.
- A source for JDK 25 that the Limited network allows.
- The Agent tool's `isolation: "remote"` runs locally without saying so
  (anthropics/claude-code issue #101834, open since 2026-10-13). Do not use it for this.

## Sources

- [Use Claude Code in the cloud](https://code.claude.com/docs/en/claude-code-on-the-web)
- [Configure cloud environments](https://code.claude.com/docs/en/cloud-environments)
- [Manage costs](https://code.claude.com/docs/en/costs)
- [Self-hosted environments](https://code.claude.com/docs/en/self-hosted-environments)
- [Claude pricing](https://claude.com/pricing)
- [Issue #101834](https://github.com/anthropics/claude-code/issues/101834)
- [GitHub: events that trigger workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)
