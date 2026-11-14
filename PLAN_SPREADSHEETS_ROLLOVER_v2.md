<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN: the spreadsheets rest state when the year-end window rolls

Status: the operator replaced the earlier task lists on 2026-11-14 with the twelve tasks below, applied after rolling `main` back to its state at 17:56 UTC on 14 November. Repository: `../spreadsheets.diyaccounting.co.uk`.

## Operator assertions (verbatim)

> When we roll to add a new latest of any of the products, that product becomes tested and also all the products that cover a current accounting period or a recent one not filed yet (e.g. year end < 1 year) are regression tested when there are changes. The new packages should automatically be generated as the date rolls over.

> start a new propsal on what the new stable rest state should be that gives me three options then we'll consider what the fixes are.

> For: "PLAN_SPREADSHEETS_ROLLOVER.md", I choose "2. Frozen anchors plus a rolling latest." and the rolling anchor should have a check that the anchor products have a year end in the future and the tests fail if they don't with an advisory that the exact-value checks shoudl roll to a new product when they fail and yes "The rolling latest and the in-scope set are checked by invariants that name no year-end". Please state the changes needed to achieve that.

> Adopt all 12 and tell me when the plan is updated, sync the board with tasks from the plan and then list those tasks.

## Goals

- A run with nothing new commits nothing and costs nothing.
- Spreadsheets `main` is green again, at its 17:56 state, with PR #200 closed (SR1, SR12).
- Generate runs commit only new year-end folders, for all four products, scheduled or dispatched (SR2, SR3).
- Pinned packages that no workflow overwrites, for the exact-value checks, with their report fixtures out of the prune's reach (SR4, SR5, SR8).
- A test that fails when a pinned package is more than six months old (SR6, SR7).
- A test over every package that names no date (SR9).
- A template, tax-data or product change reaches the existing packages, committing only the packages whose content changed (SR10, SR11).


## Where it stands

- `origin/main` is 40afa42af, the `generate-ltd.yml` dispatch of 2026-11-14 18:22 UTC (run 43623012544). It is the only commit after 6a9a7c9c5 (17:56). It added the Nov27 and Dec27 Company folders, rewrote files in every other Company folder, rewrote `examples/ltd-latest`, renamed the two Oct27 brickwork reports to Dec27 (the prune at `generate-ltd.yml` lines 494 to 497), and changed `app/lib/provenance-data.js` and the reconciliation page.
- Three checks pin the Oct27 year-end, so `main` fails them: `app/test/judge-reconciliation.test.js` lines 44 to 45 (report file names), the diya-gl parity gate (`diya-gl/parity.sh` against `examples/parity/<product>/report.json` and `bookchecks.json`), and `web/browser-tests/diya-gl-ltd-equivalence.browser.test.js` (cells of `examples/ltd-latest`). The bot commit started no workflow. PR #200 shows the failures: `app-test`, `browser-test` and `pack diya-gl, smoke and parity`.
- `main`'s last `test.yml` run (43622960594, head b22d451a9) passed by reusing a green record. No workflow has tested the 6a9a7c9c5 tree itself, because it is a bot commit.
- A dispatched run commits every generated file (`generate-ltd.yml` lines 510 to 512, the same in the other three). A scheduled run commits only new folders in `packages/` (lines 498 to 509).
- A scheduled run is not free. It regenerates every package, runs `npm test`, and runs LibreOffice reconciliation before it finds that nothing is new.
- Only `generate-ltd.yml` has a schedule (line 17, Mondays 04:00 UTC). The schedules of `generate-bst.yml`, `generate-se.yml` and `generate-taxi.yml` are commented out (lines 10 to 11 of each).
- `generate-se.yml` lines 127 to 139 also make the `Payslip 05` folders from the Self Employed folders.
- The committed packages do not match what the 17:56 generator makes. In 40afa42af the Jun24 Company package's `Financialaccounts.xlsx` changed its period dates (45748 to 45108) and `Payslips.xlsx` changed "existing = 06/04/25" to "06/04/24". These are content fixes, not noise. The first run that regenerates existing packages commits them.
- The package PDFs are not reproducible. `app/lib/guide.js` line 41 dates a PDF by the file time of its Markdown source, which is the checkout time in CI. The workflows run `pip install --quiet weasyprint` with no version. The workbooks are reproducible: `app/lib/generator.js` keeps the template's zip entry dates.
- `actions/checkout` in the generate jobs fetches one commit, so `git log -- <path>` there returns the head commit, whatever the path.
- Exact-value readers of the committed examples and reports: 46 code and test files name `examples/<product>-latest` (list in SR5). `web/browser-tests/r-sources.js` lines 256 to 268 and 430 to 440 take each example's year-end from the highest report name in `reports/`. `app/test/judge-reconciliation.test.js` and `app/test/se-derivations.test.js` name eight Apr27 and Oct27 report files.
- `examples/ltd-latest` holds the Oct27 package, last changed by f38ebcb44 on 2026-10-05. `examples/bst-latest` and `examples/se-latest` were last changed on 2026-11-14, `examples/taxi-latest` on 2026-11-13.
- The tax data runs out: `app/data/ltd-2027.toml` ends on 2028-03-31 and the window reaches Apr28 on 2027-02-16; `app/bin/generate.js` loops only over the toml files that exist, so Company would stop getting new packages with nothing reporting it (Self Employed on 2028-02-16).
- The Company reconcile matrix tests a representative set (latest March, June, February and the overall latest) of the last 24 months, not every year-end in scope.
- Latest at 17:56: Basic Sole Trader, Taxi Driver and Self Employed Apr27 (tax year to 2027-04-05); Company Oct27. On 2026-11-16 the window reaches Jan28 (`yearEndCutoff`, `app/bin/generate.js` lines 51 to 54), so the next Monday run adds Nov27, Dec27 and Jan28.

## The scope every option uses

**In scope** for a product: its latest year-end, and every year-end whose period is current or ended less than 12 months ago (filing not yet due). Today that is Company Dec25 to Dec27 (25 monthly year-ends) and, for the three tax-year products, Apr26 and Apr27.

- **A roll** (a new latest appears): the new latest gets the full test set for its product.
- **A change** (a template, the tax data, the engine or the generator): every in-scope year-end of every product the change reaches is regression tested.
- **Generation**: each product's new packages are built and published when the date brings a new year-end into the window, with no dispatch.

## Option 1: everything derived from the date

No test, fixture or expected file names a year-end. Each run computes the in-scope set from the date and the `packages/` folders. The generator writes, beside each new latest, the expected values its checks compare against (the parity `report.json` and `bookchecks.json`, the judge fixtures, the equivalence cells), and a check proves the committed expectations equal a fresh build.

- A roll commits the new packages and the new expectations in one bot commit, then the workflow runs the full test set on that commit before the site deploys it.
- Every product has a daily schedule that is a no-op when nothing new is in the window.
- Main stays green through a roll because the expectations move with the latest.
- Risk: an expectation written by the generator agrees with a wrong generator. Option 2's anchors cover that.

## Option 2: frozen anchors plus a rolling latest

Each product keeps a small set of frozen anchor year-ends (for example Company Oct27, Self Employed Apr27) whose exact-value expectations never change. The rolling latest and the in-scope set are checked by invariants that name no year-end (the books balance, the reconciliation reports pass, the judge passes, the CLI and the workbook agree cell for cell).

- A roll adds packages and runs the invariants on the new latest; the anchors catch a generator change that shifts a known figure.
- An anchor is replaced only by a deliberate change when its year-end leaves the in-scope set.
- Main stays green through a roll because no exact value follows the latest.
- `packages/` already keeps every year-end (at 17:56, 91 Company folders, Apr20 to Oct27), so an anchor adds no package that is not there already.

## Option 3: a release pull request per roll

The scheduled run builds the new packages on a branch and opens a pull request instead of committing to `main`. The pull request carries the packages and the regenerated expectations, runs the full test set for the new latest and the regression set for the in-scope year-ends, and merges through `/auto-merge` when green.

- `main` changes only through green pull requests, so a roll can never leave it red.
- A red roll waits as an open pull request with its failure named, and the site keeps the previous packages.
- A merge needs the same gates as any other change; with no session running, a green roll still needs `/auto-merge` or GitHub auto-merge on that branch.
- Cost: one pull request per roll (monthly for Company, yearly for the tax-year products).


## Tasks

Applied after rolling back to `main` at 17:56 UTC on 14 November 2026 (6a9a7c9c5). That point was a direct commit to `main` by the diya-gl publish workflow, not a merge; the last merge was PR #199 at 17:46. At 17:56 `generate-ltd.yml` already runs every Monday at 04:00 UTC (line 17) and a scheduled run commits only new folders in `packages/` (lines 498 to 509).

Line numbers below are those of 6a9a7c9c5. Each task after SR1 starts from `origin/main` and finds a step by its `name:`, because earlier tasks move the lines.

Rules for every task:

- Dispatch no generate workflow on `main` until SR13 is on `main`. A dispatch before SR2 and SR3 commits every generated file again.
- SR2, SR3, SR4, SR13, SR11 and SR10 change the same four workflow files. Build them one after another, in that order, each on `origin/main` after the one before has merged, or all on one branch by one agent.
- Run LibreOffice work (reconciliation, SR14's script, browser tests) one run at a time. Never start a second heavy run while one is in progress.

| # | Task | Waits on |
|---|---|---|
| SR1 | Revert 40afa42af in one pull request, so `main` matches 17:56 and `test.yml` passes on that pull request. | — |
| SR12 | Close spreadsheets PR #200 without merging. | — |
| SR2 | `generate-ltd.yml`: every run commits only new folders in `packages/`; the commit job stages nothing else, and the steps that only fed reports, the page, provenance and the spec page to the commit go. | SR1 |
| SR3 | `generate-bst.yml`, `generate-se.yml`, `generate-taxi.yml`: the same as SR2. | SR2 |
| SR4 | All four generate workflows: delete the steps that replace `examples/<product>-latest`, and their upload and download steps. | SR3 |
| SR13 | All four generate workflows: a first `plan` job lists the year-ends in the window that have no folder; with none, every other job is skipped. A run generates and reconciles only the new year-ends. The three commented-out schedules come back, weekly. | SR4 |
| SR5 | Rename `examples/<product>-latest` to `examples/<product>-pinned`, and update every file that names those folders. | SR4 |
| SR6 | New file `examples/pinned.json`: each product's pinned year-end and the date its package was built. | SR5 |
| SR8 | Move the eight pinned report files from `reports/` to `app/test/fixtures/pinned-reports/`; the tests read them there, and `r-sources.js` takes the pinned year-ends from `examples/pinned.json`. | SR6 |
| SR14 | New script `scripts/refresh-pinned.mjs`: rebuilds one product's pinned package for an in-scope year-end, with its reports, parity fixtures and `pinned.json` entry. | SR8 |
| SR7 | New unit test: fails when a pinned package was built more than six months ago; its message names the SR14 command. | SR14 |
| SR9 | New unit test: for every folder in `packages/`, the name parses, every expected file is present, and each workbook opens. | SR1 |
| SR11 | Package PDFs take the date of the last commit to their product's templates, from full history, with a pinned weasyprint; a generate run proves that a second build of one package is byte-identical. | SR13 |
| SR10 | All four generate workflows: a push to `main` that changes a product's templates, tax data or product code, or a dispatch with `regenerate-existing`, starts a run that commits every changed package in `packages/`. | SR11 |

## Task briefs

### SR1: revert 40afa42af

1. Run `git -C ../spreadsheets.diyaccounting.co.uk log --oneline 6a9a7c9c5..origin/main`.
2. On a branch from `origin/main`, run `git revert --no-edit 40afa42af`.
3. If step 1 lists a later commit made by a generate workflow that changes `examples/`, `reports/` or a folder that already existed in `packages/`, revert it too. Keep a later commit that only adds new folders in `packages/`; a Monday run (`generate-ltd.yml` line 17) can add one.
4. Open one pull request. The pull request's `test.yml` run is the proof, because no workflow has tested the 6a9a7c9c5 tree.
5. If that run fails on a check that 40afa42af did not cause, fix the cause in the same pull request.

Done when the pull request's `test.yml` is green and the pull request merges through `/auto-merge`.

### SR12: close PR #200

`gh pr close 200 -R diy-accounting-uk/spreadsheets.diyaccounting.co.uk --comment "Replaced by the SR tasks of PLAN_SPREADSHEETS_ROLLOVER."` Leave its branch for the operator.

### SR2: generate-ltd.yml commits only new folders

In `.github/workflows/generate-ltd.yml`:

1. In the `commit` job's "Commit and push" step, replace lines 489 to 513 with one loop, for every event:
   ```bash
   for dir in packages/*/; do
     if [[ -z "$(git ls-files -- "$dir" | head -1)" ]]; then
       git add -- "$dir"
     fi
   done
   ```
   This deletes the `git rm` of `reports/screenshots` and `reports/populated`, the brickwork prune (lines 490 to 497), the `schedule` test and the `else` branch.
2. In the `commit` job, delete the download of `ltd-reports-*` (lines 456 to 460), the download of `ltd-reconciliation-page` (lines 466 to 470), "Stamp the provenance data with this reconciled commit" and "Build the diya-gl spec page" (lines 479 to 482). Delete the Node setup and `npm ci` (lines 471 to 478), because nothing left in the job needs Node.
3. In the `reconcile` job, delete "Build the reconciliation page" and its upload (lines 354 to 365), "Keep only this run's own reports in the uploaded artifact" (lines 366 to 377), `rm -rf reports/populated` (line 378) and the `ltd-reports-${{ matrix.year-end }}` upload (lines 379 to 383). Keep "Keep the committed reports for the page build" (lines 241 to 245), because the unit test step copies those reports back.
4. In `reconcile-extra`, delete `rm -rf reports/populated` and the `ltd-reports-extra` upload (lines 418 to 425).
5. Rewrite the comments at lines 11 to 16 and 498 to 502 to say that every run commits only new folders in `packages/`.
6. Delete `app/test/generate-workflow-report-artifacts.test.js`. Its subject, report artifacts carried to the commit job, no longer exists.

Done when `./scripts/validate-workflows.sh` passes, `npm test` passes, and a dispatch of `generate-ltd.yml` on the pull request's branch commits only paths under new folders of `packages/`, or prints "No changes to commit".

### SR3: the same for the other three products

Apply SR2's steps 1 to 5 to `generate-bst.yml`, `generate-se.yml` and `generate-taxi.yml`. Find each step by its `name:`. `generate-taxi.yml` has no `reconcile-extra` job. In `generate-se.yml` the loop also adds the new `Payslip 05` folders, because they are new folders in `packages/`.

Done when `./scripts/validate-workflows.sh` and `npm test` pass, and a dispatch of each workflow on the branch commits only new folders in `packages/`, or nothing.

### SR4: no workflow writes the examples

In each of the four generate workflows, delete:

- the step "Copy latest populated to examples" (`generate-ltd.yml` lines 326 to 334, `generate-bst.yml` 267 to 275, `generate-se.yml` 291 to 299, `generate-taxi.yml` 284 to 292);
- the `<product>-examples` upload in the `reconcile` job and its download in the `commit` job.

Rewrite the comment above "Unit tests against the fresh packages and example" (for example `generate-ltd.yml` lines 335 to 338) to say that the step tests the fresh packages against the committed example. Keep the step and `scripts/leg-test-files.mjs`.

Done when `grep -n 'examples/' .github/workflows/generate-*.yml` shows only the `examples/precision-code-ltd`, `examples/basic-taxi-driver` and similar scenario reads, and `./scripts/validate-workflows.sh` passes.

### SR13: a run with nothing new stops after one short job

1. In `app/bin/generate.js`, export `plannedPackages(packageFilter, runDate)`. It returns `[{ product, yearEnd, dirName }]` for every package that a run on `runDate` builds, from the same loops `main()` uses (lines 239 to 283) and `packageNaming`. Make `main()` use it, so the two cannot differ.
2. New script `scripts/new-year-ends.mjs --package <bst|taxi|se|ltd>`. It prints a JSON array of the year-ends (`YYYY-MM-DD`) whose `dirName` has no file in `git ls-files packages/`. For `se`, a year-end is also new when its `Payslip 05` folder is missing.
3. Add a unit test for the script with an injected file list and run date: a run date that adds no year-end gives `[]`; 2026-11-16 against the 17:56 Company folders gives Nov27, Dec27 and Jan28.
4. In each generate workflow, add a `plan` job after `params` (Node, `npm ci`, the script). Outputs: `year-ends` (the JSON array) and `mode` (`roll` when the array is not empty, else `none`).
5. Every other job needs `plan` and runs only when `mode != 'none'`. With `none`, the run ends after `plan`.
6. In the `generate` job, pass the new year-ends: `npm run generate -- --package <p> --year-end <the year-ends, space-separated>`.
7. Set the reconcile matrix to every new year-end. Keep `latest` as the newest of them. Keep the `reconcile-all` input as it is.
8. In the `generate-bst.yml` and `generate-taxi.yml` `test` jobs (which run before `generate`), add the same `plan` condition.
9. Restore the schedules: `generate-bst.yml` `'20 4 * * 1'`, `generate-taxi.yml` `'40 4 * * 1'`, `generate-se.yml` `'0 5 * * 1'`. Rewrite the comments above them: a run with nothing new commits nothing and stops after the `plan` job.

Done when a dispatch of each workflow on the branch, after the branch holds every folder in the window, shows only `params` and `plan` as run jobs, with every other job skipped.

### SR5: rename the examples to pinned

1. `git mv examples/<product>-latest examples/<product>-pinned` for `bst`, `taxi`, `se` and `ltd`.
2. Replace `<product>-latest` with `<product>-pinned` in these files:
   - `app/bin/build-reconciliation-pages.js` (lines 15, 50, 62, 75, 89), `app/bin/export.js`, `app/bin/report.js`, `app/lib/anchors/ltd.js`, `app/lib/ltd-layout.js`;
   - `diya-gl/parity.sh`, `diya-gl/scripts/parity-fixtures.mjs`, `diya-gl/smoke.sh`;
   - `scripts/leg-test-files.mjs` (lines 26 to 28: both patterns);
   - `app/test/`: `diya-gl-interchange`, `diya-gl-mcp`, `diya-gl-page-upload`, `entry-number-uniqueness`, `export-file-ltd`, `export-file`, `forecast-tax-precision`, `link-cache`, `ltd-anchors`, `ltd-link-caches`, `ltd-period-shift`, `ltd-workbook`, `mcp-ltd`, `overtype-sidecar`, `report-entry-numbers`, `se-anchors`, `verify-roundtrip-frame`, `xlsx-exporter`, `xlsx-reader` (each `.test.js`);
   - `web/browser-tests/`: `diya-gl-bst-edits`, `diya-gl-bst`, `diya-gl-equivalence`, `diya-gl-formats`, `diya-gl-ltd-equivalence`, `diya-gl-ltd-formats`, `diya-gl-ltd-forms`, `diya-gl-ltd-page`, `diya-gl-se-edits`, `diya-gl-se-equivalence`, `diya-gl-se-formats`, `diya-gl-taxi-equivalence`, `diya-gl-taxi-formats`, `diya-gl-taxi-views` (each `.browser.test.js`), and `r-sources.js`;
   - the `CONTEXT_*.md` files and `.claude/skills/clean/SKILL.md` and `.claude/skills/session-report/SKILL.md`.
3. Rename the identifiers and test names that say "latest" about these folders (for example `ltdLatestZipBytes`, `"S3 (ltd-latest, saved)"`) to say "pinned". Change nothing else in those tests.
4. Leave `scripts/update-java.sh` (`use-latest-releases`) and `package.json` (`update-to-latest`) alone.

Done when `git grep -n -E '(bst|taxi|se|ltd)-latest' -- ':!packages'` finds nothing, and `npm test`, `npm run test:browser` and `diya-gl/parity.sh` pass.

### SR6: examples/pinned.json

New file `examples/pinned.json`. The `built` date is the date of the last commit that changed the folder at 17:56:

```json
{
  "bst": { "yearEnd": "2027-04-05", "built": "2026-11-14" },
  "taxi": { "yearEnd": "2027-04-05", "built": "2026-11-13" },
  "se": { "yearEnd": "2027-04-05", "built": "2026-11-14" },
  "ltd": { "yearEnd": "2027-10-31", "built": "2026-10-05" }
}
```

Add `app/lib/pinned.js` with `readPinned()` (parse and check that each entry has a `YYYY-MM-DD` `yearEnd` and `built`). Every reader below uses it.

### SR8: the pinned reports leave reports/

1. `git mv` these eight files from `reports/` to `app/test/fixtures/pinned-reports/`:
   - `GB_Accounts_Company_2027_10_31__Oct27__Excel_2007_ltd-brickwork-pro-vat.md`, `..._ltd-brickwork-pro-nonvat.md`;
   - `GB_Accounts_Self_Employed_2027_04_05__Apr27__Excel_2007_se-brickwork-pro-vat.md`, `..._se-brickwork-pro-nonvat.md`, `..._se-scenario-advanced.md`;
   - `GB_Accounts_Basic_Sole_Trader_2027_04_05__Apr27__Excel_2007_bst-scenario-basic.md`;
   - `GB_Accounts_Taxi_Driver_2027_04_05__Apr27__Excel_2007_taxi-scenario-basic.md`, `..._taxi-scenario-sp-sixty.md`.
2. `app/test/judge-reconciliation.test.js`: `report(key)` (lines 54 to 56) and the `assemblePrompt` test at line 667 read the fixture folder. The size test at line 735 keeps `reports/`, which still holds every product's other reports.
3. `app/test/se-derivations.test.js`: `REPORT_FILES` (lines 45 to 49) read the fixture folder.
4. `web/browser-tests/r-sources.js`: `latestYearEnd` (lines 256 to 268) and `latestSeYearEnd` (lines 430 to 440) become one `pinnedYearEnd(product)` that reads `readPinned()`. Delete `reportPattern` and `SE_SCENARIO_ADVANCED_REPORT`.
5. Rename `FIXTURES`, `REPORT_FILES` and the readers so that no name says "latest".

Done when `npm test` and `npm run test:browser` pass and `grep -rn '2027_04_05\|2027_10_31' app/test web/browser-tests --include=*.js` finds only the fixture file names.

### SR14: the command that replaces a pinned package

New script `scripts/refresh-pinned.mjs --product <bst|taxi|se|ltd> --year-end <YYYY-MM-DD>`, and the npm script `pinned:refresh`. It needs LibreOffice. It:

1. Fails unless `packages/` holds the product's folder for that year-end, and the year-end is the product's latest or ended less than 12 months before today.
2. Runs, into a temporary reports folder, the same reconciliation commands that the product's generate workflow runs for its latest year-end, in the `reconcile` and `reconcile-extra` jobs (for example `ltd`: `--scenario full`, `brickwork-pro-nonvat`, `brickwork-pro-vat`). Add a `--reports-dir <dir>` option to `app/bin/reconcile.js` for this; `REPORTS_DIR` (line 47) stays the default.
3. Fails when a report says `ANOMALYDETECTED`.
4. Replaces `examples/<product>-pinned` with the populated output, as the SR4-deleted step did: the whole folder for `ltd` and `se`; one file renamed `GB_Accounts_Basic_Sole_Trader.xlsx` or `GB_Accounts_Taxi_Driver.xlsx` for `bst` and `taxi`.
5. Replaces the product's files in `app/test/fixtures/pinned-reports/` with the new reports of the same scenarios.
6. Runs `npm run parity:refresh`.
7. Writes the product's `examples/pinned.json` entry: the new `yearEnd`, and today as `built`.
8. Prints: "The exact-value tests that read the pinned package now fail where a figure moved. Update each expected value from the new fixture in the same change."

Add a unit test for the argument checks in step 1, with an injected folder list and date. Done when a run for `bst` at `2027-04-05` on a branch leaves `npm test` green after the printed updates.

### SR7: the six-month test

New file `app/test/pinned-age.test.js`. For each product in `readPinned()`, it fails when `built` is more than six calendar months before today. The message is:

"The pinned <product> package was built on <built>, more than six months ago. The exact-value checks must roll to a newer package: run `npm run pinned:refresh -- --product <product> --year-end <an in-scope year-end>` and update the expected values that then fail."

Inject the date into the comparison function, and test it with a date inside and a date outside six months. The test names no year-end. Done when `npm test` passes on today's date.

### SR9: every package is complete

New file `app/test/package-catalogue.test.js`. For every folder in `packages/`:

1. The name matches `^GB Accounts (Basic Sole Trader|Taxi Driver|Self Employed|Company|Payslip 05) (\d{4}-\d{2}-\d{2}) \(([A-Z][a-z]{2})(\d{2})\) Excel 2007$`, and the short label equals the month and year of the date.
2. The folder holds exactly the expected files. Read them from `app/templates/<dir>/meta.toml` (`template.files`, or the single workbook name from `packageNaming`, plus `output.guide_filename` and `output.payslip_guide_filename`). A `Payslip 05` folder holds `Payslips.xlsx` and `Payslip User Guide.pdf`.
3. Each `.xlsx` and `.docx` opens with JSZip and holds `[Content_Types].xml`; each `.xlsx` holds `xl/workbook.xml`.
4. Each `.pdf` is not empty and starts with `%PDF-`. This catches a guide that `app/bin/generate.js` lines 123 to 128 failed to build with only a warning.

The test names no year-end and no count. Done when `npm test` passes on the 17:56 tree.

### SR11: reproducible PDFs

1. `app/lib/guide.js`: `sourceDateEpoch` is required. Throw when it is not a whole number. Delete the file-time default (line 41) and rewrite the header comment (lines 7 to 9).
2. `app/bin/generate.js`: when `--source-date-epoch` is absent and guides are built, use `git log -1 --format=%ct -- app/templates/<product dir>` for each product. Before that, throw when `git rev-parse --is-shallow-repository` prints `true`, with the message "generate.js dates the guides from git history; check out with fetch-depth: 0". With `--skip-guide`, read no git history.
3. Unit-test the epoch function with an injected git runner: a shallow repository throws; a full one returns the last template commit time.
4. In each generate workflow's `generate` job, set `fetch-depth: 0` on `actions/checkout`, and pin weasyprint: `pip install --quiet weasyprint==<version>`. Use the latest release on the day of the change, and write the version in that line only.
5. In `test.yml`'s `build` job, add `--skip-guide` to "Generate latest BST package". That job installs no pandoc, so its guide never builds.
6. In each generate job, after "Compute reconciliation matrix", generate the latest year-end a second time into `/tmp/again` with `--output-dir`, and `cmp` every file with the copy in `packages/`. Fail the job when one differs.

Done when a dispatch of each workflow on the branch passes the step in item 6.

### SR10: a template, tax-data or product change reaches the packages

1. In each generate workflow, add a `push` trigger on `main` with these paths:
   - all: `app/templates/meta.toml`, `app/bin/generate.js`, `app/lib/generator.js`, `app/lib/guide.js`;
   - `bst`: `app/templates/bst/**`, `app/data/se-*.toml`, `app/products/bst.js`;
   - `taxi`: `app/templates/taxi/**`, `app/data/se-*.toml`, `app/products/taxi.js`;
   - `se`: `app/templates/se/**`, `app/data/se-*.toml`, `app/products/se.js`, `app/products/se/**`;
   - `ltd`: `app/templates/ltd/**`, `app/data/ltd-*.toml`, `app/products/ltd.js`, `app/products/ltd/**`.
2. Add a boolean input `regenerate-existing` to `workflow_dispatch` and `workflow_call`, and pass it from `generate-all.yml`.
3. The `plan` job's `mode` is `change` when the event is `push` or `regenerate-existing` is true.
4. With `change`, the `generate` job builds every package in the window (no `--year-end`). The reconcile matrix is the 17:56 rule (Company: latest March, June, February and the latest; the tax-year products: every year-end) plus every new year-end.
5. With `change`, the commit step runs `git add -- packages/`. With SR11 in place, only the files whose content changed are staged. With `roll`, it keeps the SR2 loop.
6. Set `cancel-in-progress: false` in each workflow's `concurrency`, so a scheduled run cannot cancel a change run.
7. Rewrite the comments about the disabled push trigger (`generate-ltd.yml` lines 18 to 32 and the same in the others).
8. After the merge, dispatch each workflow once with `regenerate-existing: true`. The first Company run commits content changes in existing folders, because the committed packages predate generator changes (see "Where it stands"). Then dispatch each once more.

Done when the second dispatch of each workflow in item 8 prints "No changes to commit".

## Assumptions

- `test.yml` passes on the 6a9a7c9c5 tree. SR1's pull request run checks it; a failure there is fixed in SR1.
- The four pinned packages pass the exact-value checks at 17:56, because PR #199's `test.yml` passed on the same examples and reports.
- With a fixed `SOURCE_DATE_EPOCH`, a pinned weasyprint and the pandoc of the `ubuntu-24.04` image (3.1.3 in run 43623012544), the same Markdown gives the same PDF bytes. SR11 item 6 checks it within a run; a runner image that changes pandoc shows as one change run that commits PDFs.
- The `built` date of a pinned package is the date of the last commit that changed its folder.
- A product change includes the generator code that builds every package (`app/bin/generate.js`, `app/lib/generator.js`, `app/lib/guide.js`), so a change there reaches the packages too.
- A run with nothing new costs the `params` and `plan` jobs, about one minute of runner time. "Costs nothing" means that no generation, test, reconciliation or commit job starts.
