<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# REPORT: homebrew-diya-gl's cron and missing ruleset

Read-only, 2026-09-10. Covers `diy-accounting-uk/homebrew-diya-gl` only, read entirely through
the `gh` CLI — the repository is not checked out anywhere in this workspace and nothing in it was
changed. Answers NEXT.md's B81.

## What the cron does

`update-formula.yml` runs `scripts/update-formula.sh` on a cron (`17 * * * *`, once an hour) and
on `workflow_dispatch`. The script reads `@diy-accounting-uk/diya-gl`'s latest version from the
npm registry, and only writes `Formula/diya-gl.rb` and commits when the tarball URL changed; when
the registry still shows the version already in the formula, it prints "Nothing to change" and
exits 0 with no commit. So the job is a poll, not a per-run action: most runs do nothing.

The repository is 61 hours old (created 2026-09-07T23:12). In that time the workflow has run 17
times total — 12 on schedule, 5 on dispatch — and produced 9 version-bump commits (`1.0.0` through
`1.1.2`). The schedule itself has not run hourly in practice: consecutive scheduled runs landed
04:36, 09:38, 14:30, 18:37, 21:49, 00:11, 04:37, 09:42, 14:34, 18:33, 21:40, 00:12, roughly 3-5
hours apart rather than 1. That gap is GitHub's own delay behaviour for scheduled workflows, not
a fault in this repository, but it means the actual polling rate has already been a fraction of
what the cron expression asks for.

Nothing downstream reads this repository on a timer. A Homebrew user only sees a new formula when
they run `brew update` or `brew install`; the schedule's only job is to keep the gap between an
npm release and the tap reflecting it short. No CI, deploy, or other workflow depends on this
repo's cadence.

A release event can replace the poll. `@diy-accounting-uk/diya-gl` is published from exactly one
place: `spreadsheets.diyaccounting.co.uk/.github/workflows/publish-diya-gl.yml`, called by
`deploy.yml` after every green prod deploy. It does not create a GitHub Release object — it runs
`npm publish`, tags the commit `diya-gl-v<version>`, and pushes that tag — so there is no `release`
webhook to attach to, but the `npm publish` step is the exact moment the tap needs to hear about.

## The schedule change

Replace the `schedule` trigger in `homebrew-diya-gl`'s `update-formula.yml` with a
`repository_dispatch`, keeping `workflow_dispatch` for a manual run:

```yaml
on:
  repository_dispatch:
    types: [diya-gl-published]
  workflow_dispatch:
    inputs:
      run-gate:
        description: "Install and test the formula even if it did not change"
        type: boolean
        default: false
```

And add a step to `spreadsheets.diyaccounting.co.uk`'s `publish-diya-gl.yml`, right after "Publish
to npm" succeeds, that fires it:

```yaml
      - name: Notify the homebrew tap of the new release
        if: ${{ steps.version.outputs.publish == 'true' }}
        run: |
          curl -sS -X POST \
            -H "Authorization: Bearer ${{ secrets.HOMEBREW_DISPATCH_TOKEN }}" \
            -H "Accept: application/vnd.github+json" \
            https://api.github.com/repos/diy-accounting-uk/homebrew-diya-gl/dispatches \
            -d '{"event_type":"diya-gl-published","client_payload":{"version":"${{ steps.version.outputs.version }}"}}'
```

This needs a new secret in `spreadsheets.diyaccounting.co.uk`: `HOMEBREW_DISPATCH_TOKEN`, a
fine-grained personal access token scoped to `diy-accounting-uk/homebrew-diya-gl` with "Contents:
read and write" permission. The default `GITHUB_TOKEN` cannot dispatch into a different
repository, so this token is the only way to make the trigger cross-repo. Creating the token and
adding the secret is the operator's call.

Net effect: the tap updates in the same run that publishes to npm, instead of somewhere between
minutes and hours later, and the cron disappears. Both edits are pushes to repositories this
worktree does not manage, so they are not made here — the two YAML snippets above are ready to
drop in once approved.

## A ruleset like its siblings'

The five repositories with a ruleset all carry the same one, differing only in `enforcement`:

| Repository | Ruleset | Rules | Bypass actors | Enforcement |
|---|---|---|---|---|
| `submit.diyaccounting.co.uk` | `main` | `deletion`, `non_fast_forward` | none | active |
| `spreadsheets.diyaccounting.co.uk` | `main` | `deletion`, `non_fast_forward` | none | active |
| `www.diyaccounting.co.uk` | `main` | `deletion`, `non_fast_forward` | none | active |
| `diy-accounting-archive` | `main` | `deletion`, `non_fast_forward` | none | active |
| `root.diyaccounting.co.uk` | `main` | `deletion`, `non_fast_forward` | none | disabled |

It targets `~DEFAULT_BRANCH`, blocks force-push and branch deletion, and does not require a pull
request or restrict who can push — a direct fast-forward push to `main` still goes through, which
is why it does not conflict with `update-formula.yml` committing straight to `main` today. The
same ruleset for `homebrew-diya-gl`, ready to send as the POST body:

```json
{
  "name": "main",
  "target": "branch",
  "enforcement": "active",
  "conditions": {
    "ref_name": {
      "include": ["~DEFAULT_BRANCH"],
      "exclude": []
    }
  },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" }
  ]
}
```

Apply with:

```bash
gh api --method POST repos/diy-accounting-uk/homebrew-diya-gl/rulesets --input ruleset.json
```

## The workspace CLAUDE.md row

`homebrew-diya-gl` is not checked out anywhere in this workspace, so the Directory column has
nothing to point at. Row for the Workspace Structure table in
`/Users/antony/projects/diy-accounting-limited/CLAUDE.md`, added after the `diy-accounting-archive`
row:

```
| — (not checked out here) | `diy-accounting-uk/homebrew-diya-gl` | Active | Homebrew tap for `diya-gl`; formula regenerated from the npm registry, read with `gh api` |
```

## Commands for the operator

```bash
# 1. Give homebrew-diya-gl the same branch ruleset as its siblings
gh api --method POST repos/diy-accounting-uk/homebrew-diya-gl/rulesets --input ruleset.json

# 2. In spreadsheets.diyaccounting.co.uk: create a fine-grained PAT scoped to
#    diy-accounting-uk/homebrew-diya-gl with Contents: read and write, then
gh secret set HOMEBREW_DISPATCH_TOKEN --repo diy-accounting-uk/spreadsheets.diyaccounting.co.uk

# 3. Edit homebrew-diya-gl/.github/workflows/update-formula.yml: replace the
#    schedule trigger with repository_dispatch (types: [diya-gl-published]),
#    push to main.

# 4. Edit spreadsheets.diyaccounting.co.uk/.github/workflows/publish-diya-gl.yml:
#    add the "Notify the homebrew tap" step after "Publish to npm", push.
```
