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

`claude/board-batch-3` is PR #132, merged with main. Two PR #118 items below still wait on a
later event to verify.

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
  service account plans the ci property, its data stream and BigQuery link. On PR #132.
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
  **Track**: ITSA business details (Sonnet). On PR #132: handler in the VAT reads'
  async shape, `buildHmrcHeaders` takes an API version, NINO validation, simulator route and
  scenarios, the Business Details page, and unit, system, browser and behaviour tests (1343,
  153, 69, simulator lane 1 passed; CDK 94), all on PR #132 with its
  `itsaBusinessDetailsBehaviour-ci` job in `deploy.yml`. Verified when that job is green on the
  PR's ci deploy; then a prod recording of the page is the next video.
- [ ] **B32.4. Add the three read suites to the 4-hourly synthetic schedule.** Decided
  2026-09-04: `synthetic-test.yml`'s scheduled `SUITES_JSON` gains `getVatLiabilitiesBehaviour`,
  `getVatPaymentsBehaviour` and `getVatPenaltiesBehaviour`. **Source**: BACKLOG 32; issue #19.
  **Owner**: Claude Code. **Model**: Haiku.
  **Track**: deployed with PR #118; verified when the next scheduled probe run on main
  (`57 */4 * * *` UTC) runs all five suites.
- [ ] **B30d. Make `alarmToGithubIssue.js` dedupe by alarm family.**
  `findOpenIssueByAlarmName` matches the exact `[ALARM] <name>` title, and per-deployment names
  carry the deployment slug, so each new deployment opens a fresh issue for the same check
  (19 of the 30 open alarm issues). Strip the deployment segment before the title search so a
  family comments on one rolling issue; unit test. **Source**: BACKLOG 30; alarm-issue review
  2026-09-05. **Owner**: Claude Code. **Model**: Sonnet.
  **Track**: deployed with PR #118 (`app/lib/alarmName.js` collapses `<env>-<slug>-app-<rest>`
  to `<env>-app-<rest>` for the issue title and search). Verified when the next alarm on
  prod-cea27f8 or ci-claudf375 comments on an existing family issue instead of opening one.
- [ ] **B34.1 remainder. `deploy.yml` runs `companiesHouseBehaviour-ci`.** The lookup is live
  in prod (prod-cea27f8, `CompaniesHouseStack`); PR #132 adds the job, shaped like the other
  probe suites. Verified when it is green on the PR's ci deploy. **Source**: BACKLOG 34; issue
  #15. **Owner**: Claude Code. **Model**: Haiku.
## Ready: Claude Code

- [ ] **B17a.3. Video: view a submitted VAT return**, same pattern. HMRC's sandbox holds no
  return for a fresh test user's canned obligations, so the scene script submits a return for a
  fulfilled period off camera through the submit page's date fields, then records "View Return"
  on that period; that step waits for the page to report the `synthetic` mode, which prod does
  since the PR #118 deploy. Green on the simulator; verified by a prod recording passing the
  blocking check. **Source**: BACKLOG 17a. **Owner**: Claude Code. **Model**: Sonnet.
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
  four B30e alarms (#95, #97, #128, #129) in OK, close those four issues; #95 went to ALARM at
  20:05 UTC on 2026-09-05 because migration 006's scan of `prod-env-bundles` is exactly what
  that detector counts, so it returns to OK on its own. Close #131 now: it is the self-destruct
  log-errors check on ci-claudeboa, a set built before the fix that is self-destructing.
  **Source**: PR #118. **Owner**: Operator.
- [ ] **B30f. Post the HMRC answer on issue #111 and decide whether the customer needs a reply.**
  `prod-env-hmrc-api-requests` shows a live customer (no `test_` prefix, no test scenario) getting
  HTTP 403 "The client and/or agent is not authorised" from HMRC on the obligations lookup at
  2026-09-03 21:44:22 UTC (request 23143b62-e10c-4309-b76c-89f8512a0a13), retried at 21:46 and
  21:48 with the same answer; the submission failure the alarm counted at 21:30 sits in the same
  session. That message is HMRC saying the customer's Government Gateway account is not enrolled
  for MTD VAT or has not granted this application authority, not a fault in our code. Paste the
  finding on #111, and if the support mailbox has a matching enquiry, reply with the enrolment
  and authority steps. The lookup that found all this is the
  `vat-submission-failure-alarm-user-lookup` skill; the customer's identity is in the chat
  record of 2026-09-05, not here. **Source**: BACKLOG 30; issue #111. **Owner**: Operator.
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
## Discipline

(none repo-specific yet — see `../NEXT.md`)
