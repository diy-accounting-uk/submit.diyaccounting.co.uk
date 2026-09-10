<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# REPORT: Git config, settled before commit signing turns on

`REPORT_IDENTITY_AUDIT.md` ranks SSH commit signing as the prerequisite for every auto-merge
policy in `PLAN_REPOSITORY_AUTOMATION.md`. Its check is `commit.verification.verified` on each
commit of a PR. Two settings on this machine's global git config sit upstream of that check and
were never looked at: `pull.rebase=true` and `rerere.enabled=true`, with no `commit.gpgsign` and
no `gpg.format` set anywhere. This report settles what they should be, so the answer survives
this machine rather than living only in `~/.gitconfig`.

All four questions below settle from git's own behaviour and this repository's own state. None
needs an operator choice between real alternatives.

## The setting today

```
pull.rebase=true
rerere.enabled=true
```

`rerere.autoupdate`, `commit.gpgsign`, `gpg.format` and `user.signingkey` are all unset, so they
take git's defaults. No repository sets a local override: this repo's `.git/config` carries only
remotes and branch tracking, and `extensions.worktreeConfig` is unset, so the global values above
are what every worktree of this repo reads, sub-agent worktrees included.

## 1. Pull rebases here. Keep it.

`pull.rebase=true` means `git pull` replays your own unpushed commits on top of the fetched
branch instead of creating a merge commit. Keep it: this repo's PR flow already assumes linear,
squashable branches, and the batch working model in `CLAUDE.md` pulls a shared branch across
several worktrees before each push. A merge commit there would need its own signature and would
clutter a branch several agents read.

**What that means for a signed history.** A rebase replays each commit through git's normal
commit machinery, so it honours `commit.gpgsign` exactly as a fresh `git commit` would: with the
setting on, every replayed commit gets a new, valid signature at its new SHA. The signature never
attests "unchanged since first authored"; it attests "this exact tree, produced by this key,
right now." A PR's signature check already re-runs on every `synchronize` event
(`PLAN_REPOSITORY_AUTOMATION.md`, P2), so a rebased, force-pushed branch re-signed on replay is
not a failure, just a new thing to check.

The failure `REPORT_IDENTITY_AUDIT.md` and `B82` describe only happens if signing is **not** a
persistent default when the rebase runs, for example a workflow that signs with a one-off `-S`
flag rather than `commit.gpgsign=true`. Section 9 of `REPORT_IDENTITY_AUDIT.md` already proposes
`commit.gpgsign=true` as a permanent global setting rather than a per-commit flag. That is the
detail that makes rebase safe, and it is already the right plan: land signing as a standing
default, not a manual flag.

## 2. rerere stays on, guarded by a default that is already in place

`rerere` records how you resolved a conflict and replays that resolution the next time git meets
the same conflict. It stays on: without it, the batch working model's repeated rebases across
worktrees mean re-resolving the same conflict by hand every time a shared branch moves.

The guard is `rerere.autoupdate`, and it is already correct: unset, which defaults to `false`.
With it false, a replayed resolution still lands as unstaged edits in the working tree; the
rebase still stops and waits for `git add` and `git rebase --continue`. That pause is the review
point before the commit, and its signature, get made. If `rerere.autoupdate` were ever set to
`true`, git would stage and continue past the replayed resolution with nobody looking at it right
before it gets signed. Don't set it.

## 3. What a worktree inherits, and why the fix is not a repo-committed config file

Every worktree of this repo (the primary checkout and every `.claude/worktrees/*` sub-agent
worktree) reads the same two files: the repository's single `.git/config` and the operator's
`~/.gitconfig`. `extensions.worktreeConfig` is unset, so there is no per-worktree config in this
repo today, and nothing here has drifted between worktrees. Turning on signing globally reaches
every worktree in the same commit as everything else, with no extra step.

That is also why the fix cannot be a config file committed to the repository. A signing key path
is personal to the machine that holds the private key, and git will not auto-load config from a
cloned repository for exactly that reason: a tracked config file could otherwise let a clone
silently redirect commands or credentials the moment someone checks it out. There is no
`.gitattributes`- or `.gitconfig`-include mechanism that a `git clone` picks up on its own.

So a machine-side setting, however well documented, only ever covers machines someone remembered
to configure by hand: a future contributor's laptop, a CI runner, or this machine after a reinstall
would all still verify nothing. The pin that reaches every one of those is server-side: a branch
ruleset rule requiring verified signatures, which rejects an unsigned push regardless of what any
machine's git config says. `REPORT_IDENTITY_AUDIT.md` section 9 already sequences that ruleset
rule last, after a few weeks of signed history exist, which is the right order: add the rule too
early and every worktree with an unconfigured key stops being able to push at all.

## 4. What each repository should carry, and what a workflow can check

The signing config itself belongs on the operator's machine as one global default, not six
per-repo copies. Every repository here has exactly one committer, so a global default already
matches every repository's need, and six separate copies would only be six places to keep in
sync for no gain. `REPORT_IDENTITY_AUDIT.md` section 9, step 1 already gives the three lines:

```
git config --global gpg.format ssh
git config --global user.signingkey ~/.ssh/id_antony_polycode_mbp_2025.pub
git config --global commit.gpgsign true
```

Running signing as a workflow-checkable claim, rather than the operator's word, needs the same
proof in every repository: `commit.verification.verified` from the GitHub API on each commit of a
PR. This branch adds that check for submit: `.github/workflows/verify-commit-signatures.yml`. It
queries `GET /repos/{owner}/{repo}/pulls/{n}/commits`, lists each commit's verification status in
the job summary, and prints a notice when any commit is unverified. It runs against the GitHub
API's own record, not the runner's local git config, so it needs no setup on the Actions side and
tells the truth regardless of what any machine signed with.

It does not fail the build. No commit in this repository is signed yet, so a failing check here
would block every open PR today. Once the three lines above are set and a run of ordinary PRs
shows signed, verified commits, change the workflow's last step to exit non-zero on any
unverified commit and add it as a required status check on the ruleset. That is the same
sequencing `REPORT_IDENTITY_AUDIT.md` section 9 already recommends: signing first as a courtesy,
required only once it is routine.

The other five repositories need the same three-line global config (already covered, it is one
setting for all six) and the same workflow file, added by each repository's own session.

## What this settles

`pull.rebase=true` and `rerere.enabled=true` stay as they are. `rerere.autoupdate` stays unset.
No repository needs a committed config file for any of this; the one place a signing requirement
belongs is a branch ruleset rule, added once signed commits are the norm. The one piece of new
code is `.github/workflows/verify-commit-signatures.yml`, which turns "the operator says this
commit is signed" into something a workflow can check.

What is left is the action `REPORT_IDENTITY_AUDIT.md` already recommends first: register the SSH
key as a signing key on `antonycc` and set the three global lines above. That is a ten-minute,
free action with an already-settled sequencing; this report only clears the ground it runs on.
