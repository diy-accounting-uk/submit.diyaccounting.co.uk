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

**Prod runs deployment prod-486af0b** (PR #325's merge); main's deploy of PR #326's merge (fbead536) is
in flight. **ci**: `ci-set2` is last-known-good; `ci-set1` carries PR #327's deploy. Open pull request: #327
(`claude/b74-board`: PU-7g, PU-7k, PU-3, B58a), its ci deploy in flight.
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
  coding agent is not enabled and the assign job goes. In flight on `claude/b74-board`, PR #327:
  `assign-copilot` replaced by the `agentic-lib` label on the issue `create-issue` opens, which
  starts `agentic-lib-code.yml` for it; the `issue_number` dispatch input labels an existing issue
  instead. **Source**: issue #318; BACKLOG 58. **Owner**: Claude Code. **Model**: Sonnet. **Size**:
  ~1 file.

- [ ] **PU-7. Practice licence build.** PU-7a to PU-7f and PU-7l are on `main`. In flight on
  `claude/b74-board`, PR #327, with PU-3's price ids: PU-7g (the submission routes take a client id and
  `enforceBundles` gains the practice check) and PU-7k (the practice page, its nav link held for
  the launch step). Left in `PLAN_PRICE_UPDATE.md`
  §(d) (lines 227 to 236): PU-7e waits on the operator's grant numbers, PU-7h on PU-7g, PU-7i on
  PU-7g, B60 and B61, PU-7j on PU-7i, PU-7m on PU-7j; the `resident-pro` catalogue
  values (`enable = "always"`, `hidden = false`, `allocation = "on-subscription"`) and the practice page's
  nav link in `web/public/widgets/page-chrome.js` flip in the launch step after PU-7m, with the
  four ci probes that reach resident-pro through a pass updated in the same change. **Source**: `PLAN_PRICE_UPDATE.md` PU-7. **Owner**: Claude Code. **Model**: Sonnet.
  **Size**: ~30 files across 5 rows after this wave.

## Machine-only

- [ ] **B58b. `agentic-lib-code.yml` lands a complete handover it wrote to `OUT_DIR`.** #318's
  third run (35702110179) wrote `CHANGES.md` with `- **Status**: complete`, a `Branch` line and
  `PR.md` to `/tmp/do-next-out`, committed `SECURITY_REVIEW_FINDINGS.md` on its branch, and the
  `Prepare a complete run's branch and pull request body` step still said "not a complete run";
  its two earlier runs (35699227062, 35700324497) handed over after their budgets. Read that run's
  log for the step's own view of `${OUT_DIR}/CHANGES.md` (the exact-line grep `grep -qxF`, the
  `Move a handover left in the checkout` step's `git add -A`, and whether `OUT_DIR` in the run
  step and in the landing step are the same path), fix the layer that is wrong, and add
  `${OUT_DIR}/PR.md` to the uploaded artifact so a missed landing can be replayed. Second defect
  from the same log: the agent's allow-list denied `find … || echo …` and `ls -la …` because a
  compound command matches none of the `Bash(find:*)` patterns, so the agent could not read the
  prior runs it was told to resume; either brief it to use single commands or allow `Bash(test:*)`
  and `Bash(ls:*)` as it is. Proof: a dispatch with `-f issue-number=318 -f resume-from=35702110179`
  ends with a PR that closes #318 carrying the findings file from that run's patch. **Source**:
  runs 35699227062, 35700324497, 35702110179; BACKLOG 58. **Owner**: Claude Code. **Model**:
  Sonnet. **Size**: ~1 file.

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
  a unit test over a copy of the workbook with the figures redacted to round numbers.
  `../REPORT_FINANCE_SOURCES_2025-26.md` (F1e) lists every sheet and what feeds it: the
  `Financialaccounts.xlsx` sheets (OpenAccounts, TrialBalance, PubBalSht) carry the opening
  balances, `Fixedassets.xlsx`'s Schedule the assets, `Companysecretary.xlsx`'s RegisterofMembers
  the members, and `dividends/Dividend Calculator.xlsx` the dividends. The Companies House filing is not a second anchor. **Source**:
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
  F1b. `../REPORT_FINANCE_SOURCES_2025-26.md` (F1e) found that `Cashaccount.xlsx` is the PayPal
  wallet's own ledger (gross sales, fees, wallet-paid purchases), so PayPal lines post to that
  cash account and the bank sees only the PayPal withdrawals; and that `Creditcardaccount.xlsx`
  holds the Stripe payout totals, filled for two months only. **Source**: `../PLAN_FINANCE_AUTOMATION.md` phase 2.
  **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~6 files.

- [ ] **B60. The MCP's Submit-facing tools over the deployed REST API.** `PLAN_SUBMISSION_MCP.md`
  M2: `mcp/lib/submit-tools.js` with obligations, VAT submit, receipt, accounts preview, accounts
  submit and poll, over the deployed API with a bearer token from the environment
  (`DIYA_SUBMIT_BASE_URL` and `DIYA_SUBMIT_ACCESS_TOKEN`, the client `mcp/lib/practice-tools.js`
  introduced for `move_book_to_client`), against the simulator lane first; registered in
  `mcp/lib/server.js`; tests under `mcp/test/` with the HTTP mocked. PU-7i needs it beside B61.
  **Source**: BACKLOG 60; `PLAN_SUBMISSION_MCP.md` M2. **Owner**: Claude Code. **Model**: Sonnet.
  **Size**: ~4 files.

- [ ] **F1b. PayPal transactions to staging.** `scripts/finance/paypal-stage.js`: the Transaction
  Search API for a month, settled transactions only with the status field kept so holds and
  reversals can be excluded downstream, written as
  `../staging/<year-end>/paypal/<yyyy-mm-dd>-paypal-transactions.json`; the client id and secret
  read from Secrets Manager (`prod/submit/paypal/client_id` and `prod/submit/paypal/client_secret`),
  landed there by `deploy-environment.yml` from the `prod` environment's `PAYPAL_CLIENT_ID` and
  `PAYPAL_CLIENT_SECRET` in the shape of its "Create secret in AWS from
  secrets.TELEGRAM_BOT_TOKEN" step (line 331), with the ARNs on `SubmitEnvironment.java` beside the
  Telegram ones (line 88); a unit test over a recorded page proves the script before any credential
  exists. The six-month run (March to August 2026) waits on OF1. **Source**:
  `../PLAN_FINANCE_AUTOMATION.md` route 1. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~5
  files.

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

## Human-driven

- [ ] **O58. The token-storage finding.** The review's one critical finding, held privately at
  `../SECURITY_REVIEW_318_2026-09-22.md` (workspace root; the repository is public): Cognito
  tokens in `localStorage` (`web/public/lib/services/auth-service.js` lines 92 to 94, 124 to 126
  and 161 to 163) are readable by any script that runs on the page, so an XSS gives a session
  away; the remediation proposed is httpOnly cookies set by the callback route, which changes the
  callback, the fetch wrapper and the API's CORS and CSRF handling. Decide whether to take it
  (then a design row for Claude Code) or to record it as accepted with the CSP as the control;
  then close #318, whose public thread should carry the outcome, not the finding. **Source**:
  issue #318; run 35702110179. **Owner**: Operator. **Model**: none. **Size**: 0 files.

- [ ] **OF1. The PayPal app credentials.** In the PayPal developer dashboard
  (<https://developer.paypal.com/dashboard/applications/live>), create a live REST API app for
  the company account and put its client id and secret on the `prod` GitHub environment as
  `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`
  (<https://github.com/diy-accounting-uk/submit.diyaccounting.co.uk/settings/environments>); the
  next `deploy-environment.yml` run lands them, and F1b's six-month run follows. **Source**:
  `../PLAN_FINANCE_AUTOMATION.md` route 1. **Owner**: Operator. **Model**: none. **Size**: 0 files.

- [ ] **O11. The ITSA send day.** Name the day the recognition email goes, write it into B11.T10's
  row, and on that day send `_developers/hmrc/DRAFT_EMAIL_ITSA_RECOGNITION.md` to
  `SDSTeam@hmrc.gov.uk`, then `_developers/hmrc/DRAFT_EMAIL_ITSA_PRODUCTION_CREDENTIALS.md` when
  SDST answers. **Source**: BACKLOG 11; `PLAN_ITSA_PHASE_2.md` T10. **Owner**: Operator. **Model**:
  none. **Size**: 0 files.

- [ ] **O34d. Send the XML Gateway email.** Send `../DRAFT_EMAIL_XMLGW_000004.md` from `antony@diyaccounting.co.uk`
  as a reply on the `xml@companieshouse.gov.uk` thread, and paste the answer into B34.6c's row when
  it comes. **Source**: BACKLOG 34d. **Owner**: Operator. **Model**: none. **Size**: 0 files.

- [ ] **O52m. The reinvestment fraction and the reserve floor.** Two numbers, written into B52m's
  row: the share of trailing income the loop may spend on paid traffic and article boosts, and the
  cash reserve it never spends below. **Source**: BACKLOG 52m; `PLAN_ONE_STOP_DASHBOARD.md` D17.
  **Owner**: Operator. **Model**: none. **Size**: 0 files.

- [ ] **F1d. NatWest statements to staging.** The operator signs in to NatWest and downloads, for
  each of March to August 2026, the current account `600947-80597386` and the savings account
  `600947-80634672` statements as CSV and PDF into `../staging/2025-2026/bank/` (March) and
  `../staging/2026-2027/bank/` (April to August), named
  `<yyyy-mm-dd>-natwest-<current|savings>-<account>.<csv|pdf>` with the month's last day, the shape
  of the 2025-26 files in the Drive mirror. No automation touches the bank sign-in. **Source**:
  `../PLAN_FINANCE_AUTOMATION.md` route 3. **Owner**: Operator. **Model**: none. **Size**: 24 files
  outside any repository.

## Blocked

- [ ] **B11.T10. ITSA phase 2: the testing evidence inside the window.** Within the 14 days before
  the day O11 names, re-run `scripts/itsa-sandbox-year.js` for 2023-24, 2025-26 and 2026-27 (the
  commands in `_developers/hmrc/ITSA_PHASE_2_SANDBOX.md` lines 69 to 79; B11.T7c's output directory
  under `../itsa-sandbox/<tax-year>/`) and update the "Testing in the last two weeks" row of
  `_developers/hmrc/hmrc_questionnaire_itsa_pass_diy_accounting_limited_v1.md` (line 28) with the
  run dates and commit. Blocked on O11's day. **Source**: BACKLOG 11; `PLAN_ITSA_PHASE_2.md` T10.
  **Owner**: Claude Code. **Model**: Haiku. **Size**: ~1 file.

- [ ] **B34.6c. Companies House accounts filing: the sandbox proof.** When O34d's answer says
  lookups are enabled: poll 000004 through `GET /api/v1/companies-house/accounts/000004` on a
  standing ci set and pin the returned `StatusCode` and any rejections as a case in
  `app/unit-tests/functions/companiesHouseAccountsGet.test.js`. The prod catalogue listing is
  BACKLOG 34c's: prod carries no `COMPANIES_HOUSE_XMLGW_URI` and no presenter secret ARNs. Blocked
  on O34d's answer. **Source**: BACKLOG 34b. **Owner**: Claude Code. **Model**: Sonnet. **Size**:
  ~1 file.

- [ ] **F2d. DIYA's book, assembled and verified.** The lines from F2a and F2b plus F2c's
  `book.toml` for 1 March to 31 August 2026, validated with `validateBook` and `validateLines`
  from the diya-gl package, written under `../staging/2026-2027/book/` (private); March 2026 matched
  line for line against the completed 2025-26 workbook (the control), every month's bank closing
  balance equal to the statement's, gross income and fees separate, no hold posted, each check a
  line in `../staging/2026-2027/book/VERIFICATION.md`. Blocked on F1b, F1c, F1d, F2a, F2b and F2c.
  **Source**: `../PLAN_FINANCE_AUTOMATION.md` phase 2 and its verification. **Owner**: Claude Code.
  **Model**: Sonnet. **Size**: ~2 files.

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

- [ ] **PU-9. Retire the three folded bundles.** `resident-diya-gl`, `resident-itsa` and
  `resident-ltd` leave `submit.catalogue.toml`, `.env.ci` and `.env.prod` once Stripe live shows no
  subscription on their prices. Blocked on PU-5. **Source**: `PLAN_PRICE_UPDATE.md` PU-9.
  **Owner**: Claude Code. **Model**: Haiku. **Size**: ~3 files.

- [ ] **B52m. The reinvestment loop.** Trailing income, reserve, budget, return per pound and payback
  as one block on `web/public/operator/dashboard.html`, fed by observations over `v_revenue_daily`
  and `v_cost_vs_target_monthly` in `operatorSnapshotPublish.js`; the reinvestment fraction as a
  lever with the reserve floor; paid traffic and article boosts as `experiments.toml` rows with
  on-off or geographic controls; GA4 conversion import from the Ads account, which exists as code
  (`infra/google/ads/ads.toml`: customer `8142685080`, four conversion actions imported from GA4
  events, one Performance Max campaign); the cost-per-session ceiling PU-15 wrote into D17 is the
  starting bid ceiling. Blocked on B52l's fitted models (the return-per-pound figure), the cost
  panel carrying revenue (BACKLOG 43, from 2026-10-02) and O52m's two numbers. **Source**: BACKLOG
  52m; `PLAN_ONE_STOP_DASHBOARD.md` D17. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~3
  files.

- [ ] **B52i. The company P&L and balance sheet on the dashboard.** The company's diya-gl book,
  derived nightly and rendered above the eight objectives beside the last set filed at Companies
  House. Shape: a nightly Lambda beside `app/functions/analytics/` calling `mcp/lib/accounts-tools.js`
  `derive_micro_entity_accounts` over the cloud book, writing JSON lines to `curated/finance/` with
  a Glue table on `Ga4DailyTables.java`'s pattern, one observation set in
  `operatorSnapshotPublish.js`, and a block above `renderSnapshot`'s objectives in
  `web/public/operator/dashboard.html`. Blocked on OF2 (DIYA's book saved to the DIYA cloud, the last of the F1 and F2 rows) and on B61 (the MCP's third Cognito app client, whose `open_book`/`save_book` over the cloud routes the nightly derivation uses). **Source**: BACKLOG 52i; `PLAN_ONE_STOP_DASHBOARD.md` D10. **Owner**:
  Claude Code. **Model**: Sonnet. **Size**: ~4 files.

- [ ] **OF2. DIYA's book saved to the DIYA cloud.** With the operator signed in through B61's
  sign-in, `save_book` writes F2d's verified book to the DIYA cloud, which is B52i's unblock event.
  Blocked on F2d and B61. **Source**: `../PLAN_FINANCE_AUTOMATION.md` phase 2. **Owner**: Claude
  Code; the operator signs in. **Model**: Haiku. **Size**: 0 files.

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

