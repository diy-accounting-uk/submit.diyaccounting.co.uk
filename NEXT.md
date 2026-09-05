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

**Prod runs deployment prod-cea27f8 (the PR #118 merge deploy of 2026-09-05), the only app
stack set standing once that run's destroy-previous job finishes with prod-13704ea.** Each extra
`prod-*-app-*` set left after a merge costs $46.88/month until named to `destroy-prod.yml`
(`PLAN_COST_OPTIMISATION.md`). Drift findings live in issue #43.

The board runs in five sections, in this order: in flight; ready for Claude Code; ready for
the operator (each briefed for Claude Cowork in `../BRIEF_OPERATOR_TASKS_2026-09-04.md` at the
workspace root); blocked operator items; blocked Claude Code items.

## In flight

**PR #118 merged 2026-09-05.** Its prod deploy is run 33987220531; every item below marked "on
PR #118" is verified against that deployment. `claude/board-batch-3` is merged with main and is
the next single branch and PR.

Each track runs in its own worktree off main; the coordinator merges each landed track into the
batch branch, pushes in batches, and opens the PR. Wave 2 tracks merge the batch branch before
starting.

- [ ] **O1c / G2b skill. `ga4-property-sync`.** A skill plus `scripts/ga4-property-sync.js`
  that, given an environment name and hostname, finds or creates the GA4 property, its web
  data stream and its BigQuery link (project `diyaccounting-ga4`, `europe-west2`, daily
  export) through the Analytics Admin API, then sets `SUBMIT_GA4_MEASUREMENT_ID` on the
  matching GitHub Environment with `gh variable set`. Dry run first, idempotent by display
  name, never prints credentials. **Source**: none. **Owner**: Claude Code. **Model**: Sonnet.
  O1a granted 2026-09-05.
  **Track**: ga4 property sync (Sonnet). On `claude/board-batch-3`: `scripts/ga4-property-sync.js`,
  `scripts/lib/googleAuth.js`, the skill doc, 17 unit tests. Verified: the live dry run as the
  service account plans the ci property, its data stream and BigQuery link. Waits on the batch 3
  PR.
- [ ] **B43a. GCP billing tidy-up, automated.** In a sibling of O1b's script,
  `scripts/gcp-billing-assert.js`: assert a budget with 50/90/100 percent alerts on
  the billing account that holds `diyaccounting-ga4`, and delete the auto-created project
  `valued-context-507200-m9` after a dry run proves it holds no APIs, datasets, buckets or
  compute. **Source**: BACKLOG 43. **Owner**: Claude Code. **Model**: Sonnet. O1a granted 2026-09-05.
  **Track**: gcp billing (Sonnet). On `claude/board-batch-3`: `scripts/gcp-billing-assert.js`, 28
  unit tests; the budget defaults to GBP 10 a month unless the hand-made one is found. Its live dry
  run now reaches the billing account (`019D7D-B02D59-ED7738`) and stops at 403 there, and holds
  no role on `valued-context-507200-m9`: both are O1e. Verified by a dry run that finds the
  hand-made budget and inventories the stray project once O1e is done.
- [ ] **B10.1. First ITSA endpoint: Business Details list.** The spike
  (`_developers/hmrc/ITSA_SPIKE.md`, on `claude/board-batch-3`) got HTTP 200 from
  `GET /individuals/business/details/{nino}/list` through our own OAuth and fraud headers, scope
  `read:self-assessment` granted as requested. Build `hmrcItsaBusinessDetailsGet.js` shaped like
  `hmrcVatObligationGet.js`, mounted at `/api/v1/hmrc/itsa/business/details` behind the
  `self-employed` activity, with a simulator route, unit and behaviour tests. Two departures the
  spike found: `buildHmrcHeaders` hardcodes the v1.0 Accept header, so the API version becomes a
  parameter; and nothing in the app carries a NINO yet. Every later ITSA endpoint needs the
  `businessId` this one returns. `_developers/backlog/self-employed-api-operations.md` has the
  wrong paths for v5.0; the spike lists the right ones. **Source**: BACKLOG 10; issues #16, #20.
  **Owner**: Claude Code. **Model**: Sonnet. Operator decision 2026-09-05: build against HMRC's test APIs and get
  something running before asking HMRC about production windows (O4a and O4b are back on the
  backlog, row 11a).
  **Track**: ITSA business details (Sonnet). On `claude/board-batch-3`: handler in the VAT reads'
  async shape, `buildHmrcHeaders` takes an API version, NINO validation, simulator route and
  scenarios, the Business Details page, and unit, system, browser and behaviour tests (1343,
  153, 69, simulator lane 1 passed; CDK 94). Remainder: `deploy.yml` has no
  `itsaBusinessDetailsBehaviour-ci` job (the suite is only listed as allowed in
  `synthetic-test.yml`), so add one shaped like `getVatObligationsBehaviour-ci`. Verified when
  that job is green on a ci deploy of batch 3; then a prod recording of the page is the next
  video.
- [ ] **B32.4. Add the three read suites to the 4-hourly synthetic schedule.** Decided
  2026-09-04: `synthetic-test.yml`'s scheduled `SUITES_JSON` gains `getVatLiabilitiesBehaviour`,
  `getVatPaymentsBehaviour` and `getVatPenaltiesBehaviour`. **Source**: BACKLOG 32; issue #19.
  **Owner**: Claude Code. **Model**: Haiku.
  **Track**: synthetic workflow (Sonnet, shared with B39.1). Code complete on `claude/board-batch-2` (PR #118); verified when the next scheduled run on main runs all five suites.
- [ ] **B30c. Stop the GitHub probe alarm firing on its own cadence.** `OpsStack.java`
  (`githubSyntheticAlarm`, renamed `githubProbeAlarm` in PR #120) evaluates a 2-hour period with
  missing data treated as breaching, but `synthetic-test.yml` publishes the metric every 4 hours,
  so about half of all windows are empty and every prod deployment inherits a false alarm
  (#103, #109, #123). Widen the period to straddle the cron, or move the alarm to the env stack
  so it is not recreated per deployment; CDK test updated. **Source**: BACKLOG 30; issues #123.
  **Owner**: Claude Code. **Model**: Sonnet.
  **Track**: probe alarm period (Sonnet). Folded into `claude/board-batch-2` (PR #118): one `{env}-env-github-probe-failed` alarm per environment in `ObservabilityStack`, 5-hour period, and the dashboard widget now reads the namespace the workflow writes to. Verified after deploy when the per-deployment `-github-probe-failed` alarms are gone and the env alarm sits in OK across a full probe cycle.
- [ ] **B30d. Make `alarmToGithubIssue.js` dedupe by alarm family.**
  `findOpenIssueByAlarmName` matches the exact `[ALARM] <name>` title, and per-deployment names
  carry the deployment slug, so each new deployment opens a fresh issue for the same check
  (19 of the 30 open alarm issues). Strip the deployment segment before the title search so a
  family comments on one rolling issue; unit test. **Source**: BACKLOG 30; alarm-issue review
  2026-09-05. **Owner**: Claude Code. **Model**: Sonnet.
  **Track**: alarm issue dedupe (Sonnet). Code complete on `claude/board-batch-2` (PR #118): `app/lib/alarmName.js` collapses `<env>-<slug>-app-<rest>` to `<env>-app-<rest>` for the issue title and search, comments name the full alarm, issues are never auto-closed. Verified when the next deployment's alarm comments on the existing family issue instead of opening one.
- [ ] **B30g. Stop the self-destruct Lambda tripping its log-errors check on every fresh ci
  deployment.** Every ci deployment's `self-destruct-stack-health` composite goes to ALARM within
  hours of creation because `check-<deployment>-app-app-self-destruct-log-errors` fires (#122 for
  ci-claudeboa, #127 for ci-claudff66, the first family-titled issue). Read
  `app/functions/ops/selfDestruct*.js` for what it logs at error level on a deployment that has
  nothing to destroy yet, and either stop logging an expected condition as an error or narrow the
  metric filter in `Lambda.java`; the alarm name's doubled `app-app` is a naming slip to fix in
  the same pass. **Source**: BACKLOG 30; issues #122, #127. **Owner**: Claude Code. **Model**:
  Sonnet.
  **Track**: self-destruct log errors (Sonnet). On `claude/board-batch-2` (PR #118): a bucket the
  edge stack has not created yet is logged as a warning, and the function name drops the doubled
  `app`. Verified when a fresh ci deployment's self-destruct composite stays in OK.
- [ ] **B30e. Stop the prod detection alarms firing on our own deployment role.** Both
  `prod-env-salt-secret-unexpected-read` (#97) and `prod-env-dynamodb-customer-table-scan` (#95)
  fire on `submit-prod-deployment-role`, the GitHub Actions role, which the detector's `prod-*`
  role-name exception in `SecurityDetectionStack.java` does not cover. The salt reads are the
  deploy pipeline reading the salt (five in a day, all that role): exclude the deployment role
  from that filter. The table scans are 412 of 450 in a day from that role across all three
  customer tables, which is the probe workflow's "Export DynamoDB data for test users" step
  (`scripts/export-test-dynamodb.sh`) scanning whole prod tables every four hours: make that
  export query by the test users' keys instead of scanning, and leave the scan detector as it is,
  since catching exactly that is its purpose. CDK test and a script test. **Source**: BACKLOG 30;
  issues #95, #97; CloudTrail lookup 2026-09-05. **Owner**: Claude Code. **Model**: Sonnet.
  **Track**: deployment role and probe export (Sonnet). On `claude/board-batch-2` (PR #118): the
  salt filter accepts the environment's deployment role, and both test-data exports query the test
  user's `hashedSub` instead of scanning (the behaviour-test export had been dumping every
  customer's rows in ci and prod). ci twins #128 and #129 opened 2026-09-05 during the ci env deploy from the batch. Verified
  when #95, #97, #128 and #129 stay in OK across a probe cycle after the deploys.
- [ ] **B40d.2. Rename the modes to `synthetic`/`live` and give the monitoring vocabulary a
  new name.** Decided 2026-09-04: `hmrcAccount` sandbox becomes synthetic across
  `web/public/developer-mode.js`, `billingWebhookPost.js:142` (`qualifiers.sandbox`), UI copy
  ("sandbox (test)") and every `HMRC_ACCOUNT`/`allowSandboxObligations` reader; the Stripe
  test flag gets its own field; `synthetic-test.yml`, the synthetic-traffic filters in the
  detectors and analytics, and the `synthetic-*` test users move to a name that does not
  collide (the design pass names it). One PR per rename layer. **Source**: BACKLOG 40d; issue
  #12. **Owner**: Claude Code. **Model**: Opus design, then Sonnet.
  **Tracks**: `PLAN_MODE_RENAME.md` is the design; four Sonnet layers, one PR each. Layer 2 (Stripe flag `stripeTestMode` plus migration 004): folded into `claude/board-batch-2` (PR #118); verified after the operator runs migration 004 dry then real on ci and prod. Layer 1 (monitoring vocabulary to `probe`, plus the four alarm docs the cuts left stale): folded into `claude/board-batch-2` (PR #118); verified after its deploy by the `-github-probe-failed` alarms in OK. Layer 3 (HMRC mode value, migrations 005 and 006): folded into `claude/board-batch-2` (PR #118): unit 1271, system 148, CDK 94, simulator behaviour lane green, residue sweep clean. Verified after the operator runs migration 005 before its deploy and 006 after, on ci then prod, and `submitVatBehaviour-ci` passes in synthetic mode. Layer 4 (docs and copy, alarm arithmetic recounted): folded into `claude/board-batch-2` (PR #118). The whole rename is verified after PR #118 deploys and the migrations run.
- [ ] **B30b. Cut the alarms and canary runs the audit shows are dead weight.** From B30a:
  drop or merge check types that never fire in CDK (`Lambda.java`), fold the five
  `AsyncApiLambda` alarm triples into their stack composite (`PLAN_ALARM_CONSOLIDATION.md`
  open item 2, one alert for stuck queue plus broken worker), and set the canary interval and
  synthetic cron so they do not both cover the same 4-hour window. Keep every alarm the
  routing rule or a runbook reads. CDK tests updated; `./mvnw clean verify`. The audit
  (`_developers/ALARM_AUDIT_2026-09.md`) found 141 of 146 alarms never fired in 90 days and the
  five that did are detection or analytics alarms with open issues. **Source**: BACKLOG 30;
  `PLAN_ALARM_CONSOLIDATION.md`. **Owner**: Claude Code. **Model**: Opus.
  **Track**: alarm cuts (Opus). Code complete on `claude/board-batch-2` (PR #118): 62 metric alarms fewer per deployment, async triples inside the stack composites, canaries at `cron(27 * * * ? *)`. Verified after the ci deploy by the counts in `PLAN_ALARM_CONSOLIDATION.md`.
- [ ] **B34.1. Companies House read-only lookup.** Public API key, no accreditation:
  `plans/issues/PLAN_ISSUE_15_limited_company_endpoints.md` describes the lookup half. Company
  search and profile behind an activity, page plus Lambda following the VAT read endpoints'
  shape, simulator route, unit and behaviour tests. **Source**: BACKLOG 34; issue #15.
  **Owner**: Claude Code. **Model**: Sonnet, after an Opus design pass on the API key handling.
  **Track**: Companies House build (Sonnet). Folded into `claude/board-batch-2` (PR #118); the
  ci key exists and run 33980220915 deployed `CompaniesHouseStack`. Remainder: `deploy.yml` has
  no `companiesHouseBehaviour-ci` job (the suite is only listed as allowed in `probe-test.yml`),
  so add one shaped like `getVatObligationsBehaviour-ci`. Verified when that job is green on a
  ci deploy of PR #118.
## Ready: Claude Code

- [ ] **B34.3a. Companies House REST filing: registered office and registered email changes.**
  The REST filing API covers transactions, registered office address, registered email address
  and insolvency, not accounts. Build those two changes as OAuth user-authorised filings against
  `api-sandbox.company-information.service.gov.uk` with the "DIY Accounting Submit - test"
  developer-hub application the operator created (an OAuth client, no key). **Source**: BACKLOG
  34; issue #15; Cowork research 2026-09-05. **Owner**: Claude Code. **Model**: Opus design, then
  Sonnet.
## Ready: operator (brief: `../BRIEF_OPERATOR_TASKS_2026-09-04.md`)

- [ ] **O10. Close the B30e alarm issues once the PR #118 deployment holds.** The probe
  workflow runs on a 4-hour cron and the env alarm `prod-env-github-probe-failed` evaluates a
  5-hour window, so one full cycle is one scheduled probe run plus the window that scores it:
  about five hours after the deploy. When that window has passed with the probe alarm and the
  four B30e alarms (#95, #97, #128, #129) in OK, close those four issues. **Source**: PR #118.
  **Owner**: Operator.
- [ ] **O1e / G2b. Two grants only your own Google identity can make.** The service account
  now enables the project's APIs itself (`scripts/gcp-enable-apis.js`, first step of
  `google-roles.yml`) and its roles dry run reports no changes, but it holds nothing on two
  resources outside the project: (1) billing account `019D7D-B02D59-ED7738`: grant
  `ga4-report-pull@diyaccounting-ga4.iam.gserviceaccount.com` Billing Account Costs Manager so
  the budget assert can read and set budgets; (2) the stray project `valued-context-507200-m9`
  (project number 747057870039): grant it Owner so the assert can inventory and delete it, or
  delete that project by hand once the console shows it empty. **Source**: none. **Owner**:
  Operator.
- [ ] **B30f. Post the HMRC answer on issue #111 and decide whether the customer needs a reply.**
  `prod-env-hmrc-api-requests` shows a live customer (no `test_` prefix, no test scenario) getting
  HTTP 403 "The client and/or agent is not authorised" from HMRC on the obligations lookup at
  2026-09-03 21:44:22 UTC (request 23143b62-e10c-4309-b76c-89f8512a0a13), retried at 21:46 and
  21:48 with the same answer; the submission failure the alarm counted at 21:30 sits in the same
  session. That message is HMRC saying the customer's Government Gateway account is not enrolled
  for MTD VAT or has not granted this application authority, not a fault in our code. Paste the
  finding on #111, and if the support mailbox has a matching enquiry, reply with the enrolment
  and authority steps. **Source**: BACKLOG 30; issue #111. **Owner**: Operator.
## Blocked: operator

- [ ] **O9 / B47. Watch the revived schedules fire on their own**: `codeql` on 2026-09-06 and
  the weekly `compliance` and `stack-drift` crons on Monday 2026-09-07 06:00 UTC. If one
  misses, revive it the same way as on 2026-08-31 and tell Claude Code. **Source**: BACKLOG 47.
  **Owner**: Operator.
- [ ] **B17a.5. Publish the videos** on https://www.youtube.com/@DIYAccountingSubmit with
  titles and descriptions drafted from the captions. The prod recordings are workflow
  artifacts: `video-view-obligations-prod` on run 33952515598 and `video-submit-return-prod` on
  run 33953044775 (mp4, vtt, transcript and stills together; 30-day retention). **Source**:
  BACKLOG 17a. **Owner**: Operator (an upload via the YouTube Data API can follow once the
  pattern settles). Blocked on B17a.3.

## Blocked: Claude Code

- [ ] **O1d / G2b. Create the ci property with the skill** and record the dataset id.
  **Source**: none. **Owner**: Claude Code. **Model**: Haiku. Blocked on O1c.
- [ ] **G2c. Plumb the measurement id through `submit.env` and assert a `purchase` row in ci.**
  After O1: replace the hardcoded `G-T81V5NL5MB` in `web/public/lib/analytics.js` with a
  value read from `submit.env` (generated by `deploy.yml`/`deploy-app.yml` from the
  environment variable), pass `GA4_BIGQUERY_DATASET_ID` for ci into
  `app/functions/analytics/ga4EventExportPull.js`'s environment, and extend
  `paymentBehaviour-ci` (or a post-run step in `synthetic-test.yml`) to query the ci dataset
  for a `purchase` event with the run's transaction id. Two facts from Track A shape this:
  behaviour-test browsers stub `gtag.js` and `/g/collect` unless
  `DIY_SUBMIT_ALLOW_REAL_ANALYTICS=true`, and Playwright's headless shell reports
  `HeadlessChrome` in the User-Agent Client Hints, which GA4's bot filter excludes, so the
  ci assertion run needs a browser that does not (Playwright `channel: "chromium"` new
  headless or `chrome`); prove the hit lands in DebugView before wiring the BigQuery check.
  **Source**: none. **Owner**: Claude Code. **Model**: Sonnet. Blocked on O1d.
- [ ] **G3. Confirm a real `purchase` lands in prod** once G1 and G2c ship: the next live
  checkout should appear in `diyaccounting-ga4.analytics_523400333.events_*`
  (`bq --project_id=diyaccounting-ga4 --location=europe-west2`). No event of that name has
  ever reached the export. **Source**: none. **Owner**: Claude Code (read-only query).
  **Model**: Haiku. Blocked on G1, G2c and a live sale.
- [ ] **B17a.3. Video: view a submitted VAT return**, same pattern. **Source**: BACKLOG 17a.
  **Owner**: Claude Code. **Model**: Sonnet.
  **Track**: HMRC's sandbox holds no return for a fresh test user's canned obligations and never
  flips the open one to fulfilled, so a return is viewable only for the period the run itself
  submits through the submit page's date fields, the way `getVatReturn.behaviour.test.js` does;
  that behaviour step waits for the page to report the `synthetic` mode, which prod only does
  once PR #118 deploys. That off-camera submission and the table's "View Return" on the fulfilled period are on
  `claude/board-batch-2` (PR #118), green on the simulator. Blocked on PR #118 deploying to
  prod; verified by a prod recording passing the blocking check.
## Discipline

(none repo-specific yet — see `../NEXT.md`)
