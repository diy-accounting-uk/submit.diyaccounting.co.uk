---
name: clean
description: Find what the workspace repositories have left behind (stale deployments, merged branches, worktrees of merged branches, logs and test artefacts, build output) and what needs attention across the estate (unread inbox messages, open board items, GitHub issues, failing workflows, open pull requests, security alerts, unpushed or uncommitted work, a main behind origin). Remove or close every category the operator agrees to in one go; then, when nothing is in progress, fetch, switch to main and pull in each repository. Invoke when the operator says "clean", "clean up", or "tidy the repo".
---

<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

<!-- @capability DEV-34 Clean up stale deployments and branches
- **Use when:** the operator says clean, clean up, or tidy the repo.
- **Does:** clean gathers leftover state in submit and in every sibling repository of the workspace: stale deployments, merged branches, worktrees, logs, test artefacts and build output. It also gathers what needs attention across the estate: unread inbox messages, open board items, GitHub issues, failing workflows, open pull requests, security alerts, and unpushed or uncommitted work. It shows them together, removes or closes every category the operator agrees to in one go, and brings each repository back to main once nothing is in progress.
- **Run:** `/clean`
- **Entry:** `.claude/skills/clean/SKILL.md`
- **Files:** .claude/skills/clean/SKILL.md
- **Keywords:** clean, stale deployment sweep, merged branch cleanup, worktree removal, build output cleanup, tidy repo, sibling repositories, inbox, dependabot, code scanning, failing workflows, unpushed commits
- **Related:** DEV-22, DEV-27
@end-capability -->

# clean

Gather every category first, show them together, ask once, act once. Nothing is removed or
closed before the operator has answered, and nothing outside the agreed categories is touched.

## Scope

The workspace root is `/Users/antony/projects/diy-accounting-limited`. The repositories are:

| Directory | GitHub repository | Deployments |
|---|---|---|
| `submit.diyaccounting.co.uk` | `diy-accounting-uk/submit.diyaccounting.co.uk` | yes (category 1) |
| `spreadsheets.diyaccounting.co.uk` | `diy-accounting-uk/spreadsheets.diyaccounting.co.uk` | no |
| `www.diyaccounting.co.uk` | `diy-accounting-uk/www.diyaccounting.co.uk` | no |
| `root.diyaccounting.co.uk` | `diy-accounting-uk/root.diyaccounting.co.uk` | no |
| `diy-accounting-archive` | `diy-accounting-uk/diy-accounting-archive` | no (archived: report only) |
| `private.diyaccounting.co.uk` | `diy-accounting-uk/private.diyaccounting.co.uk` | no |

Every command runs with `git -C <repo>` or an explicit `cd <repo> &&`; a worktree is never the
working directory for this skill. Run every loop under `bash` (the session shell is zsh, which
does not split an unquoted `$var` into words). Tee every piped output to a file in the session
scratchpad before a filter. Read each sibling's own `CLAUDE.md` before acting in it.

## Part 1 — gather

Read, do not assume. Run all the gathers before showing anything. Categories 1 to 5 are leftovers
that can be removed. Categories 6 to 13 are items that need attention: some can be closed or
fixed by this skill, the rest are reported with the action that clears them.

**1. Stale deployments (submit only).** Needs an SSO session (`aws sso login --sso-session
diyaccounting`); without one, report the category as "unverified: no SSO session" and leave it
out of the question.

```bash
for p in diya-submit-ci diya-submit-prod; do
  aws --profile $p cloudformation list-stacks \
    --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE UPDATE_ROLLBACK_COMPLETE DELETE_FAILED \
    --query "StackSummaries[?contains(StackName,'-app-')].[StackName,StackStatus,CreationTime]" --output text
done
aws --profile diya-submit-ci  ssm get-parameter --name /submit/ci/last-known-good-deployment   --query Parameter.Value --output text
aws --profile diya-submit-prod ssm get-parameter --name /submit/prod/last-known-good-deployment --query Parameter.Value --output text
```

Group by deployment name (the part before `-app-`). A ci set is stale when it is past its
self-destruct time (creation plus 4 hours) with any stack standing, when its only stack is a
`SelfDestructStack`, or when any stack is `DELETE_FAILED`; the last-known-good name is stale by
the same test once its set is down to that one stack. A prod set is stale when it is not the
last-known-good one. Never list the live set of either environment.

**2. Merged branches, in every repository.** `git -C <repo> fetch --prune origin` first. Local
branches are candidates for removal. Origin branches are listed for the operator to see, never
deleted by this skill and never given a delete command: remotes are the operator's.

```bash
bash <<'EOF'
cd "$1"
for ref in $(git for-each-ref --format='%(refname)' refs/heads refs/remotes/origin \
             | grep -v -E '^refs/(heads/main|remotes/origin/main|remotes/origin/HEAD)$'); do
  short=${ref#refs/heads/}; short=${short#refs/remotes/}
  ahead=$(git rev-list --count origin/main..$ref)
  if [ "$ahead" = 0 ]; then echo "$short merged"; else
    files=$(git diff --name-only origin/main...$ref)
    if [ -z "$files" ] || git diff --quiet origin/main $ref -- $files; then echo "$short content-on-main ($ahead commits)"; else echo "$short UNIQUE ($ahead commits)"; fi
  fi
done
EOF
```

`merged` and `content-on-main` (a squashed worktree branch whose every change already sits on
`main`) are candidates. `UNIQUE` never is; list it under "kept" with its commit count. A branch
with an open pull request is kept whatever the diff says
(`gh pr list --repo <repo> --state open --json headRefName`). A bare `origin` or `origin/HEAD` is a
symbolic ref, never a branch.

**3. Worktrees of merged branches, in every repository.** `git -C <repo> worktree list
--porcelain`; a worktree is a candidate when its branch is a candidate in category 2. Run
`git status --short` inside each candidate first: one with uncommitted tracked changes is kept
and reported, because removal would lose that work. Untracked `node_modules` does not count.

**4. Logs and test artefacts.** Globs run under `bash` with `shopt -s nullglob`. In submit, at the
repository root: `*.log` (the behaviour-test tees), `target/behaviour-test-results`,
`target/playwright-report`, `target/traces`, `test-results/`, `playwright-report/`, and the same
under every worktree. In a sibling, the same names where they exist. Never
`cognito-native-test-credentials.json`: it is the lock that says native auth is on for a lane,
and `npm run test:disableCognitoNative` is the only thing that removes it.

**5. Build output and libraries.** In submit: `target/` (Maven), `cdk.out/` and
`cdk-environment/cdk.out/`, `web/public/submit.bundle.js` (regenerated by `npm run bundle`),
`node_modules/` (followed by `npm ci`), and `node_modules/` under every worktree that survives
category 3. In a sibling: `target/` and its `cdk*.out/` directories. Show sizes with `du -sh`.
Everything here is regenerated by the next build or install; anything that is not both stays out.

**6. Unpushed and uncommitted work, in every repository.** Report only; this skill never commits,
pushes, stashes or discards another session's work.

```bash
git -C <repo> status --short                       # uncommitted, untracked
git -C <repo> log --oneline --branches --not --remotes   # commits on no remote
git -C <repo> status -sb | head -1                 # main ahead of or behind origin
```

A local `main` that is only behind `origin/main`, with a clean tracked tree, is a candidate for a
fast-forward (Part 4). Any other row is reported with the session or branch that owns it.

**7. Inbox messages.** `~/.claude/inboxes/submit.md`, `~/.claude/inboxes/diyaccounting.md`,
`~/.claude/inboxes/spreadsheets.md` and the workspace `INBOX.md`: every `[unread]` block. A block
addressed to this workspace (to `claude-code-submit`, to `diyaccounting`, or with no `to:`) is a
candidate: act on it as the inbox protocol in `~/.claude/CLAUDE.md` says, then mark it `[read]`. A
block addressed to another session (`to: cowork`) is listed under "kept"; it is that session's to
mark. A message whose content is no longer true (a cool-down since lifted) gets a reply only when
the recipient is blocked on the change.

**8. Board items in the siblings.** Every sibling `NEXT.md` and `PLAN_*.md`: the count of open
items (`- [ ]` rows, or the plan's open tasks) and their labels. Report only: a sibling's board is
worked by `/board` and `/do-next` in that repository. Submit's own `NEXT.md` is `/board`'s.

**9. GitHub issues needing attention, in every repository.**

```bash
gh issue list --repo <repo> --state open --limit 100 --json number,title,labels,updatedAt
```

Candidates to close, each with its evidence in the closing comment:
- An `[ALARM]` issue whose alarm is in state `OK` for over a day, or whose alarm no longer exists
  (`aws cloudwatch describe-alarms --alarm-names <name>`, read-only).
- A private `alarm-mirror` issue whose public issue is closed (`gh issue view <n> --json state`).
Every other open issue (a support thread, a security review request, a feature) is listed with
its age and labels, never closed by this skill.

**10. Failing workflows, in every repository.** The latest run of each workflow on each branch:

```bash
gh run list --repo <repo> --limit 100 --json workflowName,headBranch,conclusion,databaseId,createdAt \
  --jq 'group_by(.workflowName+.headBranch)[]|max_by(.createdAt)|select(.conclusion=="failure" or .conclusion=="startup_failure")'
```

For each, read the failed step (`gh run view <id> --repo <repo> --log-failed`, tee'd) and name the
cause in one line. A red on `main` is reported first. A red on a dependabot branch usually means
two grouped updates must land in order (for example an `aws-cdk-lib` bump that needs the newer
`aws-cdk` CLI from the npm group); say which PR lands first.

**11. Open pull requests, in every repository.** `gh pr list --repo <repo> --json
number,title,headRefName,mergeable,statusCheckRollup`: number, branch, mergeable, failed checks.
Report only. A merge goes through `/auto-merge` and nothing else.

**12. Security alerts, in every repository.**

```bash
gh api "repos/<repo>/dependabot/alerts?state=open&per_page=100"
gh api "repos/<repo>/code-scanning/alerts?state=open&per_page=100"
gh api "repos/<repo>/secret-scanning/alerts?state=open&per_page=100"
```

A 403 or 404 that says the feature is off for the repository is reported as "off", not as an
error. Each open alert is listed with its severity, package or rule, and path, and with the
`NEXT.md` row that carries it (`DEP183`, `DEP133`) or "no row". An open secret-scanning alert is
reported first, whatever its age. Report only: a fix is a board row.

**13. Stale local state in the main checkout of each sibling.** The same as categories 2 to 5,
already covered above; listed here so a render never omits a sibling because it has no
deployments.

## Part 2 — show and ask

One table per part: the leftovers (categories 1 to 5) and the attention items (6 to 12), one row
per category per repository, with the count, the size where it is known, and the names in full
(a deployment set, a branch, a worktree path, a file, an issue number, a run id, an alert number).
Empty categories are not shown and not asked about. Then one `AskUserQuestion` with
`multiSelect: true`, one option per category that this skill can act on (1 to 5, the inbox blocks
in 7, the issues to close in 9, the fast-forwards in 6), each option's description naming what it
removes or closes. The report-only rows (8, 10, 11, 12, and the rest of 6 and 9) are not options;
they are listed with the action that clears them. No change before the answer.

## Part 3 — act, all agreed categories in one go

Run the agreed actions in category order and report each command's result.

- **Deployments.** A ci set: `gh workflow run destroy-ci.yml --ref main -f deployment-name=<name>`;
  leftovers with no set behind them: `gh workflow run destroy-ci.yml --ref main -f sweep-for-stacks=true`
  once. A spare prod set: `gh workflow run destroy-prod.yml -f deployment-name=<name>`. Wait for
  each run to finish (`gh run watch <id>` in the foreground, or a sleep loop inside one Bash call)
  and read its conclusion; a red run is reported with its failed step, never retried blind.
- **Branches.** `git -C <repo> branch -D <local…>`. Origin branches are listed only.
- **Worktrees.** `git -C <repo> worktree remove --force --force <path>` for each (the doubled flag
  overrides locks), joined with `;`, then `git -C <repo> worktree prune`.
- **Logs and artefacts.** `rm -f` the files and `rm -rf` the directories named in the table.
- **Build output.** In submit: `rm -rf target cdk.out cdk-environment/cdk.out
  web/public/submit.bundle.js node_modules`, then `npm ci` in the foreground with a 600 s timeout,
  then `npm run bundle` so the next `npm test` finds the bundle. In a sibling: `rm -rf` the
  directories named in the table.
- **Inbox blocks.** Act on each, then change its marker to `[read]`.
- **Issues.** `gh issue close <n> --repo <repo> --comment "<the evidence>"`.

`git worktree remove` and `git branch -D` can be denied to the session by the permission
settings. When a command is denied, print the whole remaining block for that category in a fenced
block prefixed with `!`, in full, and carry on with the next category; the operator runs the
block or leaves it, and nothing else waits on it.

## Part 4 — back to main, in each repository

"Ongoing work" in a repository means any of: uncommitted tracked changes in its main checkout
(untracked files ignored), a worktree kept in category 3 because it holds uncommitted work, a
local branch reported `UNIQUE` in category 2 with no pull request, or a commit in category 6 that
is on no remote. When none of these exists in a repository:

```bash
git -C <repo> fetch --prune origin
git -C <repo> checkout main
git -C <repo> pull --ff-only origin main
```

When ongoing work exists, say what it is and leave that checkout where it is.

## Report

Fact first: what was removed or closed, per category and repository, with counts; then what was
kept and why (a `UNIQUE` branch, a dirty worktree, a live set, another session's inbox block);
then the report-only items with the action that clears each (a PR to land first, a failing run's
cause, an alert with no row); then any block handed to the operator; then the branch and head of
each repository's checkout. Nothing else.
