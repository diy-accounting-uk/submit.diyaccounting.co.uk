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

**Prod runs deployment prod-13704ea (main's scheduled deploy of 2026-09-05), the only app
stack set standing.** Each extra
`prod-*-app-*` set left after a merge costs $46.88/month until named to `destroy-prod.yml`
(`PLAN_COST_OPTIMISATION.md`). Drift findings live in issue #43.

The board runs in five sections, in this order: in flight; ready for Claude Code; ready for
the operator (each briefed for Claude Cowork in `../BRIEF_OPERATOR_TASKS_2026-09-04.md` at the
workspace root); blocked operator items; blocked Claude Code items.

## In flight

**Resumed 2026-09-05.** PR #118 (`claude/board-batch-2`) is complete and ready for review; work started after it lands
on `claude/board-batch-3`, the next single branch and PR. Its dispatched ci deploy (run 33954344850) passed every ci suite; the stacked PRs #119, #120, #125 and #126 are closed and folded in. The
Companies House lookup is folded in too, so PR #118's deploy fails secret validation until the
operator's API key (O6) exists.

Each track runs in its own worktree off main; the coordinator merges each landed track into the
batch branch, pushes in batches, and opens the PR. Wave 2 tracks merge the batch branch before
starting.

- [ ] **O1b / G2b roles-as-code. A role file that CI applies on commit.** Add
  `analytics/google-roles.toml` listing the GA4 account and property access bindings
  (Analytics Admin API `accessBindings`) and the GCP project IAM bindings the analytics work
  needs, a script `scripts/google-roles-apply.js` that reconciles them idempotently with a
  `--dry-run`, and a workflow `google-roles.yml` that dry-runs on pull requests touching the
  file and applies on push to main, authenticating with the service account from Secrets
  Manager via OIDC. **Source**: none. **Owner**: Claude Code. **Model**: Sonnet. O1a granted 2026-09-05.
  **Track**: google roles (Sonnet), worktree `.claude/worktrees/agent-ab637e01e6c753dbf`, lands on `claude/board-batch-3`.
- [ ] **O1c / G2b skill. `ga4-property-sync`.** A skill plus `scripts/ga4-property-sync.js`
  that, given an environment name and hostname, finds or creates the GA4 property, its web
  data stream and its BigQuery link (project `diyaccounting-ga4`, `europe-west2`, daily
  export) through the Analytics Admin API, then sets `SUBMIT_GA4_MEASUREMENT_ID` on the
  matching GitHub Environment with `gh variable set`. Dry run first, idempotent by display
  name, never prints credentials. **Source**: none. **Owner**: Claude Code. **Model**: Sonnet.
  O1a granted 2026-09-05.
  **Track**: ga4 property sync (Sonnet). On `claude/board-batch-3`: `scripts/ga4-property-sync.js`,
  `scripts/lib/googleAuth.js`, the skill doc, 17 unit tests. Its live dry run stopped because the
  Analytics Admin API is not enabled on the project (O1e); verified by a dry run that plans the
  ci property once O1e is done.
- [ ] **B43a. GCP billing tidy-up, automated.** In a sibling of O1b's script,
  `scripts/gcp-billing-assert.js`: assert a budget with 50/90/100 percent alerts on
  the billing account that holds `diyaccounting-ga4`, and delete the auto-created project
  `valued-context-507200-m9` after a dry run proves it holds no APIs, datasets, buckets or
  compute. **Source**: BACKLOG 43. **Owner**: Claude Code. **Model**: Sonnet. O1a granted 2026-09-05.
  **Track**: gcp billing (Sonnet). On `claude/board-batch-3`: `scripts/gcp-billing-assert.js`, 28
  unit tests; the budget defaults to GBP 10 a month unless the hand-made one is found. Its live dry
  run stopped twice: the Cloud Billing API is disabled on `diyaccounting-ga4`, and the service
  account holds no role on `valued-context-507200-m9` (O1e covers both); verified by a dry run
  that finds the hand-made budget and inventories the stray project once O1e is done.
- [ ] **B10a.3. Make one read-only ITSA sandbox call through our own OAuth and fraud headers.**
  Allow `read:self-assessment` in `web/public/lib/auth-url-builder.js` and the scope
  validation in `app/functions/hmrc/hmrcTokenPost.js` (unit tests exist for scope
  rejection); log in on the proxy variant as the O5 test user; call
  `GET /individuals/business/details/{nino}/list` on `HMRC_SANDBOX_BASE_URI` with the token
  and `app/lib/buildFraudHeaders.js` headers. Write `_developers/hmrc/ITSA_SPIKE.md`:
  the raw response, whether the existing application and headers were accepted, and which of
  `_developers/backlog/self-employed-api-operations.md`'s assumptions held. This is the gate
  for B10. **Source**: BACKLOG 10a; issue #16; `_developers/backlog/self-employed-api-operations.md`.
  **Owner**: Claude Code. **Model**: Opus. O5a and O5b done 2026-09-05: the sandbox app holds Business Details v2.0, Self Employment
  Business v5.0 and Obligations v3.0, and the test user (VRN and NINO enrolled) is the
  `hmrc-test-user-credentials` artifact on run 33977271581 (7-day retention).
  **Track**: ITSA spike (Opus), worktree `.claude/worktrees/agent-aa1cb7f7075c5b8f7`, lands on `claude/board-batch-3`.
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
  customer's rows in ci and prod). Verified when #95 and #97 stay in OK across a probe cycle
  after the prod deploy.
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
## Ready: Claude Code

(none)

## Ready: operator (brief: `../BRIEF_OPERATOR_TASKS_2026-09-04.md`)

- [ ] **O1e / G2b. Three Google switches the scripts cannot flip themselves.** On GCP project
  `diyaccounting-ga4` (project number 958354756046) enable the Analytics Admin API and the Cloud
  Billing API: `gcloud services enable analyticsadmin.googleapis.com cloudbilling.googleapis.com
  --project diyaccounting-ga4` (or the console's API library). On the stray project
  `valued-context-507200-m9` (project number 747057870039) grant the GA4 service account Viewer
  plus Project Deleter, or delete that project by hand once the console shows it holds nothing.
  The property-sync, roles and billing scripts all stop at these. **Source**: none. **Owner**:
  Operator.
- [ ] **O1a / G2b bootstrap. Grant the GA4 service account admin once, so every later grant
  is code.** The analytics jobs already run as a Google service account (Secrets Manager
  `GA4_SERVICE_ACCOUNT_ARN`). In GA4 admin give that account the Administrator role on the
  GA4 account, and in GCP project `diyaccounting-ga4` give it Owner (or IAM Admin plus
  BigQuery Admin). This is the last hand grant: after it, O1b applies grants from a file.
  **Source**: none. **Owner**: Operator.
  In the operator brief `../BRIEF_OPERATOR_TASKS_2026-09-04.md`.
- [ ] **O4a / B11a.2. Obtain the ITSA recognition questionnaire from HMRC SDST** if it is not
  on the hub (the VAT ones arrived by email; see `_developers/hmrc/hmrc_questionnaire_*`) and
  drop it into `_developers/hmrc/`. **Source**: BACKLOG 11a. **Owner**: Operator.
  In the operator brief `../BRIEF_OPERATOR_TASKS_2026-09-04.md`.
- [ ] **O4b / B11a.2. Ask HMRC whether a 2027-28 production-credential window opens for new
  ITSA quarterly-update products.** HMRC's pages say the 2026-27 window is closed to new
  products (`_developers/hmrc/ITSA_MINIMUM_FUNCTIONALITY_STANDARDS.md`; vendor contact
  makingtaxdigital-softwarevendors@hmrc.gov.uk). The answer decides whether backlog rows 10
  and 11 keep their April 2027 target. **Source**: BACKLOG 11a. **Owner**: Operator.
  In the operator brief `../BRIEF_OPERATOR_TASKS_2026-09-04.md`.
- [ ] **O6 / B34.1. Register two Companies House API keys and add them as GitHub environment
  secrets.** Steps 1 to 7 under "Operator steps" in
  `_developers/backlog/companies-house-api-operations.md`: a developer-hub application and REST key
  per environment, then `COMPANIES_HOUSE_API_KEY` on the `ci` and `prod` GitHub environments, then
  the deploy-environment workflow for each. PR #118 cannot deploy until this lands. **Source**:
  BACKLOG 34; issue #15. **Owner**: Operator.
- [ ] **B30f. Post the HMRC answer on issue #111 and decide whether the customer needs a reply.**
  `prod-env-hmrc-api-requests` shows a live customer (no `test_` prefix, no test scenario) getting
  HTTP 403 "The client and/or agent is not authorised" from HMRC on the obligations lookup at
  2026-09-03 21:44:22 UTC (request 23143b62-e10c-4309-b76c-89f8512a0a13), retried at 21:46 and
  21:48 with the same answer; the submission failure the alarm counted at 21:30 sits in the same
  session. That message is HMRC saying the customer's Government Gateway account is not enrolled
  for MTD VAT or has not granted this application authority, not a fault in our code. Paste the
  finding on #111, and if the support mailbox has a matching enquiry, reply with the enrolment
  and authority steps. **Source**: BACKLOG 30; issue #111. **Owner**: Operator.
- [ ] **B27c.2 remainder, operator. Replace the year-old ICO certificate PDF in the repo root**
  with the current one (registration ZB070902, expiry 2027-05-23): the register of fee payers
  only serves the certificate behind a login. Same filename, then commit. **Source**: BACKLOG
  27c. **Owner**: Operator.
- [ ] **B34.2. Get the Companies House filing route for accounts.** The REST filing API does
  not cover accounts; the route is a presenter account on gov.uk plus test presenter credentials
  requested by email to xml@companieshouse.gov.uk (replies reported at 17 to 40 working days).
  The April 2027 software-only mandate is paused with no new date. Apply for the presenter
  account and the test credentials, record the presenter id and the date, and hand them to
  Claude Code for B34.3. **Source**: BACKLOG 34; issue #15; Cowork brief 2026-09-05.
  **Owner**: Operator.
  In the operator brief `../BRIEF_OPERATOR_TASKS_2026-09-04.md`.
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
- [ ] **B34.3. Companies House accounts filing.** The filing half of the plan doc, against the
  presenter (XML gateway) route rather than the REST API. **Source**:
  BACKLOG 34; issue #15. **Owner**: Claude Code. **Model**: Opus. Blocked on B34.2.
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
- [ ] **B34.1. Companies House read-only lookup.** Public API key, no accreditation:
  `plans/issues/PLAN_ISSUE_15_limited_company_endpoints.md` describes the lookup half. Company
  search and profile behind an activity, page plus Lambda following the VAT read endpoints'
  shape, simulator route, unit and behaviour tests. **Source**: BACKLOG 34; issue #15.
  **Owner**: Claude Code. **Model**: Sonnet, after an Opus design pass on the API key handling.
  **Track**: Companies House build (Sonnet). Folded into `claude/board-batch-2` (PR #118). Blocked on O6: the deploy fails secret validation until the operator's key exists; verified by `companiesHouseBehaviour-ci` against the deployment after that.
## Discipline

(none repo-specific yet — see `../NEXT.md`)
