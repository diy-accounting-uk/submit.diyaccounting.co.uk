---
name: watch
description: Arm a background Monitor over this repository's GitHub CI, then act on what it reports until the whole scope is green. Invoke when the operator says "watch the builds", "keep it green", or hands over a branch to get through CI.
---

<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# watch

This skill is a brief for one background monitor. Arm it, keep working, and act on the events it
sends. The watch ends on evidence, never on elapsed time and never on a check summary.

**Use the `Monitor` tool, `persistent: true`.** It runs the poll loop detached and turns each
stdout line into a notification, so the session stays free while CI runs. Do not write a foreground
poll loop: it occupies the session for the length of a build, which is the thing this skill exists
to avoid. Do not write a `sleep N; check` task that has to be re-armed by hand either. The monitor
re-arms itself and exits when the run is terminal.

For a single "tell me when it finishes", `Bash` with `run_in_background: true` and a command that
exits on the condition is lighter: one notification, no filter to get wrong.

## Scope

**main, plus the head branch of every open pull request**, re-read each cycle:

```bash
{ echo main; gh pr list --state open --limit 50 --json headRefName --jq '.[].headRefName'; } | sort -u
```

A PR merging or opening changes the scope, and picking that up is this skill's job.

## The monitor's brief

Poll every 60-90s. Emit the reds as they land, then one tally when everything is terminal.

- **Cover every terminal state**: failure, cancelled, timed out. A filter tuned to the happy path
  is silent through a crash, and silence reads exactly like still running. Ask before arming: if
  this went red right now, would anything be emitted?
- **Keep the volume low.** Every line is a message and a monitor that floods is stopped
  automatically. A PR here carries 70-odd checks, so one line per check is a firehose. Reds plus a
  final tally is selective without going quiet on bad news.
- **Poll the API for state, never grep a log for a word.** `status == "completed"` with its
  `conclusion` is the fact. A log line saying "passed" is not.
- **Seed silently**: on the first pass record what has already finished without emitting it, so the
  monitor reports changes rather than history.
- **An empty result set is not a pass.** A branch that does not exist, a filter matching nothing,
  and a `jq` asking for a field the `--json` list did not request all return nothing with exit 0,
  which reads like a clean run. Count rows before interpreting them and report NO DATA when it is
  zero. Give up loudly after a few empty cycles rather than sitting there looking healthy.
- Let a failed `gh` call skip the cycle rather than kill the loop.
- **Probe merge-readiness every cycle.** A watch that only reports reds leaves a PR sitting green
  for however long nobody looks. Each poll, for every open PR that is not a draft, take the **latest
  run of each distinct workflow on its branch** and call the PR ready when **none of those latest
  runs is still incomplete, and none of them failed**:

      gh run list --branch <headRef> --limit 60 --json workflowName,status,conclusion,databaseId \
        | jq 'group_by(.workflowName) | map(max_by(.databaseId))'

  Incomplete is `queued` or `in_progress`. Failed is `failure`, `timed_out` or `action_required`.
  Anything else — `success`, and also `skipped`, `cancelled` or `neutral` — does not hold the PR
  back, because a workflow can legitimately skip under a `paths:` filter and a cancelled run is
  usually a supersession. Requiring a literal `success` from every workflow that has ever touched
  the branch would leave a PR never ready for reasons that are not defects.

  A shell loop cannot invoke a skill, so the probe's job is only to notice and say so: emit
  `MERGEABLE #<n> <branch>` and let the agent decide. Emit it once per PR per readiness, not every
  cycle, or a ready PR floods the channel until someone merges it.

## When a mergeable PR appears

**Run `/auto-merge`.** Do not merge by hand: that skill is the only sanctioned path and it re-checks
every gate properly, including the ones a shell probe cannot see — uncommitted work in the branch's
worktree, a branch ahead of origin, a PR head that no longer equals the branch tip.

The probe is a hint, not a verdict. It can be wrong in both directions: green checks on a stale head
look ready and are not, and a PR whose runs have not registered yet looks unready and merely is
early. `/auto-merge` is what settles it.

If `/auto-merge` merges anything, the scope changes — the PR's branch leaves it and `main` gains a
deploy. Re-read the scope on the next cycle rather than carrying the old one.

## When a red arrives

**Gather the whole run's failures before fixing anything.** One run's worth, diagnosed together,
fixed together, pushed once. Thirteen behaviour tests behind one failed `deploy api` are one
failure. A run that delegates to another inherits its failure, so check whether two red runs are
one cause.

Open the run; never report its state from memory or from `gh pr checks`.

```bash
gh run view <run-id> --json jobs \
  --jq '.jobs[]|select(.conclusion=="failure")|.steps[]|select(.conclusion=="failure")|[.number,.name]|@tsv'
```

`gh run view --log-failed` often returns nothing useful when the failure is buried in a step's
output. Fetch the job log directly, strip the ANSI codes, and tee before filtering:

```bash
gh api "repos/<owner>/<repo>/actions/jobs/<job-id>/logs" --allow-escape-sequences \
  | sed 's/\x1b\[[0-9;]*m//g' | tee /tmp/job.log | grep -iE "error|fail|✘" | tail -20
```

**Three reds that are not defects.** A cancelled run is usually a supersession, so check for a
later run in the same group. A commit can legitimately trigger nothing under a `paths:` filter, and
"no run for this commit" is a distinct state from "run failed" — though a change that should have
triggered a workflow and did not means the filter is the bug. And with `cancel-in-progress: false`
GitHub keeps one run queued per group and drops the older pending one when a third arrives, so a
deploy can silently never happen.

**Fix the right layer.** If a test asserts something the product genuinely does wrong, fix the
product. Name the layer you fixed, not the symptom you saw: a fix that moves the failure from step
7 to step 10 worked, and a second layer was behind it.

**Check what changed underneath you.** Another repository's `main`, a live endpoint, an upstream
action. The repository is not the only variable.

## Push discipline

**Never push to a branch while any of that branch's deploy runs are in flight.** This repository
has more than one, so check each. Confirm by reading the runs, not by assuming elapsed time. A
cancelled deploy mid-change leaves infrastructure part-applied, which costs more than the wait.

Verification that mirrors the gate matters as much: a YAML parse is not what CI runs. The
`validate workflow syntax` job runs actionlint with a specific ignore list, so run that same
command before pushing a workflow change.

## Stop condition

All at once, each verified by reading:

1. Every open PR's required checks pass.
2. main's workflows are green on its latest commit **that runs them** — enumerate the real
   workflows with `gh workflow list` rather than assuming a set, and say which commit you judged
   against when the latest one triggers nothing.
3. No run queued or in progress on any branch in scope, established by counting rows.

A green PR whose deploy has not started is not done.

If blocked by something only the operator can do, say so in one line, name it, show the whole
command, and keep the monitor running. A block on one branch does not stop the watch.
