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

## Status

Researched 2026-11-17. The work repository `diy-accounting-uk/submit-cloud` exists (step 1 and 2 done); steps 3 to 9 and the first trial are not started.

## The goal

The laptop is the coordinator. It runs out of CPU when many local agents and a one-hour gate run
at once (load average up to 200 on 16 cores, `CPU_Speed_Limit` 20, on 2026-11-17). Cloud sessions
add compute that the plan already pays for. They work in a separate repository, `submit-cloud`, so a push never starts the org's
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

Ultra fits many parallel workers best. A worker that waits on a test run uses few tokens.

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

## The work repository

`diy-accounting-uk/submit-cloud` is a plain public repository in the org, made the way
`diya-submit-plugin` was (not a GitHub fork, which GitHub does not allow in the same owner). It holds `main` as pushed from this repository. Its
Actions are off, so a push to it starts nothing.

- The submit OIDC roles trust only `repo:diy-accounting-uk/submit.diyaccounting.co.uk` (and
  `root.diyaccounting.co.uk`), read on 2026-11-17, so a workflow in `submit-cloud` cannot assume
  them.
- The org's Actions variables (`ROOT_*`, `GATEWAY_*`, `SPREADSHEETS_*` role ARNs) are visible to
  all org repositories. The trust of those roles in the management, gateway and spreadsheets
  accounts is not yet read. Read it before Actions is ever turned on in `submit-cloud`.
- A pull request from `submit-cloud` is not needed. Results come back by `git fetch`.

## The channel between the coordinator and a worker

| Direction | Mechanism |
| --- | --- |
| Task down | `SendMessage` from the coordinator to the worker by its session name. `ListAgents` here already lists cloud sessions as peers (2026-11-17). |
| Result up | The worker pushes `claude/<worker>-<row>` to `submit-cloud`. The last commit's body holds the report: what changed, the commands run with counts, what it did not do. |
| Detect a result | A Monitor here polls `git ls-remote cloud 'refs/heads/claude/*'` every 2 minutes and wakes the coordinator on a new tip. |
| Next task | The worker ends its turn after the push. The next `SendMessage` starts its next turn. |
| Fallback | If a message does not wake an idle worker, the worker runs `/loop` with the skill and reads `.collab/<worker>.md` on a `collab` branch of `submit-cloud` each tick. The coordinator pushes that file. |

A cloud session cannot message another session back yet, so the result channel is git.

Rejected for now:
- An S3 bucket. It needs static IAM keys in an environment variable that every user of the
  environment can read, and a new IAM user and secret. Git on `submit-cloud` does the same job.
- A claude.ai artifact with a shared database. This session has the tool; a cloud session's access
  to it is not verified.

## The `/collaborate` skill

`.claude/skills/collaborate/SKILL.md` in this repository, synced to `submit-cloud`. It holds:

1. The worker's name, from the skill's argument (`/collaborate worker-1`).
2. On a task message: fetch the base branch the message names from `submit-cloud`, make
   `claude/<worker>-<row>`, build the row by its brief, run the gates the brief names, commit with
   the report in the body, push to `submit-cloud`, end the turn.
3. Never push to `origin` or any repository other than `submit-cloud`. Never push a branch that does not
   start with `claude/`. Never delete a branch.
4. Commit before a long gate. A reclaimed VM loses uncommitted work.
5. The fallback loop of the channel table, used only when a message does not arrive.

## Steps

Steps 3 to 5 are the operator's. Steps 6 to 9 are a session's.

1. Done 2026-11-17: `gh repo create diy-accounting-uk/submit-cloud --public`, then `main` pushed.
2. Done 2026-11-17: Actions off (`gh api -X PUT repos/diy-accounting-uk/submit-cloud/actions/permissions -F enabled=false`).
3. Install the Claude GitHub app (https://github.com/apps/claude) on the `diy-accounting-uk` org,
   with "Only select repositories" set to `submit-cloud` only. Do not run
   `/web-setup`, because it sends the local `gh` token, which can push to the org repository.
4. Add the remote in the local checkout:
   `git remote add cloud git@github.com:diy-accounting-uk/submit-cloud.git`
5. At https://claude.ai/code, create an environment: network Limited plus the Playwright download
   domain; environment variables `BASH_DEFAULT_TIMEOUT_MS=3600000` and
   `BASH_MAX_TIMEOUT_MS=3600000`; a setup script that installs Node 24 and JDK 25 and runs
   `npm ci`.
6. Write `.claude/skills/collaborate/SKILL.md` (a docs commit to `main`).
7. Before each dispatch: `git push cloud origin/main:refs/heads/main` , then push the wave's base branch to
   `cloud`. Start the Monitor on `submit-cloud`'s `claude/*` branches.
8. Land a result: `git fetch cloud claude/<worker>-<row>`, then `git merge --squash` onto the local
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

- Which remote `claude --cloud` clones when `origin` and `cloud` both exist. Until it is known,
  workers start from claude.ai/code on `submit-cloud`, not from `claude --cloud` here.
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
