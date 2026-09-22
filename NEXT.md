<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# NEXT — current state & kickoff

Living handover for this repository. Rules and shape: `../NEXT.md` (DONE or OPEN only, nothing
deferred; a bug found fixing item A is A's remainder, not a new item; this file holds ONLY what
to do next — completed work lives in `git log`). Plans of record: `PLAN_*.md` at this root.

## Open items

Items marked (Bn) are backlog rows in `BACKLOG.md`, which carries each one's full value
reasoning. Every item ends with a tag line: **Source** (backlog row, GitHub issue, plan doc, or
none), **Owner** (`Operator` for steps a workflow cannot do, `Claude Code` for steps a sub-agent
runs), and for Claude Code steps the **Model** a sub-agent should use (Fable > Opus > Sonnet >
Haiku; the lowest tier that fits). Anything touching code goes through a `claude/*` branch and
PR; the operator merges.

**Prod runs deployment prod-a4ea2f3**; main's deploy of PR #325's merge (486af0b6) is creating
prod-486af0b. **ci**: `ci-set1` is last-known-good; `ci-set2` carries PR #326's deploy. Open pull request:
#326 (`claude/b73-board`: B30af.8), its ci deploy in flight; `claude/b74-board` (PU-7g, PU-7k, PU-3)
runs its proofs before its push.
**ci**: `ci-set1` is last-known-good. Open pull request: #326 (`claude/b73-board`: B30af.8), its ci deploy
in flight.

The board runs in five sections, in this order: **in flight** (a branch, a pull request or a run
in motion, each named in the row), **machine-only**, **machine-ask**, **human-driven**,
**blocked**. The section is the classification — what it takes to carry the row to
completion, not who owns it now — so no row carries a separate tag that could drift from where it
sits. `machine-ask` is work a session drives end to end with a human present to authenticate or
approve: a second factor, an SSO login, a command the session's policy denies, a send from the
operator's address, a write to Google or GitHub the operator says go to. `human-driven` is work a
human must navigate themselves: a coding assistant's practical limits, a physical restriction
beyond one authentication (a proctored exam, a signature in person), or policy (a payment mandate,
a filing against the operator's own company, a decision between named alternatives). A row whose
only human step is merging its PR is machine-only; that is the standing workflow, not an action
the row needs. Within a section, items run by the size of the change to committed files, least
first (operator, 2026-09-13); a row that changes nothing committed — a comment, a run, a scan, a
console action — comes before any code. Operator items are briefed in
`../NEXT_OPERATOR_RUNBOOK.md` at the workspace root, one file rewritten in place. Every item
names its model: the lowest tier that fits (Fable > Opus > Sonnet > Haiku), or `none` for a human
step.

## In flight

- [ ] **B58a. `security-review.yml` hands the weekly review to `agentic-lib`.** The operator's
  decision of 2026-09-22: the `agentic-lib` label is the only path for the review; the Copilot
  coding agent is not enabled and the assign job goes. In flight: an agent replaces `assign-copilot`
  (and the `copilot_agent_login` input, the App token mint and the `copilot-agent` label) with the
  `agentic-lib` label on the issue `create-issue` opens, which starts `agentic-lib-code.yml` for it;
  the `issue_number` dispatch input labels an existing issue instead. #318 carries the label since
  2026-09-22 07:21 UTC and run 35699227062 is working it. **Source**: issue #318; BACKLOG 58.
  **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~1 file.

- [ ] **B30af.8. A scheduled probe never holds a suite's lock while it waits for main's deploy.**
  In flight: `claude/b73-board`, PR #326, its ci deploy running.
  `probe-test.yml`'s `behaviour-test` job takes the concurrency group
  `behaviour-test-user-<env>-<suite>` (line 352) and then, on a scheduled run, waits inside that
  job for any deploy in progress on `main` (the `wait-for-main-deploy` steps at lines 500 and 548,
  up to 40 minutes each). A deploy of `main` whose own probe of the same suite starts meanwhile
  queues on that lock, so the two wait on each other: on 2026-09-22 the scheduled probe's
  `submitVatBehaviour-prod` job held the lock from 05:44 while deploy run 35688610628's
  `submitVatBehaviour-prod` sat pending, until the scheduled run 35690948230 was cancelled at
  06:28. Keep the `params` job's wait (line 241, before any lock); replace the two in-job waits
  with a check that gives up at once: when a `main` deploy is in progress, skip the navigation and
  end the suite as superseded (`continue-on-error` outcome neutral, the CloudWatch metric not
  published), since the deploy's own probe covers that suite. `.github/actions/wait-for-main-deploy`
  gains a `max-wait-minutes` input (default 40; 0 returns at once with an output naming the run).
  Proof: a dispatched `probe-test.yml` on ci with a deploy of the same branch in flight ends the
  suite as superseded inside a minute. **Source**: deploy run 35688610628; BACKLOG 30.
  **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~3 files.

- [ ] **PU-7. Practice licence build.** PU-7a to PU-7f and PU-7l are on `main`. In flight on
  `claude/b74-board` with PU-3's price ids: PU-7g (the submission routes take a client id and
  `enforceBundles` gains the practice check) and PU-7k (the practice page, its nav link held for
  the launch step). Left in `PLAN_PRICE_UPDATE.md`
  §(d) (lines 227 to 236): PU-7e waits on the operator's grant numbers, PU-7h on PU-7g, PU-7i on
  PU-7g, B60 and B61, PU-7j on PU-7i, PU-7m on PU-7j; the `resident-pro` catalogue
  values (`enable = "always"`, `hidden = false`, `allocation = "on-subscription"`) and the practice page's
  nav link in `web/public/widgets/page-chrome.js` flip in the launch step after PU-7m, with the
  four ci probes that reach resident-pro through a pass updated in the same change. **Source**: `PLAN_PRICE_UPDATE.md` PU-7. **Owner**: Claude Code. **Model**: Sonnet.
  **Size**: ~30 files across 5 rows after this wave.

## Machine-only

- [ ] **PU-5. The DIYA-GL tier on prod.** `SubmitApplication.java` line 489 sets
  `.residentTierEnabled(!"prod".equals(envName))`, which `DiyaGlStack.java` (lines 153 and 257)
  passes as `DIYA_GL_RESIDENT_TIER` and `app/services/diyaGlEntitlement.js` line 57 reads; make
  it true for prod, and add `prod` to `resident`'s `listedInEnvironments` (`submit.catalogue.toml`
  line 226, the entry at line 217). After main's deploy the bundles page on prod lists `resident`
  at £39 a year and £3.99 a month beside `resident-vat`, with the live price ids PU-3 wrote;
  PU-9 and PU-14 follow it. `DiyaGlStackTest.java` and `productCatalog.test.js` carry the
  assertions to update. The Stripe prices exist in test and live (PU-3, 2026-09-22) and
  the ids are on `claude/b74-board`. **Source**:
  `PLAN_PRICE_UPDATE.md` PU-5. **Owner**: Claude Code. **Model**: Haiku. **Size**: ~2 files.

- [ ] **F1e. What the accounts consume.** Before any downloader: read the complete 2025-26 workbook
  set in the Drive mirror (`../drive/DIY Accounting Limited/finance/2025-2026 accounts/`:
  `Currentaccount.xlsx`, `Savingaccount.xlsx`, `Sales.xlsx`, `Purchases.xlsx`, `Cashaccount.xlsx`,
  `Financialaccounts.xlsx`, `Vatreturns.xlsx`, `dividends/`, `invoices/`, `paypal/`, `stripe/`,
  `bank/`) and write `../REPORT_FINANCE_SOURCES_2025-26.md` at the workspace root (private): which
  figures each sheet takes from which source, which staged fields therefore matter, the
  counterparties on the bank lines, and the answer to "does the previous year show anything
  missing". Per `../PLAN_FINANCE_AUTOMATION.md` phase 1's first instruction. No spreadsheet
  reader is installed on the machine (no `xlsx`, `exceljs` or `openpyxl`); the
  `@diy-accounting-uk/diya-gl` package in `mcp/node_modules` (after `npm ci` in `mcp/`) bundles
  one (`dist/app/lib/xlsx/`, `workbook-set.js`, `product-workbook.js`, `scenario-extractor.js`),
  so a throwaway node script in the scratchpad reads the workbooks through it. The folder's shape:
  `paypal/` holds three PDFs a month (`2025-04 PayPal - transactions.PDF`), `stripe/` a
  `transactions.csv` and `summary.pdf` a month, `invoices/` only `Salesinvoice.xlsx`,
  `dividends/` a `.docx` per shareholder, and `year end accounts/` is empty. **Source**:
  `../PLAN_FINANCE_AUTOMATION.md` phase 1. **Owner**: Claude Code. **Model**: Sonnet. **Size**:
  ~1 file.

- [ ] **F1a. The staging tree and its index source.** `../staging/<year-end>/<source>/` at the
  workspace root (`2025-2026/` for March 2026, `2026-2027/` for April to August), a `README.md` there
  naming the layout and the date-stamped file names the plan's write boundary gives, and `staging`
  added to `../index/corpus.toml` as its own source in the shape of the `analytics` source (line
  111: `[[sources]]`, `name`, `type = "filetree"`, `root = "../staging"`), then the workspace's
  `reindex` skill (`../.claude/skills/reindex/SKILL.md`). Nothing under `../staging/` is ever committed to a repository. **Source**:
  `../PLAN_FINANCE_AUTOMATION.md`, the write boundary. **Owner**: Claude Code. **Model**: Haiku.
  **Size**: ~2 files.

- [ ] **F1c. Stripe balance transactions and payouts to staging.** `scripts/finance/stripe-stage.js`:
  for a month, `balance_transactions` with `expand: data.source` and the payouts, from the live key
  the way `infra/stripe/stripe-sync.js` reads it for `--mode live` (its `GetSecretValueCommand`
  around line 274; a read-only listing), written as
  `../staging/<year-end>/stripe/<yyyy-mm-dd>-stripe-balance-transactions.json` and
  `…-payouts.json` as the raw Stripe objects, one array per file, with gross, fee and net kept
  separate; a unit test over a recorded page. Run it for March to August 2026 (profile
  `submit-prod`). F2a's Stripe parser reads these files, so this row lands first; the Drive
  mirror's `stripe/2026-03 Stripe - transactions.csv` is the cross-check for March. **Source**: `../PLAN_FINANCE_AUTOMATION.md` route 2. **Owner**:
  Claude Code. **Model**: Sonnet. **Size**: ~2 files.

- [ ] **F2b. Supplier invoices from the mailbox.** `mcp/lib/finance/mail-invoices.js`: for a
  period, the supplier invoices read through the corpus index: `../index/.venv/bin/corpus search
  --source mail-antony --since <date> --until <date> --json "<supplier>"` then `corpus doc --json
  <id>` for the extracted text (the index content-indexes the PDF attachments, which is why no
  PDF reader is needed in this repository); the `.eml` itself sits under
  `../mail/antony@diyaccounting.co.uk/<yyyy>/<m>/<d>/<id>.eml` and `../mail/INDEX.tsv` lists
  date, mailbox, from, to, subject, attachments and path. The module shells out to that CLI
  through one function the tests replace with two recorded, redacted documents; emitted as
  `purchases` lines with
  `documentType = "invoice"` and the supplier's `taxCode` (`S` or `OS`), against
  `diya-gl-lines-v2.schema.json` in the spreadsheets repository's `public/schema/`; a unit test over
  two recorded invoices (AWS, Google Cloud). No file harvesting. **Source**:
  `../PLAN_FINANCE_AUTOMATION.md` route 4, phase 2. **Owner**: Claude Code. **Model**: Sonnet.
  **Size**: ~3 files.

- [ ] **F2c. Opening balances and the book from the prior-year workbook.**
  `mcp/lib/finance/book-from-workbook.js`: `book.toml` per `diya-gl-book-v2.schema.json` (entity
  information, chart of accounts, opening balances, debtors, creditors, fixed assets, dividends,
  members) seeded from the complete 2025-26 workbook set in the Drive mirror (`Financialaccounts.xlsx`,
  `Fixedassets.xlsx`, `Companysecretary.xlsx`, the dividends folder), read through
  `@diy-accounting-uk/diya-gl`'s own workbook reader (`dist/app/lib/workbook-set.js`,
  `scenario-extractor.js`; the package is `mcp/`'s dependency) and validated with `validateBook`
  from `dist/app/lib/diya-gl-schema.js`, the import `mcp/lib/book-tools.js` line 22 already makes;
  a unit test over a copy of the workbook with the figures redacted to round numbers. The Companies House filing is not a second anchor. **Source**:
  `../PLAN_FINANCE_AUTOMATION.md` phase 2. **Owner**: Claude Code. **Model**: Sonnet. **Size**:
  ~3 files.

- [ ] **F2a. Staged sources into diya-gl lines.** `mcp/lib/finance/`: parsers for the NatWest CSV
  (`Date,Type,Description,Value,Balance,Account Name,Account Number`; `Type` to
  `diya-gl:bankCode`; samples in the Drive mirror's `2025-2026 accounts/bank/`), the Stripe files
  (a charge as a `sales` `receipt` line plus a `purchases` fee line, a payout as a `bank` line that
  must match the bank BAC line) and the PayPal export (settled transactions only; holds and their
  reversals excluded; a receipt as `sales`, a bill payment as `purchases` matched to the mailbox
  invoice), each emitting lines validated with `validateLines` from the diya-gl package's
  `diya-gl-schema.js`, gross income and fees never netted; unit tests over recorded samples with
  the March 2026 holds case. The table in the plan's "Target format" section is the mapping. The
  bank parser can start now (the Drive mirror holds the 2025-26 CSVs, named
  `Current 600947-80597386 01-01-2026 to 31-01-2026.csv`); the Stripe parser reads F1c's JSON
  files, so it follows F1c; the PayPal parser has no sample until F1b writes one, so it follows
  F1b. **Source**: `../PLAN_FINANCE_AUTOMATION.md` phase 2.
  **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~6 files.

- [ ] **B60. The MCP's Submit-facing tools over the deployed REST API.** `PLAN_SUBMISSION_MCP.md`
  M2: `mcp/lib/submit-tools.js` with obligations, VAT submit, receipt, accounts preview, accounts
  submit and poll, over the deployed API with a bearer token from the environment
  (`DIYA_SUBMIT_BASE_URL` and `DIYA_SUBMIT_ACCESS_TOKEN`, the client `mcp/lib/practice-tools.js`
  introduced for `move_book_to_client`), against the simulator lane first; registered in
  `mcp/lib/server.js`; tests under `mcp/test/` with the HTTP mocked. PU-7i needs it beside B61.
  **Source**: BACKLOG 60; `PLAN_SUBMISSION_MCP.md` M2. **Owner**: Claude Code. **Model**: Sonnet.
  **Size**: ~4 files.

- [ ] **B61. The MCP's third Cognito app client and the stdio sign-in.** `PLAN_SUBMISSION_MCP.md`
  M3: a third app client on the pool beside the web and DIYA-GL clients (`IdentityStack.java`, the
  DIYA-GL client's pattern at line 279 onward), a JWT authoriser scoped to its audience on the
  cloud book routes (`ApiStack.java`, the `booksJwtAuthorizer` at line 299 and its wiring at 361 and
  491), a sign-in for the stdio surfaces, and `open_book`/`save_book` in `mcp/lib/book-tools.js`
  (today filesystem-only: `openBook` line 89, `saveBook` line 159) over the DIYA cloud routes with
  that token. The plan's item 4 names the device-code grant and says it costs nothing new; Cognito
  has no device grant, so that route would cost a table and two routes. The row takes
  authorization code with PKCE on a loopback redirect instead (`http://127.0.0.1:<port>/callback`
  on the new client, the flow every CLI uses and Cognito supports as it stands): the MCP opens the
  hosted UI in the browser, catches the code on the loopback listener, exchanges it, and keeps the
  refresh token in the OS keychain or a mode-600 file under `~/.config/diya-submit/`. The operator
  can ask for the device grant instead. Unblocks F2d, PU-7i and B52i. **Source**: BACKLOG 61;
  `PLAN_SUBMISSION_MCP.md` M3. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~8 files.

## Machine-ask

- [ ] **F1b. PayPal transactions to staging.** `scripts/finance/paypal-stage.js`: the Transaction
  Search API for a month, settled transactions only with the status field kept so holds and
  reversals can be excluded downstream, written as
  `../staging/<year-end>/paypal/<yyyy-mm-dd>-paypal-transactions.json`; a unit test over a recorded
  page. The app client id and secret come from the PayPal developer dashboard, which the operator
  creates and puts on the `prod` GitHub environment as `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`
  for `deploy-environment.yml` to land in Secrets Manager as `prod/submit/paypal/client_id` and
  `prod/submit/paypal/client_secret`, in the shape of its "Create secret in AWS from
  secrets.TELEGRAM_BOT_TOKEN" step (line 331), with the ARNs on `SubmitEnvironment.java` beside the
  Telegram ones (line 88). Run it for March to August 2026. **Source**:
  `../PLAN_FINANCE_AUTOMATION.md` route 1. **Owner**: Claude Code; the operator creates the PayPal
  app. **Model**: Sonnet. **Size**: ~5 files.

- [ ] **B11.T10. ITSA phase 2: the send.** The operator names the day; Claude Code re-runs
  `scripts/itsa-sandbox-year.js` for 2023-24, 2025-26 and 2026-27 (the commands in
  `_developers/hmrc/ITSA_PHASE_2_SANDBOX.md` lines 69 to 79; B11.T7c moves its output directory)
  inside the 14 days before it and updates the "Testing in the last two weeks" row of
  `_developers/hmrc/hmrc_questionnaire_itsa_pass_diy_accounting_limited_v1.md` (line 28); the
  operator sends `_developers/hmrc/DRAFT_EMAIL_ITSA_RECOGNITION.md` to `SDSTeam@hmrc.gov.uk` and
  `_developers/hmrc/DRAFT_EMAIL_ITSA_PRODUCTION_CREDENTIALS.md` when SDST answers. **Source**: BACKLOG 11; `PLAN_ITSA_PHASE_2.md` T10. **Owner**: Claude Code re-runs; the
  operator names the day and sends. **Model**: Haiku. **Size**: ~1 file.

## Human-driven

- [ ] **F1d. NatWest statements to staging.** The operator signs in to NatWest and downloads, for
  each of March to August 2026, the current account `600947-80597386` and the savings account
  `600947-80634672` statements as CSV and PDF into `../staging/2025-2026/bank/` (March) and
  `../staging/2026-2027/bank/` (April to August), named
  `<yyyy-mm-dd>-natwest-<current|savings>-<account>.<csv|pdf>` with the month's last day, the shape
  of the 2025-26 files in the Drive mirror. No automation touches the bank sign-in. **Source**:
  `../PLAN_FINANCE_AUTOMATION.md` route 3. **Owner**: Operator. **Model**: none. **Size**: 24 files
  outside any repository.

## Blocked

- [ ] **F2d. DIYA's book, assembled, verified and saved to the DIYA cloud.** The lines from F2a and
  F2b plus F2c's `book.toml` for 1 March to 31 August 2026, validated against both v2 schemas; March
  2026 matched line for line against the completed 2025-26 workbook (the control), every month's
  bank closing balance equal to the statement's, gross income and fees separate, no hold posted;
  then saved to the DIYA cloud through `save_book` with the operator signed in, which is B52i's
  unblock event. Blocked on F1b, F1c, F1d, F2a, F2b, F2c and B61. **Source**:
  `../PLAN_FINANCE_AUTOMATION.md` phase 2 and its verification. **Owner**: Claude Code; the operator
  signs in. **Model**: Sonnet. **Size**: ~2 files.

- [ ] **F2e. The MCP writes a populated spreadsheets package.** A tool in `mcp/lib/finance/` that
  takes the book and lines and writes a DIY Accounting spreadsheets package, reconciled under the
  spreadsheets repository's existing reconciliation harness rather than a new check; nothing
  automated writes to Google Drive. Blocked on F2d. **Source**: `../PLAN_FINANCE_AUTOMATION.md`
  phase 2. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~3 files.

- [ ] **B34.7. Run and fix the filing suites' sandbox sign-in.** `deploy.yml` and `probe-test.yml`
  run the two filing suites only when the dispatch input `runCompaniesHouseSandboxFiling` is
  `true`, and probe-test's guard step fails fast naming any of O17's four values that is empty.
  Against a standing ci set, once O17 clears:
  `gh workflow run probe-test.yml -f environment-name=ci -f deployment-name=<ci-set>
  -f behaviour-test-suite=changeRegisteredOfficeBehaviour -f runCompaniesHouseSandboxFiling=true`;
  then the same for `changeRegisteredEmailBehaviour`. The suite navigates the ci apex, which is the
  registered redirect, so this runs before P4 moves the probes to the set's own host. The fix lands
  in `behaviour-tests/steps/behaviour-companies-house-filing-steps.js`, whose
  `authoriseWithCompaniesHouse` selectors (`#userId`, `#password`, `#companyAuthCode`,
  `#givePermission`) are the simulator's own OAuth page and whose authenticator-challenge selectors
  are a stated guess; the first run's screenshots under `target/` show the real One Login and
  permission pages. **Source**: BACKLOG 34. **Owner**: Claude Code. **Model**: Sonnet. Blocked on
  O17. **Size**: ~1 file.

- [ ] **PU-14. An `experiments.toml` row for the price change.** Objective `conversion-to-paid`,
  lever price, metric purchases per human session, start at PU-5's deploy, so the £39 shape is
  measured against the 99p rate. Blocked on PU-5. **Source**: `REPORT_PRICE_UPDATE_REVIEW.md` §2 row
  6; operator 2026-09-21. **Owner**: Claude Code. **Model**: Haiku. **Size**: ~1 file.

- [ ] **B34.6b. Companies House accounts filing: the sandbox proof.** Submission 000004 (test
  presenter, company 06846849, package reference 0012) was acknowledged with no errors by the XML
  Gateway test service; every `GetSubmissionStatus` poll for it answers 9999 "No presenter ID
  supplied", with the body's `PresenterID` plaintext and hashed, and the body is plaintext on
  `main`. The blocker is the email BACKLOG 34d describes, which has not been sent: the last message
  on the `xml@companieshouse.gov.uk` thread is the operator's of 2026-09-11. Claude Code drafts it,
  the operator sends, and it asks whether 000004 was accepted and whether status lookups are
  enabled for this presenter. When the answer comes and lookups are enabled: poll 000004 through
  `GET /api/v1/companies-house/accounts/000004` on a standing ci set, and pin the returned
  `StatusCode` and any rejections as a case in
  `app/unit-tests/functions/companiesHouseAccountsGet.test.js`. The prod catalogue listing is
  BACKLOG 34c's: prod carries no `COMPANIES_HOUSE_XMLGW_URI` and no presenter secret ARNs.
  **Source**: BACKLOG 34b, 34d. **Owner**: Claude Code; the operator sends 34d's email. **Model**:
  Sonnet. Blocked on that answer. **Size**: ~2 files.

- [ ] **B52l. The optimiser over the raw export.** A notebook over `../analytics/prod/` (pulled by
  `scripts/analytics-pull.sh`, one CSV per view in `rawExportPublish.js`'s `VIEW_NAMES`): per-block
  correlations, the block models fitted (linear cost from `v_cost_daily`, log-linear funnels from
  `v_login_to_submission_funnel` and `v_ga4_funnel_daily`, Hill curves for spend), levers ranked by
  effect per unit cost, and the next experiment proposed with its predicted effect and interval as a
  row ready for `experiments.toml`; Bayesian optimisation for the continuous knobs and a
  Thompson-sampling bandit for allocations once experiments exist. The model design as a section
  under `PLAN_ONE_STOP_DASHBOARD.md` D16 first, then the notebook, then one line per objective on
  `web/public/operator/dashboard.html`. Blocked until three months of nightly export exist under
  `exports/prod/`: first written 2026-09-08, so the gate is 2026-12-09, checked with `aws --profile
  submit-prod s3 ls s3://prod-env-analytics-lake-<account>/exports/prod/`. **Source**: BACKLOG 52l;
  `PLAN_ONE_STOP_DASHBOARD.md` D16. **Owner**: Claude Code. **Model**: Opus for the models, Sonnet
  for the notebook. **Size**: ~3 files.

- [ ] **B52m. The reinvestment loop.** Trailing income, reserve, budget, return per pound and payback
  as one block on `web/public/operator/dashboard.html`, fed by observations over `v_revenue_daily`
  and `v_cost_vs_target_monthly` in `operatorSnapshotPublish.js`; the reinvestment fraction as a
  lever with the operator's reserve floor; paid traffic and article boosts as `experiments.toml`
  rows with on-off or geographic controls; GA4 conversion import from the Ads account. Blocked on
  three events: B52l's fitted models, which the return-per-pound figure comes from; the cost panel
  carrying revenue (BACKLOG 43, from 2026-10-02, the first monthly renewal); and the operator
  naming the reinvestment fraction and the reserve floor. The Google Ads account exists as code
  (`infra/google/ads/ads.toml`: customer `8142685080`, four conversion actions imported from GA4
  events, one Performance Max campaign), so no token step remains; the cost-per-session ceiling
  PU-15 writes into D17 is the starting bid ceiling.
  **Source**: BACKLOG 52m; `PLAN_ONE_STOP_DASHBOARD.md` D17. **Owner**: Claude Code, with the
  operator's fraction and floor. **Model**: Sonnet. **Size**: ~3 files.

- [ ] **PU-9. Retire the three folded bundles.** `resident-diya-gl`, `resident-itsa` and
  `resident-ltd` leave `submit.catalogue.toml`, `.env.ci` and `.env.prod` once Stripe live shows no
  subscription on their prices. Blocked on PU-5. **Source**: `PLAN_PRICE_UPDATE.md` PU-9.
  **Owner**: Claude Code. **Model**: Haiku. **Size**: ~3 files.

- [ ] **B52i. The company P&L and balance sheet on the dashboard.** The company's diya-gl book,
  derived nightly and rendered above the eight objectives beside the last set filed at Companies
  House. Shape: a nightly Lambda beside `app/functions/analytics/` calling `mcp/lib/accounts-tools.js`
  `derive_micro_entity_accounts` over the cloud book, writing JSON lines to `curated/finance/` with
  a Glue table on `Ga4DailyTables.java`'s pattern, one observation set in
  `operatorSnapshotPublish.js`, and a block above `renderSnapshot`'s objectives in
  `web/public/operator/dashboard.html`. Blocked on F2d (DIYA's book saved to the DIYA cloud, the last of the F1 and F2 rows) and on B61 (the MCP's third Cognito app client, whose `open_book`/`save_book` over the cloud routes the nightly derivation uses). **Source**: BACKLOG 52i; `PLAN_ONE_STOP_DASHBOARD.md` D10. **Owner**:
  Claude Code. **Model**: Sonnet. **Size**: ~4 files.

- [ ] **O17. A sandbox sign-in for the filing suites, and four ci values.** The sandbox has no
  registration page and no create-user API; its sign-in is reached only through
  `identity-sandbox.company-information.service.gov.uk/oauth2/authorise` with the "- test" client
  and the registered ci apex redirect, which offers GOV.UK One Login or a Companies House email
  sign-in. The blocker: `find-and-update-sandbox.company-information.service.gov.uk` answers no
  connection (re-checked 2026-09-19; `identity-sandbox/user/register` redirects to
  `/there-is-a-problem`), so the One Login route cannot complete. Retry that host; if it is still
  dead after a day, post the host, URL and time on the Companies House developer forum
  <https://forum.aws.chdev.org/>. When it answers: create a One Login with a plus-address and an
  authenticator app, capturing the base32 secret, sign in once through the sandbox chooser, and set
  on the GitHub `ci` environment the variable `TEST_COMPANIES_HOUSE_USER_ID` and the secrets
  `TEST_COMPANIES_HOUSE_PASSWORD`, `TEST_COMPANIES_HOUSE_TOTP_SECRET` and
  `COMPANIES_HOUSE_SANDBOX_API_KEY` (the "- test" REST key); none of the four is set today.
  Unblocks B34.7. **Source**: BACKLOG 34. **Owner**: Operator. **Model**: none.

## Discipline

- **Push once per batch of landed tracks, never per track**, and prefer one dispatch that
  proves several things over several dispatches. A push per track turned one batch into six
  ci deploys and several environment deploys in a morning on 2026-09-06, each able to open
  alarm issues and cancel each other through the deploy concurrency group, and the operator
  froze pushes twice. A freeze, when the operator calls one, stops `git push`,
  `gh workflow run` and `gh pr create` until they lift it in their own words; local commits,
  worktree tracks and reading logs continue, and a failed job gets a proposed fix in the reply.

