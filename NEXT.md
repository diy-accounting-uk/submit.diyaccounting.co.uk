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

- [ ] **B32 verification. Run the new VAT read suites against the real HMRC sandbox.** Run
  on prod 2026-09-04 with the durable synthetic user (`synthetic-test.yml` dispatch, one
  suite each): obligations, view-return and penalties pass; liabilities and payments fail
  only on the audit assertion that reads HMRC's error code from the stored record, which the
  audit repository masks (`***MASKED***`); the fix is PR #115 (message text instead of code); after
  its merge re-dispatch those two suites.
  Green closes B32 and this block. **Source**: BACKLOG 32; issue #19. **Owner**: Claude Code.
  **Model**: Sonnet.

### Block 2 — Operator batch (brief: `../BRIEF_OPERATOR_TASKS_2026-09-04.md`)

Browser and account work a workflow cannot do, plus the decisions that unblock Tier 2. Each
item's steps, URLs and hand-back are in the brief so Claude Cowork can drive the browser. Hand
results back by pasting them into a Claude Code session or appending to the workspace
`INBOX.md`.
- [ ] **B17a.1. Spike: a Playwright pattern for human-audience video, proven on one
  unauthenticated tour of the site, delivered as a GitHub Actions workflow.** Not test
  automation: the viewer is a person. Requirements set 2026-09-04: three consistent
  pacing groups in a config (per typed character; between form cells or clicks; before and
  after a scroll or navigation), with backend wait time subtracted from the configured pause
  and a scaled visible timer shown while waiting; a drawn pointer with trails and an
  emphasis on each action; text annotations from a scene script (`videos/tour.json`: scenes,
  targets, captions, holds) so a UI change means a rerun, not a re-edit; high frame rate
  capture with fine scrubber control (a fixed-cadence frame sequence assembled by ffmpeg
  rather than Playwright's variable-rate webm); 1920x1080 mp4 with a held final frame and
  per-scene stills. The spike records against a local instance for fast iteration; the real
  recording runs as `video-capture.yml` against prod using the HMRC sandbox account and the
  synthetic user. Design first: web research on published guidance for website training and
  demo videos (GOV.UK and WCAG video and caption guidance, pointer emphasis, pacing) feeds
  the design. First video: home, about, guide, help, bundles and accessibility with no login.
  The operator reviews the video and the pattern is refined before the authenticated ones.
  In flight: the design is done (`scratchpad/design-video-capture.md`: CDP screencast with
  per-frame timestamps to 60 fps H.264, captions 40px, no audio, waits compressed 8x past 6 s
  with a real-seconds timer, `ffmpeg-static`, plus a `.vtt` and transcript per video for WCAG
  1.2.1). The Sonnet build was dispatched 2026-09-04 in worktree
  `.claude/worktrees/agent-ad7c8fb3474742b6e` (branch `claude/site-video-capture`); the
  session that dispatched it ended, so the next session checks that worktree's `git log` and
  `git status` first and resumes from the design (also kept at
  `_developers/design/site-video-capture.md`) rather than re-designing. The operator has
  said no further items go in flight without their explicit request. **Source**: BACKLOG 17a; `PLAN_DEMO_VIDEOS.md`. **Owner**: Claude
  Code. **Model**: Opus design, then Sonnet.

## Ready: Claude Code

- [ ] **B34.1. Companies House read-only lookup.** Public API key, no accreditation:
  `plans/issues/PLAN_ISSUE_15_limited_company_endpoints.md` describes the lookup half. Company
  search and profile behind an activity, page plus Lambda following the VAT read endpoints'
  shape, simulator route, unit and behaviour tests. **Source**: BACKLOG 34; issue #15.
  **Owner**: Claude Code. **Model**: Sonnet, after an Opus design pass on the API key handling.
- [ ] **B40d.2. Rename the modes to `synthetic`/`live` and give the monitoring vocabulary a
  new name.** Decided 2026-09-04: `hmrcAccount` sandbox becomes synthetic across
  `web/public/developer-mode.js`, `billingWebhookPost.js:142` (`qualifiers.sandbox`), UI copy
  ("sandbox (test)") and every `HMRC_ACCOUNT`/`allowSandboxObligations` reader; the Stripe
  test flag gets its own field; `synthetic-test.yml`, the synthetic-traffic filters in the
  detectors and analytics, and the `synthetic-*` test users move to a name that does not
  collide (the design pass names it). One PR per rename layer. **Source**: BACKLOG 40d; issue
  #12. **Owner**: Claude Code. **Model**: Opus design, then Sonnet.
- [ ] **B30b. Cut the alarms and canary runs the audit shows are dead weight.** From B30a:
  drop or merge check types that never fire in CDK (`Lambda.java`), fold the five
  `AsyncApiLambda` alarm triples into their stack composite (`PLAN_ALARM_CONSOLIDATION.md`
  open item 2, one alert for stuck queue plus broken worker), and set the canary interval and
  synthetic cron so they do not both cover the same 4-hour window. Keep every alarm the
  routing rule or a runbook reads. CDK tests updated; `./mvnw clean verify`. The audit
  (`_developers/ALARM_AUDIT_2026-09.md`) found 141 of 146 alarms never fired in 90 days and the
  five that did are detection or analytics alarms with open issues. **Source**: BACKLOG 30;
  `PLAN_ALARM_CONSOLIDATION.md`. **Owner**: Claude Code. **Model**: Opus.
- [ ] **B39.1. Fix the synthetic runs' "upload web test results" job.** It fails with
  `jq: Could not open file target/behaviour-test-results/<suite>/test-report-<suite>.json`
  after a passing behaviour test (prod dispatches 33908160864 and 33908172202; main's
  scheduled run 33814958075 failed the same way on submitVat), so the per-suite report is
  written elsewhere or not at all in that job. Make the report path and the upload agree
  and add a check that fails early with the paths it looked at. **Source**: BACKLOG 39
  (synthetic-test flakiness); repo find 2026-09-04. **Owner**: Claude Code. **Model**:
  Sonnet.
- [ ] **B40f. Make the Express dev server answer uncaught handler errors as JSON.** When
  `getAsyncRequest` threw `ResourceNotFoundException` locally, `app/bin/server.js` returned
  Express's default HTML 500 page and the page failed on `Unexpected token '<'`; the API rule
  is JSON always, and the deployed Lambdas already answer through `httpResponseHelper.js`. Add
  a JSON error handler to the dev server and a system test that a throwing route returns a
  JSON 500. **Source**: repo find 2026-09-03 fixing B32. **Owner**: Claude Code. **Model**:
  Haiku.

## Ready: operator (brief: `../BRIEF_OPERATOR_TASKS_2026-09-04.md`)

- [ ] **B12c. Land the `resident-itsa` Stripe price ids.** Both modes done 2026-09-04 with the
  `stripe-catalogue-sync` skill: test `price_1UC216FdFHdRoTOjCEixPiQL`, live
  `price_1UC2SqCD0Ld2ukzIiRyB0xmy`; PR #114 carries them in `.env.ci` and `.env.prod` and
  awaits merge. Day pass numbers (3 tokens, 100 concurrent) stand unless the operator gives
  new ones. **Source**: BACKLOG 12. **Owner**: Operator merges. **Model**: —.
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

### Block 3 — opens as Blocks 1 and 2 land

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
- [ ] **B32.4. Add the three read suites to the 4-hourly synthetic schedule.** Decided
  2026-09-04: `synthetic-test.yml`'s scheduled `SUITES_JSON` gains `getVatLiabilitiesBehaviour`,
  `getVatPaymentsBehaviour` and `getVatPenaltiesBehaviour`. **Source**: BACKLOG 32; issue #19.
  **Owner**: Claude Code. **Model**: Haiku. Blocked on the B32 verification.
- [ ] **B17a.2. Video: view VAT obligations**, logged in as the synthetic user, using the
  B17a.1 pattern. **Source**: BACKLOG 17a. **Owner**: Claude Code. **Model**: Sonnet. Blocked
  on B17a.1.
- [ ] **B17a.3. Video: view a submitted VAT return**, same pattern. **Source**: BACKLOG 17a.
  **Owner**: Claude Code. **Model**: Sonnet. Blocked on B17a.1.
- [ ] **B17a.4. Video: submit a VAT return** end to end, same pattern. **Source**: BACKLOG 17a.
  **Owner**: Claude Code. **Model**: Sonnet. Blocked on B17a.1.
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

Backlog Tier 2 rows 10 and 11 become dispatchable once B10a.3 exists and O4b answers the
production-window question; rows 34 and 40d are now B34.1–3 and B40d.2 above.

## Discipline

(none repo-specific yet — see `../NEXT.md`)
