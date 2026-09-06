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

**Prod runs deployment prod-0967fab (the PR #136 merge deploy of 2026-09-06), the only app
stack set standing.** A main deploy retires the previous set itself; a `prod-*-app-*` set
left standing by anything else costs $46.88/month until named to `destroy-prod.yml`
(`PLAN_COST_OPTIMISATION.md`). Drift findings live in issue #43.

The board runs in five sections, in this order: in flight; ready for Claude Code; ready for
the operator (each briefed for Claude Cowork in `../BRIEF_OPERATOR_TASKS_2026-09-04.md` at the
workspace root); blocked operator items; blocked Claude Code items.

## In flight

PR #136 (batch 4) merged at 06:08 UTC on 2026-09-06. Its `deploy environment` run 34015720587
failed at the create-secrets step because `COMPANIES_HOUSE_CLIENT_SECRET` is not set yet, so
neither environment has the batch's environment stacks (the triage role, guardrail, budget and
the bundles index) until the guard below lands. Batch 5 is integration branch
`claude/board-batch-5`; the operator merges. The batch 4 items below are code complete on main
and each names the event that verifies it once the environment deploy succeeds. B30d waits on
a later event to verify.

- [ ] **B34.4. The environment deploy skips the Companies House client secret while it is
  unset.** `deploy-environment.yml`'s create-secrets step fails on an empty
  `COMPANIES_HOUSE_CLIENT_SECRET`, which blocks every environment deploy. The step now exits
  with a notice when the secret is empty. **Source**: run 34015720587. **Owner**: Claude Code.
  **Model**: Fable (coordinator).
  **Track**: on `claude/board-batch-5`. The ci environment deploy from the branch (run
  34020851682) is green with every batch 4 and 5 environment stack, so ci now has the triage
  role and guardrail, both Bedrock budgets, the forwarder Lambda and the bundles index (ACTIVE).
  The prod environment run after the PR #137 merge (34023929068) got the observability
  stacks, budgets and index up but `prod-env-DataStack` rolled back: the index custom
  resource issued a second `UpdateTable` while the index was still creating ("Index is being
  created"), and the backup stack job was skipped behind it. Re-dispatched for prod as run
  34024729614 with the index now ACTIVE. On `claude/board-batch-6` (8105f1aa) the custom
  resource also ignores `ResourceInUseException`, so an index still creating counts as ensured.
  Verified when that run is green.
- [ ] **B30n. Triage anonymises rather than blocks, and opens a draft PR when it can name the
  change.** Operator decision 2026-09-06, reversing the dispatch choices: the Bedrock guardrail's
  PII action becomes ANONYMIZE (the triage input is HMRC's and CloudWatch's, not ours to
  control, so a blocked comment helps nobody), the workflow posts the guardrail's anonymised
  output, and the draft-PR path from `PLAN_ALARM_EVIDENCE_AND_TRIAGE.md` Part 6.2 ships with
  `contents: write` and `pull-requests: write`. **Source**: BACKLOG 30; issue #18. **Owner**:
  Claude Code. **Model**: Sonnet.
  **Track**: code complete on `claude/board-batch-5` (0fa136da): every guardrail entity and
  regex is ANONYMIZE, the workflow posts `outputs[0].text` with a one-line note when the
  guardrail intervened, and a fenced diff in the posted comment becomes branch
  `claude/triage-<issue>` and a draft PR when it applies cleanly. The first ci run posted
  Bedrock's 404 as if it were triage, so the redaction script now fails the run on a result
  carrying `is_error`, and nothing is posted. Verified through B30o's proof run.
- [ ] **B30m. The Bedrock budget topic reaches Telegram.** `<env>-env-bedrock-budget-alerts` in
  `ObservabilityUE1Stack` has no subscriber. The us-east-1 alarms already forward to the
  Telegram path; the budget topic joins the same route in CDK, with a test. **Source**: BACKLOG
  30. **Owner**: Claude Code. **Model**: Sonnet.
  **Track**: code complete on `claude/board-batch-5` (dc69e74e). Budgets publish only to SNS,
  so `bedrockBudgetAlertForward.js` in us-east-1 subscribes to the topic and puts an
  `ActivityEvent` on the shared activity bus, which every deployment's Telegram rule already
  reads. The same commit fixes the ci environment deploy failure (run 34016080214, "Budgets
  Actions don't support daily granularity"): the deny action sits on a monthly USD 150 budget,
  30 days of the daily figure, and the daily USD 5 budget notifies only (`GREATER_THAN` 99
  percent, the only operator shape Budgets accepts). The ci environment run 34020055726 then
  failed on the forwarder Lambda's image: the environment deploy builds no image for the
  us-east-1 registry, since that stack never had a container Lambda. Track ue1-env-image
  added that build (ea0bd4d6: the ingestion image is pushed to the us-east-1 repository as
  `env-observability-ue1-<sha>`), and run 34020851682 deployed the lot to ci. A test
  notification to `ci-env-bedrock-budget-alerts` at 08:55 UTC on 2026-09-06 reached the
  forwarder, which put one `bedrock-budget-alert` event on the activity bus (its log shows
  `published: 1`); no ci app set stood to carry it to Telegram. The same test on prod at
  09:30 UTC reached `prod-env-bedrock-budget-alert-forward` (`published: 1`), where
  prod-0967fab's Telegram rule reads the bus. Verified when the operator confirms the message
  arrived on Telegram.

- [ ] **B43b. ci self-destruct leaves the Companies House stack behind.** The self-destruct
  Lambda's deletion list (`SelfDestructStack.java` environment, `app/functions/infra/
  selfDestruct.js`) predates `CompaniesHouseStack`, so every ci set leaves
  `ci-<slug>-app-CompaniesHouseStack` standing, and `destroy-ci.yml`'s sweep only discovers
  deployments by their public, published and last-known-good names, so the orphans are
  invisible to it. Three stand now: ci-claudff66, ci-claudf375, ci-claud063e (two Lambdas,
  aliases, alarms and log groups each). Fix both lists, with unit and CDK tests. **Source**:
  board render 2026-09-06; BACKLOG 43. **Owner**: Claude Code. **Model**: Sonnet.
  **Track**: code complete on `claude/board-batch-5` (3e8fe230): the Lambda deletes the
  Companies House stack after the HMRC stack, pinned by `SelfDestructStackTest`, and the sweep
  scans eu-west-2 for `ci-*-app-` prefixes it would otherwise not see. ci-claudff66 also has an
  `ApiStack` in DELETE_FAILED (its Cognito authorizer is still referenced by the Companies
  House routes), so that set needs the Companies House stack deleted first and the ApiStack
  deleted again. On the operator's yes of 2026-09-06 the three Companies House stacks were
  deleted and ci-claudff66's ApiStack delete was requested again. Verified when
  `list-stacks` in ci shows no `ci-claud*` stack and the next ci set self-destructs whole.
- [ ] **B30d. Make `alarmToGithubIssue.js` dedupe by alarm family.**
  `findOpenIssueByAlarmName` matches the exact `[ALARM] <name>` title, and per-deployment names
  carry the deployment slug, so each new deployment opens a fresh issue for the same check
  (19 of the 30 open alarm issues). Strip the deployment segment before the title search so a
  family comments on one rolling issue; unit test. **Source**: BACKLOG 30; alarm-issue review
  2026-09-05. **Owner**: Claude Code. **Model**: Sonnet.
  **Track**: deployed with PR #118 (`app/lib/alarmName.js` collapses `<env>-<slug>-app-<rest>`
  to `<env>-app-<rest>` for the issue title and search). The first family issue opened under
  the collapsed title: #133 `prod-app-api-failed`, 22:04 UTC on 2026-09-05, for prod-0f68ed8.
  Verified when the next `api-failed` alarm on any prod set comments on #133 instead of opening
  a new issue.
- [ ] **B32.4 remainder. The probe upload step fails for the three read suites.** The renamed
  `probe-test.yml` fired on its own at 22:22 UTC on 2026-09-05 (run 33995729733) with all five
  scheduled suites, and every suite passed, so the schedule is verified. The three "upload web
  test results" jobs for `getVatLiabilitiesBehaviour`, `getVatPaymentsBehaviour` and
  `getVatPenaltiesBehaviour` then failed: the publish step in `probe-test.yml` copies
  `web/public/tests/test-reports/web-test/html-report/` to S3 and that directory does not exist
  for those suites, so the scheduled run reports failure and counts against
  `prod-env-github-probe-failed`. Make the step upload the HTML report only when the suite
  produced one, or carry the report through the artifact the same way the two older suites do.
  Verified when the next scheduled run is green end to end. **Source**: BACKLOG 32; issue #19.
  **Owner**: Claude Code. **Model**: Sonnet.
  **Track**: code complete on `claude/board-batch-4` (58051590, aa57a597). The cause was the
  four newer suites' `testId` lacking the `Behaviour` suffix, so the publish script looked for
  the html-report under the wrong directory; the ids now equal the suite names. The scheduled
  prod matrix drops the three read suites and `deploy.yml` runs the gated suites only on ci.
  Verified when the first scheduled probe run after the PR merges is green end to end.
- [ ] **B30k. ci alarms stop opening GitHub issues.** Every ci alarm issue of 2026-09-05
  (#128, #129, #131) was test churn on a ci set that self-destructs within hours, and ci alarms
  already reach Telegram through the same rule. In `OpsStack.java` the
  `<deployment>-app-alarm-state-change` rule targets both the Telegram forwarder and
  `alarmToGithubIssue`; add the issue Lambda as a target only when `props.envName()` is
  `prod` (the Telegram target stays for both), and pin it with a CDK test that a ci synth has
  one target and a prod synth two. **Source**: BACKLOG 30; operator decision 2026-09-05.
  **Owner**: Claude Code. **Model**: Sonnet.
  **Track**: code complete on `claude/board-batch-4` (fe4eff98): the issue Lambda is a rule
  target only when the environment is `prod`, pinned by `OpsStackTest` (one target on ci, two on
  prod). Verified when the next ci alarm reaches Telegram and opens no issue.
- [ ] **B32.5. Activities visible only in ci until the operator has examined them.** The
  catalogue once carried `listedInEnvironments` on a bundle (commented out in
  `web/public/submit.catalogue.toml`) and nothing honours it now. Add an `environments` field
  on activities, read by `catalog-service.js` so the UI lists the activity only in a named
  environment, and by `enforceBundles` in `app/services/bundleManagement.js` so its paths
  answer 403 elsewhere (the Lambda has `ENVIRONMENT_NAME`; the browser reads the environment
  from `submit.env`). Set it to `["local", "proxy", "ci"]` on `vat-liabilities`,
  `vat-payments`, `vat-penalties` and `self-employed`, and on every new activity from now on
  until the operator has tried it on ci and lifts the gate; the Companies House `company-lookup`
  reached prod in PR #118 and joins the same gate. Unit tests on both readers, and the ci
  behaviour suites keep running against ci. **Source**: operator decision 2026-09-05; BACKLOG
  32. **Owner**: Claude Code. **Model**: Sonnet.
  **Track**: code complete on `claude/board-batch-4` (b72324d8). Activities carry
  `environments = ["local", "test", "simulator", "proxy", "ci"]`; the home page reads the
  environment from `submit.environment-name.txt` (PublishStack writes it at synth, prod serves
  `prod`), and `enforceBundles` answers 403 with `ACTIVITY_ENVIRONMENT_RESTRICTED` elsewhere. The
  three VAT read activities' path patterns narrowed to their own routes so the gate cannot leak
  onto other VAT endpoints. The ci deployment ci-claud063e (deploy run 33998025585, green)
  serves the catalogue with the field on all five activities; verified when prod after the
  merge hides them and the operator has looked at them on ci.
- [ ] **B30j. Stop the hourly bundle-capacity reconcile scanning the bundles table.**
  CloudTrail for 2026-09-05 shows `prod-env-dynamodb-customer-table-scan` (#95) re-entering
  ALARM every hour at about :35 past, and each one is
  `app/functions/account/bundleCapacityReconcile.js` running `Scan` on `prod-env-bundles` on
  its `rate(1 hour)` schedule (AccountStack); the deployment role's scans stopped with B30e
  and the last of them was migration 006 at 20:05 UTC. The scan detector exempts no caller by
  design, because app code should never scan a customer table; the detector is right and the
  job is wrong. Design pass: count bundle
  take-up without a scan (a sparse GSI on `bundleId` queried per catalogue bundle, or a counter
  item the grant and expiry paths maintain), then rebuild the reconcile on it; CDK test on the
  index or the counter, unit test on the reconcile. The operator closed #95 on 2026-09-05;
  the next hourly scan opens a fresh family issue, which is the one to close when this lands.
  Verified when `prod-env-dynamodb-customer-table-scan` stays in OK across a day. **Source**:
  BACKLOG 30; CloudTrail lookup 2026-09-05. **Owner**: Claude Code. **Model**: Opus design,
  then Sonnet.
  **Track**: `PLAN_BUNDLE_CAPACITY_RECONCILE.md` is on `claude/board-batch-4` (bd6d402e): a
  sparse GSI `bundleId-expiry-index` queried once per capped bundle, no counter, no backfill,
  the schedule stays hourly. Code complete on `claude/board-batch-4` (6ebea8ee, 6dca64bb,
  a13db2db, ce25b350): the index, the reconcile's per-bundle count query, the Scan grant gone,
  `restore-test.yml` reading `ItemCount` instead of scanning the source table, and the pass
  repository's scan fallback removed. The index and the new reconcile land in one deploy; a
  reconcile run against a still-building index throws and the next hourly run succeeds.
  Verified when `prod-env-dynamodb-customer-table-scan` stays OK for a day after the merge.
- [ ] **B30h. Alarm issues link to the evidence.** An alarm issue today carries the alarm
  name, the state change and the CloudWatch reason (#111 is the example). Make
  `app/functions/ops/alarmToGithubIssue.js` add links, never log text, because the repo is
  public: a CloudWatch Logs Insights link pre-filled with the log groups behind the alarm's
  metric and the alarm's evaluation window (for `prod-env-hmrc-submission-failure` that is the
  `hmrcVatReturnPost` function's log group and the `prod-env-hmrc-api-requests` table's request
  ids), and an X-Ray trace search link for the same window (every Lambda traces with
  `Tracing.ACTIVE`, `constructs/Lambda.java`). The alarm-to-log-group mapping needs a design
  pass: alarm names carry the function name for per-function checks and the metric namespace
  for business metrics. Unit tests on the two builders. **Source**: BACKLOG 30; issue #111.
  **Owner**: Claude Code. **Model**: Opus design, then Sonnet.
  **Track**: `PLAN_ALARM_EVIDENCE_AND_TRIAGE.md` is on `claude/board-batch-4` (605e45ef):
  rules keyed on metric namespace rather than a row per alarm, the window read from the event's
  `reasonData`, composite alarms resolved through `DescribeAlarms`. Code complete on
  `claude/board-batch-4` (bd85b797): `app/lib/alarmEvidence.js`, `alarmWindow.js` and
  `consoleLinks.js`, the Lambda's revised body, `scripts/resolve-alarm-evidence.mjs`, and the two
  OpsStack policy statements; the CLI reproduces the plan's worked-example URLs byte for byte.
  Verified when the first prod alarm issue after the merge carries a Logs Insights link and an
  X-Ray link that open on the right window in the console.
- [ ] **B34.3a. Companies House REST filing: registered office and registered email changes.**
  The REST filing API covers transactions, registered office address, registered email address
  and insolvency, not accounts. Build those two changes as OAuth user-authorised filings against
  `api-sandbox.company-information.service.gov.uk` with the "DIY Accounting Submit - test"
  developer-hub application the operator created (an OAuth client, no key). **Source**: BACKLOG
  34; issue #15; Cowork research 2026-09-05. **Owner**: Claude Code. **Model**: Opus design, then
  Sonnet.
  **Track**: `PLAN_COMPANIES_HOUSE_REST_FILING.md` is on `claude/board-batch-4` (ca7a800a):
  eight Lambdas, tokens in the browser session like HMRC's, both activities free on `default`
  behind the environments gate, three sequential Sonnet tracks. Track 1 (auth plumbing) is
  merged (a88c2459: token exchange Lambda with the client secret scoped to it alone, callback
  page, simulator OAuth routes, env and CDK plumbing; `COMPANIES_HOUSE_CLIENT_ID` is blank in
  `.env.ci` and `.env.prod` until the operator fills it). Track 2 is merged (1a8356a2,
  98cd2bec: the seven filing Lambdas, simulator scenarios and system test; the four
  registered-office and registered-email Lambdas carry shorter deployed names to fit AWS's
  64-character cap, URL paths unchanged). Track 3 is merged (d7470848, 223cf553: the two
  filing pages, the service module, both activities on `default` behind the gate, browser and
  behaviour suites green on the simulator; the in-browser TOML parser reads one-line arrays
  only, so catalogue arrays stay on one line). Code complete. Verified when
  `changeRegisteredOfficeBehaviour-ci` and `changeRegisteredEmailBehaviour-ci` pass against the
  sandbox, which needs the operator steps below (O11).
- [ ] **B30i. Alarm triage: Claude Code headless in Actions, on Bedrock.** `alarm-triage.yml`
  runs on `issues: opened` for issues labelled `alarm` and on the `triage` label, reads the
  alarm from the issue body, derives the evidence with B30h's mapping, and runs Claude Code on
  Bedrock (`eu.anthropic.claude-sonnet-4-5-20250929-v1:0`, `--max-turns 12`, plan mode, a
  read-only tool allow-list) behind a three-runs-a-day guard, `concurrency: alarm-triage` and a
  timeout. Its one write is an issue comment, after a regex deny-list and a Bedrock guardrail
  that blocks PII; no PR permissions. The read-only triage role, the guardrail and a daily USD 5
  Bedrock budget whose action attaches a Bedrock deny live in the Observability stacks. Design
  in `PLAN_ALARM_EVIDENCE_AND_TRIAGE.md` Parts 6 to 8. **Source**: BACKLOG 30; issue #18;
  operator decision 2026-09-05. **Owner**: Claude Code. **Model**: Sonnet.
  **Track**: code complete on `claude/board-batch-4` (0501fc94, a28ab599); the workflow is a
  quiet no-op until `SUBMIT_ALARM_TRIAGE_ROLE_ARN` is set on the environment. Remainder: the
  budget action's subscriber, `<env>-env-bedrock-budget-alerts` in `ObservabilityUE1Stack`, has
  no reader yet (B30m). The `triage` label exists; the role variable and the proof run are
  B30o; the anonymise and draft-PR reversal is B30n. Verified through B30o.
- [ ] **G2c. Plumb the measurement id through `submit.env` and assert a `purchase` row in ci.**
  Replace the hardcoded `G-T81V5NL5MB` in `web/public/lib/analytics.js` with a value read from
  `submit.env` (generated by `deploy.yml`/`deploy-app.yml` from the environment variable), pass
  `GA4_BIGQUERY_DATASET_ID` for ci into `app/functions/analytics/ga4EventExportPull.js`'s
  environment, and extend `paymentBehaviour-ci` (or a post-run step in `synthetic-test.yml`)
  to query the ci dataset for a `purchase` event with the run's transaction id. Behaviour-test
  browsers stub `gtag.js` and `/g/collect` unless `DIY_SUBMIT_ALLOW_REAL_ANALYTICS=true`, and
  Playwright's headless shell reports `HeadlessChrome`, which GA4's bot filter excludes, so the
  assertion run needs a browser that does not. The ci property exists: 552917343, measurement
  id `G-DV0SDVEZWC`, dataset `analytics_552917343`; the sync's dry run does not find the
  BigQuery link it created, which the track fixes in `scripts/ga4-property-sync.js`.
  **Source**: none. **Owner**: Claude Code. **Model**: Sonnet.
  **Track**: code complete on `claude/board-batch-5` (a8304e49, e7d69754). `analytics.js` reads
  `GA4_MEASUREMENT_ID` from `submit.env`; the environment file wins where it is set (prod pins
  `G-T81V5NL5MB`) and the `SUBMIT_GA4_MEASUREMENT_ID` variable fills it otherwise (ci). The ci
  export dataset is `analytics_552917343`. The daily export lags about a day, so the payment
  suite on ci fires a real purchase event and asserts BigQuery for an earlier run's Stripe
  transaction (26 hours to 4 days old), skipping when none exists. Two fixes rode along: the
  sync read `bigQueryLinks` where the API says `bigqueryLinks`, and the content security policy
  allowed only `www.google-analytics.com` while GA4 collects on regional subdomains. Verified
  when a ci probe run after the merge finds a purchase row.
## Ready: Claude Code

## Ready: operator (brief: `../BRIEF_OPERATOR_TASKS_2026-09-04.md`)

- [ ] **B17a.5. Publish the videos** on https://www.youtube.com/@DIYAccountingSubmit with
  titles and descriptions drafted from the captions. The prod recordings are workflow
  artifacts, each with mp4, vtt, transcript and stills and 30-day retention:
  `video-view-obligations-prod` on run 33952515598, `video-submit-return-prod` on run
  33953044775, and `video-view-return-prod` on run 34017736028 (the return on screen is the one
  filed off camera, Box 6 at £5,000). The ITSA Business Details recording is ci-only until the
  activity leaves the gate: `video-itsa-business-details-ci` on run 34002898819. **Source**:
  BACKLOG 17a. **Owner**: Operator (an upload via the YouTube Data API can follow once the
  pattern settles).
- [ ] **O14. Close alarm issue #133.** `prod-app-api-failed` was opened by prod-0f68ed8's
  alarm at creation; that set is gone and prod-0967fab's `api-failed` alarm sat in OK from
  creation, which is what B30l set out to do. **Source**: board render 2026-09-06. **Owner**:
  Operator.
- [ ] **O11. Companies House filing: the developer-hub and ci steps.** On the "DIY Accounting
  Submit - test" application at developer.company-information.service.gov.uk/manage-applications,
  register the redirect URIs `PLAN_COMPANIES_HOUSE_REST_FILING.md` lists (each ends in
  `/companies-house/filingCallback.html`, for localhost:3000, local.submit:3443, ci-submit and
  submit). Put `COMPANIES_HOUSE_CLIENT_ID` (variable) and `COMPANIES_HOUSE_CLIENT_SECRET`
  (secret) on the GitHub `ci` environment. Say whether the application is sandbox-only, which
  decides whether prod needs a second application. The build lands and proves itself on the
  simulator without these; the ci behaviour runs wait on them. **Source**: BACKLOG 34; issue
  #15. **Owner**: Operator.

## Blocked: operator

- [ ] **O12. Close #134 and #135 once the reconcile fix has held.** #134
  `ci-env-dynamodb-customer-table-scan` and #135 `prod-env-dynamodb-customer-table-scan` close
  once B30j's reconcile has deployed to prod and the alarm has stayed OK for a day; the ci one
  also stops being raised at all after B30k. **Source**: board render 2026-09-06. **Owner**:
  Operator. Blocked on the prod environment deploy after PR #137 and a day of OK after it.
- [ ] **O9 / B47. Watch the revived schedules fire on their own**: `codeql` on 2026-09-06 and
  the weekly `compliance` and `stack-drift` crons on Monday 2026-09-07 06:00 UTC. If one
  misses, revive it the same way as on 2026-08-31 and tell Claude Code. **Source**: BACKLOG 47.
  **Owner**: Operator.

## Blocked: Claude Code

- [ ] **B30o. Set `SUBMIT_ALARM_TRIAGE_ROLE_ARN` on prod and prove the triage chain.** ci is
  done: the variable points at `ci-env-alarm-triage-role`, and adding the `triage` label to
  #134 ran the whole chain (run 34016641016: role assumed, guardrail read, comment posted).
  The model call answered 404 until the Anthropic use-case form was submitted through
  `bedrock put-use-case-for-model-access` in both accounts on 2026-09-06. The re-run
  (34024132783) stopped at the day guard, which counted every workflow run including the ones
  the guard or the role check had stopped; on `claude/board-batch-6` the guard counts only
  runs whose `run-triage` job executed. Once that merges, re-label #134 with `triage`. Prod's
  variable is set (`prod-env-alarm-triage-role` exists since run 34023929068 deployed the
  observability stacks). **Source**: BACKLOG 30; issue #18. **Owner**: Claude Code. **Model**:
  Fable (coordinator). Blocked on the batch 6 merge.
- [ ] **G3. Confirm a real `purchase` lands in prod** once G1 and G2c ship: the next live
  checkout should appear in `diyaccounting-ga4.analytics_523400333.events_*`
  (`bq --project_id=diyaccounting-ga4 --location=europe-west2`). No event of that name has
  ever reached the export. **Source**: none. **Owner**: Claude Code (read-only query).
  **Model**: Haiku. Blocked on G1, G2c and a live sale.
## Discipline

(none repo-specific yet — see `../NEXT.md`)
