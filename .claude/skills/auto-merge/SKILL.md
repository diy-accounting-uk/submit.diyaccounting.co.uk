---
name: auto-merge
description: Catalogue worktrees, branches, uncommitted work, PRs and review threads; render the state; merge every PR that is genuinely ready; then hand over to /watch. Invoke when the operator says "auto-merge", "merge what's ready", or asks for the merge state of the repository.
---

<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# auto-merge

Gather the whole picture, show it, merge only what is unambiguously ready, and hand the result to
`/watch`.

**This skill merges pull requests, which `CLAUDE.md` otherwise forbids.** That prohibition holds
everywhere else; invoking this skill is the operator granting the exception, and it extends no
further than a PR that passes every gate below. It never pushes to `main` directly, never deletes an
origin branch, and never rewrites history.

## Dry-run mode

`/auto-merge-dry-run` runs this skill with every mutating step suppressed. In dry-run:

- no merge, no commit, no push, no branch deletion, no worktree removal
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

For each eligible PR, list the **distinct workflows that have run against its head SHA**, and take
the latest run of each:

```bash
gh run list --branch <headRef> --limit 60 --json headSha,workflowName,status,conclusion,databaseId
```

Filter to the head SHA, group by `workflowName`, keep the newest per group.

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

After a verified merge: update local `main`, remove the branch's worktree, and delete the local
branch with `git branch -d` — never `-D`, which hides the case where the branch was not merged after
all. **Never delete an origin branch**; list it for the operator instead.

## Part 6 — the result table

One row per PR touched this run, including any just merged.

| PR | Branch | Workflows (latest per workflow) | Worktree | Check result | Action |
|---|---|---|---|---|---|

`Check result` is exactly `ready` or `blocking`, and when blocking it names the gate. The last column
is the action taken, or recommended when nothing was taken. End the table with a summary row giving
the overall action for the run.

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
