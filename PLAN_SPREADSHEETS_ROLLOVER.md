<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN: the spreadsheets rest state when the year-end window rolls

Status: Option 2 chosen on 2026-11-14; an independent review the same day (`../private.diyaccounting.co.uk/engineering/spreadsheets/REVIEW_SR1_SR10_2026-11-14.md`) found the first SR1 to SR10 would fail the goals, and the operator adopted all twelve of its changes. The tasks are SR1 to SR12 and the decisions OSR5 and OSR7 in "The changes for Option 2", each a row on `NEXT.md`. Repository: `../spreadsheets.diyaccounting.co.uk`.

## Operator assertions (verbatim)

> When we roll to add a new latest of any of the products, that product becomes tested and also all the products that cover a current accounting period or a recent one not filed yet (e.g. year end < 1 year) are regression tested when there are changes. The new packages should automatically be generated as the date rolls over.

> start a new propsal on what the new stable rest state should be that gives me three options then we'll consider what the fixes are.

> For: "PLAN_SPREADSHEETS_ROLLOVER.md", I choose "2. Frozen anchors plus a rolling latest." and the rolling anchor should have a check that the anchor products have a year end in the future and the tests fail if they don't with an advisory that the exact-value checks shoudl roll to a new product when they fail and yes "The rolling latest and the in-scope set are checked by invariants that name no year-end". Please state the changes needed to achieve that.

> Adopt all 12 and tell me when the plan is updated, sync the board with tasks from the plan and then list those tasks.

## Goals

- Spreadsheets keeps itself correct and current as time passes, with nobody touching it.
- New packages appear for every product as the date brings a new year-end, with no dispatch.
- Exact figures are proved against fixed anchors that a roll never changes, and the anchors' own year-ends are kept in the future.
- Whatever year-ends are current is proved by rules that hold for any year-end, so the calendar moving can never turn the build red.
- Heavy proof (the LibreOffice calculations, the browser suite, byte stability) runs once per push in CI on a clean runner, never repeated on this Mac.
- Local work only runs quick checks specific to the change, so parallel sessions and agents never fail each other's runs by load.
- A run with nothing new commits nothing and costs nothing.
- Red only ever means a real defect in what customers download.
- The test: could the pipeline run unattended for a year, through every month-end and a new tax year, while other work runs on this Mac, with every red still a real defect?

## Where it stands

- The `generate-ltd.yml` dispatch of 2026-11-14 (run 43623012544, commit 40afa42af) moved the latest Company year-end from Oct27 to Dec27. Its `commit` job keeps only the latest Company brickwork reports and rewrites `examples/ltd-latest`.
- Three checks pin the Oct27 year-end, so spreadsheets `main` fails them: `app/test/judge-reconciliation.test.js` (report file names), the diya-gl parity gate (`diya-gl/parity.sh` against the committed `report.json` and `bookchecks.json`), and `web/browser-tests/diya-gl-ltd-equivalence.browser.test.js` (cells of `examples/ltd-latest`). The bot commit started no workflow, so `main`'s own CI has not shown it; pull request #200 shows it.
- A dispatched Company roll breaks them again: a dispatched run commits every generated file. A scheduled run commits only new package folders (SC1's guard), so it adds packages but never refreshes reports, examples, pages or existing packages.
- The cause of the incident: the generate workflows commit without running what `test.yml` runs, a `GITHUB_TOKEN` push starts no workflow, and `deploy.yml` deploys `main` daily at 07:17 UTC without waiting for `test.yml`, so an unchecked bot commit can reach the site.
- The tax data runs out: `app/data/ltd-2027.toml` ends on 2028-03-31 and the window reaches Apr28 on 2027-02-16; `app/bin/generate.js` loops only over the toml files that exist, so Company would stop getting new packages with nothing reporting it (Self Employed on 2028-02-16).
- Only `generate-ltd.yml` runs on a schedule (Mondays 04:00 UTC). `generate-bst.yml`, `generate-taxi.yml` and `generate-se.yml` have their schedules commented out, so a new tax year's packages appear only on a dispatch.
- The Company reconcile matrix tests a representative set (latest March, June, February and the overall latest) of the last 24 months, not every year-end in scope.
- Latest today: Basic Sole Trader, Taxi Driver and Self Employed Apr27 (tax year to 2027-04-05); Company Dec27.

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
- `packages/` already keeps every year-end (93 Company folders, Apr20 to Dec27), so an anchor adds no package that is not there already.

## Option 3: a release pull request per roll

The scheduled run builds the new packages on a branch and opens a pull request instead of committing to `main`. The pull request carries the packages and the regenerated expectations, runs the full test set for the new latest and the regression set for the in-scope year-ends, and merges through `/auto-merge` when green.

- `main` changes only through green pull requests, so a roll can never leave it red.
- A red roll waits as an open pull request with its failure named, and the site keeps the previous packages.
- A merge needs the same gates as any other change; with no session running, a green roll still needs `/auto-merge` or GitHub auto-merge on that branch.
- Cost: one pull request per roll (monthly for Company, yearly for the tax-year products).

## The changes for Option 2

All in `../spreadsheets.diyaccounting.co.uk`, as adopted from the review. 44 files read `examples/<product>-latest` or a named year-end report today. An anchor is a year-end, not a frozen file: the generate workflows rebuild it from the current templates on every run and compare it with committed expected values.

| # | Change | Files | Goal |
|---|---|---|---|
| SR1 | The pre-push hook runs only quick, change-specific checks: it drops the `calc`, `browser` and `infra` tiers (CI's `app-test`, `browser-test` and `infra-test` jobs run them); its live-process guard applies only to the tiers that run, and vitest or Playwright only in the same worktree; the gates run the parity gate only when the diff reaches `diya-gl/`, `app/lib/` or `examples/`; `app/test/test-scope-live-guard.test.js` follows. | ~3 | local work is quick; parallel runs never fail each other |
| SR2 | One registry, `app/lib/fixed-examples.js` (the name `app/lib/anchors/` is taken), per product: the anchor year-end, `examples/<product>-anchor`, the report fixtures and the parity fixtures, and the list of its consumers. First step: Company's anchor takes Oct27 from b22d451a9 so `main` goes green. Report fixtures for all four products (ltd brickwork Oct27; se brickwork and advanced, bst basic, brickwork and sp-sixty, taxi basic and sp-sixty Apr27) move outside `reports/`, in a form the CI hash and the pre-push Markdown fast path do not skip. All 44 consumers read the registry: `web/browser-tests/r-sources.js` `latestYearEnd` and `latestSeYearEnd`, the equivalence test's drift cells from the anchor's month (`monthTabOrder`), `diya-gl/scripts/parity-fixtures.mjs`, `ltd-period-shift.test.js`, the `test.yml` roundtrip year-ends; `export.js` and `report.js` change only in comments; `build-reconciliation-pages.js` takes the leg's populated-latest folder. `scripts/leg-test-files.mjs` goes. A test fails when an anchor year-end is today or earlier, naming the roll workflow of SR6. One Opus agent. | ~50 | exact figures against anchors |
| SR3 | Each generate workflow runs one leg at the registry's anchor year-end on every run, copies that populated output to `examples/<product>-anchor`, and before it commits checks parity, the unit tests that read the anchor, and the CLI form of S2 against S3. The expected values stay committed; a shifted figure fails the run and nothing is committed. | ~4 | exact figures; red means a defect |
| SR4 | A gate before each generate commit: the leg runs the full unit tier and the parity gate on the tree it will commit; extra-scenario anomalies block the commit; the job dispatches `test.yml` after its push; the scheduled prod deploy requires a green `test.yml` record for `HEAD`. | ~6 | red means a defect; nothing unchecked reaches the site |
| SR5 | A tax-data horizon check: a unit test fails eight weeks before `yearEndCutoff` reaches a year-end with no `app/data/<regime>-<year>.toml`. Due before 2027-02-16. What the new file holds is OSR5. | ~1 | packages keep appearing |
| SR6 | A workflow that rolls the anchor: on dispatch, and on a schedule a set time before each anchor's year-end, it builds the populated anchor at the newest year-end in the window, refreshes the parity and report fixtures and the registry, and opens a pull request for `/auto-merge`. Due before March 2027 (the tax-year anchors expire on 2027-04-05). | ~3 | keeps itself current |
| SR7 | The in-scope set in the generate workflows: every year-end from today minus 12 months, by day, to the latest, inclusive (26 Company year-ends today, Nov25 to Dec27); S2 is the CLI engine over the export of the populated package; the judge runs only at the latest leg; the Basic Sole Trader, Self Employed and Taxi Driver matrix as OSR7 decides. | ~6 | current year-ends checked by rules that name no year-end |
| SR8 | A `test.yml` job for pull requests that touch `app/templates`, `app/data`, `app/products` or the generator libraries: generate and reconcile the in-scope year-ends of the products the change reaches, with no commit. | ~2 | a change is regression tested |
| SR9 | One scheduled `generate-all.yml` in place of the four product schedules (it runs the products one after another, because their commits collide on `provenance-data.js`, the reconciliation index and `spec.html`). Its first job exits before generating when the window adds no year-end and the hash of the inputs equals the one recorded in the last generate commit. | ~5 | no dispatch; nothing new costs nothing |
| SR10 | Pull request #200 (SC4) keeps the PDF epoch, the provenance writer and the page date, drops the example-workbook keeper, puts the scheduled-run guard back until SR11, and adds the PDF epoch to the Basic Sole Trader, Self Employed and Taxi Driver workflows. | ~6 | nothing new commits nothing |
| SR11 | A dispatched CI job generates one year-end of each product twice with the same epoch and compares every output (packages, reports, screenshots, pages); each timestamp source found is fixed; then the scheduled-run guard goes. | ~4 | nothing new commits nothing |
| SR12 | Payslip 05 (seven packages built in `generate-se.yml`) joins the in-scope checks. | ~2 | red means a defect in any download |

Decisions: **OSR5**, what a new tax-year file holds when the horizon check fires (a human-written file from HMRC's figures, or the last year carried forward with a flag that blocks publishing until checked). **OSR7**, the Basic Sole Trader, Self Employed and Taxi Driver matrix in SR7 (keep all seven tax years reconciled, or only the in-scope two), and whether "today minus 12 months, by day" is the in-scope rule.

Rules for these rows: an agent runs only the test files its change reaches, with `VITEST_MAX_WORKERS=2`, and no browser or LibreOffice suite; a row that changes browser specs is proved with `gh workflow run test.yml --ref <branch>`, which may run as often as needed.

Order: SR1, SR2, SR3 and SR4 in one pull request make `main` green. SR5 before 2027-02-16. SR6 before March 2027. Then SR7 and SR8, SR9, SR10, SR11 and SR12.
