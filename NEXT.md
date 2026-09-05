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

**Prod runs deployment prod-a0f41c7 (the PR #107 merge, deployed 2026-09-04), the only app
stack set standing; prod-ca55da7 was destroyed by that deploy.** Each extra
`prod-*-app-*` set left after a merge costs $46.88/month until named to `destroy-prod.yml`
(`PLAN_COST_OPTIMISATION.md`). Drift findings live in issue #43.

The board runs in five sections, in this order: in flight; ready for Claude Code; ready for
the operator (each briefed for Claude Cowork in `../BRIEF_OPERATOR_TASKS_2026-09-04.md` at the
workspace root); blocked operator items; blocked Claude Code items.

## In flight

**Resumed 2026-09-05.** Integration branch `claude/board-batch-2` is PR #118 (draft, all checks
green) with five tracks landed; PR #119 (layer 2) and PR #120 (layer 1, stacked on #118) are open
with ci behaviour-suite failures under diagnosis. The two paused tracks resumed from their `-wip`
branches in fresh worktrees.

Each track runs in its own worktree off main; the coordinator merges each landed track into the
batch branch, pushes in batches, and opens the PR. Wave 2 tracks merge the batch branch before
starting.

- [ ] **B17a.1 remainder. Make the video timing check honest about the timer.**
  `scripts/check-video-timings.js` requires `timerMarkers >= 1`, but a script whose only
  backend wait finishes under the 250 ms threshold never draws the timer, so the prod tour run
  (33918880298) printed exit code 1 while `video-capture.yml` marked the step continue-on-error
  and the job green. Require a timer marker only when the timeline records a wait past the
  threshold, and make the step fail the job when a check fails. **Source**: BACKLOG 17a.
  **Owner**: Claude Code. **Model**: Haiku.
  **Track**: timing check (Haiku). Code complete on `claude/board-batch-2` (PR #118): the timer check counts only on-page waits, and the workflow step blocks. Verified when the next `video-capture.yml` run passes the check as a blocking step.
- [ ] **B17a.2. Video: view VAT obligations**, logged in as the synthetic user, using the
  B17a.1 pattern. **Source**: BACKLOG 17a. **Owner**: Claude Code. **Model**: Sonnet.
  **Track**: video auth (Opus). Code complete on `claude/board-batch-2` (PR #118): the capture script signs in through the provider `TEST_AUTH_PROVIDER` names, takes a day pass, authorises with HMRC, and `videos/view-obligations.json` recorded end to end on the simulator variant with the timing check green. The ci recording (run 33948656157) failed before the first frame because the ci deployment had self-destructed overnight and `ci-submit.diyaccounting.co.uk` no longer resolved; the prod recording (run 33948895801) produced the full 132 s mp4 but the blocking timing check failed on `timerMarkers`: four clicks that leave the page waited past the threshold and the overlay cannot draw during a navigation. A Sonnet track (worktree `.claude/worktrees/agent-aa406b7b95b37cc0b`) is making the capture record `navigated` and `timerShown` per step and the check count only on-page waits; then the prod recording re-runs and a passing blocking check verifies this item and B17a.1.
- [ ] **B17a.3. Video: view a submitted VAT return**, same pattern. **Source**: BACKLOG 17a.
  **Owner**: Claude Code. **Model**: Sonnet.
  **Track**: journey videos (Sonnet), both scripts in one track. Worktree `.claude/worktrees/agent-aebb529df95f87b05`, running, stacked on the batch branch.
- [ ] **B17a.4. Video: submit a VAT return** end to end, same pattern. **Source**: BACKLOG 17a.
  **Owner**: Claude Code. **Model**: Sonnet.
  **Track**: journey videos (Sonnet), both scripts in one track. Worktree `.claude/worktrees/agent-aebb529df95f87b05`, running, stacked on the batch branch.
- [ ] **B32.4. Add the three read suites to the 4-hourly synthetic schedule.** Decided
  2026-09-04: `synthetic-test.yml`'s scheduled `SUITES_JSON` gains `getVatLiabilitiesBehaviour`,
  `getVatPaymentsBehaviour` and `getVatPenaltiesBehaviour`. **Source**: BACKLOG 32; issue #19.
  **Owner**: Claude Code. **Model**: Haiku.
  **Track**: synthetic workflow (Sonnet, shared with B39.1). Code complete on `claude/board-batch-2` (PR #118); verified when the next scheduled run on main runs all five suites.
- [ ] **B34.1. Companies House read-only lookup.** Public API key, no accreditation:
  `plans/issues/PLAN_ISSUE_15_limited_company_endpoints.md` describes the lookup half. Company
  search and profile behind an activity, page plus Lambda following the VAT read endpoints'
  shape, simulator route, unit and behaviour tests. **Source**: BACKLOG 34; issue #15.
  **Owner**: Claude Code. **Model**: Sonnet, after an Opus design pass on the API key handling.
  **Track**: Companies House build (Sonnet), resumed from `claude/companies-house-lookup-wip` at step 5 of 7 in worktree `.claude/worktrees/agent-ad6e4d9bbd090c659`, running. Its own PR; deploys once the operator's key (O6) exists.
- [ ] **B39.2. Stop ci deploys from different branches colliding.** Two branches whose names
  share nine cleaned characters (`claude/mode-rename-1-probe`, `claude/mode-rename-2-stripe-flag`)
  both deployed as `ci-claudemod` and overwrote each other, and every deploy repoints the shared
  `ci-submit.diyaccounting.co.uk` apex that the ci behaviour suites hit, so PRs #119 and #120
  failed thirteen ci suites with no code fault. Fix in `get-names`: a per-branch unique name of the
  same length; fix in `deploy.yml`: one concurrency group per target environment so ci deploys
  serialise. **Source**: BACKLOG 39; CI diagnosis 2026-09-05. **Owner**: Claude Code. **Model**:
  Sonnet.
  **Track**: pipeline fix (Sonnet), running, lands on `claude/board-batch-2`; then PRs #119 and #120
  re-run one at a time.
- [ ] **B40d.2. Rename the modes to `synthetic`/`live` and give the monitoring vocabulary a
  new name.** Decided 2026-09-04: `hmrcAccount` sandbox becomes synthetic across
  `web/public/developer-mode.js`, `billingWebhookPost.js:142` (`qualifiers.sandbox`), UI copy
  ("sandbox (test)") and every `HMRC_ACCOUNT`/`allowSandboxObligations` reader; the Stripe
  test flag gets its own field; `synthetic-test.yml`, the synthetic-traffic filters in the
  detectors and analytics, and the `synthetic-*` test users move to a name that does not
  collide (the design pass names it). One PR per rename layer. **Source**: BACKLOG 40d; issue
  #12. **Owner**: Claude Code. **Model**: Opus design, then Sonnet.
  **Tracks**: `PLAN_MODE_RENAME.md` is the design; four Sonnet layers, one PR each. Layer 2 (Stripe flag `stripeTestMode` plus migration 004): code complete on `claude/mode-rename-2-stripe-flag` (PR #119); verified after the operator runs migration 004 dry then real on ci and prod. Layer 1 (monitoring vocabulary to `probe`, plus the four alarm docs the cuts left stale): code complete on `claude/mode-rename-1-probe` (PR #120, stacked on the batch branch); verified after its deploy by the `-github-probe-failed` alarms in OK. Layer 3 (HMRC mode value, migrations 005 and 006): resumed from `claude/mode-rename-3-synthetic-wip` in worktree `.claude/worktrees/agent-a52c3cd4bb3f09447`, running, stacked on layers 1 and 2. Layer 4 (docs and copy) follows, and also recomputes the stale alarm-count arithmetic layer 1 left in `REPORT_ALARM_AUDIT.md` and `PLAN_COST_OPTIMISATION.md`.
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
- [ ] **B39.1. Fix the synthetic runs' "upload web test results" job.** It fails with
  `jq: Could not open file target/behaviour-test-results/<suite>/test-report-<suite>.json`
  after a passing behaviour test (prod dispatches 33908160864 and 33908172202; main's
  scheduled run 33814958075 failed the same way on submitVat), so the per-suite report is
  written elsewhere or not at all in that job. Make the report path and the upload agree
  and add a check that fails early with the paths it looked at. **Source**: BACKLOG 39
  (synthetic-test flakiness); repo find 2026-09-04. **Owner**: Claude Code. **Model**:
  Sonnet.
  **Track**: synthetic workflow (Sonnet, shared with B32.4). Code complete on `claude/board-batch-2` (PR #118): the report file is now named after the suite the workflow passes, and the upload job fails early naming the paths it looked at. Verified when a prod dispatch of `getVatPenaltiesBehaviour` uploads its report.

## Ready: Claude Code

(none)

## Ready: operator (brief: `../BRIEF_OPERATOR_TASKS_2026-09-04.md`)

- [ ] **O1a / G2b bootstrap. Grant the GA4 service account admin once, so every later grant
  is code.** The analytics jobs already run as a Google service account (Secrets Manager
  `GA4_SERVICE_ACCOUNT_ARN`). In GA4 admin give that account the Administrator role on the
  GA4 account, and in GCP project `diyaccounting-ga4` give it Owner (or IAM Admin plus
  BigQuery Admin). This is the last hand grant: after it, O1b applies grants from a file.
  **Source**: none. **Owner**: Operator.
  In the operator brief `../BRIEF_OPERATOR_TASKS_2026-09-04.md`.
- [ ] **O3 / B27c.2. Renew the company's ICO registration.** Registration ZB070902 (the
  certificate PDF in the repo root) expired 2026-05-23 and `privacy.html` still publishes it
  as current, so this is an active gap, not a check. Pay the fee for DIY Accounting Limited
  (06846849) and hand the new number and expiry to Claude Code for
  `_developers/ICO_CHECKLIST.md` and `privacy.html`. **Source**: BACKLOG 27c; Track E finding
  2026-09-03. **Owner**: Operator.
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
- [ ] **O5a / B10a.2. Subscribe the sandbox application to the ITSA APIs.** In the HMRC
  developer hub, subscribe the sandbox app (`HMRC_SANDBOX_CLIENT_ID` in `.env.ci`) to Business
  Details (MTD) and Self Employment Business (MTD). **Source**: BACKLOG 10a. **Owner**:
  Operator.
  In the operator brief `../BRIEF_OPERATOR_TASKS_2026-09-04.md`.
- [ ] **O6 / B34.1. Register two Companies House API keys and add them as GitHub environment
  secrets.** Steps 1 to 7 under "Operator steps" in
  `_developers/backlog/companies-house-api-operations.md`: a developer-hub application and REST key
  per environment, then `COMPANIES_HOUSE_API_KEY` on the `ci` and `prod` GitHub environments, then
  the deploy-environment workflow for each. The lookup PR cannot deploy until this lands. **Source**:
  BACKLOG 34; issue #15. **Owner**: Operator.
- [ ] **B30b remainder, operator. Close the six `[ALARM]` issues for the deleted p95 alarms**:
  #78, #80, #81, #83, #86, #89 (`…-activity-telegram-forwarder-high-duration-p95`). The alarm no
  longer exists after the batch deploys, so no recovery event will close them. **Source**: BACKLOG
  30. **Owner**: Operator.
- [ ] **B34.2. Apply for Companies House software-filing accreditation, for accounts filing.**
  An operator submission with weeks of lead time; the plan doc lists what it asks for. **Source**:
  BACKLOG 34; issue #15. **Owner**: Operator.
  In the operator brief `../BRIEF_OPERATOR_TASKS_2026-09-04.md`.

## Blocked: operator

- [ ] **O5b / B10a.2. Mint an ITSA sandbox test user.** Run the `create-hmrc-test-user`
  workflow on main with `mtd-vat,mtd-income-tax` and keep the credentials artifact (NINO,
  user id, password) somewhere private. **Source**: BACKLOG 10a. **Owner**: Operator. Blocked
  on O5a.
  In the operator brief `../BRIEF_OPERATOR_TASKS_2026-09-04.md`.
- [ ] **O9 / B47. Watch the revived schedules fire on their own**: `codeql` on 2026-09-06 and
  the weekly `compliance` and `stack-drift` crons on Monday 2026-09-07 06:00 UTC. If one
  misses, revive it the same way as on 2026-08-31 and tell Claude Code. **Source**: BACKLOG 47.
  **Owner**: Operator.
- [ ] **B17a.5. Publish the videos** on https://www.youtube.com/@DIYAccountingSubmit with
  titles and descriptions drafted from the captions. **Source**: BACKLOG 17a. **Owner**:
  Operator (an upload via the YouTube Data API can follow once the pattern settles). Blocked
  on B17a.2–4.

## Blocked: Claude Code

- [ ] **O1b / G2b roles-as-code. A role file that CI applies on commit.** Add
  `analytics/google-roles.toml` listing the GA4 account and property access bindings
  (Analytics Admin API `accessBindings`) and the GCP project IAM bindings the analytics work
  needs, a script `scripts/google-roles-apply.js` that reconciles them idempotently with a
  `--dry-run`, and a workflow `google-roles.yml` that dry-runs on pull requests touching the
  file and applies on push to main, authenticating with the service account from Secrets
  Manager via OIDC. **Source**: none. **Owner**: Claude Code. **Model**: Sonnet. Blocked on
  O1a.
- [ ] **O1c / G2b skill. `ga4-property-sync`.** A skill plus `scripts/ga4-property-sync.js`
  that, given an environment name and hostname, finds or creates the GA4 property, its web
  data stream and its BigQuery link (project `diyaccounting-ga4`, `europe-west2`, daily
  export) through the Analytics Admin API, then sets `SUBMIT_GA4_MEASUREMENT_ID` on the
  matching GitHub Environment with `gh variable set`. Dry run first, idempotent by display
  name, never prints credentials. **Source**: none. **Owner**: Claude Code. **Model**: Sonnet.
  Blocked on O1a.
- [ ] **O1d / G2b. Create the ci property with the skill** and record the dataset id.
  **Source**: none. **Owner**: Claude Code. **Model**: Haiku. Blocked on O1c.
- [ ] **B34.3. Companies House accounts filing.** The filing half of the plan doc. **Source**:
  BACKLOG 34; issue #15. **Owner**: Claude Code. **Model**: Opus. Blocked on B34.2.
- [ ] **B43a. GCP billing tidy-up, automated.** In the roles/apply script from O1b (or a
  sibling `scripts/gcp-billing-assert.js`): assert a budget with 50/90/100 percent alerts on
  the billing account that holds `diyaccounting-ga4`, and delete the auto-created project
  `valued-context-507200-m9` after a dry run proves it holds no APIs, datasets, buckets or
  compute. **Source**: BACKLOG 43. **Owner**: Claude Code. **Model**: Sonnet. Blocked on O1a.
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
- [ ] **B10a.3. Make one read-only ITSA sandbox call through our own OAuth and fraud headers.**
  Allow `read:self-assessment` in `web/public/lib/auth-url-builder.js` and the scope
  validation in `app/functions/hmrc/hmrcTokenPost.js` (unit tests exist for scope
  rejection); log in on the proxy variant as the O5 test user; call
  `GET /individuals/business/details/{nino}/list` on `HMRC_SANDBOX_BASE_URI` with the token
  and `app/lib/buildFraudHeaders.js` headers. Write `_developers/hmrc/ITSA_SPIKE.md`:
  the raw response, whether the existing application and headers were accepted, and which of
  `_developers/backlog/self-employed-api-operations.md`'s assumptions held. This is the gate
  for B10. **Source**: BACKLOG 10a; issue #16; `_developers/backlog/self-employed-api-operations.md`.
  **Owner**: Claude Code. **Model**: Opus. Blocked on O5b.
- [ ] **B27c.2 remainder. Record the new ICO registration number and expiry in
  `_developers/ICO_CHECKLIST.md` and `web/public/privacy.html`** once O3 hands them over.
  **Source**: BACKLOG 27c. **Owner**: Claude Code. **Model**: Haiku. Blocked on O3.

Backlog Tier 2 rows 10 and 11 become dispatchable once B10a.3 exists and O4b answers the
production-window question; rows 34 and 40d are now B34.1–3 and B40d.2 above.

## Discipline

(none repo-specific yet — see `../NEXT.md`)
