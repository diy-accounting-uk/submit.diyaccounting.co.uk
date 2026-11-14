<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN: the spreadsheets rest state when the year-end window rolls

Status: v1.1 — v1 corrected for the breaking weaknesses found by three zero-context reviews (2026-11-14), with the rejected options removed. Applied after rolling spreadsheets `main` back to its state at 17:56 UTC on 14 November 2026 (commit 6a9a7c9c5). Repository: `../spreadsheets.diyaccounting.co.uk`. v5.1: SR14 (early stop when nothing is new) is taken out of this plan and is its own board task after these land (operator, 2026-11-14).

## Operator assertions (verbatim)

> When we roll to add a new latest of any of the products, that product becomes tested and also all the products that cover a current accounting period or a recent one not filed yet (e.g. year end < 1 year) are regression tested when there are changes. The new packages should automatically be generated as the date rolls over.

> start a new propsal on what the new stable rest state should be that gives me three options then we'll consider what the fixes are.

> For: "PLAN_SPREADSHEETS_ROLLOVER.md", I choose "2. Frozen anchors plus a rolling latest." and the rolling anchor should have a check that the anchor products have a year end in the future and the tests fail if they don't with an advisory that the exact-value checks shoudl roll to a new product when they fail and yes "The rolling latest and the in-scope set are checked by invariants that name no year-end". Please state the changes needed to achieve that.

> Adopt all 12 and tell me when the plan is updated, sync the board with tasks from the plan and then list those tasks.

## Goals

- A run with nothing new commits nothing.
- Spreadsheets `main` is green again, at its 17:56 state, with PR #200 closed (SR1, SR12).
- Generate runs commit only new year-end folders, for all four products, scheduled or dispatched (SR2, SR3).
- Pinned packages that no workflow overwrites, for the exact-value checks, with their report fixtures out of the prune's reach (SR4, SR5, SR8).
- A test that fails when a pinned package is more than six months old (SR6, SR7).
- A test over every package that names no date (SR9).
- A template, tax-data or product change reaches the existing packages, committing only the packages whose content changed (SR10, SR11).

## Where it stands

- After 6a9a7c9c5 (17:56), `origin/main` holds two commits: 40afa42af, the `generate-ltd.yml` dispatch of 2026-11-14 (run 43623012544, committed 18:22 UTC), and 89d680d8d, which adds only `.claude/skills/orient-*` and lines in `CLAUDE.md` and stays. 40afa42af added the Nov27 and Dec27 Company folders, rewrote files in every other Company folder, rewrote `examples/ltd-latest`, renamed the two Oct27 brickwork reports to Dec27 (the prune at `generate-ltd.yml` lines 494 to 497), and changed `app/lib/provenance-data.js` and the reconciliation page.
- Three checks pin Oct27, so `main` fails them: `app/test/judge-reconciliation.test.js` (report file names, lines 44 to 45), the diya-gl parity gate (`diya-gl/parity.sh`), and `web/browser-tests/diya-gl-ltd-equivalence.browser.test.js` (cells of `examples/ltd-latest`).
- At 17:56 the Company folders are Apr20 to Oct27 (91), and the latest tax-year folders are Apr27. On 2026-11-16 the window reaches Jan28 (`yearEndCutoff`, `app/bin/generate.js` lines 51 to 54), so that Monday's run adds Nov27, Dec27 and Jan28.
- A scheduled `generate-ltd.yml` run commits only new folders in `packages/` (lines 498 to 509); line 503 (`git reset -q`) and line 509 (`git restore --worktree -- .`) are part of that path, and line 509 is what lets the `git pull --rebase` at line 521 succeed. A dispatched run commits every generated file (lines 510 to 512).
- `generate-bst.yml`, `generate-se.yml` and `generate-taxi.yml` have no schedule (`generate-bst.yml` lines 9 to 12), and every run of them commits every generated file (`generate-bst.yml` lines 440 to 441). The tax-year packages next add a folder (Apr28) from 16 February 2027.
- `app/lib/guide.js` line 41 dates each package PDF by its Markdown source's file time, which is the checkout time in CI. `generate.js` takes `--source-date-epoch` to override it (lines 14 and 160 to 164); no workflow passes it. weasyprint is installed unpinned (`generate-ltd.yml` line 144). Workbooks are already reproducible. The generate jobs fetch one commit (line 131), so `git log -- <path>` there returns the head commit.
- `app/bin/build-packages.js` (lines 43 to 44) writes untracked `LICENCE.txt` and `README.txt` into each package folder (`.gitignore` lines 97 to 99); a folder holding `DO NOT USE - WORK IN PROGRESS.txt` is skipped (line 78).
- Each generate workflow has one `concurrency` group per ref with `cancel-in-progress: true` (`generate-ltd.yml` lines 5 to 7). A group keeps one pending run, and a newer run of any event replaces it.
- `web/browser-tests/r-sources.js` lines 256 to 268 and 430 to 440 take each example's year-end from the highest report name in `reports/`. `app/test/judge-reconciliation.test.js` (lines 43 to 52) and `app/test/se-derivations.test.js` (lines 45 to 49) name eight Apr27 and Oct27 report files.
- `examples/ltd-latest` holds Oct27 (`Financialaccounts.xlsx` Admin!F21 is 2027-10-31), last built on 2026-10-05; `examples/bst-latest` and `examples/se-latest` on 2026-11-14; `examples/taxi-latest` on 2026-11-13. The "Copy latest populated to examples" steps are today the only way a pinned package is rebuilt; `npm run parity:refresh` refreshes all four products' parity fixtures at once.

## Tasks

| # | Task | Waits on |
|---|---|---|
| SR1 | Revert 40afa42af in one pull request, so `main` matches 17:56. Proof: that pull request's `test.yml` run passes in full. | — |
| SR2 | `generate-ltd.yml` commit job: every run, scheduled or dispatched, takes the new-folder path (`git reset -q`, the loop, `git restore --worktree -- .`, lines 503 to 509). Delete the event test and the dispatched `git add` (lines 498 and 510 to 513), the report prune (lines 489 to 497), and the provenance and spec steps (lines 479 to 482), whose output nothing stages any more. For the same reason delete the reconcile job's judge steps (lines 311 to 325) and its page build and page upload (lines 354 to 365), and the commit job's downloads of the reports and the page (lines 456 to 460 and 466 to 470): a failure in one of these stops the commit of new folders, and the page build failed run 43553723891 in this way. | SR1 |
| SR3 | SR2's change, deletions included, in `generate-bst.yml`, `generate-se.yml` and `generate-taxi.yml`: the `git add` of everything (`generate-bst.yml` lines 440 to 441) becomes `git reset -q`, the new-folder loop and `git restore --worktree -- .` (the loop also covers the `Payslip 05` folders `generate-se.yml` lines 127 to 139 make). Add `generate-ltd.yml`'s Monday schedule (lines 10 to 17) to each, at its own minute of the 04:00 hour so the four pushes do not meet. | SR2 |
| SR4 | All four generate workflows: delete the steps that replace `examples/<product>-latest`, and the uploads and downloads that carry it. Done when no generate workflow names `-latest`. | SR3 |
| SR5 | Rename `examples/<product>-latest` to `examples/<product>-pinned`, and update every file that names them, including those that spell the path as `resolve(ROOT, "examples", "ltd-latest")`. Done when `git grep -l -e bst-latest -e se-latest -e ltd-latest -e taxi-latest -- ':!packages' ':!scripts/update-java.sh'` lists nothing (it lists 50 files at 6a9a7c9c5) and `scripts/leg-test-files.mjs` line 28 matches `-pinned`. | SR4 |
| SR6 | New file `examples/pinned.json`: per product the pinned year-end and build date (ltd 2027-10-31, built 2026-10-05; bst and se 2027-04-05, built 2026-11-14; taxi 2027-04-05, built 2026-11-13), read through one module `app/lib/pinned.js`. | SR5 |
| SR7 | New unit test: fails when a pinned package was built more than six months ago; its message names `gh workflow run refresh-pinned.yml -f product=<product>`. The test skips when `PINNED_AGE_CHECK=off`, which the generate workflows set, so an old pin never stops new packages. | SR6, SR13 |
| SR8 | Copy (do not move) the eight pinned report files from `reports/` to `app/test/fixtures/pinned-reports/`; `reports/` stays as it is. `judge-reconciliation.test.js`, `se-derivations.test.js` and `r-sources.js` find each pinned report and year-end through `app/lib/pinned.js` by product and scenario, never by a dated name. | SR6 |
| SR9 | New unit test: for every folder in `packages/` (skipping folders that hold the work-in-progress marker), the name parses, every expected file is present (ignoring the untracked `LICENCE.txt` and `README.txt`), and each workbook opens. | SR1 |
| SR10 | All four generate workflows: a push to `main` that changes `app/templates/**`, `app/data/**`, `app/products/**`, `app/lib/**`, `app/bin/generate.js` or the workflow file itself (except `app/lib/provenance-data.js`) starts a run that regenerates every package from the pushed commit. The workflow file is in the paths so that the merge of SR10 starts one run per product: the committed packages predate template and product changes already on `main`, and no other run commits a changed package. Its commit step runs `git add packages/` between `git reset -q` and `git restore --worktree -- .`, so it commits every new or changed package and nothing outside `packages/`. Push runs use their own concurrency group (`<product>-packages-push-${{ github.ref }}`) with `cancel-in-progress: false`: a newer push run replaces only a pending push run and regenerates from the newer head, and a scheduled or dispatched run never replaces a pending push run. | SR3, SR11 |
| SR11 | Package PDFs take their date from the last commit that touched the product's templates: each generate job checks out with `fetch-depth: 0` and `filter: blob:none` and passes `--source-date-epoch "$(git log -1 --format=%ct -- app/templates/<product>)"` to `npm run generate`. weasyprint is pinned to one version. | SR3 |
| SR12 | Close spreadsheets PR #200 without merging. | — |
| SR13 | New workflow `refresh-pinned.yml` (dispatch, input `product`) runs `scripts/refresh-pinned.mjs --product <product>`: build the populated scenario package at the newest year-end, copy it to `examples/<product>-pinned`, run `npm run parity:refresh`, refresh that product's pinned report copies, and update `pinned.json`. It pushes the result to a new branch for review. | SR8 |

## Rules for these tasks

- No generate workflow is dispatched by hand until SR2, SR3 and SR4 are on `main`. A generate run on a task branch commits package folders to that branch; revert such bot commits before the branch merges.
- SR2, SR3, SR4, SR7, SR10 and SR11 edit the same workflow files (SR7 sets `PINNED_AGE_CHECK` in them), so they are built one after another, never in parallel.
- New `uses:` lines reuse the pinned action SHAs already in the repository (`scripts/check-action-pins.mjs` checks them).
- An agent runs only the tests its change reaches, with `VITEST_MAX_WORKERS=2`, and no browser or LibreOffice suite locally; browser and LibreOffice proof comes from `gh workflow run test.yml --ref <branch>`.
