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

**Prod runs deployment prod-a4ea2f3** (PR #324's merge; its deploy run is on its last prod probe and
prod-bc09c1b is being destroyed). **ci**: `ci-set1` is last-known-good. Open pull request: #325
(`claude/b72-board`: PU-7d, PU-7f, PU-7l), its ci deploy in flight.

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

- [ ] **B30af.8. A scheduled probe never holds a suite's lock while it waits for main's deploy.**
  In flight: an agent on `worktree-agent-a20c46ad24ab88104`, to land on `claude/b73-board`.
  `probe-test.yml`'s `behaviour-test` job takes the concurrency group
  `behaviour-test-user-<env>-<suite>` (line 352) and then, on a scheduled run, waits inside that
  job for any deploy in progress on `main` (the `wait-for-main-deploy` steps at lines 500 and 548,
  up to 40 minutes each). A deploy of `main` whose own probe of the same suite starts meanwhile
  queues on that lock, so the two wait on each other: on 2026-09-22 the scheduled probe's
  `submitVatBehaviour-prod` job held the lock from 05:44 while deploy run 35688610628's
  `submitVatBehaviour-prod` sat pending, until the scheduled run 35690948230 was cancelled at
  06:28. Keep the `params` job's wait (line 241, before any lock); replace the two in-job waits
  with a check that gives up at once: when a `main` deploy is in progress, skip the navigation and
  end the suite as superseded (`continue-on-error` outcome neutral, the CloudWatch metric not
  published), since the deploy's own probe covers that suite. `.github/actions/wait-for-main-deploy`
  gains a `max-wait-minutes` input (default 40; 0 returns at once with an output naming the run).
  Proof: a dispatched `probe-test.yml` on ci with a deploy of the same branch in flight ends the
  suite as superseded inside a minute. **Source**: deploy run 35688610628; BACKLOG 30.
  **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~3 files.

- [ ] **PU-7. Practice licence build.** In flight: PU-7d (the entitlement by client), PU-7f (agent
  authorisation) and PU-7l (`move_book_to_client`) on `claude/b72-board`, PR #325, its ci deploy
  running. The rows left in `PLAN_PRICE_UPDATE.md` §(d) (lines 227 to 236): PU-7e waits on the
  operator's grant numbers, PU-7g on PU-7f, PU-7h on PU-7g, PU-7i on PU-7g and the MCP plan's M2
  and M3, PU-7j on PU-7i, PU-7k on PU-7f, PU-7m on PU-7j; the `resident-pro` catalogue values
  (`enable = "always"`, `hidden = false`, `allocation = "on-subscription"`) flip in the launch step
  after PU-7m, with the four ci probes that reach resident-pro through a pass updated in the same
  change. **Source**: `PLAN_PRICE_UPDATE.md` PU-7. **Owner**: Claude Code. **Model**: Sonnet.
  **Size**: ~45 files across 7 rows.

## Machine-only

## Machine-ask

- [ ] **B58a. The Copilot coding agent is enabled, so `security-review.yml` can assign #318.** The
  dispatch `gh workflow run security-review.yml -f issue_number=318` (run 35688659421, 2026-09-22)
  failed as designed: `suggestedActors` lists only `antonycc` and `support-at-diyaccounting` under
  both the workflow token and the App token, so no token can assign `copilot-swe-agent` until the
  Copilot coding agent is enabled for this repository (GitHub, repository Settings, Copilot, Coding
  agent; or the organisation's Copilot policy). The operator enables it, then Claude Code re-runs
  the same dispatch and reads #318's timeline for the `assigned` event. #318 stays open until then.
  **Source**: issue #318; BACKLOG 58. **Owner**: the operator enables; Claude Code dispatches and
  reads. **Model**: Haiku. **Size**: ~0 files.

- [ ] **PU-3. Stripe test then live.** The `resident` product with both prices through
  `stripe-catalogue-sync`, test then live; the price ids into `.env.ci` and `.env.prod`. The catalogue's `prices` rows and the
  `STRIPE_(TEST_)PRICE_ID_RESIDENT_YEAR`/`_MONTH` env rows are what the sync writes. **Source**: `PLAN_PRICE_UPDATE.md` PU-3. **Owner**: Claude Code; the live key is the
  operator's. **Model**: Haiku. **Size**: ~2 files.

- [ ] **B11.T10. ITSA phase 2: the send.** The operator names the day; Claude Code re-runs
  `scripts/itsa-sandbox-year.js` for 2023-24, 2025-26 and 2026-27 (the commands in
  `_developers/hmrc/ITSA_PHASE_2_SANDBOX.md` lines 69 to 79; B11.T7c moves its output directory)
  inside the 14 days before it and updates the "Testing in the last two weeks" row of
  `_developers/hmrc/hmrc_questionnaire_itsa_pass_diy_accounting_limited_v1.md` (line 28); the
  operator sends `_developers/hmrc/DRAFT_EMAIL_ITSA_RECOGNITION.md` to `SDSTeam@hmrc.gov.uk` and
  `_developers/hmrc/DRAFT_EMAIL_ITSA_PRODUCTION_CREDENTIALS.md` when SDST answers. **Source**: BACKLOG 11; `PLAN_ITSA_PHASE_2.md` T10. **Owner**: Claude Code re-runs; the
  operator names the day and sends. **Model**: Haiku. **Size**: ~1 file.

## Human-driven

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

- [ ] **PU-14. An `experiments.toml` row for the price change.** Objective `conversion-to-paid`,
  lever price, metric purchases per human session, start at PU-5's deploy, so the £39 shape is
  measured against the 99p rate. Blocked on PU-5. **Source**: `REPORT_PRICE_UPDATE_REVIEW.md` §2 row
  6; operator 2026-09-21. **Owner**: Claude Code. **Model**: Haiku. **Size**: ~1 file.

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

- [ ] **PU-5. The DIYA-GL tier on prod.** `SubmitApplication.java` line 484 sets
  `.residentTierEnabled(!"prod".equals(envName))`, which `DiyaGlStack.java` (lines 140 and 241)
  passes as `DIYA_GL_RESIDENT_TIER` and `app/services/diyaGlEntitlement.js` line 40 reads; make
  it true for prod, and add `prod` to `resident`'s environments in the catalogue. Blocked on PU-3. **Source**:
  `PLAN_PRICE_UPDATE.md` PU-5. **Owner**: Claude Code. **Model**: Haiku. **Size**: ~2 files.

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

- [ ] **B52m. The reinvestment loop.** Trailing income, reserve, budget, return per pound and payback
  as one block on `web/public/operator/dashboard.html`, fed by observations over `v_revenue_daily`
  and `v_cost_vs_target_monthly` in `operatorSnapshotPublish.js`; the reinvestment fraction as a
  lever with the operator's reserve floor; paid traffic and article boosts as `experiments.toml`
  rows with on-off or geographic controls; GA4 conversion import from the Ads account. Blocked on
  three events: B52l's fitted models, which the return-per-pound figure comes from; the cost panel
  carrying revenue (BACKLOG 43, from 2026-10-02, the first monthly renewal); and the operator
  naming the reinvestment fraction and the reserve floor. The Google Ads account exists as code
  (`infra/google/ads/ads.toml`: customer `8142685080`, four conversion actions imported from GA4
  events, one Performance Max campaign), so no token step remains; the cost-per-session ceiling
  PU-15 writes into D17 is the starting bid ceiling.
  **Source**: BACKLOG 52m; `PLAN_ONE_STOP_DASHBOARD.md` D17. **Owner**: Claude Code, with the
  operator's fraction and floor. **Model**: Sonnet. **Size**: ~3 files.

- [ ] **PU-9. Retire the three folded bundles.** `resident-diya-gl`, `resident-itsa` and
  `resident-ltd` leave `submit.catalogue.toml`, `.env.ci` and `.env.prod` once Stripe live shows no
  subscription on their prices. Blocked on PU-5. **Source**: `PLAN_PRICE_UPDATE.md` PU-9.
  **Owner**: Claude Code. **Model**: Haiku. **Size**: ~3 files.

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

