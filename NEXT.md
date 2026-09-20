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

**Prod runs deployment prod-dd95c16** (main's deploy of 2026-09-19, nine stacks created 08:52 UTC,
the only prod set standing; the deploy destroyed prod-0db1730 itself). **ci**: no set standing;
`ci-set1` self-destructed and `destroy-ci.yml`'s sweeps since have found nothing.

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

- [ ] **B52y.3. The security lake nightly's Dependabot row.** In flight: the Link-header pagination is on `claude/b62-board` (PR #309, f3ad8538); the proof is the first 03:20 UTC run after it reaches prod. The 2026-09-20 03:20 UTC run
  proved the token: `code_scanning` rows carry counts and `secret_scanning` reads `count: 0`. The
  `dependabot` row is still `count: null` because `fetchOpenGithubAlerts` in
  `app/functions/security/securityLakeNightly.js` (line ~216) pages with `?page=N` and the
  Dependabot alerts endpoint answers 400 `Pagination using the page parameter is not supported`
  (it pages by cursor). Follow the response's `Link` header `rel="next"` URL instead of counting
  pages, for all three endpoints; a case in `app/unit-tests/functions/security/securityLakeNightly.test.js`
  feeds two linked pages and one 400. Proof, after the next 03:20 run: `aws --profile submit-prod
  s3 cp s3://prod-env-analytics-lake-972912397388/curated/security/github-alerts/dt=<run date>/data.json -`
  has no `"count":null` and `aws --profile submit-prod logs filter-log-events --log-group-name
  /aws/lambda/prod-env-security-lake-nightly --start-time <ms> --filter-pattern '"GitHub alert fetch
  failed"'` returns no event. **Source**: issue #249. **Owner**: Claude Code. **Model**: Haiku.
  **Size**: ~2 files.

- [ ] **B30an. Exclude service-linked roles from the CIS unauthorized-api-calls filter.** In flight: the pattern change is on `claude/b62-board` (PR #309, bf736bdb); #305 closes when it is on prod. Alarm
  issue #305 (`prod-env-cis-unauthorized-api-calls`, 2026-09-20 11:46 UTC, OK again at 11:56) was
  one CloudTrail event: `AWSServiceRoleForResourceExplorer` calling `macie2:ListCustomDataIdentifiers`,
  `AccessDenied`, AWS's own indexer probing a service the account does not use. The filter is the
  `UnauthorizedApiCalls` row of `CIS_CONTROLS` in
  `infra/main/java/co/uk/diyaccounting/submit/stacks/SecurityDetectionStack.java` (line ~415),
  threshold 1, which already excludes `uxc.amazonaws.com`. Add
  `($.userIdentity.sessionContext.sessionIssuer.userName != "AWSServiceRoleFor*")` to the pattern
  with the same `AssumedRole` guard `deployRoleExclusionClause` builds, and one assertion on the
  synthesised filter pattern in the stack's test. #305 closes when the pattern is on prod. Eleven
  `cis-unauthorized-api-calls` issues since #157; BACKLOG 30a's re-count says whether the control
  earns its threshold of 1. **Source**: issue #305; BACKLOG 30. **Owner**: Claude Code. **Model**:
  Haiku. **Size**: ~2 files.

- [ ] **B52.D3. CLS on submit's web-vitals widgets, and RUM on the spreadsheets site.** In flight: the CLS metric, alarm and widget are on `claude/b62-board` (PR #309, 6e655571); the spreadsheets message sits in `~/.claude/inboxes/spreadsheets.md`. The RUM client
  (`web/public/submit.js`, `maybeInitRum`) runs the `performance` telemetry, so `AWS/RUM`'s
  `WebVitalsCumulativeLayoutShift` is collected and nothing reads it: add a `clsP75` metric, a
  "RUM p75 CLS" `GraphWidget` in dashboard row 1 and an alarm at 0.25 beside `lcpP75`, `inpP75` and
  `-rum-lcp-p75` in `ObservabilityStack.java` (lines ~349-400 and ~579-605), with one synth
  assertion in `ObservabilityStackTest.java`; test `./mvnw clean verify`. The spreadsheets half is
  that repository's: append one message to `~/.claude/inboxes/spreadsheets.md` in the workspace
  format asking for a `CfnAppMonitor` plus identity pool and guest role in `SpreadsheetsStack.java`
  on `ObservabilityStack.java` lines 300-345's pattern, the `cwr` loader of `web/public/submit.js`
  in `web/spreadsheets.diyaccounting.co.uk/public/lib/analytics.js` (loaded by all 147 pages), and
  `client.rum.us-east-1`, `dataplane.rum.eu-west-2` and `cognito-identity.eu-west-2` added to
  `script-src`/`connect-src` in `infra/main/resources/security-headers.json`, as `EdgeStack.java`
  lines 793 and 877 carry them. **Source**: BACKLOG 62; `PLAN_ONE_STOP_DASHBOARD.md` D3. **Owner**:
  Claude Code. **Model**: Sonnet. **Size**: ~3 files.

- [ ] **B52.D4. A visitors-by-class panel on the operator dashboard.** In flight: on `claude/b62-board` (PR #309, 73116665). `visitor_kind` (human, bot,
  synthetic) already reaches the lake: `web/public/lib/analytics.js` sets it as a GA4 user property,
  `analytics/bigquery/sessions_by_host_source_daily.sql` groups by it, and `ga4DailyPull.js` copies
  that table to `curated/ga4_daily/`; no view or observation reads it. Add
  `infra/main/resources/analytics/views/v_visitors_by_kind_daily.sql` on `v_ga4_funnel_daily`'s
  shape — `SELECT dt AS day, hostname, visitor_kind, sum(sessions) AS sessions, sum(users) AS users
  FROM sessions_by_host_source_daily GROUP BY 1, 2, 3` — register it in `BusinessViews.java`'s
  `VIEWS` (readTables `sessions_by_host_source_daily`), append it to `rawExportPublish.js`'s
  `VIEW_NAMES`, and add one observation per class under the `conversion-to-submission` objective in
  `operatorSnapshotPublish.js` (`where: "visitor_kind = 'human'"` and so on, GA4 deep link).
  `dashboard.html` needs no edit: `renderSnapshot` draws whatever observations the snapshot carries.
  Tests: `VIEW_COUNT` 24 to 25 in `BusinessViewsTest.java`, the VIEW_NAMES assertion in
  `rawExportPublish.test.js`, `npm run test:unit`, `./mvnw clean verify`. **Source**: BACKLOG 67;
  `PLAN_ONE_STOP_DASHBOARD.md` D4. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~5 files.

- [ ] **B72. `video-capture.yml` runs after a main deploy that touched a scene-script page.** In flight: on `claude/b62-board` (PR #309, 8d1f2ec3); the proof dispatch after merge is `gh workflow run video-capture-on-deploy.yml -f head-sha=<main> -f base-sha=<previous>`. New
  `.github/workflows/video-capture-on-deploy.yml`: `on: workflow_run` (`workflows: [deploy]`, `types:
  [completed]`, `branches: [main]`), job `if` conclusion is success, `permissions: actions: write`,
  and `workflow_dispatch` (`head-sha`, `base-sha`). The event carries `head_sha` only: `base` is the
  newest earlier successful `deploy.yml` run on main with a different `head_sha` (`gh api
  .../workflows/deploy.yml/runs?branch=main&status=success`); the diff is `gh api
  repos/$R/compare/<base>...<head> --jq '.files[].filename'`; no base or an empty diff means no
  capture. Scripts name no pages, so add a `pages` array of `web/public/` paths to the ten
  `videos/*.json`, to `videos/scene-script.schema.json` and to `REQUIRED_TOP_LEVEL` in
  `scripts/lib/video/scriptSchema.js`; new `scripts/video-scripts-for-changed-files.mjs` exports
  `scriptsTouchedBy(changedFiles, scripts)`. Dispatch `gh workflow run video-capture.yml -f script=<n>`
  one at a time (poll `gh run list` to completion; group `video-capture-prod` cancels in progress).
  Tests: `app/unit-tests/scripts/videoScriptsForChangedFiles.test.js`, `app/unit-tests/videoScenePages.test.js`.
  **Source**: BACKLOG 72; `PLAN_REPOSITORY_AUTOMATION.md` Phase 5. **Owner**: Claude Code. **Model**:
  Sonnet. **Size**: ~16 files.

- [ ] **B49.15. Move the declarations under `infra/`.** In flight: on `claude/b62-board` (PR #309, 06e65dee); the proof after merge is `gh workflow run google-apply.yml -f apply=false`. `git mv` per the table in
  `PLAN_EVERYTHING_AS_CODE.md` "The `infra/` layout": `google/*.toml`, `google/credentials/`,
  `analytics/bigquery/*.sql`, the nine `scripts/{gcp,google,ga4}-*.js`, `scripts/lib/googleAuth.js`.
  `scripts/youtube-upload.js` stays; its `CONFIG_PATH` becomes `infra/google/gcp/youtube.toml`.
  Maven owns only `infra/main` and `infra/test`, so nothing collides. Update every `CONFIG_PATH` and
  `CREDENTIALS_DIR` constant and `google-roles-apply.js:188`; the `./lib/googleAuth.js` imports,
  `behaviour-tests/helpers/ga4PurchaseQuery.js`, `google-oauth-assert.js`'s `./youtube-upload.js`;
  the nine `app/unit-tests/scripts/*.test.js` imports, `ga4BigQuerySync.test.js`'s `sql_file`
  strings, `web/unit-tests/analytics.test.js:146`; `bigquery.toml`'s four `sql_file` values; the
  three npm scripts; `google-apply.yml` (filters become `infra/google/**`, the `identity.toml` read,
  eight steps) and `probe-test.yml:481`, `youtube-check.yml` having no filter; the comments in
  `app/`, `web/public/lib`, `infra/main` and `REPORT_REPOSITORY_CONTENTS.md`. One commit. Proof:
  `npm test`, `npm run linting`, `gh workflow run google-apply.yml -f apply=false`. **Source**:
  BACKLOG 49b; item 15. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~35 files.

- [ ] **B70.D. The remedy list: design.** In flight: on `claude/b62-board` (PR #309, 9ed88ffd); the 16 nightly `*-errors`/stack-health rows are `draft-pr`, `none` the alternative. One table, in `PLAN_REPOSITORY_AUTOMATION.md` Phase 3 and as
  `app/data/alarm-remedies.json`, keyed by family (`alarmFamilyKey` in `app/lib/alarmName.js`, e.g.
  `prod-app-api-5xx`, `prod-env-github-probe-failed`), each row one of: a dispatch (workflow file and
  `-f` inputs, from those that exist: `set-origins.yml` `domain-source=last-known-good`,
  `probe-test.yml` `behaviour-test-suite=…`, `deploy-cdk-stack.yml` `stackName=…`, `deploy-app.yml`;
  no workflow re-runs a nightly Lambda, so `*-analytics-nightly-*` and `*-publish-errors` need a new
  `run-lambda.yml` or stay `none`), `close-when-gone` (a deployment-scoped family whose deployment
  is gone), `draft-pr` (the triage's diff marked ready when it touches only listed paths and checks
  pass), or `none` (`cis-*`, `*-table-scan`, `*-secret-unexpected-read`, `*-submission-failure`).
  Also the close rule: the App authored the issue (PR #304), `verify-alarm-origin.mjs` passes, every
  alarm of the family is OK; and a dispatch budget per family per day. The 62 closed alarm issues
  (`gh issue list --label alarm --state all`) score the table: how many would have closed themselves.
  **Source**: BACKLOG 70; `PLAN_REPOSITORY_AUTOMATION.md` Phase 3, P1, P3, P9. **Owner**: Claude
  Code. **Model**: Opus. **Size**: ~2 files.

- [ ] **B11.T7b.1. The sandbox script creates both businesses.** In flight: on `claude/b62-board` (PR #309, 9f1d9117); proven on 2023-24, both ids in `business-details-list`, final declaration 204. `scripts/itsa-sandbox-year.js`
  creates the sole trade, sets the ITSA status and takes and restores the vendor-state checkpoint;
  it has no property business. Add a second `test-support-create-business` call to `POST
  {sandboxBase}/individuals/self-assessment-test-support/business/{nino}`, body from a new
  `buildTestPropertyBusinessRequestBody()` beside `buildTestBusinessRequestBody()`: `typeOfBusiness:
  "uk-property"`, the same address fields, no `tradingType` or `tradingName`. Save `{ checkpointId,
  businessId, propertyBusinessId }` in `checkpoint-id.txt` and restore both ids. Command, after `aws
  sso login --sso-session diyaccounting`: `ITSA_SANDBOX_TEST_USER_FILE=./hmrc-test-user.json
  ITSA_SANDBOX_TAX_YEAR=2023-24 ITSA_SANDBOX_OUT_DIR=./target/itsa-sandbox-year/2023-24
  scripts/proxy-secrets.sh node scripts/itsa-sandbox-year.js`. Proof: that directory's
  `itsa-sandbox-year-transcript.json` shows `business-details-list` carrying both ids,
  `self-employment` and `uk-property`; a builder test in
  `app/unit-tests/scripts/itsa-sandbox-year.test.js`; `npm run test:unit`. **Source**:
  `PLAN_ITSA_PHASE_2.md` T7. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~2 files.

- [ ] **B11.T7b.4. Run B, the cumulative year.** In flight: on `claude/b62-board` (PR #309, 4e73c148); proven on 2025-26, eight cumulative PUTs at 204. Import `resolveItsaSubmissionModel` from
  `app/lib/hmrcValidation.js`, call it on `ITSA_SANDBOX_TAX_YEAR` and branch on the string it
  answers, comparing no year itself. On `"cumulative"` the four quarterly calls per business become
  `PUT .../business/self-employment/{nino}/{businessId}/cumulative/{taxYear}` (5.0) and `PUT
  .../business/property/uk/{nino}/{propertyBusinessId}/cumulative/{taxYear}` (6.0), `STATEFUL`,
  okStatuses [204], each carrying that quarter's dates and the running total so far:
  `buildSelfEmploymentPeriodRequestBody` unchanged, `buildUkPropertyCumulativeRequestBody` in place
  of the dated property builder. Every other step keeps its URL; the `MTD Mandated` status the
  script sets makes the reporting type quarterly. Delete the "2024-25 or earlier" limit from the
  script header and the runbook. Command: B11.T7b.1's, with `ITSA_SANDBOX_TAX_YEAR=2025-26` and a
  `2025-26` out directory. Proof: eight cumulative PUTs at 204, the final declaration 204 line, and
  B11.T7b.1's command still passing. After B11.T7b.1. **Source**: `PLAN_ITSA_PHASE_2.md` T7.
  **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~2 files.

- [ ] **B34.8. Design the three next Companies House filings.** In flight: on `claude/b62-board` (PR #309, 2e7352ff). Replace the Horizons section of
  `PLAN_COMPANIES_HOUSE_ACCOUNTS_FILING.md` with one section each for FRS 102 section 1A
  small-company accounts, dormant accounts, and a CT600 to HMRC carrying the same balance sheet,
  each in the shape of the plan's existing sections and each naming: the entry point and the
  concepts it adds to `CONCEPTS` in `app/services/microEntityAccountsIxbrl.js`; what changes in the
  `FormSubmission` envelope `app/services/companiesHouseXmlGateway.js` builds, or that nothing
  does; the page; the `Gov-Test-Scenario` cases for
  `app/http-simulator/scenarios/accounts-filing.js`; and its sandbox proof. Read the accounts TIS
  5.9 on gov.uk: section 1A and FRS 105 share the FRS 102 entry point, dormant accounts carry
  `EntityDormantTruefalse` and the section 480 statement in place of 477, and section 1A adds the
  directors' report elements and a P&L. Check every concept against
  `fixtures/frc-taxonomy/frs-102-2026-concepts.json`. For the CT600, HMRC's own transport and
  taxonomy: gov.uk collection "Corporation Tax online: support for software developers".
  **Source**: BACKLOG 34e, 34f, 34g. **Owner**: Claude Code. **Model**: Opus. **Size**: ~2 files.

- [ ] **B69.1. The publication filter as a composite action.** In flight: on `claude/b62-board` (PR #309, fbdb510c); the proof dispatch after merge is `gh workflow run alarm-triage.yml -f issue-number=305`. New `.github/actions/publish-filter/action.yml`
  in `run-triage-agent`'s shape: inputs `input-file`, `format` (`claude-json`|`markdown`),
  `environment-name`, `model-id`, `workflow-name`, `run-number`, `run-url`; steps: read
  `/submit/<env>/alarm-triage/guardrail-id` and `-version` from SSM, run `scripts/redact-triage-output.mjs`
  (new `--markdown` flag skips `extractFinalAssistantText`), `aws bedrock-runtime apply-guardrail`
  (its anonymised text when it intervenes), append `_Written by <model-id> in [<workflow-name>
  #<run-number>](<run-url>). Not reviewed by a person._`; outputs `output-file`, `redactions`,
  `guardrail-action`. Callers: `alarm-triage.yml` as on `claude/b61-board` replaces its four inline
  steps and the `_Answered by Haiku._` line; `agentic-lib-code.yml` filters `pr-body.md` before
  `gh pr create`; `agentic-lib-board.yml`'s tracking comment is a fixed template and stays. The
  triage role every caller assumes holds `bedrock:ApplyGuardrail` and `ssm:GetParameter`. Tests: the
  `--markdown` path in `redactTriageOutput.test.js`; proof is one
  `alarm-triage.yml` dispatch whose comment ends with the byline. After PR #304. **Source**: BACKLOG
  69; `PLAN_REPOSITORY_AUTOMATION.md` Phase 1, P7; `REPORT_IDENTITY_AUDIT.md` 7.2. **Owner**: Claude
  Code. **Model**: Sonnet. **Size**: ~6 files.

## Machine-only

- [ ] **B11.T7b.6. Both runs' proofs.** The exit code rests on two printed lines today, `final
  declaration 204` and `fraud header validator clean`. Add three more, each computed from the
  transcript: `both businesses in calculation income sources`; `loss claims read back` (run A
  `claims.carryBack` and `carryBackLossesDecrease`, run B the property `claims.carryForward` and the
  carry-back 400); `suspendTemporalValidations on every losses and adjustments write`, from each
  entry's `requestHeaders`. Exit 1 when any line but the income-sources one is false, since that one
  records the `DYNAMIC` gap. Then run both years from a clean checkpoint, back to back: delete both
  `checkpoint-id.txt` files, run the B11.T7b.1 command, then the B11.T7b.4 command. Proof: both
  transcripts end with the five lines and each run exits 0;
  `app/unit-tests/scripts/itsa-sandbox-year.test.js` covers every new pure function and `npm run
  test:unit` passes; `_developers/hmrc/ITSA_PHASE_2_SANDBOX.md`'s "What it proves" and "What each
  phase should return" sections carry each new step with its expected status. After B11.T7b.3 and
  B11.T7b.5. **Source**: `PLAN_ITSA_PHASE_2.md` T7. **Owner**: Claude Code. **Model**: Sonnet.
  **Size**: ~3 files.

- [ ] **B11.T7b.7. Record the responses.** Every request and response is already in the transcript;
  the comparison against the simulator is not. For each call the two runs add, set HMRC's status and
  body beside the simulator's route and scenario for that call and fix any field name, status or
  error shape that differs: `app/http-simulator/routes/itsa-uk-property-period.js`,
  `itsa-uk-property-annual.js`, `itsa-bsas.js` (the uk-property retrieve and adjust),
  `itsa-losses-and-claims.js`, `itsa-tax-liability-adjustments.js`,
  `itsa-self-employment-cumulative.js`, `itsa-uk-property-cumulative.js`, and the file of each name
  under `app/http-simulator/scenarios/`. The test-support create-business response for `uk-property`
  and the calculation's `businessIncomeSources` shape go in the runbook's run record, each
  correction naming the transcript entry behind it. A run needs an SSO session for `submit-ci` and
  no deployment; the re-run inside HMRC's 14-day window is B11.T10's. Proof: `npm test` green,
  including `app/unit-tests/http-simulator/`. After B11.T7b.6. **Source**: `PLAN_ITSA_PHASE_2.md`
  T7. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~10 files.

- [ ] **B49.22. `infra/paypal`.** `paypal.toml`: `[button] hosted_button_id = "XTEQ73HM52QQW"`,
  `form_action = "https://www.paypal.com/donate"`, `donate_url` (the same id as a GET link), `page =
  "https://spreadsheets.diyaccounting.co.uk/donate.html"`; `[source]` recording the sibling
  repository's `web/spreadsheets.diyaccounting.co.uk/donate.template.html` and
  `app/templates/meta.toml` (`[publisher] donate`), which carry the same id. The form posts no
  return URL, so none is recorded. `paypal-assert.js` in `google-oauth-assert.js`'s shape: GET
  `page` answers 200 and its HTML holds `action="<form_action>"` and `name="hosted_button_id"
  value="<id>"` exactly once (pure `findHostedButtonIds(html)`); GET `donate_url` answers 200. Step
  in `infra-apply.yml`'s prod job only (`if: matrix.environment == 'prod'`), read-only, filter
  `infra/paypal/**`. Test `paypalAssert.test.js` over `parseConfig`, `findHostedButtonIds`,
  `assertTemplateMatches`. Proof: `npm test`, one `infra-apply.yml` run. After B49.18. **Source**:
  BACKLOG 49b; item 22. **Owner**: Claude Code. **Model**: Haiku. **Size**: ~3 files.

- [ ] **B49.23. `infra/telegram`.** `telegram.toml`: `[bot] username = "diyaccounting_bot"`,
  `[secrets] bot_token = "{env}/submit/telegram/bot_token"`, six `[[group]]` rows `name`,
  `environment`, `purpose` (`test`, `live`, `ops`), `chat_id`, from `.env.ci:139-141`,
  `.env.prod:132-134` and `RUNBOOK_INFORMATION_SECURITY.md:89`. `telegram-assert.js` in
  `google-oauth-assert.js`'s shape: read the matrix environment's token from Secrets Manager, never
  printed; `getMe` username equals `[bot]`; `getChat` per group of that environment answers `ok`
  with `id` equal to `chat_id` and `title` equal to `name`; `getWebhookInfo` answers an empty `url`;
  each `chat_id` equals `TELEGRAM_<PURPOSE>_CHAT_ID` in `.env.<env>`. Fail on any mismatch. Step in
  `infra-apply.yml`, both jobs, filter `infra/telegram/**`. Test `telegramAssert.test.js` over
  `parseConfig`, `groupsForEnvironment`, `assertBot`, `assertChat`, `assertNoWebhook`. Proof: `npm
  test`, one `infra-apply.yml` run. After B49.18. **Source**: BACKLOG 49b; item 23. **Owner**:
  Claude Code. **Model**: Haiku. **Size**: ~3 files.

- [ ] **B49.19. `infra/hmrc`.** `hmrc.toml`: `[application.sandbox]` (client id `uqMH…v4tV`,
  test-api host, `secret = "{env}/submit/hmrc/sandbox_client_secret"`) and
  `[application.production]` (`hKCO…ycev`, `api.service.hmrc.gov.uk`,
  `prod/submit/hmrc/client_secret`), each with `redirect_uris` and
  `[[application.<x>.subscription]]` rows `api`, `version`, `probe` (a GET path). Sandbox set:
  `ITSA_PHASE_2_SANDBOX.md` lines 37-41 plus VAT (MTD), fraud-header and test-user APIs, versions
  from each `app/functions/hmrc/*.js` `Accept` header; the production set is unrecorded, so the
  first run records it. `hmrc-assert.js`: a client-credentials token per application
  (`create-hmrc-test-user.js:75-89`), one GET per subscription with `Accept:
  application/vnd.hmrc.<version>+json`, failing on 403 `RESOURCE_FORBIDDEN`. The ci job asserts
  sandbox, the prod job both. Step after companies-house in `infra-apply.yml`, filter
  `infra/hmrc/**`. Test `hmrcAssert.test.js` over `parseConfig`, `probeRequest`,
  `classifySubscriptionResponse`. Proof: `npm test`, one `infra-apply.yml` run. After B49.18.
  **Source**: BACKLOG 49b; item 19. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~4 files.

- [ ] **B49.18. `infra/companies-house` and the shared `infra-apply.yml`.** `companies-house.toml`:
  `[environment.ci]` and `[environment.prod]`, each `application_name`, `client_id`, three base
  URIs, `redirect_uris` (`<host>/companies-house/filingCallback.html`), `xmlgw_uri`, and
  `[environment.<env>.secrets]` naming `api_key`, `client_secret`, `presenter_id`, `presenter_code`
  (blank on prod), from `.env.ci` and `.env.prod`. `companies-house-assert.js` in
  `google-oauth-assert.js`'s shape: `client_id` equals `COMPANIES_HOUSE_CLIENT_ID` in `.env.<env>`;
  GET `{identity_base_uri}/oauth2/authorise` per redirect with the scope `auth-url-builder.js:54`
  builds, `redirect: "manual"`, fail on 400; the REST key answers 200 on
  `{base_uri}/company/00000006`. `infra-apply.yml` takes `google-apply.yml`'s triggers, OIDC chain
  and summary, `certificate-check.yml`'s `matrix.environment: [ci, prod]`, no Google auth, filter
  `infra/companies-house/**`; its row joins `REPORT_REPOSITORY_CONTENTS.md`. Test
  `companiesHouseAssert.test.js` over `parseConfig`, `authoriseUrl`, `classifyAuthoriseResponse`.
  Proof: `npm test` and one `infra-apply.yml` run. After B49.15. **Source**: BACKLOG 49b; item 18.
  **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~5 files.

- [ ] **B49.21. `infra/stripe`.** `git mv scripts/stripe-setup.js infra/stripe/stripe-sync.js` and
  `scripts/lib/stripeCatalogue.js` beside it, fixing its test. `stripe.toml`: `[[endpoint]]` rows
  `environment`, `url` (the two `*-billing.submit…/api/v1/billing/webhook`), `modes` (ci test, prod
  both), `github_secret` (`STRIPE_[TEST_]WEBHOOK_SECRET`), `aws_secret`
  (`{env}/submit/stripe/[test_]webhook_secret`); `[events] enabled` = the nine `DESIRED_EVENTS`;
  `[keys]` naming the two secret keys. `--mode test|live` reads the key from Secrets Manager and
  `--apply` replaces the inverted `--dry-run`. A new price id is written into `.env.ci`/`.env.prod`
  by a pure `rewriteEnvLines`, as `stripe-catalogue-sync/SKILL.md` step 4 does; a new endpoint's
  secret goes to `gh secret set <name> --env <env>` and to `put-secret-with-rotation-tag.sh`, since
  `deploy-environment.yml` rewrites the AWS secret from GitHub every deploy. The `infra-apply.yml`
  step plans only; a live apply stays a local run under the skill's separate go. Test
  `stripeSync.test.js` over `parseArgs`, `parseConfig`, `planEndpoints`, `rewriteEnvLines`. Proof:
  `npm test`, `--mode test` reading "already exists" throughout. After B49.18. **Source**: BACKLOG
  49b; item 21. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~6 files.

- [ ] **B71. Support issue triage on `issues: [opened]`.** New `.github/workflows/support-triage.yml`
  in `alarm-triage.yml`'s shape as on `claude/b61-board`: `if` `contains(labels, 'support')`, its
  budget guard, kill switch and B69.1 filter, new `prompts/support-triage.md`, and a `prompt-file`
  input on `.github/actions/run-triage-agent`. The Lambda's issue is `[Support] <subject>`, labels
  `support`, `<category>` and `origin:machine`, fenced Subject and Message, no name or email; the
  triage role reaches no DynamoDB, Cognito or Athena, so no customer lookup runs here (that skill
  serves B70's alarm family). The agent reads that text as data plus `web/public/faqs.toml`,
  `help.html` and `guide.html`; its comment names the matched article and the label it added (never
  close, P1) and ends `_Written by <model id> in [support-triage #<run number>](<run url>). Not
  reviewed by a person._`. The drafted reply goes to the step summary, not the issue (public replies
  stay human, Q8), under `This reply was drafted by an AI and not reviewed by a person.`.
  `.github/ISSUE_TEMPLATE/support.md` becomes issue form `support.yml`: a `category` dropdown of the
  Lambda's five values, `description`, labels `support` and `origin:human`. Proof: `npm test`, one
  dispatch. After B69.1. **Source**: BACKLOG 71; `PLAN_REPOSITORY_AUTOMATION.md` Phase 4. **Owner**:
  Claude Code. **Model**: Sonnet. **Size**: ~6 files.

- [ ] **B69.2. The reliability ledger.** `probe_runs`, `alarm_state_changes` and
  `github_workflow_runs` carry suite, alarm and run outcomes; nothing records an agent run's own.
  Each agent workflow (`alarm-triage.yml`, `agentic-lib-code.yml`, `agentic-lib-board.yml`, B71's)
  ends with a step in `record-dora`'s shape writing one row via `.github/actions/dora-row` to
  `curated/agent-runs/dt=<date>/<run-id>-<attempt>.json`: `workflow`, `run_id`, `run_url`, `trigger`,
  `environment`, `issue_number`, `model_id`, `outcome` (`posted`|`skipped-budget`|`skipped-role`|
  `verify-failed`|`no-answer`|`max-turns`), `escalated`, `redactions`, `guardrail_action`,
  `pr_number`, `duration_seconds`, `finished_at`. Glue table `agent_runs` in `WorkflowRunTables.java`
  (copy `probe_runs`, wire in `AnalyticsStack.java`); `v_agent_runs_daily.sql` (copy
  `v_dora_runs_daily.sql`, register in `BusinessViews.java`) joins `github_issue_events` on
  `pr_number` (`merged`) and `issue_number` (`closed`, `is_operator`) for posted rate, PR-accepted
  rate and time-to-close; one observation per rate in `operatorSnapshotPublish.js`'s `uptime` group.
  Tests: `WorkflowRunTablesTest` in `ComplianceTablesTest`'s shape, `./mvnw clean verify`, the first
  row in Athena. **Source**: BACKLOG 69; `PLAN_REPOSITORY_AUTOMATION.md` Phase 1. **Owner**: Claude
  Code. **Model**: Sonnet. **Size**: ~9 files.

- [ ] **B70.B. The remedy list: build.** From B70.D's `app/data/alarm-remedies.json`.
  `app/unit-tests/data/alarmRemedies.test.js`: every `workflow` names a file in `.github/workflows/`
  and its inputs match that file's `workflow_dispatch.inputs`. `prompts/alarm-triage.md` gets the
  family's row and a final `remedy: <id>|none` line; `alarm-triage.yml` (as on `claude/b61-board`)
  parses it, dispatches only an id in the list with the App token (`gh workflow run <file> -f …`),
  labels the issue `remedy:<id>`, marks the draft PR ready (`gh pr ready`) only for a `draft-pr` row
  whose diff touches listed paths; otherwise the draft stays and, when the list is silent, a
  `policy:question` comment (P9). New `.github/workflows/alarm-remedy-close.yml` (`schedule` off the
  hour, `workflow_dispatch`): for each open `alarm` issue labelled `remedy:*`, new
  `scripts/close-alarm-issue-when-ok.mjs` (+ test) checks the App is the author,
  `verify-alarm-origin.mjs` passes, `describe-alarms` shows every alarm of the family OK (or gone,
  for `close-when-gone`), then `gh issue close`. Kill switch first; the budget guard becomes
  `.github/actions/agent-run-budget` (inputs: workflow file, job, step). Proof: `npm test`, one
  dispatch, one observed close. **Source**: BACKLOG 70; `PLAN_REPOSITORY_AUTOMATION.md` Phase 3.
  **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~9 files.

## Machine-ask

- [ ] **B11.T7b.3. Run A's loss sequence on the sole trade.** One loss-claims resource per business
  per year, so the sequence is a PUT, its read-back, an adjustments PUT and its read-back, between
  the property BSAS adjust and `calculation-trigger`. `PUT
  {sandboxBase}/individuals/losses/{nino}/businesses/{businessId}/loss-claims/{taxYear}`: Accept
  7.0, `suspendTemporalValidations: "true"` added to the `hmrcHeaders` result, okStatuses [200,
  204], `buildLossesAndClaimsRequestBody({ typeOfBusiness: "self-employment", losses: {
  broughtForwardLosses: 500 }, claims: { carryForward: { currentYearLosses: 250 }, carryBack: {
  previousYearGeneralIncome: 100 } } })` from `app/functions/hmrc/hmrcItsaLossesAndClaimsPut.js`;
  then that path on `GET` with `STATEFUL`, asserting `claims.carryBack`. Then `PUT
  .../tax-liability/adjustments/{nino}/{taxYear}` (1.0, same header, `carryBackLossesDecrease: {
  incomeTax: 20 }`) and its `STATEFUL` GET. The calculation answers canned figures under `DYNAMIC`,
  so the proof is the two read-backs and a final declaration still at 204. Command as B11.T7b.1.
  After B11.T7b.2. **Source**: `PLAN_ITSA_PHASE_2.md` T7. **Owner**: Claude Code. **Model**: Sonnet.
  **Size**: ~1 file.

- [ ] **B11.T7b.5. Run B's two extra calls.** Gated on `submissionModel === "cumulative"`, after the
  property BSAS adjust: `PUT
  {sandboxBase}/individuals/losses/{nino}/businesses/{propertyBusinessId}/loss-claims/{taxYear}`
  (7.0, `suspendTemporalValidations: "true"`, okStatuses [200, 204],
  `buildLossesAndClaimsRequestBody({ typeOfBusiness: "uk-property", claims: { carryForward: {
  currentYearLosses: 300 } } })`) and its `STATEFUL` GET asserting `claims.carryForward`. Then the
  refusal, twice. Assert the builder throws `LossesAndClaimsValidationError` with code
  `CARRY_BACK_CLAIM` for `{ typeOfBusiness: "uk-property", claims: { carryBack: {
  previousYearGeneralIncome: 100 } } }`, recorded as `property-carry-back-refused-locally`. Then
  send that raw body to the same path with `Gov-Test-Scenario: CARRY_BACK_CLAIM`, okStatuses [400],
  recorded as `property-carry-back-rejected` with HMRC's code and message; the simulator answers
  `RULE_TYPE_OF_CLAIM_INVALID`, and a different code is a B11.T7b.7 correction. Same command as
  B11.T7b.4. Proof: the three transcript entries at 204, 200 and 400. After B11.T7b.4. **Source**:
  `PLAN_ITSA_PHASE_2.md` T7. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~1 file.

- [ ] **B11.T7b.2. Run A, the dated year.** The sole-trade leg runs to `bsas-adjust`. Add the
  property leg after it, with the builders in `app/functions/hmrc/hmrcItsaUkProperty*.js` and
  `hmrcItsaBsasUkProperty*.js`: four `POST
  .../business/property/uk/{nino}/{propertyBusinessId}/period/{taxYear}` (6.0, `STATEFUL`, the
  `buildStandardQuarterlyPeriods` dates, `ukNonFhlProperty` with `periodAmount` and
  `consolidatedExpenses`); `PUT .../annual/{taxYear}` (6.0, `allowances: { propertyIncomeAllowance:
  1000 }`); a BSAS trigger with `typeOfBusiness: "uk-property"`, then `GET` and `adjust` on
  `.../adjustable-summary/{nino}/uk-property/{calculationId}/{taxYear}` (7.0, `UK_PROPERTY_PROFIT`
  on the read, `income: { totalRentsReceived: 1 }` on the adjust). After `calculation-retrieve`,
  record `inputs.incomeSources.businessIncomeSources` and print whether both businesses appear; only
  fixture ids there is the known `DYNAMIC` gap, so warn and continue. A 403 names a Property
  Business 6.0 subscription only the operator adds. Command as B11.T7b.1. Proof: every property step
  `ok: true`, final declaration 204. After B11.T7b.1. **Source**: `PLAN_ITSA_PHASE_2.md` T7.
  **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~2 files.

- [ ] **B11.T10. ITSA phase 2: the recognition pack.** Four files under `_developers/hmrc/` carry
  the pack: `ITSA_PRODUCTION_APPROVALS_CHECKLIST.md`,
  `hmrc_questionnaire_itsa_pass_diy_accounting_limited_v1.md` and the two `DRAFT_EMAIL_ITSA_*.md`.
  Two things remain. From the transcripts B11.T7b.7 leaves: the checklist's sandbox-proof column in
  rows 4, 6 and 7 and its nine-API table (Property Business, Individual Losses, Tax Liability
  Adjustments), its reviewer-question bullet about property, losses and the cumulative model
  deleted; both emails' sandbox paragraph naming both income types, both quarterly models, the loss
  claims and the adjustments; the ITSA pass's testing-in-the-last-two-weeks row with the new run's
  date and commit. Then the send: the operator names the day, Claude Code re-runs the B11.T7b.1 and
  B11.T7b.4 commands inside the 14 days before it and updates that row, the operator sends the
  recognition email to `SDSTeam@hmrc.gov.uk` and the credentials one when SDST answers. Proof: no
  "not evidenced" left in checklist rows 4, 6 and 7. After B11.T7b.7. **Source**: BACKLOG 11;
  `PLAN_ITSA_PHASE_2.md` T10. **Owner**: Claude Code edits and re-runs; the operator sends.
  **Model**: Haiku. **Size**: ~4 files.

- [ ] **B52.D2. Donations on the revenue panel.** `v_revenue_daily` reads `stripe_charges`, written
  by `stripeReconcile.js` with the live key at `prod/submit/stripe/secret_key`
  (`app/lib/stripeClient.js`), labelled by `charge.metadata.bundleId`, so a Payment Link charge
  falls to `'unknown'`. Read the account side first: fetch that secret and `GET /v1/payment_links`,
  matching the four live slugs in the spreadsheets repository's
  `web/spreadsheets.diyaccounting.co.uk/donate-links.toml` (`…4F200`, `4F201`, `4F202`, `4F204`); a
  match means one account, and `SELECT day, product, revenue_gbp FROM v_revenue_daily WHERE product
  = 'unknown'` in workgroup `prod-env-analytics` shows whether donations are already landing
  unlabelled. Then label them by setting `payment_intent_data.metadata.bundleId` on each link in
  `scripts/stripe-setup.js`'s idempotent shape, with a unit test on the builder. That is a live
  Stripe write: the operator approves it and confirms the account holding the links is the
  company's. PayPal donations are not in this row; they arrive with `../PLAN_FINANCE_AUTOMATION.md`
  phase 1's PayPal pull, which has no code. **Source**: BACKLOG 66; plan D2. **Owner**: Claude Code;
  the operator approves the Stripe write. **Model**: Sonnet. **Size**: ~2 files.

- [ ] **B49.16. Read-only inventory of the Google Ads account.** `infra/google/ads/ads-inventory.js`
  in `google-inventory.js`'s shape, over the Ads REST API (`POST customers/{id}/googleAds:search`
  with GAQL, headers `developer-token` and `login-customer-id`, no SDK): `customer_client` under the
  manager, `customer.auto_tagging_enabled`, `conversion_action`, `customer_conversion_goal`,
  `campaign` with `campaign_budget` and `asset_group`, and GA4's
  `properties/523400333/googleAdsLinks`; it writes nothing. `ads.toml` starts with `[account]`
  holding both ids and `[secrets]` naming `prod/submit/google/ads/{developer_token,refresh_token}`.
  The operator supplies the manager customer id and the developer token from that account's API
  Center, written with `put-secret-with-rotation-tag.sh prod/submit/google/ads/developer_token
  '<token>'` under `AWS_PROFILE=submit-prod`, then runs `ads-inventory.js --consent` once, reusing
  `youtube-upload.js`'s loopback consent for scope `.../auth/adwords`. A test-access token cannot
  read account 814-268-5080. Test `adsInventory.test.js` over `parseArgs` and `shape*`. After
  B49.15. **Source**: BACKLOG 49b; item 16. **Owner**: Claude Code, the operator supplies the token,
  the id and the consent. **Model**: Sonnet. **Size**: ~4 files.

- [ ] **B49.20. `infra/github`.** `github.toml`: `[repository]` the two merge settings; `[actions]`
  the permissions and selected-actions fields, `default_workflow_permissions`, and
  `patterns_allowed` from `scripts/github-actions-permissions.sh`; `[security]
  automated_security_fixes = true` (false live); `[[ruleset]]` `main` with its enforcement,
  conditions, its three rules and bypass actors; `[[environment]]` `ci`, `prod`, `copilot` with
  variable and secret names; `[codeowners]`. Write it from live `gh api` reads, ruleset 16057564
  among them. `github-sync.js`: `gh api` reads, a pure `planGithub(config, live)`, `--apply` writing
  back through the same routes; a missing variable or secret name is a finding, not created.
  `github-actions-permissions.sh` goes. `GITHUB_TOKEN` cannot administer, so the operator supplies a
  fine-grained PAT (this repository, Administration read/write, Environments, Secrets and Variables
  read) as the `prod` environment secret `GITHUB_ADMIN_TOKEN`, the step's `GH_TOKEN`. Test
  `githubSync.test.js` over `parseConfig`, `planGithub`, `rulesetDiff`. Proof: `npm test` and a plan
  reading "already match". After B49.18. **Source**: BACKLOG 49b; item 20. **Owner**: Claude Code,
  the operator supplies the token. **Model**: Sonnet. **Size**: ~5 files.

- [ ] **O38. The two GitHub Apps carry every machine write.** The code is on `main` since PR #304
  (7248ef4d) and prod-dd95c16 carries it. Proof so far: alarm issue #305 (2026-09-20 11:51 UTC) is
  authored by `app/diyaccounting-ops`, `user.type: Bot`, and the security-lake nightly of
  2026-09-20 03:20 UTC read code-scanning and secret-scanning alerts on the App token. The support
  ticket and the triage PR prove themselves when one next arrives. One read of a PAT remains:
  `.github/workflows/security-review.yml:211` gives `assign-copilot`'s `github-script` step
  `secrets.PERSONAL_ACCESS_TOKEN`; replace it with an `actions/create-github-app-token` step on
  `AGENT_APP_ID`/`AGENT_APP_PRIVATE_KEY` as `alarm-triage.yml:173-176` does, and check on the next
  `security-review.yml` run that the App can run `replaceActorsForAssignable` (if it cannot, the
  job goes, since Copilot assignment is the PAT's only use). Then delete the repository secrets
  `ISSUE_BOT_TOKEN`, `SUPPORT_BOT_TOKEN` and `PERSONAL_ACCESS_TOKEN` (`gh secret delete <name>`)
  and the Secrets Manager entries `{env}/submit/github/issue_bot_token` and `support_bot_token` in
  ci and prod (`aws secretsmanager delete-secret --recovery-window-in-days 30`, the operator
  approves). **Source**: `REPORT_IDENTITY_AUDIT.md` section 8, recommendations 2 and 3. **Owner**:
  Claude Code, the operator approves the five deletes. **Model**: Haiku. **Size**: ~1 file.

## Human-driven

- [ ] **B30af.6. Register the four slot hosts' redirect URIs with HMRC and Companies House (P2).**
  Eight URIs, for N = 1 to 4:
  `https://ci-set<N>.submit.diyaccounting.co.uk/activities/submitVatCallback.html` on the HMRC
  sandbox application `uqMHA6RsDGGa7h8EG2VqfqAmv4tV` at
  <https://developer.service.hmrc.gov.uk/developer/applications>, and
  `https://ci-set<N>.submit.diyaccounting.co.uk/companies-house/filingCallback.html` on the
  Companies House "DIY Accounting Submit - test" application `e5be4a0d-cebf-4024-83a3-5497a0fec4b2`
  at <https://developer.company-information.service.gov.uk/manage-applications>. Both are console
  forms with no API. The design's §6 cap is answered on the page: HMRC documents a maximum of five
  redirect URIs per application and that one already holds three (prod, ci apex, local), so at most
  two slot hosts fit. Report how many each form accepted; that count is N for P3 and for
  `slot-count` in `.github/actions/claim-ci-slot/action.yml`. Proof: the design's §3 `curl` answers
  200 for each host registered. **Source**: the design, P2. **Owner**: Operator, in both hubs.
  **Model**: none. **Size**: ~0 files.

## Blocked

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

- [ ] **B52n.2. The spreadsheets donation event lands as `donate`.** `donate` is a key event on
  property 523400333 (`google/analytics.toml`) and the spreadsheets repository's
  `public/lib/download-page.js` sends it since 08:26 UTC on 2026-09-18.
  `analytics/bigquery/key_events_daily.sql` still maps that host's `purchase` to `donate` as well,
  so the proof reads the raw event name. Its scheduled query covers event_date D-2, so a full day
  is first proven by the 04:30 run on 2026-09-21 (event_date 2026-09-19). Proof: `aws --profile
  submit-prod athena start-query-execution` in workgroup `prod-env-analytics`, database
  `prod_env_analytics`, `SELECT dt, count(*) FROM ga4_bq_events WHERE stream_id = '13496898428' AND
  event_name = 'donate' GROUP BY 1` — a non-zero row for 2026-09-19 closes it, and the matching
  `key_events_daily` row (hostname `spreadsheets.diyaccounting.co.uk`, key_event `donate`) confirms
  the aggregate carries it. Zero on both means the emitter is not reaching GA4: reopen B52n with the
  query output. The lake's newest day, 2026-09-18, has one `donation_prompt` and no `donate` or
  `purchase` for that stream, so no donation happened that day and the proof waits on the 2026-09-21 run.
  Blocked on that run. **Source**: B52n. **Owner**: Claude Code. **Model**: Haiku. **Size**: ~0 files.

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

- [ ] **B52i. The company P&L and balance sheet on the dashboard.** The company's diya-gl book,
  derived nightly and rendered above the eight objectives beside the last set filed at Companies
  House. Shape: a nightly Lambda beside `app/functions/analytics/` calling `mcp/lib/accounts-tools.js`
  `derive_micro_entity_accounts` over the cloud book, writing JSON lines to `curated/finance/` with
  a Glue table on `Ga4DailyTables.java`'s pattern, one observation set in
  `operatorSnapshotPublish.js`, and a block above `renderSnapshot`'s objectives in
  `web/public/operator/dashboard.html`. Blocked on `../PLAN_FINANCE_AUTOMATION.md` phases 1 and 2
  (open, drafted 2026-08-31, no code): the unblock event is a `book.toml` with validated diya-gl
  lines for DIYA saved to the DIYA cloud. Also blocked on `PLAN_SUBMISSION_MCP.md` M3, the third
  Cognito app client with the device-code grant and `open_book`/`save_book` over the cloud routes;
  M1c is on main (PR #232). **Source**: BACKLOG 52i; `PLAN_ONE_STOP_DASHBOARD.md` D10. **Owner**:
  Claude Code. **Model**: Sonnet. **Size**: ~4 files.

- [ ] **B49.17. `infra/google/ads/ads.toml` and `ads-sync.js`.** Extend the `ads.toml` B49.16
  starts: `auto_tagging = true`; four `[[conversion_action]]` rows (`purchase`, `submit_vat_return`,
  `runner_download`, `donate`) with `ga4_event` and `category`; `[[customer_conversion_goal]]` rows
  `category`, `origin`, `biddable`; one `[[campaign]]` (`name`, `type = "PERFORMANCE_MAX"`,
  `status`, `budget_micros`, `[[campaign.asset_group]] name`); `[reserve_floor] ssm_parameter =
  "/submit/prod/ads/reserve-floor-gbp"`, the name only. `ads-sync.js` in `gcp-identity-sync.js`'s
  shape: GAQL reads, pure `planAds(config, live)`, plan by default, `--apply` through the
  `customers`, `campaignBudgets`, `campaigns` and `customerConversionGoals` mutates; a declared
  conversion action missing live fails the run; `googleAdsLinks` stays with `ga4-sync.js`. Pin the
  API version in one constant. Last step of `google-apply.yml`, reading the two Ads secrets through
  that workflow's AWS chain, since the federated Google credentials do not cover Ads. Test
  `adsSync.test.js` over `parseConfig` and `planAds`. Proof: `npm test`, a `google-apply.yml` plan
  run reading "already match". **Source**: BACKLOG 49b; item 17. **Owner**: Claude Code. **Model**:
  Sonnet. Blocked on B49.16 and B52n.2. **Size**: ~4 files.

- [ ] **B30af.5. Branch deploys leave the ci apex: P3 to P5.** P1 (the slot pool) is on `main`: a
  ci branch deploy claims `ci-set1` to `ci-set4` through SSM in `deploy.yml`'s `names` job. What is
  left, per `_developers/DESIGN_CI_BRANCH_DEPLOYS_OFF_THE_APEX.md`: **P3**, `IdentityStack.java`'s
  `buildCallbackUrls`/`buildLogoutUrls` add every slot host for non-prod (`https://ci-set<N>…/` and
  `/auth/loginWithCognitoCallback.html`; `/` and `/auth/signed-out.html`), with an
  `IdentityStackTest.java` case asserting the submit client's `CallbackURLs`/`LogoutURLs` the way
  the diya-gl cases do, deployed by `deploy-environment.yml`. **P4**, `SubmitSharedNames.java` sets
  non-prod `publicDomainName = deploymentDomainName`, and `deploy.yml`'s `DIY_SUBMIT_APEX_URL` and
  `verify-api`'s `APEX_URL` take `needs.names.outputs.public-url`. **P5**, `set-origins` and
  `rollback-origins` gate to prod, a new `.github/workflows/promote-ci-apex.yml` (concurrency group
  `promote-ci-apex`, no cancel) is dispatched after `set-last-known-good-deployment`, the ~34
  `needs: set-origins` edges repoint for ci, and probe-test's three `wait-for-main-deploy` steps
  drop for ci. **Source**: the design, P3 to P5. **Owner**: Claude Code. **Model**: Sonnet. Blocked
  on B30af.6 (P2, which also fixes N). **Size**: ~9 files.

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

- [ ] **B52m. The reinvestment loop.** Trailing income, reserve, budget, return per pound and payback
  as one block on `web/public/operator/dashboard.html`, fed by observations over `v_revenue_daily`
  and `v_cost_vs_target_monthly` in `operatorSnapshotPublish.js`; the reinvestment fraction as a
  lever with the operator's reserve floor; paid traffic and article boosts as `experiments.toml`
  rows with on-off or geographic controls; GA4 conversion import from the Ads account. Blocked on
  three events: B52l's fitted models, which the return-per-pound figure comes from; the cost panel
  carrying revenue (BACKLOG 43, from 2026-10-02, the first monthly renewal); and a Google Ads
  account existing with its conversion import — the operator opens it and supplies the developer
  and refresh tokens B49.16 needs, then names the reinvestment fraction and the reserve floor.
  **Source**: BACKLOG 52m; `PLAN_ONE_STOP_DASHBOARD.md` D17. **Owner**: Claude Code, with the
  operator's fraction and floor. **Model**: Sonnet. **Size**: ~3 files.

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

