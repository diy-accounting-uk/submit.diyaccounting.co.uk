<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN: the spreadsheets rest state when the year-end window rolls

Status: one plan in place of the versions v1 to v8 (archived in `../private.diyaccounting.co.uk/engineering/submit/archive/`). STC1, the stable cut, is on spreadsheets `main` (PR #201, f17057cb5): every generate run commits only new package folders. RO1 and RO2 are on spreadsheets `main` (PR #203, 8c7c585f8). RO3 and RO5 are on `main` (PR #204, 898530f30). RO4 is on `main` (PR #205, 5b54c2cf0). RO6 is on `main` (PR #206, a1ded6f4d) and ES1 too (PR #207, 593967e9c). Open: RO5's proof, that the push runs of 593967e9c commit nothing. Repository: `../spreadsheets.diyaccounting.co.uk`.

## Operator assertions (verbatim)

> When we roll to add a new latest of any of the products, that product becomes tested and also all the products that cover a current accounting period or a recent one not filed yet (e.g. year end < 1 year) are regression tested when there are changes. The new packages should automatically be generated as the date rolls over.

> For: "PLAN_SPREADSHEETS_ROLLOVER.md", I choose "2. Frozen anchors plus a rolling latest." and the rolling anchor should have a check that the anchor products have a year end in the future and the tests fail if they don't with an advisory that the exact-value checks shoudl roll to a new product when they fail and yes "The rolling latest and the in-scope set are checked by invariants that name no year-end". Please state the changes needed to achieve that.

> we have a red build on main in ../spreadsheets and I want a set of changes, ideally deliveruing to the v1.1 goals but I'll reduce scope for a stable cut.

## Goals

- Spreadsheets `main` is green, and generate runs commit only new year-end folders, for all four products, scheduled or dispatched (STC1).
- Pinned packages that no workflow overwrites, for the exact-value checks (STC1).
- A run with nothing new commits nothing and costs nothing (STC1, ES1).
- A test that fails when a pinned package is more than six months old, with a way to refresh it (RO3, RO4).
- A test over every package that names no date (RO2).
- A template, tax-data or product change reaches the existing packages, committing only the packages whose content changed (RO5, RO6).

## Where it stands

- After STC1, all four generate workflows stage only the package folders `main` does not hold (`git reset -q`, the new-folder loop, `git restore --worktree -- .`). Their report prune, "Copy latest populated to examples" steps, provenance and spec steps still run, and their output is discarded.
- `examples/<product>-latest` is the pinned package of each product: ltd Oct27 built 2026-10-05; bst and se Apr27 built 2026-11-14; taxi Apr27 built 2026-11-13. 50 files name these paths, some as `resolve(ROOT, "examples", "ltd-latest")`.
- `app/test/judge-reconciliation.test.js`, `app/test/se-derivations.test.js` and `web/browser-tests/r-sources.js` find the pinned reports by dated names in `reports/`. Nothing commits to `reports/` after STC1.
- `app/lib/guide.js` dates each package PDF by its Markdown source's file time, which is the checkout time in CI. weasyprint, pydyf and fonttools are installed unpinned; fonttools writes the embedded font subsets, which are the only bytes that differ between two runs' guide PDFs. Workbooks are already reproducible. The generate checkouts fetch one commit.
- `app/test/formula-presence-guard.test.js` already opens every `packages/*/*.xlsx`.
- `app/bin/build-packages.js` writes untracked `LICENCE.txt` and `README.txt` into each package folder; a folder holding `DO NOT USE - WORK IN PROGRESS.txt` is skipped.
- `generate-all.yml` calls the four workflows with no inputs. Each workflow's `concurrency` keeps one pending run per group.
- `app/test/generate-workflow-report-artifacts.test.js` checks the report artifacts that the commit jobs download.

## Tasks

| # | Task | Waits on |
|---|---|---|
| RO1 | All four generate workflows: delete the steps whose output nothing commits after STC1: the report prune, the "Copy latest populated to examples" steps and the uploads and downloads that carry `examples/<product>-latest`, the provenance and spec steps, and the report and page uploads and downloads that only feed them. Update `app/test/generate-workflow-report-artifacts.test.js` to match. Done when no generate workflow names `-latest`, `build-provenance-data` or `spec.html`. | STC1 |
| RO2 | New unit test: for every folder in `packages/` (skipping folders that hold the work-in-progress marker), the name parses and every expected file is present (ignoring the untracked `LICENCE.txt` and `README.txt`). Workbook loading stays in `formula-presence-guard.test.js`. | STC1 |
| RO3 | New file `examples/pinned.json`: per product the pinned year-end and build date (ltd 2027-10-31, built 2026-10-05; bst and se 2027-04-05, built 2026-11-14; taxi 2027-04-05, built 2026-11-13), read through one module `app/lib/pinned.js`. New unit test: fails when a pinned package was built more than six months ago; its message names `gh workflow run refresh-pinned.yml -f product=<product>`. The test skips when `PINNED_AGE_CHECK=off`, which the generate workflows set, so an old pin never stops new packages. | RO1 |
| RO4 | New workflow `refresh-pinned.yml` (dispatch, input `product`) installs LibreOffice as the reconcile jobs do and runs `scripts/refresh-pinned.mjs --product <product>`: at the newest year-end in `packages/`, run the reconciliation for the populated scenario and for each scenario whose report the pinned checks read, copy the populated package to `examples/<product>-latest` (ltd and se: the populated folder; bst and taxi: the populated workbook as `GB_Accounts_Basic_Sole_Trader.xlsx` or `GB_Accounts_Taxi_Driver.xlsx`), run `npm run parity:refresh`, replace that product's pinned reports in `reports/` and the names the three pinned checks read, and update `pinned.json`. It pushes the result to a new branch for review with `git push --no-verify`, because `npm ci` points `core.hooksPath` at `.githooks` and the pre-push router would otherwise run the browser tier in a job with no browsers. | RO3 |
| RO5 | Package PDFs take their date from the last commit that touched the product's templates: each generate job checks out with `fetch-depth: 0` and `filter: blob:none` and passes `--source-date-epoch "$(git log -1 --format=%ct -- app/templates/<product>)"` to `npm run generate`, which `guide.js` uses in place of the file time. weasyprint, pydyf and fonttools are installed at pinned versions. Done when two runs on one commit produce byte-identical packages. | RO1 |
| RO6 | All four generate workflows gain a `commit-scope` output in the `params` job: `changed-packages` for a dispatch (the input's default, which `generate-all.yml` calls also take) and for a push, `new-folders` for a scheduled run. For `changed-packages` the commit job stages `git add packages/` in place of the new-folder loop, then `git restore --worktree -- .`, so no run stages anything outside `packages/`. A push to `main` that changes `app/templates/**`, `app/data/**`, `app/products/**`, `app/lib/**` (except `app/lib/provenance-data.js`), `app/bin/generate.js` or the workflow file itself starts a run; the workflow file is in the paths so that the merge of RO6 starts one run per product, because the committed packages predate template and product changes already on `main`. Push runs use their own concurrency group (`<product>-packages-push-${{ github.ref }}`) with `cancel-in-progress: false`, so a scheduled run never replaces a pending push run. | RO5 |

ES1 on `NEXT.md` (a run with nothing new stops early) edits the same workflows and runs after RO6.

## Rules for these tasks

- RO1, RO3, RO5, RO6 and ES1 edit the same workflow files (RO3 sets `PINNED_AGE_CHECK` in them), so they are built one after another, never in parallel. RO2 and RO4 can run beside them.
- No generate workflow is dispatched from a task branch. A generate run on a task branch commits package folders to that branch; revert such bot commits before the branch merges.
- New `uses:` lines reuse the pinned action SHAs already in the repository (`scripts/check-action-pins.mjs` checks them).
- An agent runs only the tests its change reaches, with `VITEST_MAX_WORKERS=2`, and no browser or LibreOffice suite locally. It pushes with `SKIP_PUSH_TESTS=1`, because the pre-push hook otherwise routes the browser and LibreOffice tiers over the branch's diff. Browser and LibreOffice proof comes from `gh workflow run test.yml --ref <branch>`.
