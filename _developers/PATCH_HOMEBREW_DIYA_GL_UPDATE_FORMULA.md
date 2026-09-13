<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Patch: homebrew-diya-gl's update-formula.yml trigger swap

`diy-accounting-uk/homebrew-diya-gl` is not checked out in this workspace (see the workspace
`CLAUDE.md`), so this is the full replacement content for
`.github/workflows/update-formula.yml`, ready for the coordinator to apply through the Contents
API. It swaps the hourly `schedule` trigger for the `repository_dispatch` that
`spreadsheets.diyaccounting.co.uk`'s `publish-diya-gl.yml` now fires after every npm publish
(branch `claude/ops-homebrew-dispatch`, commit `008952eb`). `workflow_dispatch` is unchanged. No
other line in the file changes.

Land this before the sending step goes live: `publish-diya-gl.yml`'s dispatch has nowhere to
land until `update-formula.yml` accepts `repository_dispatch`.

Base to apply against: `.github/workflows/update-formula.yml` at
`081e3804f6b6d1522e1135b0546695969cf6938b` (homebrew-diya-gl's `main`, read 2026-09-13).

```bash
gh api --method PUT repos/diy-accounting-uk/homebrew-diya-gl/contents/.github/workflows/update-formula.yml \
  -f message="Trigger the formula update from a repository_dispatch instead of an hourly poll" \
  -f content="$(base64 -i update-formula.yml)" \
  -f sha=081e3804f6b6d1522e1135b0546695969cf6938b \
  -f branch=main
```

Full file content:

```yaml
# SPDX-License-Identifier: Apache-2.0
# Copyright (C) 2006-2026 DIY Accounting Limited
name: Update formula

on:
  repository_dispatch:
    types: [diya-gl-published]
  workflow_dispatch:
    inputs:
      run-gate:
        description: "Install and test the formula even if it did not change"
        type: boolean
        default: false

permissions:
  contents: write

jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Update the formula from the npm registry
        id: update
        run: scripts/update-formula.sh

      - name: Commit and push if the formula changed
        id: commit
        run: |
          if [[ -n "$(git status --porcelain)" ]]; then
            git config user.name "github-actions[bot]"
            git config user.email "github-actions[bot]@users.noreply.github.com"
            git add Formula/
            git commit -m "diya-gl ${{ steps.update.outputs.version }}"
            git push
            echo "changed=true" >> "$GITHUB_OUTPUT"
          else
            echo "No change to commit."
            echo "changed=false" >> "$GITHUB_OUTPUT"
          fi

      - name: Set up Homebrew
        if: hashFiles('Formula/diya-gl.rb') != '' && (steps.commit.outputs.changed == 'true' || inputs.run-gate == true)
        uses: Homebrew/actions/setup-homebrew@main

      - name: Install and test the formula from the tap just pushed
        if: hashFiles('Formula/diya-gl.rb') != '' && (steps.commit.outputs.changed == 'true' || inputs.run-gate == true)
        env:
          HOMEBREW_NO_AUTO_UPDATE: "1"
          HOMEBREW_NO_ENV_HINTS: "1"
          HOMEBREW_NO_INSTALL_CLEANUP: "1"
        run: |
          brew tap diy-accounting-uk/diya-gl
          brew install --build-from-source --verbose diy-accounting-uk/diya-gl/diya-gl
          brew test --verbose diy-accounting-uk/diya-gl/diya-gl
```

Diff against the current file (only the `on:` block moves):

```diff
--- a/.github/workflows/update-formula.yml
+++ b/.github/workflows/update-formula.yml
@@ -4,8 +4,8 @@
 name: Update formula

 on:
-  schedule:
-    - cron: "17 * * * *"
+  repository_dispatch:
+    types: [diya-gl-published]
   workflow_dispatch:
     inputs:
       run-gate:
```
