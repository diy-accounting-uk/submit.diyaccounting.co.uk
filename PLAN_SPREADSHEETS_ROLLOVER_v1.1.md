<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN: the spreadsheets rest state when the year-end window rolls

Status: v1.1 — v1 corrected for the breaking weaknesses found by three zero-context reviews (2026-11-14), with the rejected options removed. Applied after rolling spreadsheets `main` back to its state at 17:56 UTC on 14 November 2026 (commit 6a9a7c9c5). Repository: `../spreadsheets.diyaccounting.co.uk`.

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

- `origin/main` is 40afa42af, the `generate-ltd.yml` dispatch of 2026-11-14 (run 43623012544, committed 18:22 UTC). It is the only commit after 6a9a7c9c5 (17:56). It added the Nov27 and Dec27 Company folders, rewrote files in every other Company folder, rewrote `examples/ltd-latest`, renamed the two Oct27 brickwork reports to Dec27 (the prune at `generate-ltd.yml` lines 494 to 497), and changed `app/lib/provenance-data.js` and the reconciliation page.
- Three checks pin Oct27, so `main` fails them: `app/test/judge-reconciliation.test.js` (report file names, lines 44 to 45), the diya-gl parity gate (`diya-gl/parity.sh`), and `web/browser-tests/diya-gl-ltd-equivalence.browser.test.js` (cells of `examples/ltd-latest`).
- At 17:56 the Company folders are Apr20 to Oct27 (91), and the latest tax-year folders are Apr27. On 2026-11-16 the window reaches Jan28 (`yearEndCutoff`, `app/bin/generate.js` lines 51 to 54), so that Monday's run adds Nov27, Dec27 and Jan28.
- A scheduled `generate-ltd.yml` run commits only new folders in `packages/` (lines 498 to 509); line 503 (`git reset -q`) and line 509 (`git restore --worktree -- .`) are part of that path, and line 509 is what lets the `git pull --rebase` at line 521 succeed. A dispatched run commits every generated file (lines 510 to 512, the same in the other three workflows).
- A scheduled run regenerates every package, runs `npm test` and LibreOffice reconciliation before it finds nothing new (run 43623012544: 35 minutes).
- `app/lib/guide.js` line 41 dates each package PDF by its Markdown source's file time, which is the checkout time in CI; weasyprint is installed unpinned. Workbooks are already reproducible. The generate checkouts fetch one commit, so `git log -- <path>` there returns the head commit.
- `scripts/build-provenance-data.mjs` (lines 100 to 120) sums every report in `reports/` into the tracked `app/lib/provenance-data.js`; `npm run test:browser` runs it, and `.githooks/pre-push` (lines 145 to 160) refuses a push that leaves a file changed. `app/bin/judge-reconciliation.js` (line 175) features the newest report of each scenario in `reports/`.
- `app/bin/build-packages.js` (lines 43 to 44) writes untracked `LICENCE.txt` and `README.txt` into each package folder (`.gitignore` lines 97 to 99); a folder holding `DO NOT USE - WORK IN PROGRESS.txt` is skipped (line 78).
- Each generate workflow's `concurrency` (`generate-ltd.yml` lines 5 to 7) keeps one pending run per group; a newer pending run replaces an older one.
- `web/browser-tests/r-sources.js` lines 256 to 268 and 430 to 440 take each example's year-end from the highest report name in `reports/`. `app/test/judge-reconciliation.test.js` (lines 43 to 52) and `app/test/se-derivations.test.js` (lines 45 to 49) name eight Apr27 and Oct27 report files. 42 code and test files name `examples/<product>-latest`.
- `examples/ltd-latest` holds Oct27 (`Financialaccounts.xlsx` Admin!F21 is 2027-10-31), last built on 2026-10-05; `examples/bst-latest` and `examples/se-latest` on 2026-11-14; `examples/taxi-latest` on 2026-11-13. The "Copy latest populated to examples" steps are today the only way a pinned package is rebuilt; `npm run parity:refresh` refreshes all four products' parity fixtures at once.
- `app/test/generate-workflow-report-artifacts.test.js` (lines 64 to 80) checks the report and page artifacts that the commit jobs download.

## Tasks

| # | Task | Waits on |
|---|---|---|
| SR1 | Revert 40afa42af in one pull request, so `main` matches 17:56. Proof: that pull request's `test.yml` run passes in full. | — |
| SR2 | `generate-ltd.yml` commit job: every run, scheduled or dispatched, commits only new folders in `packages/`, keeping `git reset -q`, the new-folder loop and `git restore --worktree -- .`. Remove the report prune, the report and page downloads, the provenance and spec steps, and the uploads that only feed them; update `app/test/generate-workflow-report-artifacts.test.js` to match. | SR1 |
| SR3 | The same change in `generate-bst.yml`, `generate-se.yml` and `generate-taxi.yml` (the new-folder loop also covers the `Payslip 05` folders `generate-se.yml` lines 127 to 139 make). | SR2 |
| SR4 | All four generate workflows: delete the steps that replace `examples/<product>-latest`, and the uploads and `git add` that carry it. Done when no generate workflow names `-latest`. | SR3 |
| SR5 | Rename `examples/<product>-latest` to `examples/<product>-pinned`, and update the 42 files that name them (find with `git grep -w -E 'examples/(bst|se|ltd|taxi)-latest'`), `scripts/leg-test-files.mjs` line 28 and `diya-gl/parity.sh`. | SR4 |
| SR6 | New file `examples/pinned.json`: per product the pinned year-end and build date (ltd 2027-10-31, built 2026-10-05; bst and se 2027-04-05, built 2026-11-14; taxi 2027-04-05, built 2026-11-13), read through one module `app/lib/pinned.js`. | SR5 |
| SR7 | New unit test: fails when a pinned package was built more than six months ago; its message names `npm run pinned:refresh -- --product <product>`. The test skips when `PINNED_AGE_CHECK=off`, which the generate workflows set, so an old pin never stops new packages. | SR6, SR13 |
| SR8 | Copy (do not move) the eight pinned report files from `reports/` to `app/test/fixtures/pinned-reports/`; `reports/` stays as it is. `judge-reconciliation.test.js`, `se-derivations.test.js` and `r-sources.js` find each pinned report and year-end through `app/lib/pinned.js` by product and scenario, never by a dated name. | SR6 |
| SR9 | New unit test: for every folder in `packages/` (skipping folders that hold the work-in-progress marker), the name parses, every expected file is present (ignoring the untracked `LICENCE.txt` and `README.txt`), and each workbook opens. | SR1 |
| SR10 | All four generate workflows: a push to `main` that changes `app/templates/**`, `app/data/**`, `app/products/**`, `app/lib/**` or `app/bin/generate.js` (ignoring `app/lib/provenance-data.js`) starts a run that regenerates every package from the pushed head and commits every package in `packages/` whose content changed, and nothing outside `packages/`. Set `cancel-in-progress: false`; a dropped pending run loses nothing, because the next run regenerates from the newer head. | SR3, SR11 |
| SR11 | Package PDFs take their date from the last commit that touched the product's templates: generate checkouts use `fetch-depth: 0` with `filter: blob:none`, `guide.js` reads `SOURCE_DATE_EPOCH`, the build fails on a shallow clone, and weasyprint is pinned to one version. | SR3 |
| SR12 | Close spreadsheets PR #200 without merging. | — |
| SR13 | `scripts/refresh-pinned.mjs` (`npm run pinned:refresh -- --product <product>`), run in CI by a `refresh-pinned` dispatch input on each generate workflow: build the populated scenario package at the newest year-end, copy it to `examples/<product>-pinned`, refresh that product's parity fixtures and pinned report copies, and update `pinned.json`, committed to a branch for review. | SR8 |
| SR14 | A scheduled run with nothing new stops early: a first job lists the year-end folders the window would add that `packages/` does not hold (`git ls-tree HEAD packages/`); when the list is empty, every other job is skipped. | SR2 |

## Rules for these tasks

- No generate workflow is dispatched by hand until SR2, SR3 and SR4 are on `main`. A generate run on a task branch commits package folders to that branch; revert such bot commits before the branch merges.
- SR2, SR3, SR4, SR10, SR11 and SR14 edit the same workflow files, so they are built one after another, never in parallel.
- New `uses:` lines reuse the pinned action SHAs already in the repository (`scripts/check-action-pins.mjs` checks them).
- An agent runs only the tests its change reaches, with `VITEST_MAX_WORKERS=2`, and no browser or LibreOffice suite locally; browser and LibreOffice proof comes from `gh workflow run test.yml --ref <branch>`.
