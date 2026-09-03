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

**Prod runs deployment prod-6f1779b, the only app stack set standing.** Each extra
`prod-*-app-*` set left after a merge costs $46.88/month until named to `destroy-prod.yml`
(`PLAN_COST_OPTIMISATION.md`). Drift findings live in issue #43.

The board is sequenced in three blocks. Block 1 is the Claude Code batch dispatched
2026-09-03. Block 2 is the operator batch that runs alongside it, briefed for Claude Cowork in
`_developers/COWORK_BRIEF_OPERATOR_BATCH.md`. Block 3 is everything the first two blocks
unblock.

### Block 1 — Claude Code batch (dispatched 2026-09-03)

Each track is an isolated worktree on its own `claude/*` branch, one PR per track with one
commit per item, in the order listed. Tracks A, C and D touch some of the same pages in
different regions (`submitVat.html`, `bundles.html`, `billingCheckoutPost.js`,
`behaviour-helpers.js`); each brief names its region and the coordinator rebases at PR time.

| Track | Model | Items, in order | Status |
|---|---|---|---|
| A funnel | Opus | G1, G2a | started |
| B vat-reads | Opus | B32b, B32.1, B32.2, B32.3 | started |
| C catalogue-hygiene | Sonnet | B12a, B12b, B40e, B40a | started |
| D accessibility | Opus | B27d, B27b.1, B27b.2, B27b.3 | started |
| F itsa-test-user | Sonnet | B10a.1 | PR #104 open, awaiting merge |
| G alarm-audit | Haiku | B30a | started |
| H privacy-fixes | Sonnet | B27c.3, B27c.4 | started |
| I pipeline-cuts | Sonnet | B32a.2 | started |

#### Track A — GA4 purchase funnel

- [ ] **G1. Tag the Stripe purchase as the GA4 `purchase` event.** Today `purchase` fires in
  `web/public/hmrc/vat/submitVat.html` `displayReceipt()` (lines ~1010–1024) with `value: 0`,
  and nothing fires when a Stripe checkout completes (`bundles.html?checkout=success`, lines
  ~1217–1235, only shows a status line). Do it client-side on the redirect, which has the
  consent state: append `&session_id={CHECKOUT_SESSION_ID}` to `success_url` in
  `app/functions/billing/billingCheckoutPost.js:116`; add `billingCheckoutSessionGet.js`
  (`GET /api/v1/billing/checkout-session/{id}`, owner-checked against the session's
  `metadata.hashedSub`, returns `amount_total`, `currency`, `bundleId`) with its Express route,
  CDK function and unit test following the other billing Lambdas; `bundles.html` calls it and
  fires `purchase` with `transaction_id` = session id, `value` = amount/100, `currency`, one
  item = the bundle. Move `begin_checkout` from `handleFormSubmission` in `submitVat.html`
  (lines ~705–719) to the checkout click in `bundles.html`. Retag the VAT submission as
  `submit_vat_return` so the funnel stays visible. Done when `npm test` passes and a proxy run
  of `paymentBehaviour` shows the three events in the `dataLayer`.
  **Source**: none (found 2026-09-02 verifying the purchase event). **Owner**: Claude Code.
  **Model**: Opus.
- [ ] **G2a. Find why consented synthetic traffic never reaches the GA4 export.** Synthetic
  runs call `consentToDataCollection` yet none of their page views appear in
  `diyaccounting-ga4.analytics_523400333.events_*` (4 `submitVat.html` views since
  2026-08-25, all real users). Candidates: headless Chromium blocking `gtag/js`, the beacon
  lost when Playwright closes the page, a GA4 property filter, or consent granted after
  `config`. Reproduce locally with `paymentBehaviour-proxy` and the GA4 DebugView (or a
  request log on `google-analytics.com/g/collect`), name the cause, and fix it in
  `web/public/lib/analytics.js` or the test helpers. Done when a ci run's hits show in
  DebugView. **Source**: none (same finding). **Owner**: Claude Code. **Model**: Opus.

#### Track B — VAT read endpoints (B32, B32b)

- [ ] **B32b. Gate obligations and view-return by activity.** `requireActivity()` from
  `_developers/backlog/vat-api-operations.md` was never built; `hmrcVatObligationGet.js:148`
  and `hmrcVatReturnGet.js:158` call `enforceBundles(event)` only. Check whether
  `enforceBundles` (`app/services/bundleManagement.js:122`) tests the caller's bundles against
  the catalogue's `bundlesForActivity("vat-obligations")`/`("view-vat-return")`; if not, add
  that check to both handlers (403 with a JSON reason, matching `hmrcVatReturnPost.js`) and
  unit-test it. Usage is already known (2026-08-06→31: obligations 616 calls / 208 users,
  view-return 199 / 122), so no query step. **Source**: BACKLOG 32b;
  `_developers/backlog/vat-api-operations.md`. **Owner**: Claude Code. **Model**: Sonnet.
- [ ] **B32.1. VAT liabilities page and Lambda.** `hmrcVatLiabilitiesGet.js` calling
  `GET /organisations/vat/{vrn}/liabilities` with fraud headers, following
  `hmrcVatObligationGet.js` (stub via `TEST_VAT_LIABILITY`, simulator route, CDK function and
  API route in `HmrcStack.java`/`ApiStack`, `Gov-Test-Scenario` passthrough);
  `web/public/hmrc/vat/vatLiabilities.html` following `vatObligations.html` (OAuth with
  `read:vat`, table, empty state, back link); unit tests; `vatLiabilities.behaviour.test.js`
  with `-proxy`/`-simulator`/`-ci` variants and a `synthetic-test.yml` entry. This one sets
  the pattern for B32.2 and B32.3. **Source**: BACKLOG 32; issue #19;
  `_developers/backlog/vat-api-operations.md`. **Owner**: Claude Code. **Model**: Opus.
- [ ] **B32.2. VAT payments page and Lambda**, same shape as B32.1 for
  `GET /organisations/vat/{vrn}/payments`. **Source**: BACKLOG 32; issue #19. **Owner**: Claude
  Code. **Model**: Sonnet. Follows B32.1 in the same track.
- [ ] **B32.3. VAT penalties page and Lambda**, same shape for
  `GET /organisations/vat/{vrn}/penalties`, plus `_developers/hmrc/HMRC_MTD_API_APPROVAL_SUBMISSION.md`
  and `guide.html`/`help.html` sections listing all three. **Source**: BACKLOG 32; issue #19.
  **Owner**: Claude Code. **Model**: Sonnet. Follows B32.2 in the same track.

#### Track C — Catalogue and hygiene (B12, B40e, B40a)

- [ ] **B12a. Line the `day-guest` bundle up with the strategy's day pass.**
  `web/public/submit.catalogue.toml` already gives `day-guest` one active allocation per user,
  `cap = 100` concurrent, `timeout = "P1D"` and `tokensGranted = 3`, which is the day pass
  as STRATEGY.md defines it. Rename its display `name` to "Day pass", make the bundles page
  and `about.html`/`guide.html` copy say "day pass", and add a unit test that
  `bundlePost.js` refuses a second `day-guest` request from the same user within the day
  (`incrementCounter` and the one-per-user rule, lines ~389–408). **Source**: BACKLOG 12;
  STRATEGY.md pricing table. **Owner**: Claude Code. **Model**: Sonnet.
- [ ] **B12b. Add the `resident-itsa` bundle.** Catalogue entry mirroring `resident-vat`
  (£0.99/month, `tokensGranted = 100`, monthly refresh) granting a `self-employed` activity
  that the ITSA pages will claim; listed on `bundles.html` and priced through the existing
  `STRIPE_[TEST_]PRICE_ID_RESIDENT_ITSA` convention in
  `app/functions/billing/billingCheckoutPost.js:resolveStripePriceId()`; webhook
  `metadata.bundleId` already carries the id. Hide it in prod (`listedInEnvironments`) until
  B10 lands. The price ids themselves arrive from B12c. **Source**: BACKLOG 12; STRATEGY.md.
  **Owner**: Claude Code. **Model**: Sonnet.
- [ ] **B40e. Port the friendly-error branches, then delete the dead `submitVat` copy.** In
  `web/public/hmrc/vat/submitVat.html` the inline `submitVat` (lines ~930–1000) is
  overwritten at runtime by the module export from `web/public/lib/services/hmrc-service.js:244-297`,
  so its `tokens_exhausted` (~972–982) and `hmrc_scope_insufficient` (~984–991) messages never
  show; the backend still emits both reasons (`hmrcVatReturnPost.js:577`,
  `app/lib/hmrcValidation.js:342`). Add those two cases to `hmrc-service.js` with unit tests,
  then delete the inline copy, `submitVatWithCalculatedHeaders`'s call into it (~901–928) and
  the `window.submitVat = submitVat` at ~1175. **Source**: BACKLOG 40e. **Owner**: Claude Code.
  **Model**: Sonnet.
- [ ] **B40a. Per-run ports for local behaviour tests.** Dynalite already takes
  `DYNAMODB_PORT=0` for an ephemeral port (`app/bin/dynamodb.js:46-48`,
  `behaviour-tests/helpers/behaviour-helpers.js:62-64`) but `.env.simulator` pins
  `TEST_SERVER_HTTP_PORT=3000`, `TEST_HTTP_SIMULATOR_PORT=9000` and dynalite 9001, and
  `scripts/start-simulator.sh` polls `localhost:9000/health`. Let `0` mean ephemeral for the
  server (`app/bin/server.js:244`) and the simulator (`app/http-simulator/server.js:79`),
  propagate the chosen ports to the spawned processes and the Playwright base URL in
  `behaviour-helpers.js`, and make `start-simulator.sh` read the chosen port. Done when two
  `npm run test:submitVatBehaviour-simulator` runs started together both pass. **Source**:
  BACKLOG 40a. **Owner**: Claude Code. **Model**: Sonnet.

#### Track D — Accessibility (B27d, B27b)

- [ ] **B27d. Fix the text-spacing clipping regression.** `npm run
  accessibility:text-spacing-prod` fails all 24 pages with `body (X overflow)`: with the WCAG
  1.4.12 overrides injected by `scripts/text-spacing-test.js` (lines 81–90), some element with
  `overflow: hidden` on every page clips. Reproduce on `-proxy`, find the shared CSS rule in
  `web/public/css/` (never `web/public-simulator/`), fix it, re-run, and refresh
  `web/public/tests/accessibility/text-spacing-results.json`. **Source**: BACKLOG 27d.
  **Owner**: Claude Code. **Model**: Sonnet.
- [ ] **B27b.1. Re-run the automated WCAG 2.2 AA scans and fix what they find.** After B27d:
  `npm run accessibility:proxy-report` (pa11y, axe 2.1/2.2, Lighthouse, text-spacing) against
  the proxy variant, fix every finding in `web/public/`, and refresh the committed results
  under `web/public/tests/accessibility/`. **Source**: BACKLOG 27b;
  `_developers/hmrc/hmrc_questionnaire_2_WCAG_2.1_AA_diy_accounting_limited_v2.md`. **Owner**:
  Claude Code. **Model**: Sonnet. Follows B27d in the same track.
- [ ] **B27b.2. Manual review of the criteria WCAG 2.2 added** (2.4.11 focus not obscured,
  2.5.7 dragging, 2.5.8 target size 24px, 3.2.6 consistent help, 3.3.7 redundant entry, 3.3.8
  accessible authentication) across the 24 pages in `scripts/text-spacing-test.js:51-77`,
  using Playwright to measure targets and focus visibility. Fix failures; record each
  criterion's evidence in a new `_developers/hmrc/WCAG_2.2_AA_EVIDENCE.md`. **Source**:
  BACKLOG 27b. **Owner**: Claude Code. **Model**: Opus.
- [ ] **B27b.3. Refresh `web/public/accessibility.html`**: results table and date (currently
  "January 14, 2026"), and the `<meta name="description">` at line 9 that still says WCAG 2.1
  while the body claims 2.2 AA. **Source**: BACKLOG 27b. **Owner**: Claude Code. **Model**:
  Haiku. Follows B27b.1 and B27b.2 in the same track.

#### Track F — ITSA test user (B10a.1)

- [ ] **B10a.1. Make the `create-hmrc-test-user` workflow honour its `service-names` input.**
  `.github/workflows/create-hmrc-test-user.yml` offers `mtd-vat,mtd-income-tax` (lines
  16–23) but never passes the choice to `scripts/create-hmrc-test-user.js`, whose `main()`
  calls `createHmrcTestUser(id, secret)` with no options, so `serviceNames` always defaults to
  `["mtd-vat"]`. Wire the input through as an env var, read it in `main()`, and add a unit
  test that the request body carries both services. Also surface the NINO in the job summary
  and artifact alongside the VRN. Unblocks B10a.2 the moment its PR merges. **Source**:
  BACKLOG 10a; repo find 2026-09-03. **Owner**: Claude Code. **Model**: Sonnet.

#### Track G — Alarm audit (B30a)

- [ ] **B30a. Alarm history audit.** Read-only: for every prod `check-*` alarm (151, four per
  Lambda from `infra/.../constructs/Lambda.java:138-227`: errors, throttles, p95 duration,
  log-errors) and the 15 `AsyncApiLambda` extras, pull `describe-alarm-history` for the last
  90 days and write `_developers/ALARM_AUDIT_2026-09.md`: a table by check type of alarms that
  never changed state, ones that only flap on deploys, and ones that fired for a real fault;
  plus the canary picture (`OpsStack` canaries at `rate(51 minutes)`, `synthetic-test.yml`
  cron `57 */4 * * *`, `github-synthetic-failed` on a 2-hour period).
  **Source**: BACKLOG 30; `PLAN_ALARM_CONSOLIDATION.md` open item 1. **Owner**: Claude Code.
  **Model**: Haiku.

#### Track H — Privacy page and receipts retention (B27c remainder)

- [ ] **B27c.3. Fix what the ICO checklist found in code.** `_developers/ICO_CHECKLIST.md`
  lists: the receipts table never had TTL enabled (`app/data/dynamoDbReceiptRepository.js:46-49`
  computes a 7-year TTL, `infra/.../stacks/DataStack.java:101-111` never calls
  `ensureTimeToLive` for it, unlike every other table with a TTL); `web/public/privacy.html`
  says the HMRC audit trail keeps 30 days (lines ~399–401) where code and runbook say 28;
  Stripe and Telegram are live processors missing from its processor list; and lines ~624
  and ~826 publish ICO registration ZB070902 as current when it expired 2026-05-23. Enable
  the TTL (CDK test, `./mvnw clean verify`), fix the three privacy.html statements (leave the
  ICO number in place for O3 to replace), unit tests where the pattern has them. **Source**:
  BACKLOG 27c; Track E finding 2026-09-03. **Owner**: Claude Code. **Model**: Sonnet.
- [ ] **B27c.4. Give subject access the same CI-wrapped path erasure has.** Erasure runs
  through `delete-user-data.yml` and `delete-user-data-by-email.yml` (dry run, audited);
  export is `scripts/export-user-data.js`, local only. Add `export-user-data.yml` mirroring
  the erasure workflows' inputs, dry run and summary, uploading the export as a private
  artifact. **Source**: BACKLOG 27c; Track E finding. **Owner**: Claude Code. **Model**:
  Sonnet.

#### Track I — Pipeline cuts (B32a.2)

- [ ] **B32a.2. Make the three largest cuts** from `_developers/PIPELINE_PROFILE_2026-09.md`:
  decouple `destroy-previous` from `set-last-known-good-deployment` in `deploy.yml` (~6.8 min
  off prod's critical path); cut the push-triggered workflow fan-out that queued deploy.yml
  for 13.7 min behind four sibling workflows (concurrency groups or trigger filters); and
  confirm from `PublishStack.java` whether `deploy-publish` needs all of `deploy-edge` before
  collapsing that hop. One PR per cut, each proven by the next run's timing. **Source**:
  BACKLOG 32a. **Owner**: Claude Code. **Model**: Sonnet (Opus unavailable 2026-09-03).

### Block 2 — Operator batch (brief: `_developers/COWORK_BRIEF_OPERATOR_BATCH.md`)

Browser and account work a workflow cannot do, plus the decisions that unblock Tier 2. Each
item's steps, URLs and hand-back are in the brief so Claude Cowork can drive the browser. Hand
results back by pasting them into a Claude Code session or appending to the workspace
`INBOX.md`. Merging Block 1's PRs as they open is also operator-only and unblocks Block 3.

- [ ] **O1 / G2b. Create a ci GA4 property with its own BigQuery export.** In GA4 admin create a
  property for `ci.submit.diyaccounting.co.uk`, add a web data stream, link it to BigQuery
  project `diyaccounting-ga4` (daily export, `europe-west2`, its own dataset), and put the
  measurement id in the `ci` GitHub Environment as a `SUBMIT_GA4_MEASUREMENT_ID` variable
  (prod gets `G-T81V5NL5MB`). **Source**: none. **Owner**: Operator.
- [ ] **O2 / B12c. Create the Stripe prices for `resident-itsa`** (test and live, £0.99/month
  recurring) and hand the two price ids to Claude Code, which puts them in `.env.ci` and
  `.env.prod` by PR; confirm the day pass numbers (3 tokens, 100 concurrent) or give new ones
  for B12a. **Source**: BACKLOG 12. **Owner**: Operator.
- [ ] **O3 / B27c.2. Renew the company's ICO registration.** Registration ZB070902 (the
  certificate PDF in the repo root) expired 2026-05-23 and `privacy.html` still publishes it
  as current, so this is an active gap, not a check. Pay the fee for DIY Accounting Limited
  (06846849) and hand the new number and expiry to Claude Code for
  `_developers/ICO_CHECKLIST.md` and `privacy.html`. **Source**: BACKLOG 27c; Track E finding
  2026-09-03. **Owner**: Operator.
- [ ] **O4 / B11a.2. Obtain the ITSA recognition questionnaire from HMRC SDST** if it is not on
  the hub (the VAT ones arrived by email; see `_developers/hmrc/hmrc_questionnaire_*`) and
  drop it into `_developers/hmrc/`. In the same contact ask whether a production-credential
  window for new ITSA quarterly-update products opens for 2027-28: HMRC's pages say the
  2026-27 window is closed to new products
  (`_developers/hmrc/ITSA_MINIMUM_FUNCTIONALITY_STANDARDS.md`; vendor contact
  makingtaxdigital-softwarevendors@hmrc.gov.uk). The answer decides whether backlog rows 10
  and 11 keep their April 2027 target. **Source**: BACKLOG 11a. **Owner**: Operator.
- [ ] **O5 / B10a.2. Subscribe the sandbox application to the ITSA APIs and mint an ITSA test
  user.** In the HMRC developer hub, subscribe the sandbox app (`HMRC_SANDBOX_CLIENT_ID` in
  `.env.ci`) to Business Details (MTD) and Self Employment Business (MTD). Then, once Track
  F's PR has merged, run the `create-hmrc-test-user` workflow with `mtd-vat,mtd-income-tax`
  and keep the credentials artifact (NINO, user id, password). **Source**: BACKLOG 10a.
  **Owner**: Operator. The subscription step is ready now; the workflow run waits on B10a.1.
- [ ] **O6 / B34a. Decide the Companies House shape**: whether the read-only company lookup
  ships on its own first, and whether to apply for filing accreditation now. Either answer
  turns backlog row 34 into dispatchable items. **Source**: BACKLOG 34; issue #15. **Owner**:
  Operator.
- [ ] **O7 / B40d.1. Pick the mode-naming target**: keep `sandbox`/`live` for HMRC and give the
  Stripe test flag its own name (recommended, smallest change), or rename the modes to
  `synthetic` and rename the monitoring vocabulary. Turns backlog row 40d into a Sonnet item.
  **Source**: BACKLOG 40d; issue #12. **Owner**: Operator.
- [ ] **O8 / B43a. GCP billing tidy-up**: confirm the budget alert on the billing account that
  holds the GA4 export is armed, and confirm the stray auto-created project
  `valued-context-507200-m9` is empty and delete it. **Source**: BACKLOG 43. **Owner**:
  Operator.
- [ ] **O9 / B47. Watch the revived schedules fire on their own**: `codeql` on 2026-09-06 and
  the weekly `compliance` and `stack-drift` crons on Monday 2026-09-07 06:00 UTC. If one
  misses, revive it the same way as on 2026-08-31 and tell Claude Code. **Source**: BACKLOG 47.
  **Owner**: Operator.
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
  for a `purchase` event with the run's transaction id. **Source**: none. **Owner**: Claude
  Code. **Model**: Sonnet. Blocked on G1, G2a (Track A) and O1.
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
  **Owner**: Claude Code. **Model**: Opus. Blocked on O5.
- [ ] **B30b. Cut the alarms and canary runs the audit shows are dead weight.** From B30a:
  drop or merge check types that never fire in CDK (`Lambda.java`), fold the five
  `AsyncApiLambda` alarm triples into their stack composite (`PLAN_ALARM_CONSOLIDATION.md`
  open item 2, one alert for stuck queue plus broken worker), and set the canary interval and
  synthetic cron so they do not both cover the same 4-hour window. Keep every alarm the
  routing rule or a runbook reads. CDK tests updated; `./mvnw clean verify`. **Source**:
  BACKLOG 30; `PLAN_ALARM_CONSOLIDATION.md`. **Owner**: Claude Code. **Model**: Opus. Blocked
  on B30a (Track G).
- [ ] **B12c remainder. Put the `resident-itsa` price ids into `.env.ci` and `.env.prod`** by
  PR once O2 hands them over. **Source**: BACKLOG 12. **Owner**: Claude Code. **Model**: Haiku.
  Blocked on O2.
- [ ] **B27c.2 remainder. Record the new ICO registration number and expiry in
  `_developers/ICO_CHECKLIST.md` and `web/public/privacy.html`** once O3 hands them over.
  **Source**: BACKLOG 27c. **Owner**: Claude Code. **Model**: Haiku. Blocked on O3.

Backlog Tier 2 rows 10 and 11 become dispatchable once B10a.3 exists and O4 answers the
production-window question; rows 34 and
40d once O6 and O7 are answered.

## Discipline

(none repo-specific yet — see `../NEXT.md`)
