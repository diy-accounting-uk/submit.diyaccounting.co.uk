---
name: auto-merge
description: Catalogue worktrees, branches, uncommitted work, PRs and review threads; render the state; merge every PR that is genuinely ready; then hand over to /watch. Invoke when the operator says "auto-merge", "merge what's ready", or asks for the merge state of the repository.
---

<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# auto-merge

Gather the whole picture, show it, merge only what is unambiguously ready, and hand the result to
`/watch`.

**This skill is the only path by which Claude merges a pull request.** `CLAUDE.md` forbids a bare
`gh pr merge` anywhere else, however green the checks look, because the gates below are the point: a
merge is the one action in this repository that a later commit cannot undo. Nothing merges here that
has not passed all of them. The skill never pushes to `main` directly, never deletes an origin
branch, and never rewrites history.

That also means a gate you cannot satisfy is a stop, not an obstacle to route around. If a PR is
ready in every way except one the skill cannot check, say so and leave it to the operator rather
than merging it by hand outside the skill.

## Dry-run mode

`/auto-merge-dry-run` runs this skill with every mutating step suppressed. In dry-run:

- no merge, no commit, no push, no rebase, no branch deletion, no worktree removal
- no write to any file tracked in source control, including `NEXT.md`
- no PR comment, no review, no label, no issue change
- `/watch` is not invoked

Everything else is identical: the same gathering, the same tables, the same verdicts. Where the live
run would act, print the exact command it would have run, in a fenced block prefixed with `!`, and
mark the row **would merge** rather than **merged**. Say in the first line of the output that this is
a dry run, because the tables are otherwise indistinguishable.

## Part 1 — gather

Read, do not assume. Every fact below has misled someone in this repository at least once.

```bash
git fetch --prune origin
git worktree list
git branch -vv
git branch -r
gh pr list --state open --json number,title,headRefName,headRefOid,isDraft,mergeable,mergeStateStatus
```

For each PR from that read, check whether its head changes only `.md` files
(`git diff --name-only origin/main...origin/<headRef>`) and whether any required context is
missing (`gh api repos/diy-accounting-uk/submit.diyaccounting.co.uk/commits/<headRefOid>/check-runs
--jq '.check_runs[].name'` against the ruleset's required list,
`gh api repos/diy-accounting-uk/submit.diyaccounting.co.uk/rulesets/16057564 --jq
'.rules[] | select(.type=="required_status_checks") | .parameters.required_status_checks[].context'`).
A Markdown-only head skips `test.yml` and `codeql.yml` by their `paths-ignore`, so their required
contexts never run on their own. `Check commit signatures` comes from `verify-commit-signatures.yml`
on `pull_request`, which always runs and needs no dispatch. When `npm test`, `maven test`, `eslint`
or `CodeQL` is missing on a Markdown-only head, dispatch the workflow that carries it and wait:

```bash
gh workflow run test.yml --ref <headRef>
gh workflow run codeql.yml --ref <headRef>
```

Then re-read the check runs on a sleep loop, in one Bash call, until every required context has a
conclusion:

```bash
for i in $(seq 1 20); do
  sleep 15
  gh api repos/diy-accounting-uk/submit.diyaccounting.co.uk/commits/<headRefOid>/check-runs \
    --jq '.check_runs[] | "\(.name) \(.status) \(.conclusion)"'
done
```

For each worktree, `git status --short` **inside it**. Uncommitted work in a worktree is real work
and it vanishes when the worktree goes.

For each local branch, whether it is ahead of its remote: `git log --oneline origin/<b>..<b>`. A
branch ahead of origin means the PR would merge something older than what exists locally — that is
the "lost commits" case and it blocks the merge.

For each open PR, its review state. Both halves matter:

```bash
gh pr view <n> --json reviews,reviewDecision
gh api graphql -f query='{repository(owner:"diy-accounting-uk",name:"submit.diyaccounting.co.uk"){pullRequest(number:N){reviewThreads(first:100){nodes{isResolved isOutdated comments(first:1){nodes{author{login} body path}}}}}}}'
```

A `CHANGES_REQUESTED` review blocks. An unresolved review thread blocks. An outdated-but-unresolved
thread still blocks — it was about code that moved, and nobody has said it is handled.

Also check local `main` for unpushed commits. Twice in one session an agent committed to the main
checkout by mistake, and a commit sitting there is invisible to every PR.

## Part 2 — the inventory table

Render this before doing anything, so the operator sees the ground truth even if nothing merges.

| PR | Branch | Worktree | Uncommitted | Ahead of origin | Draft | Review state | Mergeable |
|---|---|---|---|---|---|---|---|

One row per open PR, then rows for branches and worktrees with no PR, so nothing is invisible.
A worktree holding uncommitted work with no PR is exactly the thing that gets lost.

## Part 3 — eligibility

A PR is eligible for the workflow check only when **all** of these hold:

1. Not a draft.
2. No `CHANGES_REQUESTED` review and no unresolved review thread.
3. Its head branch has no uncommitted changes in any worktree checked out to it.
4. Its head branch is not ahead of origin — what is on the remote is what will merge.
5. `mergeable` is not `CONFLICTING`.
6. The PR's head SHA equals the branch tip on origin. A merge takes the head it was last updated
   against; anything pushed after that is left behind, and this batch has lost commits that way.

Say which gate stopped each ineligible PR. "Not ready" without a reason is useless to the operator.

## Part 4 — the workflow check

For each eligible PR, list the **distinct workflows that have run against its head SHA from push or
pull_request events**, and take the latest run of each:

```bash
gh run list --branch <headRef> --limit 60 --json headSha,workflowName,status,conclusion,databaseId,event \
  | jq 'map(select(.event == "push" or .event == "pull_request"))'
```

Filter to the head SHA, filter to push or pull_request events, group by `workflowName`, keep the newest per group.

**Only push and pull_request events gate the merge.** Workflow dispatch runs (manual or automatic video
capture), scheduled runs, and issue-triggered runs are not checks on the PR and do not prevent a merge.
This prevents hand-dispatched recordings or maintenance workflows from incorrectly blocking ready PRs.

Merge only when every one of those latest runs has `conclusion == "success"`.

Four readings that are not failures, and one that is not a pass:

- **`cancelled` is usually a supersession.** Check for a later run of the same workflow on the same
  SHA. If one exists and succeeded, the cancellation is noise. If none does, the workflow did not
  run and that blocks.
- **`skipped` is not a pass.** A workflow that skipped produced no evidence. Treat it as "no run"
  and say so rather than counting it green.
- **A workflow with no run at all may be correct** — `paths:` filters mean a commit can legitimately
  trigger nothing. But a change that should have triggered a workflow and did not means the filter
  is the bug, not the run. Name any workflow you expected and did not see.
- **Still running blocks.** Report it as running, not as a failure, and do not merge.
- **An empty result set is not a pass.** If the head SHA has no runs at all, that is NO DATA, not
  green. Count the rows before interpreting them. Runs take a minute to register after a push, so a
  freshly pushed head with nothing against it means "too early", not "ready".

Never read a PR's state from `gh pr checks` alone, and never from memory. Open the runs.

## Part 5 — merge

Merge one PR at a time, and **wait for its merge to land before merging the next**. Two merges in
quick succession start two deploys of the same environment; the concurrency group drops one and the
second PR's code reaches nothing.

Before merging, check that no deploy is in flight on `main`:

```bash
gh run list --branch main --limit 6 --json status,workflowName --jq '.[] | select(.status != "completed")'
```

A merge starts a deploy. Starting one while another is mid-stack-creation is how infrastructure ends
up part-applied.

Default to `--squash` for a branch of small fixes and `--merge` for a batch whose commit history is
worth keeping. State which you chose and why; if unsure, say so and use `--merge`, because history
can be squashed later and cannot be recovered.

```
! gh pr merge <n> --merge
```

**Then verify the merge actually happened**, because a reported merge has been wrong here:

```bash
gh api repos/diy-accounting-uk/submit.diyaccounting.co.uk/pulls/<n> --jq '"merged=\(.merged) head=\(.head.sha[0:8]) mergeCommit=\(.merge_commit_sha[0:8])"'
git log --oneline origin/main..origin/<headRef>
```

The second command must be empty. Anything it lists was left behind by the merge and goes into the
next batch immediately.

After a verified merge: update local `main`, then list the branch's worktree, its local branch
and its origin branch for the operator in Part 7 as one fenced `!` command; removal of all three is
denied to the session in this environment, and none of them blocks anything.

**Then look at the other open PRs, and leave them alone unless they need a rebase.** A rebase
restarts the branch's whole deploy, and several at once contend for the ci apex alias and the
shared test users; `main`'s own deploy is the integration proof and rolls the apex back when a
probe fails. For each remaining open PR, in the order they will merge:

1. Read `mergeable` again and intersect its changed files with the merged PR's
   (`git diff --name-only origin/main~1..origin/main` against `git diff --name-only
   origin/main...origin/<headRef>`). Empty intersection and not `CONFLICTING`: it merges as it
   stands on its next turn, no rebase. Record `left as is` in Part 6.
2. File intersection misses a gate the merged PR made stricter, because a stricter gate reaches
   every file, not just the ones the merged PR touched. Check for one:
   `git diff origin/main~1 origin/main -- .github/workflows/test.yml` for a new or changed job or
   step running prettier, eslint, or spotless, or adding or raising a coverage threshold; `git diff
   origin/main~1 origin/main -- vitest.config.js` for a changed `coverage.thresholds` value. Read
   `.github/workflows/test.yml` for the command each gate runs today — currently `npx prettier
   --check .` (job `lint-js`, step "Check formatting (Prettier)"), `./mvnw spotless:check` (job
   `lint-js`, step "Check formatting (Spotless)"), `npx eslint . --format json` compared against
   `.eslint-baseline.json` (job `lint-js`, step "Ratchet the repository-wide error count"), and
   `npm run test:coverage` for the `vitest.config.js` thresholds (job `npm-unit-test`).
   For each gate the merged PR added or changed, and each remaining candidate: build a scratch
   worktree on the candidate's head merged with the new `main`, then run the gate's command in it.
   ```bash
   git worktree add --detach <tmp> origin/<headRef>
   git -C <tmp> merge --no-edit origin/main
   ```
   Run the gate's command with `<tmp>` as the working directory. A red result: report `gate <name>
   red on #<n>` in Part 6 and Part 7, leave the PR open, and hand its fix to a sub-agent — never
   fix it inside this skill. Put `<tmp>` under `/tmp` or the session's scratchpad; its removal is
   the operator's like every other worktree here, so list it in Part 7's removal block.
3. Conflicting, or overlapping files: rebase locally first. In its worktree (or a fresh
   `git worktree add`), `git fetch origin && git rebase origin/main`, then run the change's blast
   radius there. A conflict aborts the rebase (`git rebase --abort`) and is reported in Part 7 as
   work for a sub-agent; never resolve it inside this skill.
4. Push the rebase with `git push --force-with-lease origin <headRef>` only when no deploy run on
   that branch is in flight (`gh run list --branch <headRef>` shows nothing `in_progress` or
   `queued` for a deploy workflow); otherwise leave the local rebase in place and report it as
   pending the branch's deploy. The lease refuses the push if the branch moved underneath; that
   too is reported, never forced.

Skip any branch with uncommitted work in a worktree or commits ahead of origin, and say so in
Part 7. In dry-run mode print the commands per branch — the gate check's scratch worktree
included — without running them, and mark the row **would rebase**, **would check gates**, or
**left as is**.

## Part 6 — the result table

One row per PR touched this run, including any just merged.

| PR | Branch | Workflows (latest per workflow) | Worktree | Check result | Action |
|---|---|---|---|---|---|

`Check result` is exactly `ready` or `blocking`, and when blocking it names the gate. The last column
is the action taken, or recommended when nothing was taken. A remaining open PR shows `left as is`,
`rebased onto <sha>`, `rebase pending: deploy in flight`, `rebase skipped: <reason>`, or `gate <name>
red on #<n>` here. End the table with a summary row giving the overall action for the run.

## Part 7 — next actions

Two short lists, no padding:

- **Operator**: what needs a human. Merges that were blocked by a review, an origin branch to delete,
  a decision the skill cannot make. Print every command in full, prefixed with `!`.
- **Agent**: what this session does next. Orphaned commits to fold into a batch, uncommitted worktree
  work to rescue, a workflow that should have run and did not.

Say plainly when a list is empty. An absent list reads as an oversight.

## Part 8 — hand over

**If any PR merged, invoke `/watch`.** The merge starts a deploy of `main`, and the post-merge run is
where a batch's real problems surface — a deploy that a branch build never exercised. Do not declare
the run finished at the merge; the merge is the middle of it.

If nothing merged, say so and do not arm a watch.
