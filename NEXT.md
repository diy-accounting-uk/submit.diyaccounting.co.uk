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
stack set standing.** A main deploy retires the previous set itself; a `prod-*-app-*` set
left standing by anything else costs $46.88/month until named to `destroy-prod.yml`
(`PLAN_COST_OPTIMISATION.md`). Drift findings live in issue #43.

The board runs in five sections, in this order: in flight; ready for Claude Code; ready for
the operator (each briefed for Claude Cowork in `../BRIEF_OPERATOR_TASKS_2026-09-04.md` at the
workspace root); blocked operator items; blocked Claude Code items.

## In flight

PR #132 merged 2026-09-05; main's deploy (run 33993674183) replaces prod-cea27f8. The two
items below wait on a later event to verify.

- [ ] **B32.4. Add the three read suites to the 4-hourly synthetic schedule.** Decided
  2026-09-04: `synthetic-test.yml`'s scheduled `SUITES_JSON` gains `getVatLiabilitiesBehaviour`,
  `getVatPaymentsBehaviour` and `getVatPenaltiesBehaviour`. **Source**: BACKLOG 32; issue #19.
  **Owner**: Claude Code. **Model**: Haiku.
  **Track**: deployed with PR #118. The renamed `probe-test.yml` missed its first cron slot
  (20:57 UTC on 2026-09-05) because a workflow that has never run under a live actor does not
  fire on schedule; one dispatch on main (run 33992278768) arms it, the same fix as the
  2026-08-31 revival. Verified when the 00:57 UTC slot on 2026-09-06 fires on its own and runs
  all five suites; if it misses, the schedule needs a second look, not another dispatch.
- [ ] **B30d. Make `alarmToGithubIssue.js` dedupe by alarm family.**
  `findOpenIssueByAlarmName` matches the exact `[ALARM] <name>` title, and per-deployment names
  carry the deployment slug, so each new deployment opens a fresh issue for the same check
  (19 of the 30 open alarm issues). Strip the deployment segment before the title search so a
  family comments on one rolling issue; unit test. **Source**: BACKLOG 30; alarm-issue review
  2026-09-05. **Owner**: Claude Code. **Model**: Sonnet.
  **Track**: deployed with PR #118 (`app/lib/alarmName.js` collapses `<env>-<slug>-app-<rest>`
  to `<env>-app-<rest>` for the issue title and search). Verified when the next alarm on
  prod-cea27f8 or ci-claudf375 comments on an existing family issue instead of opening one.
## Ready: Claude Code

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
- [ ] **B10.1 remainder. Record the ITSA Business Details page on ci.** The endpoint, page,
  simulator route and tests merged in PR #132 and `itsaBusinessDetailsBehaviour-ci` is green;
  the last step is a recording of the page in the site-video-capture pattern (`videos/*.json`,
  `auth: "user"`) against a ci deployment, since the activity stays ci-only until the operator
  has examined it (B32.5). Every later ITSA endpoint needs the `businessId` this one returns.
  **Source**: BACKLOG 10; issues #16, #20. **Owner**: Claude Code. **Model**: Sonnet.
- [ ] **O1d / G2b. Create the ci GA4 property with the `ga4-property-sync` skill** (merged in
  PR #132; its dry run plans the property, web stream and BigQuery link) and record the dataset
  id. This is a real write to GA4 and to the `SUBMIT_GA4_MEASUREMENT_ID` GitHub variable.
  **Source**: none. **Owner**: Claude Code. **Model**: Haiku.
- [ ] **B17a.3. Video: view a submitted VAT return**, same pattern. HMRC's sandbox holds no
  return for a fresh test user's canned obligations, so the scene script submits a return for a
  fulfilled period off camera through the submit page's date fields, then records "View Return"
  on that period; that step waits for the page to report the `synthetic` mode, which prod does
  since the PR #118 deploy. Green on the simulator; verified by a prod recording passing the
  blocking check. **Source**: BACKLOG 17a. **Owner**: Claude Code. **Model**: Sonnet.
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
  index or the counter, unit test on the reconcile. Verified when #95 stays in OK across a
  day. **Source**: BACKLOG 30; issue #95; CloudTrail lookup 2026-09-05. **Owner**: Claude
  Code. **Model**: Opus design, then Sonnet.
- [ ] **B30k. ci alarms stop opening GitHub issues.** Every ci alarm issue of 2026-09-05
  (#128, #129, #131) was test churn on a ci set that self-destructs within hours, and ci alarms
  already reach Telegram through the same rule. In `OpsStack.java` the
  `<deployment>-app-alarm-state-change` rule targets both the Telegram forwarder and
  `alarmToGithubIssue`; add the issue Lambda as a target only when `props.envName()` is
  `prod` (the Telegram target stays for both), and pin it with a CDK test that a ci synth has
  one target and a prod synth two. **Source**: BACKLOG 30; operator decision 2026-09-05.
  **Owner**: Claude Code. **Model**: Sonnet.
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
- [ ] **B30i. Alarm triage: Claude Code headless in Actions, on Bedrock.** After B30h. The
  trigger is the issue itself: `alarm-triage.yml` runs on `issues: opened` for issues labelled
  `alarm` (the Lambda in `app/functions/ops/alarmToGithubIssue.js` is not changed), reads the
  alarm name, timestamp, region and deployment from the issue body, and derives the log groups
  with the mapping B30h builds. Repeat alarms only comment on the family issue, so they never
  re-trigger; the operator re-runs one by adding a `triage` label (`issues: labeled`). Budget:
  USD 5 a day. An AWS Budget on Bedrock spend for the account with a daily period and that
  limit, with a budget action that attaches a deny on `bedrock:InvokeModel` to the triage role
  when the figure is crossed, is the hard stop, not an alert. Beneath it the first step counts
  this workflow's runs in the last 24 hours through the GitHub API and exits at three, and
  `concurrency: alarm-triage`, `timeout-minutes`, a pinned Sonnet model and `--max-turns` keep
  a run near a dollar, so the budget action is the backstop, not the normal path. The job checks out the repo, assumes a
  read-only OIDC role scoped to the deployment's log groups, X-Ray and CloudWatch alarm history
  (no customer tables), and runs Claude Code with `CLAUDE_CODE_USE_BEDROCK=1`. Its one write is
  a comment on the issue (or a draft PR when it can name the change): the text passes Bedrock
  Guardrails' sensitive-information filter plus a regex deny-list for IPs, emails, VRNs and
  64-hex hashes before posting, and log content is treated as data, never instructions. Design
  pass first: the alarm-to-log-group mapping shared with B30h, the role's resource list, the
  triage prompt. **Source**: BACKLOG 30; issue #18; operator decision 2026-09-05. **Owner**:
  Claude Code. **Model**: Opus design, then Sonnet.
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
  about five hours after the deploy. When that window has passed with the probe alarm and
  `prod-env-salt-secret-unexpected-read` (#97) in OK, close #97; its last firing was 19:22 UTC
  on 2026-09-05, before the fix reached prod. #95 is B30j's now. **Source**: PR #118.
  **Owner**: Operator.
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
## Discipline

(none repo-specific yet — see `../NEXT.md`)
