<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN: keeping the spreadsheet packages current

Status: two open tasks. TU1 and RF1 stay in this plan until the operator boards them (operator, 2026-11-15). Repository: `../spreadsheets.diyaccounting.co.uk`. The rollover plan that built the current pipeline is archived at `../private.diyaccounting.co.uk/engineering/submit/archive/PLAN_SPREADSHEETS_ROLLOVER.md`.

## Operator assertions (verbatim)

> When we roll to add a new latest of any of the products, that product becomes tested and also all the products that cover a current accounting period or a recent one not filed yet (e.g. year end < 1 year) are regression tested when there are changes. The new packages should automatically be generated as the date rolls over.

> Move RF1 off the board and into a plan with some surrounding context for PLAN_SPREADSHEETS_UPDATES.md also add SC2 to the plan but keep it on the board. Also add a new task to the plan for the tax updates to be a monthly ci job that mimics the spreadsheets skill and also works like the spreadsheets updates to create byte identical output when here are no material changes so there isn't a new commit.

> I want a LLM powered githb action that updates the tax rates and the github action should commit.

For the first ltd refresh the operator chose (2026-11-15): the exact-value checks move to the new pinned package in that refresh's pull request.

## Where it stands

- **Generation.** The four generate workflows (`generate-ltd.yml`, `generate-bst.yml`, `generate-se.yml`, `generate-taxi.yml`) run on a push to `main` that changes `app/templates/**`, `app/data/**` (not `app/data/releases.json`), `app/products/**`, `app/lib/**` (not `app/lib/provenance-data.js`), `app/bin/generate.js` or the workflow itself. They also run on a dispatch, on a call from `generate-all.yml` and, for ltd only, on a schedule.
- **What a run commits.** The `params` job sets `commit-scope`: `changed-packages` for a push, a call or a default dispatch, and `new-folders` for a schedule. `changed-packages` stages new and modified files under `packages/` with `git add --ignore-removal`, and `new-folders` stages only the folders `main` lacks. A `new-folders` run whose window holds nothing new stops after `params` (`generate.js --package <p> --list`).
- **Byte-identical output.** Package PDFs take `--source-date-epoch` from the product's last template commit, and weasyprint 70.0, pydyf 0.13.0 and fonttools 4.68.0 are pinned; workbooks were already reproducible. The push runs of 593967e9c, 14bd570d9 and bedbcdde9 committed nothing for all four products. An unchanged input therefore gives no commit.
- **Pins.** `examples/pinned.json` holds each product's pinned year-end and build date. It is read and written only through `app/lib/pinned.js`. The values are ltd 2027-10-31 (built 2026-10-05), bst and se 2027-04-05 (built 2026-11-14), and taxi 2027-04-05 (built 2026-11-13).
  - `app/test/pinned-age.test.js` fails once a pin is more than six months old, and names `gh workflow run refresh-pinned.yml -f product=<product>`.
  - `refresh-pinned.yml` pushes `refresh-pinned/<product>-<run id>` and writes the `gh pr create` command into its summary, because Actions may not create pull requests in this repository.
- **The judge.** The deploy's and the reconcile jobs' LLM judge (`app/bin/judge-reconciliation.js`) runs Nova 2 Lite at temperature 0 with up to 30,000 output tokens. A fail stands only on two fails in a row, and the digest (`app/lib/report-indicators.js`) states the corporation tax bridge from operating profit.
- **Tax data.** `app/data/se-YYYY-YYYY.toml` (tax years, BST, SE and Taxi) and `app/data/ltd-YYYY.toml` (financial years, named by the year the FY starts) hold the rates. Files exist to `se-2027-2028.toml` and `ltd-2027.toml`. The procedure for a new year is the spreadsheets skill `.claude/skills/package-updates/SKILL.md`, run by hand in a session. Submit's `.claude/skills/tax-sources/` keeps one JSON file per gov.uk source (URL, retrieval date, verbatim quote, fact ids) for the site's rates page.
- **A push made with `GITHUB_TOKEN` starts no workflow.** A bot commit to `app/data/**` therefore does not start the generate push runs; a `workflow_dispatch` sent with `GITHUB_TOKEN` does start them.

## Tasks

| # | Task | Waits on |
|---|---|---|
| RF1 | The first pinned-package refreshes carry their test moves. A session runs the refresh the age test names, opens the pull request from the job summary, and adds two kinds of change to it. (1) The first ltd refresh moves the pin from Oct27 to Dec27. Its pull request moves `app/test/judge-reconciliation.test.js` lines 253 and 673 (net assets 47,516.89) and `app/test/verify-roundtrip-frame.test.js` lines 143 to 153 (the October package) to the new pinned package (operator, 2026-11-15). (2) The first se refresh to Apr28 adds a 2027-28 entry to `sa103-mtd-mapping.json`'s `api.years`. It also adds the 2027-28 facts to `app/test/se-derivations.test.js`'s `EXPECT_PRESENT_BY_YEAR`, `EXPECT_ABSENT_BY_YEAR`, `EXPECT_BASIS_PERIOD_ADJUSTMENTS_BY_YEAR` and its Structures and Buildings Allowance figures. The rest of that test already follows the pin (`taxYearLabel`, `taxYearDataFile`). Model: Sonnet. Size: ~6 files. | The first refresh: the age test fails for ltd on 2027-04-05, or a refresh is run sooner |
| TU1 | An LLM-powered GitHub Action in spreadsheets updates the tax rates each month and commits them itself (operator, 2026-11-15). It does by machine what `.claude/skills/package-updates/SKILL.md` does by hand. (a) **Read.** The job fetches the gov.uk pages that submit's `.claude/skills/tax-sources/sources/*.json` name, plus the pages the `package-updates` skill lists. It asks Bedrock for the rates through the OIDC role the reconciliation judge already uses (`vars.SPREADSHEETS_ACTIONS_ROLE_ARN`, Nova 2 Lite at temperature 0, a tool call with a fixed schema per data file). It checks each answer against the verbatim quote on the page before it uses the figure. (b) **Write.** It updates `app/data/se-YYYY-YYYY.toml` and `app/data/ltd-YYYY.toml`, and creates a new year's pair once gov.uk publishes its rates. Writing is canonical: fixed key order, fixed number format, and no date or run stamp in a data file. So a month with no material change writes identical bytes, and `git diff --quiet` ends the run with no commit. (c) **Commit.** When a value changes, the job commits to `main` and pushes with `GITHUB_TOKEN` and `--no-verify`, as the generate workflows do. A `GITHUB_TOKEN` push starts no workflow, so the job then dispatches `generate-all.yml` (a `workflow_dispatch` sent with `GITHUB_TOKEN` does start it). That run's `changed-packages` scope commits the rebuilt packages. (d) **Schedule.** A monthly cron and a dispatch, with `concurrency` and `cancel-in-progress: false`. Proof: two runs on one commit with no gov.uk change commit nothing. A run against a fixture with one changed rate commits exactly that one line, with the model call stubbed in a unit test. Model: Opus (design), Sonnet (build). Size: ~6 files. | — |

## Rules for these tasks

- No generate workflow is dispatched from a task branch. A generate run there commits package folders to that branch.
- New `uses:` lines reuse the pinned action SHAs already in the repository (`scripts/check-action-pins.mjs`).
- An agent runs only the tests its change reaches, with `VITEST_MAX_WORKERS=2`, and pushes with `SKIP_PUSH_TESTS=1`. Browser and LibreOffice proof comes from `test.yml` on the pull request.
