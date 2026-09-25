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

**Prod runs deployment prod-0fdfb15** (PR #351's merge deploy, run 36001311936; the confirmation statement activity is listed on ci only).
**ci**: `ci-set1` is last-known-good (built 2026-09-24 10:02 UTC by the b92 branch deploy) and the only ci set standing.
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

Shared facts for the analytics rows (B52i, B52l, B52m): the prod Athena database is
`prod_env_analytics` and the workgroup `prod-env-analytics` (eu-west-2, `AWS_PROFILE=submit-prod`);
`OperatorSnapshotPublish.java` passes them to the Lambda as `GLUE_DATABASE_NAME` and
`ATHENA_WORK_GROUP_NAME` (lines 103 to 104).

## In flight

- [ ] **B30bl. The self-destruct schedule wraps past midnight.** `SelfDestructStack.java` builds the rule's hour field as `<start hour>/<delay>` (the `hourExpression`, around line 305), and a cron hour step does not wrap: a set created at 16:16 UTC gets `cron(16 16/4 * * ? *)`, which fires only at 16:16 and 20:16. ci-set1's last-known-good protection (`LAST_KNOWN_GOOD_PROTECTION_HOURS`, line 48) ended 2026-09-25 00:45 UTC, but the next firing was 16:16 UTC, about 27.5 hours after promotion; the comment at line 46 says 12 to 16. Build the hour field as `(start hour % delay)/delay` (`0/4` for a 16:xx start, firing at 00, 04, 08, 12, 16 and 20), keep the single fixed hour when the delay does not divide 24, fix the line 46 comment, and add cases to `SelfDestructStackTest.java` for a start before and after 20:00 UTC. Maven proof: `./mvnw test -Dtest=SelfDestructStackTest`; `spotless:apply` only on the two files. A pipeline failure (a cron firing wrongly), so tier 1; operator, 2026-09-25: first wave. **Source**: BACKLOG 30. **Owner**: Claude Code. **Model**: Haiku. **Size**: 2 files. **In flight**: landed on `claude/arclight-itsa` (worktree `.claude/worktrees/arclight`); the batch is not pushed yet.

- [ ] **ITSA-R4. The simulator lacks HMRC's test-support create-business route.** `itsaUkPropertyAnnualSubmission` and `itsaUkPropertyPeriod` fail at their first step: `[HMRC Test Business] Create business failed: 404 Not Found - {"code":"NOT_FOUND","message":"Route not found: POST /individuals/self-assessment-test-support/business/{nino}"}` (run 2026-09-24). The caller is `createHmrcTestBusiness` in `behaviour-tests/helpers/behaviour-helpers.js` (line 1172): it walks the simulator's authorize page (that part passes), POSTs `buildTestSupportBusinessBody`'s body (line 1141) to `/individuals/self-assessment-test-support/business/{nino}` and needs `{ businessId }` back (line 1238), then POSTs `/individuals/self-assessment-test-support/itsa-status/{nino}/{taxYear}` (line 1246), which the simulator also lacks. The suites then file against that `businessId` (`itsaUkPropertyPeriod.behaviour.test.js` line 289), so a created business has to persist: record it in `app/http-simulator/state/store.js` and have `app/http-simulator/routes/itsa-business-details.js`'s list (line 23) return it for that NINO, and `routes/itsa-status.js` answer the status set. Both routes in a new `app/http-simulator/routes/itsa-test-support.js` registered beside the others; a unit test per route under `app/unit-tests/http-simulator/routes/` on `companies-house-xmlgw.test.js`'s pattern. Runs in one agent with ITSA-R3, R4 first, because both touch the simulator's ITSA routes and R3's first suspect is the business picker that reads the same list. Blocks O11. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~4 files. **In flight**: landed on `claude/arclight-itsa`; the two UK property suites pass on the simulator.

- [ ] **ITSA-R3. Four ITSA suites time out on the simulator.** Run 2026-09-24: each waits 452 s with no status and no spinner, then times out. `itsaAnnualSubmission` waits for "Annual Submission edit form", `itsaFinalDeclaration` for "Final Declaration calculation retrieved", `itsaLossesAndClaims` for "Losses and Claims edit form", `itsaSelfEmploymentPeriod` for "Quarterly update result". The same shape in four suites points at one cause upstream of the forms (the business picker, a shared step, or a simulator route); diagnose that first: `npm run test:itsaAnnualSubmissionBehaviour-simulator`, then its log `itsaAnnualSubmissionBehaviour.log` and the screenshots under `target/`. Runs in the same agent as ITSA-R4, after it (the business picker reads `routes/itsa-business-details.js`, which R4 changes). `itsaBusinessDetails` and `itsaObligations` pass. The approvals checklist cites these suites (`_developers/hmrc/ITSA_PRODUCTION_APPROVALS_CHECKLIST.md` lines 34 to 46). Blocks O11. **Owner**: Claude Code. **Model**: Sonnet. **Size**: —. **In flight**: landed on `claude/arclight-itsa`. The cause was the second HMRC consent a write action asks for after a read-scoped token; all eight ITSA suites pass on the simulator.

- [ ] **ITSA-R1. The eight ITSA suites in CI.** None of the eight `test:itsa*Behaviour-simulator` suites is in `.github/workflows/test.yml`'s simulator jobs (the VAT suites are, from line 725); `deploy.yml` runs six on ci only (from line 2784) and skips prod; annual submission and final declaration run nowhere. Add all eight on the VAT jobs' pattern once ITSA-R3 and ITSA-R4 make them pass. **Owner**: Claude Code. **Model**: Sonnet. **Size**: 1 file. **In flight**: an agent, worktree `.claude/worktrees/itsa-ci` on `claude/arclight-itsa-ci`, cut from the batch.

- [ ] **ITSA-R2. The sandbox year with a real multi-factor header: the runs.** The code is on `claude/arclight-itsa`: `scripts/itsa-sandbox-year.js` signs the lane's durable user in through Cognito and builds `Gov-Client-Multi-Factor` from the ID token, and only `VALID_HEADERS` with no warnings passes. The `local` lane's user `synthetic-local@test.diyaccounting.co.uk` has a TOTP device but no stored secret (`ci/submit/test/local/totp-secret` is missing), and no password is stored by design. With the operator's go (a Cognito and Secrets Manager write), in the batch worktree: `AWS_PROFILE=submit-ci npm run test:enableCognitoNative` (rotates the password and TOTP device, stores the secret, writes `cognito-native-test-credentials.json`); run 2023-24, 2025-26 and 2026-27 with `ITSA_SANDBOX_COGNITO_PASSWORD` from that file (command in `_developers/hmrc/ITSA_PHASE_2_SANDBOX.md`); `npm run test:disableCognitoNative`. Then record each run's date, transcript and commit in `ITSA_PHASE_2_SANDBOX.md` and the questionnaire's "Testing in the last two weeks" row (`_developers/hmrc/hmrc_questionnaire_itsa_pass_diy_accounting_limited_v1.md` line 28), and change the recognition email's MFA sentence (`_developers/hmrc/DRAFT_EMAIL_ITSA_RECOGNITION.md` lines 49 to 51) to the validator's result. Blocks O11. **Owner**: Claude Code with the operator. **Model**: Sonnet. **Size**: 3 files. **In flight**: landed on `claude/arclight-itsa` (runs 2026-09-25: 2023-24, 2025-26 and 2026-27 each `VALID_HEADERS` with no warnings, final declarations 204; the run record, questionnaire row and email sentence updated). The HMRC sandbox test user in `../hmrc-test-user.json` was recreated because its stored password no longer signed in.

- [ ] **CS-10a. The per-submission price in the product catalogue.** Give activities a price the way
  bundles have one: `[[activities.prices]]` under `id = "file-confirmation-statement"` in
  `web/public/submit.catalogue.toml` (line 438), on the shape of `[[bundles.prices]]` (line 154:
  `interval`, `amount`, `currency`, `default`), with `interval = "submission"` marking a one-off charge
  per filing. Amount £61.35 (6135 pence): `(Companies House fee + Stripe fee) × 1.2` with the fee £50 and Stripe's standard UK card rate of 1.5% + 20p charged on the price itself, so P = 1.2 × (5000 + 0.015P + 20), P = 6024 / 0.982 = 6134.4, rounded up; the formula goes in the row's comment so a fee change is one edit.
  Parse and validate it in `app/services/productCatalog.js` beside `getBundlePrices` (line 75; its
  tests in `app/unit-tests/services/productCatalog.test.js`), and teach
  `infra/stripe/lib/stripeCatalogue.js` `buildStripeProductsFromCatalog` (line 19) and
  `infra/stripe/stripe-sync.js` to plan a one-off Stripe price for an activity price: the price
  lookup (line 305) filters `type: "recurring"` and the create (line 320) always sets `recurring`, so
  both branch on `interval = "submission"`; `computeEnvUpdates` (line 254) names the env var row.
  Tests in `app/unit-tests/scripts/stripeSync.test.js`. The agent runs the sync as a plan only; the
  `--apply` in test mode is a Stripe write the operator approves after merge, and the live price
  lands with CS-11 through `stripe-catalogue-sync`. The page and
  the charge flow are CS-10b and CS-10c. **Source**: `PLAN_COMPANIES_HOUSE_CONFIRMATION_STATEMENT.md`
  "The fee path"; operator 2026-09-24. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~6 files. **In flight**: landed on `claude/arclight-itsa`.

- [ ] **SR-3. The XML Gateway poll saves the raw and masked exchange.** The 000004 reply to the XML team took three drafts and two extra gateway calls, because the poll (scratch scripts under the session scratchpad) saved only masked XML bodies: no HTTP headers, no raw copy, and the masking hid the empty `Value` the gateway echoes. A committed `scripts/companies-house-xmlgw-poll.js` over `app/services/companiesHouseXmlGateway.js`'s `buildStatusRequest` and `resolvePresenterCredentials` that writes, per call, the request and response with the HTTP request line, headers and body, raw and masked (masking only non-empty credential fields), to a directory outside the repository; a unit test over the masking. **Source**: session report VWPXGf. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~3 files. **In flight**: landed on `claude/arclight-itsa`.

- [ ] **SR-4. A lint rule for unescaped HTML on `web/public`.** CodeQL alert 74 (DOM text reinterpreted as HTML) cost PR #351 a 169 job-minute redeploy and about 55 minutes, and the same page held 15 more unescaped interpolations. `eslint.config.js` lints `web/public/**/*.js` (line 82) but not the inline scripts in `web/public/**/*.html`, where the finding was. Add `eslint-plugin-html` and `eslint-plugin-no-unsanitized` for `web/public`, run it over the existing pages, and record the count; if it finds more than the lint job's ratchet allows (`.eslint-baseline.json`), raise the baseline to the measured count so the gate blocks new findings only. **Source**: session report VWPXGf. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~4 files. **In flight**: landed on `claude/arclight-itsa`.

- [ ] **SR-6a. Code comments stop citing plan documents: app, mcp, web, behaviour-tests.** 80 lines in 54 files cite a `PLAN_*.md` (`git grep -n -E 'PLAN_[A-Z0-9_]+\.md' -- app mcp infra web/public scripts behaviour-tests .github ':!*.md'`), 35 of them `PLAN_PRICE_UPDATE.md (d)`, which moved to `../developers/submit/archive/`; the rule is that comments and test names never reference a plan. This half: the 26 files under `app/`, `mcp/`, `web/public/` and `behaviour-tests/`, including three `describe` names (`companiesHouseAccountsPost.test.js` line 260, `hmrcVatObligationGet.test.js` line 285, `hmrcVatReturnPost.test.js` line 440) and two MCP tool descriptions in `mcp/lib/server.js` (lines 356 and 368). Rewrite each to say what the code does; no behaviour change; `npm run linting` on the files touched. **Owner**: Claude Code. **Model**: Haiku. **Size**: 26 files. **In flight**: landed on `claude/arclight-itsa`.

- [ ] **SR-6b. Code comments stop citing plan documents: infra, scripts, workflows.** SR-6a's other half: the 28 files under `infra/`, `scripts/` and `.github/`, including a SQL view header (`infra/main/resources/analytics/views/v_cost_vs_target_monthly.sql` line 5) and an operator-facing `echo` in `scripts/aws-accounts/backup-prod-for-migration.sh` (line 309). Java files: `./mvnw spotless:apply` reformats files the row does not own, so format only the files touched; `prettier --check` on the workflow. Lands on SR-6a's branch or after it. **Owner**: Claude Code. **Model**: Haiku. **Size**: 28 files. **In flight**: landed on `claude/arclight-itsa`.

- [ ] **CS-10b. Charging for a single submission.** A general capability, not confirmation-statement
  specific: a route that opens a Stripe Checkout Session in `payment` mode for an activity's
  `interval = "submission"` price (on `app/functions/billing/billingCheckoutPost.js`'s pattern, which
  opens `subscription` mode for bundles), carrying the activity id and a subject key (for the
  confirmation statement, company number and review date) in the session metadata; `billingWebhookPost.js`
  records the paid charge on `checkout.session.completed` in `payment` mode; a service
  `app/services/activityCharges.js` with `hasPaidCharge(userSub, activityId, subjectKey)` and a way to
  mark a charge used, so one payment covers one filing. The route in `app/bin/server.js` and in CDK
  beside the billing routes; the storage on the existing billing tables' pattern (design the record
  first: a new DynamoDB table in the data stack, or rows in an existing billing table). Unit tests for
  the route, the webhook branch and the service.
  **Source**: `PLAN_COMPANIES_HOUSE_CONFIRMATION_STATEMENT.md` "The fee path". **Owner**: Claude Code.
  **Model**: Sonnet. **Size**: ~10 files. **In flight**: landed on `claude/arclight-itsa`.

- [ ] **CS-10c. The charge in the confirmation statement journey.** On
  `web/public/companies-house/fileConfirmationStatement.html`: when `PaymentPeriodsRequest` says the
  fee is due, the preview shows £61.35 and "Pay and submit" opens CS-10b's checkout; the return lands
  back on the preview and submits. `app/functions/companies-house/companiesHouseConfirmationStatementPost.js`
  refuses a fee-due submission without an unused paid charge for the company and review date (JSON
  402), marks the charge used on acceptance by the gateway, and keeps `COMPANIES_HOUSE_CS_FEE_MODE=operator`
  for the operator's own company. A browser test for both fee states, and a
  `fileConfirmationStatementBehaviour` case paying with a Stripe test card on the simulator. **Source**: `PLAN_COMPANIES_HOUSE_CONFIRMATION_STATEMENT.md` "The fee path". **Owner**:
  Claude Code. **Model**: Sonnet. **Size**: ~6 files. **In flight**: an agent, worktree `.claude/worktrees/cs10c` on `claude/arclight-cs10c`, cut from the batch.

- [ ] **B52i. The company P&L and balance sheet on the dashboard.** Build the design in `PLAN_ONE_STOP_DASHBOARD.md` "D10 build: the book reader's identity": a `{env}-env-company-book-pull` job in `IngestionStack.java` beside the Stripe reconcile job, an optional branch of `NightlyIngestionWorkflow`, whose role can only `s3:GetObject` under `users/{ownerPrefix}/books/{bookId}/` in `{env}-env-diya-gl-{account}` and `s3:PutObject` on the lake's `curated/finance/*`; it derives the micro-entity accounts (move the derivation from `mcp/lib/accounts-tools.js` `derive_micro_entity_accounts` into `app/services/` and add `@diy-accounting-uk/diya-gl` to the root `package.json`, because the Lambda image copies `app/` only), writes JSON lines to `curated/finance/` with a Glue table on `Ga4DailyTables.java`'s pattern, one observation set in `operatorSnapshotPublish.js`, and a block above `renderSnapshot`'s objectives in `web/public/operator/dashboard.html` (line 283). Config: `SUBMIT_COMPANY_BOOK_ID` and `SUBMIT_COMPANY_BOOK_OWNER_PREFIX` as GitHub Environment variables read by `SubmitEnvironment.java` and passed by `deploy-environment.yml`; unset means no job and no grant. Tests: `app/unit-tests/analytics/companyBookPull.test.js` and `IngestionStackTest` cases for the configured and unconfigured stack. Over 25 files is not expected; if it is, split derivation move from the job. **Source**: BACKLOG 52i; `PLAN_ONE_STOP_DASHBOARD.md` D10. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~10 files. **In flight**: landed on `claude/arclight-itsa`: the job, the `company_accounts` Glue table, a ninth snapshot objective (turnover, costs, profit and the seven FRS 105 lines) and a panel above the objectives that stays hidden while the job is off. No source reads DIYA's own Companies House filing history yet, so the panel shows the book's figures alone. The job reads nothing until the two prod variables name the book.

- [ ] **SR-5. The spreadsheets pre-push hook stops refusing its own regenerated file (spreadsheets).** Two pushes in one session (PU-7n and F2e's harness) ran the full browser tier, 65 and 43 minutes, for 2-file and 6-file changes, then refused the push because the test router rewrote `app/lib/provenance-data.js` from the locally installed diya-gl engine version (`../spreadsheets.diyaccounting.co.uk/.githooks/pre-push`, lines 89 and 124; `scripts/build-provenance-data.mjs`; `scripts/test-scope.mjs`). Make the router leave `provenance-data.js` alone when only the local engine version differs, and scope the browser tier to the changed pages. **Source**: session report VWPXGf. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~3 files (spreadsheets). **In flight**: spreadsheets PR #142 (`claude/arclight-prepush`); the fix for its two red router tests is pushed.

## Machine-only

- [ ] **X-1. DIYA-GL on Submit's spreadsheets page.** Operator, 2026-09-25: https://submit.diyaccounting.co.uk/spreadsheets.html lists the spreadsheet products (`web/public/spreadsheets.html`, the `.product` blocks from line 392); add DIYA-GL (https://diya-gl.co.uk/, the four books in the browser) as a product block on the same pattern, and check the page's browser test covers it. The gateway's G-1 and spreadsheets' LP-27 are the same change on the other sites. **Owner**: Claude Code. **Model**: Haiku. **Size**: ~2 files.

- [ ] **SI-1. Every sign-in route at the same level: the inventory and design.** Operator, 2026-09-25: uplift every sign-in path in this repository and `../spreadsheets.diyaccounting.co.uk` so every route is at the same level, with no gaps. Three Cognito app clients in `IdentityStack.java` (lines 258, 284, 315) sign people in, and they are not at one level today: the Submit client's code exchange runs through Submit's own `app/functions/auth/cognitoTokenPost.js`, which publishes a `login` or `token-refresh` activity event (line 91, `publishActivityEvent` line 95), and the Submit callback page sends GA4 `login` (`web/public/auth/loginWithCognitoCallback.html` line 225); the books client exchanges its code in the browser straight with Cognito (`../spreadsheets.diyaccounting.co.uk/web/diya-gl.co.uk/public/cloud.js` lines 229, 245, 357) and the MCP client from the CLI (`mcp/lib/auth.js` line 187), so neither leaves an activity event or a GA4 login, and a book save (`app/functions/diyaGl/diyaGlPut.js`) or open emits nothing either (prod has 10 books under 3 owners and the lake has rows for one). The pool's Pre Token Generation trigger (`app/functions/auth/preTokenGeneration/index.js`) runs for every client on every token issue and names the `triggerSource`, so it is a candidate single point for the sign-in and refresh events. Write `PLAN_SIGN_IN_PARITY.md` at this root: the operator's words verbatim at the top; a matrix of every route (the three clients, native Cognito for the test lanes, token refresh and sign-out for each, and any other sign-in the two repositories carry, found by grep for `oauth2/`, `InitiateAuth` and the Hosted UI domain) against every dimension a route should have (server-side activity event with actor classification and masked email, GA4 `login` and `logout`, synthetic and test tagging, the MFA claim and `Gov-Client-Multi-Factor` data, sign-out and token revocation, book save and open events, alarms and dashboard panels that count sign-ins, and whether the user authenticated or a token refresh started a new session: operator 2026-09-25, from Pre Token Generation's `triggerSource` and `cognitoTokenPost.js`'s `grantType`, with a session marker on the event); each gap with the file and line that closes it; and the build split into rows by repository, each under about 25 files, with its tests. **Source**: operator 2026-09-25. **Owner**: Claude Code. **Model**: Opus. **Size**: 1 file.

- [ ] **B39a. Lighthouse over every sitemap URL (issue #13).** Today `compliance.yml`'s `accessibility-lighthouse` job (line 235, weekly, Monday 06:06 UTC; `main` runs it against prod) audits one URL through `npm run accessibility:lighthouse-<env>` (`package.json` lines 346 to 351). Build what the issue's acceptance criteria name: a script (`npm run lighthouse:multi`, on `lighthouse` ^13.3.0, already a dependency, or `@lhci/cli`) that reads `web/public/sitemap.xml` (16 URLs) and audits each for performance, accessibility, SEO and best practices; per-URL HTML reports uploaded as the job's artifact; thresholds in one config file, Perf 80, A11y 95, SEO 95, Best practices 95, and where a page measures below on the first run, that category's gate starts at the measured floor and the gap is listed in the commit message; a drift check that fails when the sitemap gains a URL the config does not cover; at most 10 minutes added, by running 3 at a time. `scripts/generate-compliance-report.js` `parseLighthouseResults` (line 215) reads one `lighthouse-results.json`; extend it to the per-URL set. Also: 44 URLs in `package.json`'s ci accessibility scripts (lines 341 to 385) name `ci.submit.diyaccounting.co.uk`, which no longer resolves; the ci apex is `ci-submit.diyaccounting.co.uk` (line 341's non-report sibling already uses it); fix them in the same change. Docs the issue names: `accessibility.html` (coverage sentence). Workflow brief: the called-workflow checklist, `prettier --check` and a js-yaml parse; proof is a `compliance.yml` dispatch after merge. BACKLOG 39's synthetic-test flakiness half stays on the backlog. **Source**: BACKLOG 39; issue #13. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~5 files.

## Machine-ask

## Human-driven

- [ ] **CS-H2. Send the confirmation-statement email.** Send `../DRAFT_EMAIL_XMLGW_CS01.md` on the `xml@companieshouse.gov.uk` thread, and paste the answers into CS-9's row. **Source**: `PLAN_COMPANIES_HOUSE_CONFIRMATION_STATEMENT.md` (its Tasks table carries the files). **Owner**: Operator. **Model**: none. **Size**: 0 files.

## Blocked

- [ ] **SI-2. Sign-in parity, the build.** The rows `PLAN_SIGN_IN_PARITY.md` names, one per repository, Submit first (the event path, the trigger, the book save and open events), then spreadsheets (the DIYA-GL pages' GA4 events and tagging). Blocked on SI-1. **Source**: operator 2026-09-25. **Owner**: Claude Code. **Model**: Sonnet. **Size**: —.

- [ ] **F-BS1. The 2026-27 company book's negative balance-sheet lines.** Cowork's check of `../staging/2026-2027/book/` (diya-gl 1.2.34, 2026-09-24): every check passes, but the published balance sheet shows trade debtors −£425.36 and trade creditors −£681.52, and net assets £1,337.3033 against shareholders' funds £1,337.3233 (2p). Causes it named: `BANK-2026-04-13-15-SUSPENSE` £527.41 (bank code DR; the 13 April "POLYCODE LIMITED, DL REPAYMENT" of the same amount is the likely pair); six "PAYPAL PAYMENT 5JX22222WZGH6" top-ups (£184.64) coded CR with no purchases line, which are transfers into the PayPal wallet; ICO ZB070902 £47.00 on 22 May with no purchases line although the label map (`../staging/labels/diya-labels.toml`) has an ICO rule; "Matthew Grundy, DIY ACCOUNTING" £70.00 on 22 April. Resolve against the operator's own reference set of accounts, line by line, then rebuild and verify with the `company-book` skill. Blocked on the operator's reference set of accounts. **Owner**: Claude Code. **Model**: Sonnet. **Size**: 0 files (the book and the label map are under `../staging/`, a label-rule or parser fix is ~2 files).

- [ ] **CS-H1. Companies House credit account: the account number.** The application went to
  `chdfinance@companieshouse.gov.uk` on 2026-09-24 (form at `../DIY Accounting Limited - CH account 2026-09-24.pdf`,
  email `../DRAFT_EMAIL_CH_CREDIT_ACCOUNT.md`), asking for the account to be linked to presenter E0000052288.
  Companies House takes up to 5 working days (by 2026-10-01). When the account number arrives, keep it in the
  credentials store and say so here; CS-9 then needs only CS-H2's answer. **Owner**: Operator. **Model**: none.
  **Size**: 0 files.

- [ ] **O11. The ITSA send day.** The day after ITSA-R1 to ITSA-R4 land (the proof suites passing and in CI, and a validator with no warning). Send `_developers/hmrc/DRAFT_EMAIL_ITSA_RECOGNITION.md` to `SDSTeam@hmrc.gov.uk`, then `_developers/hmrc/DRAFT_EMAIL_ITSA_PRODUCTION_CREDENTIALS.md` when SDST answers. The sandbox year must be inside HMRC's 14 days on the send day: the 2026-09-21 run lapses after 2026-10-05, and ITSA-R2's re-run replaces it. Blocked on ITSA-R1 and ITSA-R2 reaching `main`. **Source**: BACKLOG 11; `PLAN_ITSA_PHASE_2.md` T10. **Owner**: Operator. **Model**: none. **Size**: 0 files.

- [ ] **CS-9. Confirmation statement sandbox proof.** On the endpoint CS-H2's answer names: a CompanyDataRequest, a no-change statement, a SIC change, one with `Shareholdings`, one with a blank director code, each polled to a terminal state and pinned in the simulator; settles Q2 and Q3. Blocked on CS-5, CS-7, CS-H1 and CS-H2; machine-ask when it runs (live credentials). **Source**: `PLAN_COMPANIES_HOUSE_CONFIRMATION_STATEMENT.md` (its Tasks table carries the files). **Owner**: Claude Code. **Model**: Sonnet. **Size**: 3 files.

- [ ] **CS-11. Confirmation statement prod launch.** `prod` on the activity, prod gateway values, `compliance.toml` rows for the credit account and the authorisation. Shares BACKLOG 34c steps 3 and 4 with the accounts launch. Blocked on CS-9, CS-H4 and CS-H6. **Source**: `PLAN_COMPANIES_HOUSE_CONFIRMATION_STATEMENT.md` (its Tasks table carries the files). **Owner**: Claude Code. **Model**: Haiku. **Size**: 5 files.

- [ ] **CS-13. PSC verification statement (VS01).** A builder over `PSCVerificationStatement-v1-0.xsd`, a submit and poll Lambda pair, a result-view section for each director who is also a PSC, filed after the statement inside the window starting the day after the review date (the report's V4). Blocked on CS-9. **Source**: `PLAN_COMPANIES_HOUSE_CONFIRMATION_STATEMENT.md` (its Tasks table carries the files). **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~8 files.

- [ ] **CS-H4. Software authorisation for the confirmation statement.** The XML team tests CS-9's submissions and issues the package reference for the form. Blocked on CS-9. **Source**: `PLAN_COMPANIES_HOUSE_CONFIRMATION_STATEMENT.md` (its Tasks table carries the files). **Owner**: Operator. **Model**: none. **Size**: 0 files.

- [ ] **CS-H6. Go for the prod confirmation statement.** Give the go for a second, fee-free statement for 06846849 through Submit in the 2026-27 payment period (the statement for the 2026-09-21 review date went by WebFiling on 2026-09-24, submission 119-158484, accepted), knowing it moves the next review date. Blocked on CS-11 and CS-H4 (the directors' codes are ready). **Source**: `PLAN_COMPANIES_HOUSE_CONFIRMATION_STATEMENT.md` (its Tasks table carries the files). **Owner**: Operator. **Model**: none. **Size**: 0 files.

- [ ] **B30at1. The sweep's claim check, proven.** Needs a claimed set that is not last-known-good
  (the sweep keeps the last-known-good set before it reads any claim): the next time two branches
  deploy at once, `gh workflow run destroy-ci.yml -f sweep-for-stacks=true` while the second holds
  `ci-set2`, and its log shows "stays: claimed by run". Blocked on two branches deploying at once. **Owner**: Claude Code. **Model**: Haiku.
  **Size**: 0 files.

- [ ] **B34.6c. Companies House accounts filing: the sandbox proof.** The XML team was asked on 2026-09-23 22:22 UTC in a new thread (from antony@, subject "Submission 000004 status and
  GetSubmissionStatus query") whether 000004 was accepted and whether lookups are enabled for test
  presenter 66666727000. When the answer says they are: poll 000004 through `GET /api/v1/companies-house/accounts/000004` on a
  standing ci set and pin the returned `StatusCode` and any rejections as a case in
  `app/unit-tests/functions/companiesHouseAccountsGet.test.js`. The prod catalogue listing is
  BACKLOG 34c's: prod carries no `COMPANIES_HOUSE_XMLGW_URI` and no presenter secret ARNs. Blocked
  on the XML team's reply. They asked for the request and response on 2026-09-24; the reply went the same day with transactions 1790285530232 (9999) and 1790285532345 (502), masked (`../DRAFT_EMAIL_XMLGW_000004_REPLY.md`; the unmasked set, from the 21:42 run, is `../DRAFT_EMAIL_XMLGW_000004_REPLY_UNMASKED.md`). In the 9999 response the gateway echoes `Method` CHMD5 with an empty `Value`. **Source**: BACKLOG 34b. **Owner**: Claude Code. **Model**: Sonnet. **Size**:
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

- [ ] **O34c. Companies House clears the presenter for live accounts filing.** BACKLOG 34c steps 2 and 3, after B34.6c's sandbox proof: ask the XML team (`xml@companieshouse.gov.uk`) to clear presenter E0000052288 for the live service and issue the live package reference (the test one is 0012); then set the live presenter id, presenter code and `COMPANIES_HOUSE_PACKAGE_REFERENCE` on GitHub's `prod` environment (Settings, Environments, prod), which `deploy-environment.yml` carries into Secrets Manager. Blocked on B34.6c. **Source**: BACKLOG 34c. **Owner**: Operator. **Model**: none. **Size**: 0 files.

- [ ] **B34c. Companies House accounts filing launched on prod.** BACKLOG 34c steps 4 to 6: `CompaniesHouseStack.java` sets the prod values (`COMPANIES_HOUSE_GATEWAY_TEST=false`, the live package reference) instead of leaving them unset; one filing on the prod lane for a company the operator controls, polled to a terminal state; `prod` added to `file-micro-entity-accounts`' `environments` and `resident`'s listing in `web/public/submit.catalogue.toml`, with the activity page and the accounts video no longer calling it a sandbox preview. Blocked on B34.6c and O34c. **Source**: BACKLOG 34c. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~5 files.

## Discipline

- **Push once per batch of landed tracks, never per track**, and prefer one dispatch that
  proves several things over several dispatches. A push per track turned one batch into six
  ci deploys and several environment deploys in a morning on 2026-09-06, each able to open
  alarm issues and cancel each other through the deploy concurrency group, and the operator
  froze pushes twice. A freeze, when the operator calls one, stops `git push`,
  `gh workflow run` and `gh pr create` until they lift it in their own words; local commits,
  worktree tracks and reading logs continue, and a failed job gets a proposed fix in the reply.

