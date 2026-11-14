<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN: the spreadsheets rest state when the year-end window rolls

Status: the operator chose Option 2 on 2026-11-14, with an anchor year-end check; the changes are SR1 to SR8 in "The changes for Option 2", each a row on `NEXT.md`. Repository: `../spreadsheets.diyaccounting.co.uk`.

## Operator assertions (verbatim)

> When we roll to add a new latest of any of the products, that product becomes tested and also all the products that cover a current accounting period or a recent one not filed yet (e.g. year end < 1 year) are regression tested when there are changes. The new packages should automatically be generated as the date rolls over.

> start a new propsal on what the new stable rest state should be that gives me three options then we'll consider what the fixes are.

> For: "PLAN_SPREADSHEETS_ROLLOVER.md", I choose "2. Frozen anchors plus a rolling latest." and the rolling anchor should have a check that the anchor products have a year end in the future and the tests fail if they don't with an advisory that the exact-value checks shoudl roll to a new product when they fail and yes "The rolling latest and the in-scope set are checked by invariants that name no year-end". Please state the changes needed to achieve that.

## Where it stands

- The `generate-ltd.yml` dispatch of 2026-11-14 (run 43623012544, commit 40afa42af) moved the latest Company year-end from Oct27 to Dec27. Its `commit` job keeps only the latest Company brickwork reports and rewrites `examples/ltd-latest`.
- Three checks pin the Oct27 year-end, so spreadsheets `main` fails them: `app/test/judge-reconciliation.test.js` (report file names), the diya-gl parity gate (`diya-gl/parity.sh` against the committed `report.json` and `bookchecks.json`), and `web/browser-tests/diya-gl-ltd-equivalence.browser.test.js` (cells of `examples/ltd-latest`). The bot commit started no workflow, so `main`'s own CI has not shown it; pull request #200 shows it.
- Each Company roll breaks them again: the window is the last day of the month 13 months ahead (`app/bin/generate.js`, `yearEndCutoff`), one month further from the 16th.
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
- Cost: the anchors' packages stay in the repository after they leave the download window.

## Option 3: a release pull request per roll

The scheduled run builds the new packages on a branch and opens a pull request instead of committing to `main`. The pull request carries the packages and the regenerated expectations, runs the full test set for the new latest and the regression set for the in-scope year-ends, and merges through `/auto-merge` when green.

- `main` changes only through green pull requests, so a roll can never leave it red.
- A red roll waits as an open pull request with its failure named, and the site keeps the previous packages.
- A merge needs the same gates as any other change; with no session running, a green roll still needs `/auto-merge` or GitHub auto-merge on that branch.
- Cost: one pull request per roll (monthly for Company, yearly for the tax-year products).

## The changes for Option 2

All in `../spreadsheets.diyaccounting.co.uk`. Today 31 files read `examples/<product>-latest` or a named year-end report: 13 unit tests, 13 browser tests, `diya-gl/parity.sh`, `diya-gl/smoke.sh`, `scripts/leg-test-files.mjs`, and `app/bin/export.js` and `app/bin/report.js`. `app/test/judge-reconciliation.test.js` and `app/test/se-derivations.test.js` name report files.

| # | Change | Files | Fixes |
|---|---|---|---|
| SR1 | One anchor registry: per product (bst, taxi, se, ltd) the anchor year-end, its package folder `examples/<product>-anchor`, its report files and its parity fixture folder. Every exact-value check reads it; none names a year-end itself. | 1 new | the pinning |
| SR2 | Freeze the anchors: `examples/<product>-latest` becomes `examples/<product>-anchor` with today's content, except Company, which takes the Oct27 content from before the roll (commit b22d451a9). The Oct27 Company brickwork reports come back from b22d451a9 into a folder the prune never touches. Anchors: Company 2027-10-31; Basic Sole Trader, Taxi Driver, Self Employed 2027-04-05. | ~60 moved, 0 edited | the 3 red checks |
| SR3 | Point the 31 consumers at the registry. A consumer that checks an exact figure reads the anchor; a consumer that needs only "a real package" (the reconciliation pages, `export.js`, `report.js`) reads the latest from `packages/`. | ~31 | the pinning |
| SR4 | The anchor check: a unit test fails for each anchor whose year-end is today or earlier. Its message: "<product> anchor <date> has passed. Roll the exact-value checks to a new anchor: copy the latest <product> package to examples/<product>-anchor, run npm run parity:refresh, set the year-end in the registry, and commit." | 1 new | the operator's check |
| SR5 | The generators stop rewriting the anchors: `generate-{bst,taxi,se,ltd}.yml` no longer delete and copy `examples/<product>-latest`. Their report prune keeps the latest year-end and the anchor year-end. | 4 | no roll breaks a check |
| SR6 | Invariants for the in-scope set, naming no year-end: each generate workflow computes, from the date and `packages/`, the latest and every year-end that ended less than 12 months ago. Each one must pass: the reconciliation report has no anomaly (today's step), the judge passes (today's step), the round trip loses nothing (`verify-roundtrip`), and the CLI and the workbook agree cell for cell on the generated package (the S2/S3 equivalence, pointed at the package rather than an example). A new latest runs the full set for its product. A change to templates, tax data, the engine or the generator runs the in-scope set of every product it reaches. This replaces the Company matrix of representative year-ends (latest March, June, February and the overall latest) with the in-scope set, 25 Company year-ends today. | ~6 | the operator's regression scope |
| SR7 | Generation on the date: `generate-bst.yml`, `generate-taxi.yml` and `generate-se.yml` get the weekly Monday schedule `generate-ltd.yml` has. A run with no new year-end commits nothing. | 3 | packages appear with no dispatch |
| SR8 | SC4 (pull request #200) shrinks to what Option 2 still needs: the PDF epoch, `provenance-data.js` and the page date. Its example-workbook keeper goes, because SR5 stops writing the examples. It rebases onto SR1 to SR5. | ~4 | quiet weekly runs |

Order: SR1 to SR5 in one pull request, with `NEXT.md` row SR11 (the pre-push hook stops running the `calc` and `browser` tiers CI runs), makes `main` green, as a two-agent chain (Opus maps every consumer and writes the registry, Sonnet repoints them). SR6 is a second pull request (Opus, because it changes what each generate workflow runs). SR7 and SR8 follow (Sonnet).
