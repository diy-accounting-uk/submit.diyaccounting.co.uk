<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN: keeping the spreadsheet packages current

Status: RF1's ltd half is on spreadsheets main (PR #221, b2df63439, 2026-11-20): the ltd pin is 2028-01-31 and its tests moved with it. RF1's se half was rehearsed on 2026-11-22 (U2): the real se, bst and taxi refresh waits on `main`'s window reaching the Apr28 year end from 2027-01-16. Repository: `../spreadsheets.diyaccounting.co.uk`. The rollover plan that built the current pipeline is archived at `../private.diyaccounting.co.uk/engineering/submit/archive/PLAN_SPREADSHEETS_ROLLOVER.md`.

## Operator assertions (verbatim)

> When we roll to add a new latest of any of the products, that product becomes tested and also all the products that cover a current accounting period or a recent one not filed yet (e.g. year end < 1 year) are regression tested when there are changes. The new packages should automatically be generated as the date rolls over.

> Move RF1 off the board and into a plan with some surrounding context for PLAN_SPREADSHEETS_UPDATES.md also add SC2 to the plan but keep it on the board. Also add a new task to the plan for the tax updates to be a monthly ci job that mimics the spreadsheets skill and also works like the spreadsheets updates to create byte identical output when here are no material changes so there isn't a new commit.

> I want a LLM powered githb action that updates the tax rates and the github action should commit.

For the first ltd refresh the operator chose (2026-11-15): the exact-value checks move to the new pinned package in that refresh's pull request.

> go fot ltd. and I want a plan for this (make an updates section in the doc PLAN_SPREADSHEETS_UPDATES.md including ltd and this )for se can set up a test in prod so we run the tax year updater to get the 2028-04-05 ye tax rules for se/bstand taxi, and run a test with the current pinning, then re-pin and another test, then we wind back and remove the 2028 ye stuff we added when we get a successful test. (operator, 2026-11-20)

> put U2 on the board and yes, this is in prod. don't start it yet I shall soon be existing the session so also board U1 and prepare for this session to close (operator, 2026-11-20)

## Where it stands

- **Generation.** The four generate workflows (`generate-ltd.yml`, `generate-bst.yml`, `generate-se.yml`, `generate-taxi.yml`) run on a push to `main` that changes `app/templates/**`, `app/data/**` (not `app/data/releases.json`), `app/products/**`, `app/lib/**` (not `app/lib/provenance-data.js`), `app/bin/generate.js` or the workflow itself. They also run on a dispatch, on a call from `generate-all.yml` and, for ltd only, on a schedule.
- **What a run commits.** The `params` job sets `commit-scope`: `changed-packages` for a push, a call or a default dispatch, and `new-folders` for a schedule. `changed-packages` stages new and modified files under `packages/` with `git add --ignore-removal`, and `new-folders` stages only the folders `main` lacks. A `new-folders` run whose window holds nothing new stops after `params` (`generate.js --package <p> --list`).
- **Byte-identical output.** Package PDFs take `--source-date-epoch` from the product's last template commit, and weasyprint 70.0, pydyf 0.13.0 and fonttools 4.68.0 are pinned; workbooks were already reproducible. The push runs of 593967e9c, 14bd570d9 and bedbcdde9 committed nothing for all four products. An unchanged input therefore gives no commit.
- **Pins.** `examples/pinned.json` holds each product's pinned year-end and build date. It is read and written only through `app/lib/pinned.js`. The values are ltd 2028-01-31 (built 2026-11-20), bst and se 2027-04-05 (built 2026-11-14), and taxi 2027-04-05 (built 2026-11-13).
  - `app/test/pinned-age.test.js` fails once a pin is more than six months old, and names `gh workflow run refresh-pinned.yml -f product=<product>`.
  - `refresh-pinned.yml` pushes `refresh-pinned/<product>-<run id>` and writes the `gh pr create` command into its summary, because Actions may not create pull requests in this repository.
- **The judge.** The deploy's and the reconcile jobs' LLM judge (`app/bin/judge-reconciliation.js`) runs Nova 2 Lite at temperature 0 with up to 30,000 output tokens. A fail stands only on two fails in a row, and the digest (`app/lib/report-indicators.js`) states the corporation tax bridge from operating profit.
- **Tax data.** `app/data/se-YYYY-YYYY.toml` (tax years, BST, SE and Taxi) and `app/data/ltd-YYYY.toml` (financial years, named by the year the FY starts) hold the rates. Files exist to `se-2027-2028.toml` and `ltd-2027.toml`. The procedure for a new year is the spreadsheets skill `.claude/skills/package-updates/SKILL.md`, run by hand in a session. Submit's `.claude/skills/tax-sources/` keeps one JSON file per gov.uk source (URL, retrieval date, verbatim quote, fact ids) for the site's rates page.
- **A push made with `GITHUB_TOKEN` starts no workflow.** A bot commit to `app/data/**` therefore does not start the generate push runs; a `workflow_dispatch` sent with `GITHUB_TOKEN` does start them.

## Tasks

| # | Task | Waits on |
|---|---|---|
| RF1 | The se, bst and taxi pinned-package refresh carries its test moves: its steps are under "The real refresh of se, bst and taxi" (see Updates). The ltd browser test `web/browser-tests/diya-gl-ltd-equivalence.browser.test.js` names the first month's tab of the pinned ltd package (`FIRST_TAB`), so an ltd refresh to another year end moves it. Model: Sonnet. Size: ~6 files. | `main` building the Apr28 packages (from 2027-01-16) |

## Updates

### The real refresh of se, bst and taxi (RF1)

The rehearsal of the refresh (U2, 2026-11-22) is recorded in `../private.diyaccounting.co.uk/engineering/spreadsheets/APR28_REHEARSAL_2026-11-22.md`, with its test moves in `apr28-rehearsal.patch` beside it. bst and taxi re-pin cleanly at 2028-04-05 with two test files moved (part 3 of the patch). The se re-pin was not rehearsed. The se reconcile passes at the 2028-04-05 year end since spreadsheets pull request #222.

The steps:

1. From 2027-01-16 `yearEndCutoff` (`app/bin/generate.js`) reaches 2028-04-30 by itself, and the first generate run on `main` builds the Apr28 se, bst and taxi packages from `app/data/se-2027-2028.toml`. No window edit and no window test move is needed.
2. Dispatch `refresh-pinned.yml` with `product=se` on `main`; it pushes `refresh-pinned/se-<run id>`. Dispatch it with `product=bst` on that branch, then with `product=taxi` on the bst branch. The taxi branch holds the three pins with no merge.
3. Move the tests on the taxi branch: part 3 of the patch (`app/test/pinned-age.test.js`, whose stale pin after three re-pins is ltd, and the May row of `web/browser-tests/diya-gl-taxi-equivalence.browser.test.js`), and the se moves that were not rehearsed: a 2027-28 entry in `app/data/hmrc/sa103-mtd-mapping.json`'s `api.years`; the 2027-28 facts in `app/test/se-derivations.test.js`'s `EXPECT_PRESENT_BY_YEAR`, `EXPECT_ABSENT_BY_YEAR` and `EXPECT_BASIS_PERIOD_ADJUSTMENTS_BY_YEAR`, and its Structures and Buildings Allowance figures; and what the se browser tests (`web/browser-tests/diya-gl-se-*.browser.test.js`, `diya-gl-equivalence.browser.test.js`, `diya-gl-formats.browser.test.js`) show.
4. Open the pull request from the taxi branch; `test.yml` runs on it with its browser, reconcile and judge jobs.

Facts that shape it:

- A `refresh-pinned.yml` run pushes with `GITHUB_TOKEN`, which starts no workflow, and makes its branch from the ref it is dispatched on (`BASE: github.ref_name`). `test.yml` runs by itself on a pull request to `main`; on a branch with no pull request it runs by dispatch (`gh workflow run test.yml --ref <branch>`).
- The "Install LibreOffice Calc" step can time out at 10 minutes when the deb cache is cold (the first run of an ISO week, or after a change to `.github/actions/apt-install`). No test runs in such a job; re-run the failed jobs once.
- The five WARNINGs of the se Apr28 report are listed in the record; they do not fail a run.

## Rules for these tasks

- No generate workflow is dispatched from a task branch. A generate run there commits package folders to that branch.
- New `uses:` lines reuse the pinned action SHAs already in the repository (`scripts/check-action-pins.mjs`).
- An agent runs only the tests its change reaches, with `VITEST_MAX_WORKERS=2`, and pushes with `SKIP_PUSH_TESTS=1`. Browser and LibreOffice proof comes from `test.yml` on the pull request.
