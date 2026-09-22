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

**Prod runs deployment prod-fbead53**; main's deploy of PR #328's merge (d731afe7) is in flight.
**ci**: `ci-set1` is last-known-good. No open pull request.

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

## Machine-only

- [ ] **B43c. A skipped scheduled deploy runs no probes.** The `11 4 * * *` run 35709546270 on
  64c82119 (docs only) took B43a's exit at `skip deploy check`, and every probe suite then ran
  against the live prod set as a `skipDeploy` run does (the `generate test pass for prod` and the
  `*-prod via probe test` jobs), forty minutes of runners proving a set the scheduled
  `probe-test.yml` already proves. In `deploy.yml`, gate the `generate-test-pass` and `web-test-*`
  jobs (and their `enable-native-auth`/`disable` pair) on `needs.names.outputs.live-head-is-current
  != 'true'` for `github.event_name == 'schedule'`, keeping them for a dispatched `skipDeploy` run,
  whose purpose is the probes. Proof: the next scheduled run on an unchanged head ends within five
  minutes with only `params`, `names`, `test` and the summary jobs. **Source**: run 35709546270;
  BACKLOG 43. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~1 file.

- [ ] **B30aq. `maven package` retries a Maven Central 429.** Deploy run 35703918781 on `main`
  (fbead536, a workflow-only change) failed in `mvn-package` (`deploy.yml` line 563 onward) because
  Maven Central answered 429 Too Many Requests for `maven-jar-plugin:3.5.0`, and every stack job
  skipped behind it; the rerun passed. Wrap the `./mvnw` call in the same retry shape the workflow
  uses for `npm ci` (three attempts with a pause), or set the Maven wagon retry properties
  (`-Dmaven.wagon.http.retryHandler.count=3 -Daether.connector.http.retryHandler.count=3`) on the
  command, and check the Maven cache step restores `~/.m2` so a warm runner never asks Central.
  **Source**: run 35703918781; BACKLOG 30. **Owner**: Claude Code. **Model**: Haiku. **Size**: ~1
  file.

- [ ] **B60a. The six MCP Submit tools against the simulator lane.** `mcp/lib/submit-tools.js`
  is proven with the HTTP mocked; the plan's M2 wants the simulator
  lane first. Run each tool against the proxy lane (`npm run start:proxy` or the lane the
  `simulatorBehaviour` suite uses; `DIYA_SUBMIT_BASE_URL` and a token from B61's sign-in or
  `scripts/ensure-cognito-test-user.js`), and add the 202 poll the async routes answer with
  (`AsyncApiLambda` in `ApiStack.java`; the VAT return and the accounts submit return 202 and a poll
  URL), which the tools treat as a synchronous 200 today. A recorded transcript of the six calls
  under `mcp/test/fixtures/` becomes the tests' replayed shapes. **Source**:
  `PLAN_SUBMISSION_MCP.md` M2; BACKLOG 60. **Owner**: Claude Code. **Model**: Sonnet. **Size**:
  ~3 files.

- [ ] **B61a. The MCP client id reaches ApiStack.** B61's `booksJwtAuthorizer` audience takes
  `mcpUserPoolClientId` when it is set and today nothing sets it: `IdentityStack.java` writes the
  id to `/submit/<env>/mcp-app-client-id` (line 332) and exports it, and `SubmitApplication.java`
  reads the books client through `COGNITO_DIYA_GL_CLIENT_ID` (line 167, `diyaGlUserPoolClientId` in
  `cdk-application/cdk.json` line 19), which `.github/actions/lookup-resources/action.yml` finds by
  client name with a retry (lines 140 to 167, output `cognito-diya-gl-client-id`) and the workflows
  pass on (`deploy.yml` lines 1547 and 1892, `deploy-cdk-stack.yml` 436, `destroy-ci.yml` 1004,
  `destroy-prod.yml` 979, `probe-test.yml` 539). Do the same for the MCP client
  (`COGNITO_MCP_CLIENT_ID`, `mcpUserPoolClientId`, output `cognito-mcp-client-id`, the client name
  `IdentityStack.java` gives it), passed to `ApiStack`'s `mcpUserPoolClientId`; an empty value
  stays allowed until the first environment deploy has written the parameter. Proof: the ci
  deploy's ApiStack shows both audiences on the cloud book routes' authoriser. **Source**:
  `PLAN_SUBMISSION_MCP.md` M3; BACKLOG 61. **Owner**: Claude Code. **Model**: Sonnet. **Size**:
  ~9 files.

- [ ] **PU-14. An `experiments.toml` row for the price change.** Objective `conversion-to-paid`,
  lever price, metric purchases per human session, start at PU-5's deploy, so the £39 shape is
  measured against the 99p rate. **Source**: `REPORT_PRICE_UPDATE_REVIEW.md` §2 row
  6; operator 2026-09-21. **Owner**: Claude Code. **Model**: Haiku. **Size**: ~1 file.

- [ ] **F2f. The mail index reads invoice attachments.** `../index/corpus.toml`'s `drive` source
  carries `convert = ["pdf", "doc", "docx"]` (line 11) and the two `eml_tree` sources
  (`mail-antony` line 41, `mail-support`) carry none, so `corpus doc` returns an email's body only
  and AWS's "Invoice Available" and Google Cloud's invoice emails yield no figure to
  `mcp/lib/finance/mail-invoices.js` (F2b, on `claude/b75-board`), which posts a line only where the
  body states the total. Read the indexer's `eml_tree` reader under `../index/` for whether it
  honours `convert` for attachments, add it if it does not, set `convert = ["pdf"]` on both mail
  sources, run `.venv/bin/corpus update --config corpus.toml` from `../index/` (the F1a run took
  under fifteen minutes for the whole corpus), then extend `mail-invoices.js` with the attachment's
  total in the shape AWS and Google Cloud invoices print it, with a third redacted recording. Runs
  F2b's four cases plus the new one. **Source**: F2b's finding; `../PLAN_FINANCE_AUTOMATION.md`
  route 4. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~3 files, plus the index.

- [ ] **PU-9. Retire the three folded bundles.** `resident-diya-gl`, `resident-itsa` and
  `resident-ltd` leave `submit.catalogue.toml`, `.env.ci` and `.env.prod` once Stripe live shows no
  subscription on their prices. **Source**: `PLAN_PRICE_UPDATE.md` PU-9.
  **Owner**: Claude Code. **Model**: Haiku. **Size**: ~3 files.

- [ ] **PU-7. Practice licence build.** PU-7a to PU-7g, PU-7k and PU-7l are on `main`. Next is
  PU-7h, audit and receipts by client: the event field in `app/lib/activityAlert.js`, the receipt
  attribute in `app/data/dynamoDbReceiptRepository.js`, the receipts filter in
  `app/functions/hmrc/hmrcReceiptGet.js`, one Athena view, their tests. Then, in
  `PLAN_PRICE_UPDATE.md` §(d) (lines 227 to 236): PU-7i waits on PU-7h, PU-7j on PU-7i, PU-7m on PU-7j, PU-7e on the operator's grant numbers; the
  `resident-pro` catalogue values (`enable = "always"`, `hidden = false`,
  `allocation = "on-subscription"`) and the practice page's nav link in
  `web/public/widgets/page-chrome.js` flip in the launch step after PU-7m, with the four ci probes
  that reach resident-pro through a pass updated in the same change. **Source**:
  `PLAN_PRICE_UPDATE.md` PU-7. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~7 files for
  PU-7h, ~25 across the four rows after it.

## Machine-ask

## Human-driven

- [ ] **O34d. Send the XML Gateway email.** Send `../DRAFT_EMAIL_XMLGW_000004.md` from `antony@diyaccounting.co.uk`
  as a reply on the `xml@companieshouse.gov.uk` thread, and paste the answer into B34.6c's row when
  it comes. **Source**: BACKLOG 34d. **Owner**: Operator. **Model**: none. **Size**: 0 files.

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

- [ ] **O52m. The reinvestment fraction and the reserve floor.** Two numbers, written into B52m's
  row: the share of trailing income the loop may spend on paid traffic and article boosts, and the
  cash reserve it never spends below. **Source**: BACKLOG 52m; `PLAN_ONE_STOP_DASHBOARD.md` D17.
  **Owner**: Operator. **Model**: none. **Size**: 0 files.

- [ ] **F1d. NatWest statements to staging.** The operator signs in to NatWest and downloads, for
  each of March to August 2026, the current account `600947-80597386` and the savings account
  `600947-80634672` statements as CSV and PDF into `../staging/2025-2026/bank/` (March) and
  `../staging/2026-2027/bank/` (April to August; both directories exist, with `../staging/README.md`
  naming the layout), named
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

- [ ] **B34.6c. Companies House accounts filing: the sandbox proof.** When O34d's answer says
  lookups are enabled: poll 000004 through `GET /api/v1/companies-house/accounts/000004` on a
  standing ci set and pin the returned `StatusCode` and any rejections as a case in
  `app/unit-tests/functions/companiesHouseAccountsGet.test.js`. The prod catalogue listing is
  BACKLOG 34c's: prod carries no `COMPANIES_HOUSE_XMLGW_URI` and no presenter secret ARNs. Blocked
  on O34d's answer. **Source**: BACKLOG 34b. **Owner**: Claude Code. **Model**: Sonnet. **Size**:
  ~1 file.

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
  `web/public/operator/dashboard.html`. Blocked on OF2 (DIYA's book saved to the DIYA cloud, the last of the F1 and F2 rows). **Source**: BACKLOG 52i; `PLAN_ONE_STOP_DASHBOARD.md` D10. **Owner**:
  Claude Code. **Model**: Sonnet. **Size**: ~4 files.

- [ ] **F2d. DIYA's book, assembled and verified.** The lines from F2a and F2b plus F2c's
  `book.toml` for 1 March to 31 August 2026, validated with `validateBook` and `validateLines`
  from the diya-gl package, written under `../staging/2026-2027/book/` (private); March 2026 matched
  line for line against the completed 2025-26 workbook (the control), every month's bank closing
  balance equal to the statement's, gross income and fees separate, no hold posted, each check a
  line in `../staging/2026-2027/book/VERIFICATION.md`. Blocked on F1b's run (OF1), F1d, F2a's Stripe and PayPal parsers, F2c and F2f.
  **Source**: `../PLAN_FINANCE_AUTOMATION.md` phase 2 and its verification. **Owner**: Claude Code.
  **Model**: Sonnet. **Size**: ~2 files.

- [ ] **F2e. The MCP writes a populated spreadsheets package.** A tool in `mcp/lib/finance/` that
  takes the book and lines and writes a DIY Accounting spreadsheets package, reconciled under the
  spreadsheets repository's existing reconciliation harness rather than a new check; nothing
  automated writes to Google Drive. Blocked on F2d. **Source**: `../PLAN_FINANCE_AUTOMATION.md`
  phase 2. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~3 files.

- [ ] **OF2. DIYA's book saved to the DIYA cloud.** With the operator signed in through B61's
  sign-in, `save_book` writes F2d's verified book to the DIYA cloud, which is B52i's unblock event.
  Blocked on F2d. **Source**: `../PLAN_FINANCE_AUTOMATION.md` phase 2. **Owner**: Claude
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

