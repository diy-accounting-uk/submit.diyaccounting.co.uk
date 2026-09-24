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

**Prod runs deployment prod-3703ecf** (PR #347's merge deploy; #348 changed only a behaviour test).
**ci**: `ci-set1` is last-known-good and the only ci set standing; `ci-set2` was swept.
No pull request is open in this repository or its siblings.

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

Shared facts for the analytics rows (B52d, B52e, B52l, B52m): the prod Athena database is
`prod_env_analytics` and the workgroup `prod-env-analytics` (eu-west-2, `AWS_PROFILE=submit-prod`);
`OperatorSnapshotPublish.java` passes them to the Lambda as `GLUE_DATABASE_NAME` and
`ATHENA_WORK_GROUP_NAME` (lines 103 to 104).

## In flight

## Machine-only

- [ ] **PU-7n. The practice licence launch: the DIYA-GL page line.** Submit's side merged in PR #347
  (2026-09-24; live prices year `price_1UIyyPCD0Ld2ukzIHeO99d6G`, month
  `price_1UIyyPCD0Ld2ukzIQefbnWMO`). Remaining: the spreadsheets branch `claude/diya-gl-resident-pro`
  (commit `3b135eef0`, local, not pushed) adds a hidden `tier-resident-pro` line at £199 a year to
  `../spreadsheets.diyaccounting.co.uk/web/diya-gl.co.uk/public/index.html`; push it and open its PR.
  **Source**: `PLAN_PRICE_UPDATE.md` §(d); operator 2026-09-22 and 2026-09-23 (go). **Owner**: Claude
  Code. **Model**: Haiku. **Size**: 2 files.

- [ ] **F1b. PayPal's six months staged.** Run `scripts/finance/paypal-stage.js` (the credential
  read from Secrets Manager `prod/submit/paypal/client_id` and `prod/submit/paypal/client_secret`
  with `AWS_PROFILE=submit-prod`) for each month from March to August 2026, writing
  `../staging/<year-end>/paypal/<yyyy-mm-dd>-paypal-transactions.json`. F2g reads the output.
  **Source**: `../PLAN_FINANCE_AUTOMATION.md` route 1. **Owner**: Claude Code.
  **Model**: Haiku. **Size**: 0 files.

- [ ] **F2e. The MCP writes a populated spreadsheets package.** A tool in `mcp/lib/finance/` that
  takes the book and lines and writes a DIY Accounting spreadsheets package, reconciled under the
  spreadsheets repository's existing reconciliation harness rather than a new check; nothing
  automated writes to Google Drive. **Source**: `../PLAN_FINANCE_AUTOMATION.md`
  phase 2. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~3 files.

- [ ] **CS-1. Confirmation statement fixtures.** Save the `ConfirmationAndVerificationStatement-v1-0` schema set and `ConfirmationStatement-v1-3.xsd` (the statement reverts to it once every officer is verified), the CompanyData and PaymentPeriods schemas, and the published examples under `fixtures/companies-house-xmlgw/` from `xmlgw.companieshouse.gov.uk/v1-0/schema/` and `/examples/`. The form since 2025-11-18 is `ConfirmationAndVerificationStatement`; `ConfirmationStatement-v1-3` has no verification block. `app/unit-tests/licenceHeaders.test.js` (line 34) already exempts `fixtures/companies-house-xmlgw/` from the licence header; the accounts fixtures there (`GetSubmissionStatus_response.xml`) show the naming. Needs network access to `xmlgw.companieshouse.gov.uk`. **Source**: `PLAN_COMPANIES_HOUSE_CONFIRMATION_STATEMENT.md` (its Tasks table carries the files). **Owner**: Claude Code. **Model**: Haiku. **Size**: 12 files.

- [ ] **CS-H2d. Draft the confirmation-statement email to the XML team.** Write `../DRAFT_EMAIL_XMLGW_CS01.md` with the plan's Q1 (which endpoint and credentials test the 2025-11-18 schemas: Companies House said on 2025-11-04 to use `https://xmlgw-sandpit-staging.companieshouse.gov.uk/v1-0/xmlgw/Gateway` with live presenter credentials, package reference 0012 and GatewayTest 1; and test company data for `CompanyDataRequest`), Q2 (shareholders on a no-change statement, reject 11686) Q4 (authorisation tests and the package reference for the form), and whether Submit presenting a customer's filing under E0000052288 counts as filing for clients (ACSP; `../REPORT_CH_IDENTITY_VERIFICATION.md` V6). It goes on the new thread of the 2026-09-23 22:22 UTC email. Changes nothing committed. **Source**: `PLAN_COMPANIES_HOUSE_CONFIRMATION_STATEMENT.md` (its Tasks table carries the files). **Owner**: Claude Code. **Model**: Haiku. **Size**: 0 files.

- [ ] **F2n. The finance parsers code lines from the label map.** `bank-lines.js` (`bankCodeFor`,
  line 104) codes a line from the statement's type alone, and `paypal-statement-lines.js` and
  `stripe-lines.js` post every receipt to sales. Give each an optional `labels` input, the map F2m
  writes to `../staging/labels/diya-labels.toml` (read by the caller and passed in, so the
  parsers stay pure and the repository holds no payee data), that sets account, bank code and VAT
  code for a matching description; an unmatched line keeps today's coding and is returned in an
  `unlabelled` list. Tests over a synthetic map. The company-book skill's Build section names
  the map and the refresh from the prior year's workbooks. The map exists: `../staging/labels/diya-labels.toml` (12 rules, 11 payee patterns from the 2025-26 set).
  **Source**: operator 2026-09-23. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~7 files.

## Machine-ask

## Human-driven

- [ ] **O11. The ITSA send day.** Operator, 2026-09-23: the day after PR #346 merges, which is 2026-09-24 (#346
  merged 2026-09-23 23:25 UTC; checklist rows 8 and 13 are evidenced on `main`; the 2026-09-21
  sandbox run is inside HMRC's 14 days). On that day send `_developers/hmrc/DRAFT_EMAIL_ITSA_RECOGNITION.md` to
  `SDSTeam@hmrc.gov.uk`, then `_developers/hmrc/DRAFT_EMAIL_ITSA_PRODUCTION_CREDENTIALS.md` when
  SDST answers. **Source**: BACKLOG 11; `PLAN_ITSA_PHASE_2.md` T10. **Owner**: Operator. **Model**:
  none. **Size**: 0 files.

- [ ] **OB30bc. Make the content scan a required check.** Add `content scan` to the required
  status checks of ruleset 16057564
  (<https://github.com/diy-accounting-uk/submit.diyaccounting.co.uk/rules/16057564>), so no PR
  merges past a PII hit. B30bc merged in PR #346 (2026-09-23); on #346 a root `.md` push and a skill push each ran
  `content scan`, and the Markdown-only head reached `CLEAN`. **Owner**: Operator.
  **Model**: none. **Size**: 0 files.

- [ ] **OF2. DIYA's book saved to the DIYA cloud.** The operator saved F2k's book from the
  DIYA-GL web app on 2026-09-23 22:51 (signed in as the operator's personal Google address;
  company "DIY Accounting Limited", ltd, 2026-04-01 to 2027-03-31, version 1). That book predates
  the corrections and sits in the 35-day sandbox, expiring about 2026-10-28. The final book is
  `../staging/2026-2027/book/book-diya-gl.zip` (453 lines; on diya-gl 1.2.32: 0 book-check and 0
  report failures, turnover £2,294.82, directors' loan 0.00, bank 1200 £1,624.90, 1210 £271.69).
  Save it as a new version of the same company, and keep it past 35 days (a Resident subscription
  or a comp on the account that holds it). **Source**: `../PLAN_FINANCE_AUTOMATION.md` phase 2. **Owner**: Operator.
  **Model**: none. **Size**: 0 files.

- [ ] **CS-H1. Apply for a Companies House credit account.** Presenter E0000052288 was issued for accounts and fee-free documents only; a confirmation statement's £50 fee needs a credit account. Complete the credit account application, send it to `chdfinance@companieshouse.gov.uk`, ask for it to be linked to E0000052288 (up to 5 working days), and keep the account number in the credentials store. **Source**: `PLAN_COMPANIES_HOUSE_CONFIRMATION_STATEMENT.md` (its Tasks table carries the files). **Owner**: Operator. **Model**: none. **Size**: 0 files.

- [ ] **CS-H3. Directors' personal codes and register dates of birth.** All three directors' 11-character Companies House personal codes, register dates of birth and full names with middle names (`OtherForenames` is enforced); typed on the page at filing time, never stored. The same codes file the 5 October statement by WebFiling (OCS, runbook task B), so collect them once. **Source**: `PLAN_COMPANIES_HOUSE_CONFIRMATION_STATEMENT.md` (its Tasks table carries the files). **Owner**: Operator. **Model**: none. **Size**: 0 files.

- [ ] **CS-H5. Choose how the £50 fee is charged.** Pick A (pass the fee through), B (inside the subscription) or C (fee plus a margin) from the plan's "The fee path", and write the choice into CS-10's row. **Source**: `PLAN_COMPANIES_HOUSE_CONFIRMATION_STATEMENT.md` (its Tasks table carries the files). **Owner**: Operator. **Model**: none. **Size**: 0 files.

- [ ] **OCS. The confirmation statement, due 5 October 2026.** Made up to 21 September 2026;
  DIY Accounting Limited 06846849 last filed a CS01 on 25 October 2025
  (<https://find-and-update.company-information.service.gov.uk/company/06846849/filing-history>).
  Before filing, confirm the registered email address the 13 September update (reference
  123168-928517-893411) left on the register is the one the company keeps, and file a second update
  if it is a test value; then supply each director-PSC's personal code within 14 days of the
  statement date. Steps are task B of `../NEXT_OPERATOR_RUNBOOK.md`. File this one by WebFiling: Submit's confirmation statement (the CS rows) is not built, and CS-H6's prod proof is a fee-free second statement after this one. The personal codes are CS-H3's too. **Owner**: Operator.
  **Model**: none. **Size**: 0 files.

## Blocked

- [ ] **CS-H2. Send the confirmation-statement email.** Send `../DRAFT_EMAIL_XMLGW_CS01.md` on the `xml@companieshouse.gov.uk` thread, and paste the answers into CS-9's row. Blocked on CS-H2d. **Source**: `PLAN_COMPANIES_HOUSE_CONFIRMATION_STATEMENT.md` (its Tasks table carries the files). **Owner**: Operator. **Model**: none. **Size**: 0 files.

- [ ] **CS-2. Envelopes and the body builder.** A generalised `buildFormSubmission` and the CS01, CompanyData and PaymentPeriods builders and parsers in `app/services/companiesHouseXmlGateway.js`, plus `companiesHouseConfirmationStatementXml.js` with the XSD-order check. Blocked on CS-1. **Source**: `PLAN_COMPANIES_HOUSE_CONFIRMATION_STATEMENT.md` (its Tasks table carries the files). **Owner**: Claude Code. **Model**: Sonnet. **Size**: 4 files.

- [ ] **CS-3. Simulator for the confirmation statement.** The three new request classes in `app/http-simulator/routes/companies-house-xmlgw.js` and a `confirmation-statement` scenario. Blocked on CS-2. **Source**: `PLAN_COMPANIES_HOUSE_CONFIRMATION_STATEMENT.md` (its Tasks table carries the files). **Owner**: Claude Code. **Model**: Sonnet. **Size**: 4 files.

- [ ] **CS-4. Confirmation statement Lambdas and the shared poll.** Six Lambdas (officers and PSC proxies, filing data, preview, submit, poll) and `pollSubmission` extracted to `app/services/companiesHouseSubmissionStatus.js`, the accounts poll (`app/functions/companies-house/companiesHouseAccountsGet.js`) moved onto it. 17 files with tests: one agent. Blocked on CS-2 and CS-3. **Source**: `PLAN_COMPANIES_HOUSE_CONFIRMATION_STATEMENT.md` (its Tasks table carries the files). **Owner**: Claude Code. **Model**: Sonnet. **Size**: 17 files.

- [ ] **CS-5. Confirmation statement CDK.** The six Lambdas in `infra/main/java/co/uk/diyaccounting/submit/stacks/CompaniesHouseStack.java` with their grants, names and props; cases in `infra/test/java/co/uk/diyaccounting/submit/stacks/CompaniesHouseStackTest.java`; `./mvnw clean verify`. Blocked on CS-4. **Source**: `PLAN_COMPANIES_HOUSE_CONFIRMATION_STATEMENT.md` (its Tasks table carries the files). **Owner**: Claude Code. **Model**: Sonnet. **Size**: 5 files.

- [ ] **CS-6. Confirmation statement page, catalogue and API docs.** `web/public/companies-house/fileConfirmationStatement.html` (on the pattern of `fileMicroEntityAccounts.html` beside it), the services, the `file-confirmation-statement` activity in `web/public/submit.catalogue.toml` (ci only, as `file-micro-entity-accounts` at line 424 is until BACKLOG 34c) and `openapi.json`. Blocked on CS-4. **Source**: `PLAN_COMPANIES_HOUSE_CONFIRMATION_STATEMENT.md` (its Tasks table carries the files). **Owner**: Claude Code. **Model**: Sonnet. **Size**: 5 files.

- [ ] **CS-7. Confirmation statement behaviour suite.** `test:fileConfirmationStatementBehaviour-*`. Blocked on CS-6. **Source**: `PLAN_COMPANIES_HOUSE_CONFIRMATION_STATEMENT.md` (its Tasks table carries the files). **Owner**: Claude Code. **Model**: Sonnet. **Size**: 4 files.

- [ ] **CS-8. Confirmation statement MCP tools.** Four tools in `mcp/lib/submit-tools.js`. Blocked on CS-4. **Source**: `PLAN_COMPANIES_HOUSE_CONFIRMATION_STATEMENT.md` (its Tasks table carries the files). **Owner**: Claude Code. **Model**: Sonnet. **Size**: 4 files.

- [ ] **CS-9. Confirmation statement sandbox proof.** On the endpoint CS-H2's answer names: a CompanyDataRequest, a no-change statement, a SIC change, one with `Shareholdings`, one with a blank director code, each polled to a terminal state and pinned in the simulator; settles Q2 and Q3. Blocked on CS-5, CS-7, CS-H1 and CS-H2; machine-ask when it runs (live credentials). **Source**: `PLAN_COMPANIES_HOUSE_CONFIRMATION_STATEMENT.md` (its Tasks table carries the files). **Owner**: Claude Code. **Model**: Sonnet. **Size**: 3 files.

- [ ] **CS-10. Confirmation statement fee collection.** Build the option CS-H5 picks. Blocked on CS-H5 and CS-4. **Source**: `PLAN_COMPANIES_HOUSE_CONFIRMATION_STATEMENT.md` (its Tasks table carries the files). **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~5 files.

- [ ] **CS-11. Confirmation statement prod launch.** `prod` on the activity, prod gateway values, `compliance.toml` rows for the credit account and the authorisation. Shares BACKLOG 34c steps 3 and 4 with the accounts launch. Blocked on CS-9, CS-H4 and CS-H6. **Source**: `PLAN_COMPANIES_HOUSE_CONFIRMATION_STATEMENT.md` (its Tasks table carries the files). **Owner**: Claude Code. **Model**: Haiku. **Size**: 5 files.

- [ ] **CS-12. Identity-verification answers into the confirmation statement.** Apply V1 to V4 from Cowork's `../REPORT_CH_IDENTITY_VERIFICATION.md` (written 2026-09-23; the plan's table carries the answers) to the page and the XML builder: every director needs a code, `OtherForenames` required, the schema chosen from each officer's `identity_verification_details`. Blocked on CS-6. **Source**: `PLAN_COMPANIES_HOUSE_CONFIRMATION_STATEMENT.md` (its Tasks table carries the files). **Owner**: Claude Code. **Model**: Sonnet. **Size**: 3 files.

- [ ] **CS-13. PSC verification statement (VS01).** A builder over `PSCVerificationStatement-v1-0.xsd`, a submit and poll Lambda pair, a result-view section for each director who is also a PSC, filed after the statement inside the window starting the day after the review date (the report's V4). Blocked on CS-9. **Source**: `PLAN_COMPANIES_HOUSE_CONFIRMATION_STATEMENT.md` (its Tasks table carries the files). **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~8 files.

- [ ] **CS-H4. Software authorisation for the confirmation statement.** The XML team tests CS-9's submissions and issues the package reference for the form. Blocked on CS-9. **Source**: `PLAN_COMPANIES_HOUSE_CONFIRMATION_STATEMENT.md` (its Tasks table carries the files). **Owner**: Operator. **Model**: none. **Size**: 0 files.

- [ ] **CS-H6. Go for the prod confirmation statement.** Give the go for a statement for 06846849 through Submit (a fee-free second statement in the 2026-27 payment period, after the 5 October one by WebFiling), knowing it moves the next review date. Blocked on CS-11, CS-H3 and CS-H4. **Source**: `PLAN_COMPANIES_HOUSE_CONFIRMATION_STATEMENT.md` (its Tasks table carries the files). **Owner**: Operator. **Model**: none. **Size**: 0 files.

- [ ] **B30at1. The sweep's claim check, proven.** Needs a claimed set that is not last-known-good
  (the sweep keeps the last-known-good set before it reads any claim): the next time two branches
  deploy at once, `gh workflow run destroy-ci.yml -f sweep-for-stacks=true` while the second holds
  `ci-set2`, and its log shows "stays: claimed by run". Blocked on two branches deploying at once. **Owner**: Claude Code. **Model**: Haiku.
  **Size**: 0 files.

- [ ] **F2g. PayPal transactions into diya-gl lines.** `mcp/lib/finance/paypal-lines.js` over
  F1b's staged files, on `mcp/lib/finance/stripe-lines.js`'s pattern. The statement route,
  `mcp/lib/finance/paypal-statement-lines.js`, already applies the rules this route needs
  (settled only; holds and their releases unposted, `isHoldCandidate` line 288 and
  `isReleaseCandidate` line 301; a receipt gross to `sales` with its fee to `purchases`; bank
  transfers and currency conversions unposted, `isCurrencyConversionOrTransfer` line 274): reuse
  those functions where the API's record shape allows. A bill payment is `purchases` matched to
  the mailbox invoice (`mcp/lib/finance/mail-invoices.js`). Validated with `validateLines`; a unit
  test over a recorded page; the proof is that the API route's `sales` and `purchases` lines for
  March to August 2026 equal the PayPal lines the statement route wrote into
  `../staging/2026-2027/book/lines.jsonl`.
  Blocked on F1b. **Source**: `../PLAN_FINANCE_AUTOMATION.md` phase 2. **Owner**: Claude Code.
  **Model**: Sonnet. **Size**: ~2 files.

- [ ] **B34.6c. Companies House accounts filing: the sandbox proof.** The XML team was asked on 2026-09-23 22:22 UTC in a new thread (from antony@, subject "Submission 000004 status and
  GetSubmissionStatus query") whether 000004 was accepted and whether lookups are enabled for test
  presenter 66666727000. When the answer says they are: poll 000004 through `GET /api/v1/companies-house/accounts/000004` on a
  standing ci set and pin the returned `StatusCode` and any rejections as a case in
  `app/unit-tests/functions/companiesHouseAccountsGet.test.js`. The prod catalogue listing is
  BACKLOG 34c's: prod carries no `COMPANIES_HOUSE_XMLGW_URI` and no presenter secret ARNs. Blocked
  on the XML team's reply; the request and response for 1790201546927 are in
  `../XMLGW_000004_POLL_2026-09-23.md` if they ask. **Source**: BACKLOG 34b. **Owner**: Claude Code. **Model**: Sonnet. **Size**:
  ~1 file.

- [ ] **B52l. The optimiser over the raw export.** A notebook over `../analytics/prod/` (pulled by
  `scripts/analytics-pull.sh`, one CSV per view in `app/functions/analytics/rawExportPublish.js`'s
  `VIEW_NAMES` (line 21)): per-block correlations, the block models fitted (linear cost from
  `v_cost_daily`, log-linear funnels from `v_login_to_submission_funnel` and `v_ga4_funnel_daily`,
  Hill curves for spend), levers ranked by effect per unit cost, and the next experiment proposed
  with its predicted effect and interval as a row ready for `experiments.toml`; Bayesian
  optimisation for the continuous knobs and a Thompson-sampling bandit for allocations once
  experiments exist. The model design as a section under `PLAN_ONE_STOP_DASHBOARD.md` D16 first,
  then the notebook, then one line per objective on `web/public/operator/dashboard.html`. Blocked
  until three months of nightly export exist under `exports/prod/`: first written 2026-09-08, so
  the gate is 2026-12-09, checked with `aws --profile submit-prod s3 ls
  s3://prod-env-analytics-lake-<account>/exports/prod/`. **Source**: BACKLOG 52l;
  `PLAN_ONE_STOP_DASHBOARD.md` D16. **Owner**: Claude Code. **Model**: Opus for the models, Sonnet
  for the notebook. **Size**: ~3 files.

- [ ] **B52m. The reinvestment loop.** Trailing income, reserve, budget, return per pound and payback
  as one block on `web/public/operator/dashboard.html`, fed by observations over `v_revenue_daily`
  and `v_cost_vs_target_monthly` in `operatorSnapshotPublish.js`; the reinvestment fraction as a
  lever with the reserve floor (operator, 2026-09-22: the fraction is 20% of trailing income, the
  reserve floor £2,000, one experiment may take at most 10% of the budget unless the operator
  names a larger share for it, and the trailing window is 30 days); paid traffic and article boosts as `experiments.toml` rows with
  on-off or geographic controls; GA4 conversion import from the Ads account, which exists as code
  (`infra/google/ads/ads.toml`: customer `8142685080`, four conversion actions imported from GA4
  events, one Performance Max campaign); the cost-per-session ceiling PU-15 wrote into D17 is the
  starting bid ceiling. Blocked on B52l's fitted models (the return-per-pound figure), the cost
  panel carrying revenue (BACKLOG 43, from 2026-10-02). **Source**: BACKLOG
  52m; `PLAN_ONE_STOP_DASHBOARD.md` D17. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~3
  files.

- [ ] **B52i. The company P&L and balance sheet on the dashboard.** The company's diya-gl book,
  derived nightly and rendered above the eight objectives beside the last set filed at Companies
  House. Shape: a nightly Lambda beside `app/functions/analytics/` calling `mcp/lib/accounts-tools.js`
  `derive_micro_entity_accounts` over the cloud book, writing JSON lines to `curated/finance/` with
  a Glue table on `Ga4DailyTables.java`'s pattern, one observation set in
  `operatorSnapshotPublish.js`, and a block above `renderSnapshot`'s objectives in
  `web/public/operator/dashboard.html`. Blocked on OF2 (DIYA's final book saved to the DIYA cloud and kept past the 35-day sandbox). **Source**: BACKLOG 52i; `PLAN_ONE_STOP_DASHBOARD.md` D10. **Owner**:
  Claude Code. **Model**: Sonnet. **Size**: ~4 files.

## Discipline

- **Push once per batch of landed tracks, never per track**, and prefer one dispatch that
  proves several things over several dispatches. A push per track turned one batch into six
  ci deploys and several environment deploys in a morning on 2026-09-06, each able to open
  alarm issues and cancel each other through the deploy concurrency group, and the operator
  froze pushes twice. A freeze, when the operator calls one, stops `git push`,
  `gh workflow run` and `gh pr create` until they lift it in their own words; local commits,
  worktree tracks and reading logs continue, and a failed job gets a proposed fix in the reply.

