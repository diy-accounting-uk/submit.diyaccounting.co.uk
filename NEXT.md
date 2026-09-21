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

**Prod runs deployment prod-a7a0d6b** (main's deploy of PR #319's merge, 35604740348). **ci**:
`ci-set1` is last-known-good. No open pull request.

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

**COOL-DOWN is on since 2026-09-21T19:32:35Z.** No new board rows except a degradation. Agents commit
and stop. One branch is driven green at a time. Lifted only by the operator in their own words.

- [ ] **O38. The two GitHub Apps carry every machine write.** In flight: `infra/github/github.toml`
  drops the three deleted secret names on `claude/ops-bot-secrets` (worktree
  `.claude/worktrees/ops-bot-secrets`, PR #321 to `main`). The seven deletes ran on 2026-09-21: the
  repository secrets `ISSUE_BOT_TOKEN`, `SUPPORT_BOT_TOKEN`, `PERSONAL_ACCESS_TOKEN`, and the four
  `issue_bot_token` and `support_bot_token` secrets in ci and prod Secrets Manager. Proof: #321's
  `infra-apply.yml` plan on `main` reports no missing secret. **Source**: `REPORT_IDENTITY_AUDIT.md`
  section 8, recommendations 2 and 3. **Owner**: Claude Code. **Model**: Haiku. **Size**: ~1 file.

## Machine-only

- [ ] **B49.24. `PLAN_EVERYTHING_AS_CODE.md`'s Google Ads section reads the current access route.**
  Its "Google Ads, concretely" section (the paragraph beginning "Access needs three things") and the
  Google Ads line of its provider table still describe the developer token, the manager account and
  `login-customer-id`, a route Google replaced on 2026-09-09 with an access level on the Cloud
  project that issued the OAuth credentials. Rewrite them to what `infra/google/ads/ads.toml`,
  `ads-inventory.js` and `ads-sync.js` do: one customer id, the refresh token from
  `prod/submit/google/ads/refresh_token`, no developer token, no manager link. Docs only; may go
  straight to `main`. **Source**: BACKLOG 49b; `PLAN_EVERYTHING_AS_CODE.md` items 16 and 17.
  **Owner**: Claude Code. **Model**: Haiku. **Size**: ~1 file.

- [ ] **B43a. The scheduled prod deploy skips a head that is already live.** `deploy.yml`'s
  `11 4 * * *` schedule on `main` creates a full prod set, deploys it and destroys the previous one
  even when the head only changed `.md` files (prod-a15fe51 from a15fe519 on 2026-09-21). In the
  `names` or `skip deploy check` job, on `github.event_name == 'schedule'`, read
  `/submit/prod/last-known-good-deployment`, derive the live set's head from its name the way
  `get-names` derives a name from a head, and skip the deploy when the two match or when
  `git diff --name-only <live head>..HEAD` matches none of the `push:` `paths:` list. Proof: a
  dispatched run with `skipDeploy` unset on a docs-only head ends at the check with no stack job.
  **Source**: BACKLOG 43. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~1 file.

- [ ] **B69a. `finalMessageOnly` cuts at the first heading.** `scripts/redact-triage-output.mjs`'s
  `finalMessageOnly` drops leaked reasoning only when a `---` thematic break precedes the answer;
  support-triage's comment on issue #100 kept one sentence of reasoning above its first `## `
  heading. When no break is present and the text carries a `## ` heading after some prose, cut to
  the first heading; text with neither passes through as today. Cases in
  `app/unit-tests/scripts/redactTriageOutput.test.js`. **Source**: BACKLOG 69. **Owner**: Claude
  Code. **Model**: Haiku. **Size**: ~2 files.

- [ ] **B46a. Lint `infra/google/`.** `eslint.config.js`'s global `ignores` carries `scripts/` and
  `infra/google/`, so the eight Google scripts under `infra/google/` carry 16 sonarjs and security
  findings nothing lints. Remove `infra/google/` from the ignore list, fix each finding or suppress
  it on its line with the reason, and leave `scripts/` as it is. Proof: `npm run linting` clean and
  `npm test` green. **Source**: BACKLOG 46. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~9
  files.

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
  drop for ci. **Source**: the design, P3 to P5. **Owner**: Claude Code. **Model**: Sonnet. N = 2: on
  2026-09-21 HMRC's sandbox application took `ci-set1` and `ci-set2` and reached its five-URI cap
  (the prod apex, ci apex and local keep the other three; `prod-submit` went), Companies House took
  the same two, and the §3 curl answers 303 and 302 for both hosts and 400 for `ci-set3`. So P3
  lists two slot hosts, and `.github/actions/claim-ci-slot/action.yml`'s `slot-count` default drops
  from 4 to 2 in the same PR. **Size**: ~9 files.

## Machine-ask

- [ ] **B11.T10. ITSA phase 2: the send.** The operator names the day; Claude Code re-runs the
  B11.T7b.1 and B11.T7b.4 commands inside the 14 days before it and updates the ITSA pass's
  testing-in-the-last-two-weeks row; the operator sends `DRAFT_EMAIL_ITSA_RECOGNITION.md` to
  `SDSTeam@hmrc.gov.uk` and `DRAFT_EMAIL_ITSA_PRODUCTION_CREDENTIALS.md` when SDST answers. **Source**: BACKLOG 11; `PLAN_ITSA_PHASE_2.md` T10. **Owner**: Claude Code re-runs; the
  operator names the day and sends. **Model**: Haiku. **Size**: ~1 file.

## Human-driven

## Blocked

- [ ] **B30ao. `prod-env-operator-snapshot-publish-errors`: the visitor-kind view's day type.**
  On `main` since PR #315 (27df5cb1). Alarm issue #313 was the snapshot's three
  visitor-kind observations failing `TYPE_MISMATCH: Cannot apply operator: varchar < date`, because
  `v_visitors_by_kind_daily` read the table's string `day`; it now reads `dt AS day`. Proof: the
  03:1x UTC snapshot run on 2026-09-22 publishes with no failing observation; then close #313
  quoting it. Blocked on that run. **Source**: issue #313; BACKLOG 30. **Owner**: Claude Code. **Model**: Haiku.
  **Size**: ~0 files.

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

