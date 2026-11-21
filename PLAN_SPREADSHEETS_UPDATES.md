<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN: keeping the spreadsheet packages current

Status: RF1's ltd half is on spreadsheets main (PR #221, b2df63439, 2026-11-20): the ltd pin is 2028-01-31 and its tests moved with it. RF1's se half is U2 (see Updates), a rehearsal of the se, bst and taxi refresh to the 2028-04-05 year end; it is on `NEXT.md`, ready (the operator's go, 2026-11-21). TU1 is on spreadsheets main (PR #215, and the quote-check fix PR #216, 2026-11-20). Repository: `../spreadsheets.diyaccounting.co.uk`. The rollover plan that built the current pipeline is archived at `../private.diyaccounting.co.uk/engineering/submit/archive/PLAN_SPREADSHEETS_ROLLOVER.md`.

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
| RF1 | The se, bst and taxi pinned-package refresh carries its test moves: U2 rehearses it (see Updates). The ltd browser test `web/browser-tests/diya-gl-ltd-equivalence.browser.test.js` names the first month's tab of the pinned ltd package (`FIRST_TAB`), so an ltd refresh to another year end moves it. Model: Sonnet. Size: ~6 files. | U2: the operator's go for the rehearsal, then the real se, bst and taxi refresh once `main` builds the Apr28 packages (from 2027-01-16) |
| TU1 | An LLM-powered GitHub Action in spreadsheets updates the tax rates each month and commits them itself (operator, 2026-11-15). It does by machine what `.claude/skills/package-updates/SKILL.md` does by hand. (a) **Read.** The job fetches the gov.uk pages that submit's `.claude/skills/tax-sources/sources/*.json` name, plus the pages the `package-updates` skill lists. It asks Bedrock for the rates through the OIDC role the reconciliation judge already uses (`vars.SPREADSHEETS_ACTIONS_ROLE_ARN`, Nova 2 Lite at temperature 0, a tool call with a fixed schema per data file). It checks each answer against the verbatim quote on the page before it uses the figure. (b) **Write.** It updates `app/data/se-YYYY-YYYY.toml` and `app/data/ltd-YYYY.toml`, and creates a new year's pair once gov.uk publishes its rates. Writing is canonical: fixed key order, fixed number format, and no date or run stamp in a data file. So a month with no material change writes identical bytes, and `git diff --quiet` ends the run with no commit. (c) **Commit.** When a value changes, the job commits to `main` and pushes with `GITHUB_TOKEN` and `--no-verify`, as the generate workflows do. A `GITHUB_TOKEN` push starts no workflow, so the job then dispatches `generate-all.yml` (a `workflow_dispatch` sent with `GITHUB_TOKEN` does start it). That run's `changed-packages` scope commits the rebuilt packages. (d) **Schedule.** A monthly cron and a dispatch, with `concurrency` and `cancel-in-progress: false`. Proof: two runs on one commit with no gov.uk change commit nothing. A run against a fixture with one changed rate commits exactly that one line, with the model call stubbed in a unit test. Model: Opus (design), Sonnet (build). Size: ~6 files. | — |

## Updates

### U2. Rehearse the se, bst and taxi refresh to the 2028-04-05 year end

The goal is to find, before the real refresh, what breaks when the se, bst and taxi pins move from 2027-04-05 to 2028-04-05, and to have the RF1 test moves ready.

Facts that shape it:

- The 2027-28 tax rules already exist: `app/data/se-2027-2028.toml`, which TU1's Action reads and updates each month. BST, SE and Taxi all use the `se` tax regime. No tax-year update is needed to build Apr28 packages.
- The Apr28 packages are missing only because of the date window. `yearEndCutoff` in `app/bin/generate.js` (line 52) builds year ends up to 15 months ahead from the 16th of a month. On 2026-11-20 the cutoff is 2028-01-31. From 2027-01-16 it reaches 2028-04-30, and the first generate run on `main` after that date builds the Apr28 packages. The real se, bst and taxi refresh can therefore happen in January 2027, not April.
- The rule "no generate workflow is dispatched from a task branch" protects task branches that merge. The rehearsal branch never merges, so it is the one branch where a generate run commits packages on purpose.
- A generate run and a `refresh-pinned.yml` run push with `GITHUB_TOKEN`, which starts no workflow. A generate run pushes to the branch it runs on (`ref: github.ref`). A `refresh-pinned.yml` run makes its branch from the ref it is dispatched on (`BASE: github.ref_name`).
- `test.yml` runs by itself on a push to `main`, on a pull request to `main` and on its schedule. On a rehearsal branch it runs by dispatch: `gh workflow run test.yml --ref <branch>`.
- `deploy.yml` runs on a push to any branch that touches its paths (`examples/**`, `app/data/**`, `app/lib/**`, `app/products/**`, `app/templates/**`, `package.json` and more). A branch deploys the one spreadsheets ci environment, and the smoke test of that deploy makes a test user in the prod user pool and turns on native sign-in for the prod DIYA-GL client while it runs. So each laptop push to a rehearsal branch has `[skip ci]` in its head commit message, and no pull request is opened from a rehearsal branch. The commit that moves `yearEndCutoff` touches `app/bin/generate.js` only, which is not a deploy path.
- `generate-all.yml` has no product input, so its ltd leg runs too. With the moved window it builds the ltd year ends after 2028-01-31 that `app/data/ltd-2027.toml` covers (its financial year ends 2028-03-31). Whether the 2028-04-30 ltd year end builds without an `ltd-2028.toml` is not known; a failure of the ltd leg alone is not a finding about se, bst or taxi. The ltd pin does not move.
- The ltd refresh showed which tests hold a pinned package's values (spreadsheets PR #221). `app/test/pinned-age.test.js` names the one stale pin on a chosen date (taxi on 2027-05-14); after the three re-pins the oldest pin is ltd (built 2026-11-20), so it moves. The local `npm test` runs no browser tier, and the browser tests hold package values: the files that read `examples/se-latest`, `examples/bst-latest` and `examples/taxi-latest` are `web/browser-tests/diya-gl-se-*.browser.test.js`, `diya-gl-bst*.browser.test.js`, `diya-gl-taxi-*.browser.test.js`, `diya-gl-equivalence.browser.test.js` and `diya-gl-formats.browser.test.js` (`diya-gl-taxi-equivalence.browser.test.js` line 464 names the period 2026-04-06 to 2027-04-05). Their proof is the `browser-test` job of the dispatched `test.yml`.
- The "Install LibreOffice Calc" step can time out at 10 minutes when the deb cache is cold (the first run of an ISO week, or after a change to `.github/actions/apt-install`). No test runs in such a job; re-run the failed jobs once.
- `examples/**` is a deploy path, so a patch file under `examples/` on `main` would start a prod deploy. The patch is kept in the private repository.

Steps:

1. Make the throwaway branch `claude/<codename>-apr28-rehearsal` from spreadsheets `main`. One commit on it moves the window: `yearEndCutoff` returns 2028-04-30. That commit exists only on this branch. Push it with `SKIP_PUSH_TESTS=1`.
2. Dispatch `generate-all.yml` on the branch. The generate runs build the Apr28 se, bst and taxi packages from `se-2027-2028.toml`, reconcile them, and commit them to the branch. Their reconcile and judge jobs are the first test.
3. **Test A, current pins.** With the pins still at 2027-04-05, dispatch `test.yml` on the branch. It and the reconcile jobs of step 2 pass. This shows the Apr28 packages do not disturb the pinned tests.
4. **Re-pin.** Dispatch `refresh-pinned.yml` with `product=se` on the rehearsal branch; it pushes `refresh-pinned/se-<run id>`. Dispatch it with `product=bst` on that branch, then with `product=taxi` on the bst branch. The taxi branch then holds the three pins at 2028-04-05 with no merge.
5. Add RF1's se test moves on the taxi branch, in commits whose head message has `[skip ci]`:
   - a 2027-28 entry in `app/data/hmrc/sa103-mtd-mapping.json`'s `api.years`;
   - the 2027-28 facts in `app/test/se-derivations.test.js`'s `EXPECT_PRESENT_BY_YEAR`, `EXPECT_ABSENT_BY_YEAR` and `EXPECT_BASIS_PERIOD_ADJUSTMENTS_BY_YEAR`, and its Structures and Buildings Allowance figures;
   - `app/test/pinned-age.test.js`'s stale pin;
   - whatever else Test B shows the se, bst and taxi pins need, the browser tests included.
6. **Test B, new pins.** Dispatch `test.yml` on the taxi branch. It passes, with its browser, reconcile and judge jobs.
7. **Wind back.** Save the diff of step 5 and of the refresh runs' test changes as `../private.diyaccounting.co.uk/engineering/spreadsheets/apr28-rehearsal.patch`, with the run ids of Tests A and B in `APR28_REHEARSAL_<date>.md` beside it. That patch is the January refresh's starting point. Then the rehearsal branch and the three `refresh-pinned/*` branches are deleted (the operator's commands). Nothing reached `main`: the Apr28 packages, the moved window and the moved pins go with the branches.

What it never does: deploy. With `[skip ci]` on the laptop pushes and no pull request, no `deploy.yml` runs from a rehearsal branch, so the live spreadsheets site and its downloads are untouched, and so is the spreadsheets ci site. "Test in prod" here means the real pipeline in GitHub Actions (generate, reconcile, judge, `test.yml`) on real packages. If a run on the spreadsheets ci environment is wanted as well, `deploy.yml` takes `environment: ci` from the branch; that is an addition the operator chooses.

Who: a local Sonnet agent (spreadsheets is laptop work), with the coordinator dispatching the workflows and reading the runs. Size: 1 commit on the branch, ~5 files of test moves, 1 patch file.

## Rules for these tasks

- No generate workflow is dispatched from a task branch. A generate run there commits package folders to that branch. The U2 rehearsal branch, which never merges, is the one exception.
- New `uses:` lines reuse the pinned action SHAs already in the repository (`scripts/check-action-pins.mjs`).
- An agent runs only the tests its change reaches, with `VITEST_MAX_WORKERS=2`, and pushes with `SKIP_PUSH_TESTS=1`. Browser and LibreOffice proof comes from `test.yml` on the pull request.
