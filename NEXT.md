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

**Prod runs deployment prod-ca55da7, the only app stack set standing; main's deploy run
33903534280 (the PR #107 merge) is queued and will replace it.** Each extra
`prod-*-app-*` set left after a merge costs $46.88/month until named to `destroy-prod.yml`
(`PLAN_COST_OPTIMISATION.md`). Drift findings live in issue #43.

The board is sequenced in three blocks. Block 1 holds what is still in flight from the
2026-09-03 batch (PR #107, merged 2026-09-04). Block 2 is the operator batch, briefed for
Claude Cowork in `_developers/COWORK_BRIEF_OPERATOR_BATCH.md`. Block 3 is everything the
first two blocks unblock.

### Block 1 — in flight

- [ ] **B32 verification. Run the new VAT read suites against the real HMRC sandbox.** The
  liabilities, payments and penalties endpoints (B32.1–3) are merged and green in every
  simulator lane, but their real-sandbox lanes ran only through hand dispatches that kept
  hitting the non-prod 2-hour self-destruct and, overnight, `npm ci` timeouts on the runners.
  Once main's deploy 33903534280 completes, dispatch `synthetic-test.yml` on main once per
  suite (`getVatObligationsBehaviour`, `getVatReturnBehaviour`, `getVatLiabilitiesBehaviour`,
  `getVatPaymentsBehaviour`, `getVatPenaltiesBehaviour`; environment auto = prod, durable
  synthetic user) and record each result. Green closes B32 and this block. **Source**: BACKLOG
  32; issue #19. **Owner**: Claude Code. **Model**: Haiku.

### Block 2 — Operator batch (brief: `_developers/COWORK_BRIEF_OPERATOR_BATCH.md`)

Browser and account work a workflow cannot do, plus the decisions that unblock Tier 2. Each
item's steps, URLs and hand-back are in the brief so Claude Cowork can drive the browser. Hand
results back by pasting them into a Claude Code session or appending to the workspace
`INBOX.md`.

- [ ] **O1a / G2b bootstrap. Grant the GA4 service account admin once, so every later grant
  is code.** The analytics jobs already run as a Google service account (Secrets Manager
  `GA4_SERVICE_ACCOUNT_ARN`). In GA4 admin give that account the Administrator role on the
  GA4 account, and in GCP project `diyaccounting-ga4` give it Owner (or IAM Admin plus
  BigQuery Admin). This is the last hand grant: after it, O1b applies grants from a file.
  **Source**: none. **Owner**: Operator.
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
- [ ] **B12c. Create the Stripe prices for `resident-itsa` with the `stripe-catalogue-sync`
  skill.** Test mode done 2026-09-04: product `prod_VCQszJB80cZ8X7`, price
  `price_1UC216FdFHdRoTOjCEixPiQL` (£0.99/month), recorded on branch
  `claude/resident-itsa-price-ids`. Live mode waits for the operator's separate go; its dry
  run shows the same single product and price to create. Then land both ids in `.env.ci` and
  `.env.prod` by PR. Confirm the day pass numbers (3 tokens, 100 concurrent) or give new ones
  for B12a. **Source**: BACKLOG 12. **Owner**: Claude Code, with the operator's go for live
  mode. **Model**: Haiku.
- [ ] **O3 / B27c.2. Renew the company's ICO registration.** Registration ZB070902 (the
  certificate PDF in the repo root) expired 2026-05-23 and `privacy.html` still publishes it
  as current, so this is an active gap, not a check. Pay the fee for DIY Accounting Limited
  (06846849) and hand the new number and expiry to Claude Code for
  `_developers/ICO_CHECKLIST.md` and `privacy.html`. **Source**: BACKLOG 27c; Track E finding
  2026-09-03. **Owner**: Operator.
- [ ] **O4a / B11a.2. Obtain the ITSA recognition questionnaire from HMRC SDST** if it is not
  on the hub (the VAT ones arrived by email; see `_developers/hmrc/hmrc_questionnaire_*`) and
  drop it into `_developers/hmrc/`. **Source**: BACKLOG 11a. **Owner**: Operator.
- [ ] **O4b / B11a.2. Ask HMRC whether a 2027-28 production-credential window opens for new
  ITSA quarterly-update products.** HMRC's pages say the 2026-27 window is closed to new
  products (`_developers/hmrc/ITSA_MINIMUM_FUNCTIONALITY_STANDARDS.md`; vendor contact
  makingtaxdigital-softwarevendors@hmrc.gov.uk). The answer decides whether backlog rows 10
  and 11 keep their April 2027 target. **Source**: BACKLOG 11a. **Owner**: Operator.
- [ ] **O5a / B10a.2. Subscribe the sandbox application to the ITSA APIs.** In the HMRC
  developer hub, subscribe the sandbox app (`HMRC_SANDBOX_CLIENT_ID` in `.env.ci`) to Business
  Details (MTD) and Self Employment Business (MTD). **Source**: BACKLOG 10a. **Owner**:
  Operator.
- [ ] **O5b / B10a.2. Mint an ITSA sandbox test user.** Run the `create-hmrc-test-user`
  workflow on main with `mtd-vat,mtd-income-tax` and keep the credentials artifact (NINO,
  user id, password) somewhere private. **Source**: BACKLOG 10a. **Owner**: Operator. Blocked
  on O5a.
- [ ] **B34.1. Companies House read-only lookup.** Public API key, no accreditation:
  `plans/issues/PLAN_ISSUE_15_limited_company_endpoints.md` describes the lookup half. Company
  search and profile behind an activity, page plus Lambda following the VAT read endpoints'
  shape, simulator route, unit and behaviour tests. **Source**: BACKLOG 34; issue #15.
  **Owner**: Claude Code. **Model**: Sonnet, after an Opus design pass on the API key handling.
- [ ] **B34.2. Apply for Companies House software-filing accreditation, for accounts filing.**
  An operator submission with weeks of lead time; the plan doc lists what it asks for. **Source**:
  BACKLOG 34; issue #15. **Owner**: Operator.
- [ ] **B34.3. Companies House accounts filing.** The filing half of the plan doc. **Source**:
  BACKLOG 34; issue #15. **Owner**: Claude Code. **Model**: Opus. Blocked on B34.2.
- [ ] **B40d.2. Rename the modes to `synthetic`/`live` and give the monitoring vocabulary a
  new name.** Decided 2026-09-04: `hmrcAccount` sandbox becomes synthetic across
  `web/public/developer-mode.js`, `billingWebhookPost.js:142` (`qualifiers.sandbox`), UI copy
  ("sandbox (test)") and every `HMRC_ACCOUNT`/`allowSandboxObligations` reader; the Stripe
  test flag gets its own field; `synthetic-test.yml`, the synthetic-traffic filters in the
  detectors and analytics, and the `synthetic-*` test users move to a name that does not
  collide (the design pass names it). One PR per rename layer. **Source**: BACKLOG 40d; issue
  #12. **Owner**: Claude Code. **Model**: Opus design, then Sonnet.
- [ ] **B43a. GCP billing tidy-up, automated.** In the roles/apply script from O1b (or a
  sibling `scripts/gcp-billing-assert.js`): assert a budget with 50/90/100 percent alerts on
  the billing account that holds `diyaccounting-ga4`, and delete the auto-created project
  `valued-context-507200-m9` after a dry run proves it holds no APIs, datasets, buckets or
  compute. **Source**: BACKLOG 43. **Owner**: Claude Code. **Model**: Sonnet. Blocked on O1a.
- [ ] **O9 / B47. Watch the revived schedules fire on their own**: `codeql` on 2026-09-06 and
  the weekly `compliance` and `stack-drift` crons on Monday 2026-09-07 06:00 UTC. If one
  misses, revive it the same way as on 2026-08-31 and tell Claude Code. **Source**: BACKLOG 47.
  **Owner**: Operator.
- [ ] **B32.4. Add the three read suites to the 4-hourly synthetic schedule.** Decided
  2026-09-04: `synthetic-test.yml`'s scheduled `SUITES_JSON` gains `getVatLiabilitiesBehaviour`,
  `getVatPaymentsBehaviour` and `getVatPenaltiesBehaviour`. **Source**: BACKLOG 32; issue #19.
  **Owner**: Claude Code. **Model**: Haiku. Blocked on the B32 verification.
- [ ] **O10 / B17a. Re-record and publish the demo videos** on
  https://www.youtube.com/@DIYAccountingSubmit, capturing the main site rather than the
  simulator. **Source**: BACKLOG 17a; `PLAN_DEMO_VIDEOS.md`. **Owner**: Operator (Claude Code
  excluded by directive 2026-08-26).

### Block 3 — opens as Blocks 1 and 2 land

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
- [ ] **B30b. Cut the alarms and canary runs the audit shows are dead weight.** From B30a:
  drop or merge check types that never fire in CDK (`Lambda.java`), fold the five
  `AsyncApiLambda` alarm triples into their stack composite (`PLAN_ALARM_CONSOLIDATION.md`
  open item 2, one alert for stuck queue plus broken worker), and set the canary interval and
  synthetic cron so they do not both cover the same 4-hour window. Keep every alarm the
  routing rule or a runbook reads. CDK tests updated; `./mvnw clean verify`. The audit
  (`_developers/ALARM_AUDIT_2026-09.md`) found 141 of 146 alarms never fired in 90 days and the
  five that did are detection or analytics alarms with open issues. **Source**: BACKLOG 30;
  `PLAN_ALARM_CONSOLIDATION.md`. **Owner**: Claude Code. **Model**: Opus.
- [ ] **B40f. Make the Express dev server answer uncaught handler errors as JSON.** When
  `getAsyncRequest` threw `ResourceNotFoundException` locally, `app/bin/server.js` returned
  Express's default HTML 500 page and the page failed on `Unexpected token '<'`; the API rule
  is JSON always, and the deployed Lambdas already answer through `httpResponseHelper.js`. Add
  a JSON error handler to the dev server and a system test that a throwing route returns a
  JSON 500. **Source**: repo find 2026-09-03 fixing B32. **Owner**: Claude Code. **Model**:
  Haiku.
- [ ] **B27c.2 remainder. Record the new ICO registration number and expiry in
  `_developers/ICO_CHECKLIST.md` and `web/public/privacy.html`** once O3 hands them over.
  **Source**: BACKLOG 27c. **Owner**: Claude Code. **Model**: Haiku. Blocked on O3.

Backlog Tier 2 rows 10 and 11 become dispatchable once B10a.3 exists and O4b answers the
production-window question; rows 34 and 40d are now B34.1–3 and B40d.2 above.

## Discipline

(none repo-specific yet — see `../NEXT.md`)
