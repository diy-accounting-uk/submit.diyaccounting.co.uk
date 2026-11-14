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

## Tasks

Applied after rolling back to `main` at 17:56 UTC on 14 November 2026. That point was a direct commit to `main` by the diya-gl publish workflow, not a merge; the last merge was PR #199 at 17:46. At 17:56 `generate-ltd.yml` already runs every Monday at 04:00 UTC (line 17) and a scheduled run commits only new folders in `packages/` (lines 498 to 509).

| # | Task | Waits on |
|---|---|---|
| SR1 | Revert the 18:22 generate commit (40afa42af) in one pull request, so `main` matches 17:56 and `test.yml` passes again. | — |
| SR2 | `generate-ltd.yml`: a dispatched run commits only new folders in `packages/`, as a scheduled run already does (replace the `else` branch at lines 510 to 512). | SR1 |
| SR3 | `generate-bst.yml`, `generate-se.yml`, `generate-taxi.yml`: each run commits only new folders in `packages/`. | SR1 |
| SR4 | All four generate workflows: delete the steps that replace `examples/<product>-latest` (for example `generate-ltd.yml` lines 326 to 334, `generate-bst.yml` lines 267 to 275) and the uploads and `git add` that carry it. | SR1 |
| SR5 | Rename `examples/<product>-latest` to `examples/<product>-pinned`, and update every test and script that reads those folders. | SR4 |
| SR6 | New file `examples/pinned.json`: each product's pinned year-end and the date its package was built. | SR5 |
| SR7 | New unit test: fails when a pinned package was built more than six months ago; its message says how to replace it. | SR6 |
| SR8 | Move the pinned products' report files from `reports/` to `app/test/fixtures/pinned-reports/`, and update the tests that read them. | SR1 |
| SR9 | New unit test: for every folder in `packages/`, the name parses, every expected file is present, and each workbook opens. | SR1 |
| SR10 | All four generate workflows: when `app/templates`, `app/data` or `app/products` change, start a run that commits every changed package in `packages/`. | SR2, SR3 |
| SR11 | Package PDFs take the date of the last template commit, so untouched packages regenerate identical and are not committed. | SR10 |
| SR12 | Close spreadsheets PR #200 without merging. | — |
