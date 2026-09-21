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

**Prod runs deployment prod-a9fa597**; main's deploy of PR #306's merge (82e4f322) is creating
prod-82e4f32 and takes the apex when its probes pass. **ci**: `ci-set1` is live and last-known-good
until it self-destructs. SSO restored at 08:2x UTC on 2026-09-21.

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

- [ ] **B30ao. `prod-env-operator-snapshot-publish-errors`: the visitor-kind view's day type.**
  In flight: on `claude/b65-board` (PR #315, 27df5cb1). Alarm issue #313 was the snapshot's three
  visitor-kind observations failing `TYPE_MISMATCH: Cannot apply operator: varchar < date`, because
  `v_visitors_by_kind_daily` read the table's string `day`; it now reads `dt AS day`. Proof: the
  first 03:1x UTC snapshot run after the merge publishes with no failing observation; then close
  #313 quoting it. **Source**: issue #313; BACKLOG 30. **Owner**: Claude Code. **Model**: Haiku.
  **Size**: ~0 files.

- [ ] **B11.T7b.2. Run A, the dated year.** In flight: proven on the sandbox and on `claude/b65-board` (PR #315, 6ed739a8). The sole-trade leg runs to `bsas-adjust`. Add the
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

- [ ] **B11.T7b.3. Run A's loss sequence on the sole trade.** In flight: proven on the sandbox and on `claude/b65-board` (PR #315, 274e7bdd). One loss-claims resource per business
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

- [ ] **B11.T7b.5. Run B's two extra calls.** In flight: proven on the sandbox and on `claude/b65-board` (PR #315, 1499b136). Gated on `submissionModel === "cumulative"`, after the
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

## Machine-only

- [ ] **B49.20. `infra/github`.** `github.toml`: `[repository]` the two merge settings; `[actions]`
  the permissions and selected-actions fields, `default_workflow_permissions`, and
  `patterns_allowed` from `scripts/github-actions-permissions.sh`; `[security]
  automated_security_fixes = true` (false live); `[[ruleset]]` `main` with its enforcement,
  conditions, its three rules and bypass actors; `[[environment]]` `ci`, `prod`, `copilot` with
  variable and secret names; `[codeowners]`. Write it from live `gh api` reads, ruleset 16057564
  among them. `github-sync.js`: `gh api` reads, a pure `planGithub(config, live)`, `--apply` writing
  back through the same routes; a missing variable or secret name is a finding, not created.
  `github-actions-permissions.sh` goes. `GITHUB_TOKEN` cannot administer; the operator's fine-grained PAT (this repository,
  Administration read/write, Environments, Secrets and Variables read) is the repository secret
  `ADMIN_TOKEN` since 2026-09-21 (GitHub refuses secret names starting `GITHUB_`), the step's
  `GH_TOKEN` on both matrix legs. Test
  `githubSync.test.js` over `parseConfig`, `planGithub`, `rulesetDiff`. Proof: `npm test` and a plan
  reading "already match". After B49.18. **Source**: BACKLOG 49b; item 20. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~5 files.

- [ ] **B52.D2. Donations on the revenue panel.** `v_revenue_daily` reads `stripe_charges`, written
  by `stripeReconcile.js` with the live key at `prod/submit/stripe/secret_key`
  (`app/lib/stripeClient.js`), labelled by `charge.metadata.bundleId`, so a Payment Link charge
  falls to `'unknown'`. Read the account side first: fetch that secret and `GET /v1/payment_links`,
  matching the four live slugs in the spreadsheets repository's
  `web/spreadsheets.diyaccounting.co.uk/donate-links.toml` (`…4F200`, `4F201`, `4F202`, `4F204`); a
  match means one account, and `SELECT day, product, revenue_gbp FROM v_revenue_daily WHERE product
  = 'unknown'` in workgroup `prod-env-analytics` shows whether donations are already landing
  unlabelled. Then label them by setting `payment_intent_data.metadata.bundleId` on each link in
  `scripts/stripe-setup.js`'s idempotent shape, with a unit test on the builder. That live
  Stripe write was approved by the operator on 2026-09-21. PayPal donations are not in this row; they arrive with `../PLAN_FINANCE_AUTOMATION.md`
  phase 1's PayPal pull, which has no code. **Source**: BACKLOG 66; plan D2. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~2 files.

## Machine-ask

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

- [ ] **B49.16. Read-only inventory of the Google Ads account.** Developer tokens were sunset by
  Google on 2026-09-09: Google Ads API access is now an access level on the Cloud project that
  issued the OAuth credentials, requested on the Google Ads API Overview page
  (<https://console.cloud.google.com/google/ads-apis/overview>, project `diyaccounting-ga4`),
  and no manager account is needed for one account. The account is 814-268-5080 (customer id
  8142685080). Build: `googleads.googleapis.com` joins `[apis] services` in
  `infra/google/gcp/project.toml` (applied by `google-apply.yml`); `infra/google/ads/ads.toml`
  starts with `[account] customer_id = "8142685080"` and `[secrets] refresh_token =
  "prod/submit/google/ads/refresh_token"`; `infra/google/ads/ads-inventory.js` in
  `google-inventory.js`'s shape over the Ads REST API (`POST
  https://googleads.googleapis.com/v21/customers/{id}/googleAds:search` with GAQL, no
  `developer-token` header, no `login-customer-id`): `customer.auto_tagging_enabled`,
  `conversion_action`, `customer_conversion_goal`, `campaign` with `campaign_budget` and
  `asset_group`, and GA4's `properties/523400333/googleAdsLinks`; it writes nothing. `--consent`
  reuses `scripts/youtube-upload.js`'s loopback consent for scope
  `https://www.googleapis.com/auth/adwords`, storing the refresh token with
  `put-secret-with-rotation-tag.sh`. Test `adsInventory.test.js` over `parseArgs` and `shape*`.
  The run needs two operator steps: on the Overview page, "Upgrade access level" from Test to
  Basic (Test access reaches test accounts only; Basic needs the project's brand verification),
  and one browser approval of the consent the script opens. **Source**: BACKLOG 49b; item 16.
  **Owner**: Claude Code builds and runs; the operator approves the access upgrade and the
  consent. **Model**: Sonnet. **Size**: ~5 files.

- [ ] **O38. The two GitHub Apps carry every machine write.** Every workflow and Lambda write runs
  on the Apps since PR #311 (0c847b07): `security-review.yml`'s Copilot assignment was the last
  read of a personal access token, and its next run proves the App may call
  `replaceActorsForAssignable` (a permission error means that job goes). What remains is the
  five deletes, each with the operator's approval: `gh secret delete ISSUE_BOT_TOKEN`,
  `gh secret delete SUPPORT_BOT_TOKEN`, `gh secret delete PERSONAL_ACCESS_TOKEN`, and
  `aws secretsmanager delete-secret --recovery-window-in-days 30 --secret-id
  <env>/submit/github/issue_bot_token` and `.../support_bot_token` under `AWS_PROFILE=submit-ci`
  and `submit-prod`. **Source**: `REPORT_IDENTITY_AUDIT.md` section 8, recommendations 2 and 3.
  **Owner**: Claude Code, the operator approves the five deletes. **Model**: Haiku. **Size**: ~0
  files.

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
  phase should return" sections carry each new step with its expected status. Blocked on B11.T7b.3 and
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
  including `app/unit-tests/http-simulator/`. Blocked on B11.T7b.6. **Source**: `PLAN_ITSA_PHASE_2.md`
  T7. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~10 files.

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

- [ ] **B52.D3. The spreadsheets site's web-vitals alarms.** The OAM sinks are on prod
  (`arn:aws:oam:us-east-1:972912397388:sink/8f40e076-e9ab-445b-8fc2-68557456b63d`) and ci
  (`arn:aws:oam:us-east-1:367191799875:sink/95055e90-9811-47c0-98db-171adcfbec90`) since PR
  #311, and the dashboard row reads `spreadsheets-web` by account and region; the sink ARNs went
  to `~/.claude/inboxes/spreadsheets.md` on 2026-09-21. CloudWatch refuses an alarm on another
  account's metric until that account has linked, so the three p75 alarms (LCP 4000ms, INP
  500ms, CLS 0.25, in `ObservabilityUE1Stack.java` beside the sink, in the shape of the submit
  RUM alarms) return once the spreadsheets repository's `AWS::Oam::Link` is deployed: check with
  `aws --profile submit-prod oam list-attached-links --sink-identifier <prod sink arn>
  --region us-east-1`. Blocked on that link. **Source**: BACKLOG 62; `PLAN_ONE_STOP_DASHBOARD.md`
  D3. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~2 files.

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

