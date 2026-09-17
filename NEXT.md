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

**Prod runs deployment prod-952b978** (PR #288, run 35176978495; the pointer and its nine stacks
verified against AWS at 07:5x UTC on 2026-09-17). PRs #296, #294 and #291 merged at 07:25 UTC;
`main`'s deploy of fcbc468e (35194438596) is standing prod-fcbc468 up and 9284434c's
(35194544211) waits behind it in the prod concurrency group. **ci**: `ci-claud86af` is live.

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

- [ ] **B52y.3. The security lake nightly's role cannot list the WAF log groups.** The 03:20
  UTC run on 2026-09-17 (three attempts, `/aws/lambda/prod-env-security-lake-nightly`) ended in
  `AccessDeniedException: ... not authorized to perform: logs:DescribeLogGroups on resource:
  arn:aws:logs:us-east-1:972912397388:log-group::log-stream:`. `SecurityLakeStack.java` (~226)
  grants `logs:DescribeLogGroups` on `arn:aws:logs:us-east-1:<account>:log-group:aws-waf-logs-<env>-*`,
  but IAM evaluates that action against the `log-group::log-stream:` resource, so the grant never
  matches. Give the Describe statement that resource (the StartQuery grant keeps its prefix), update
  `SecurityLakeStackTest`, and the next nightly writes the WAF rows. The GitHub alert rows are
  B52y.5's. In flight on `claude/b55-board`, PR #297. Then close #249 with the
  nightly's log. **Source**: issue #249. **Owner**: Claude
  Code. **Model**: Sonnet. **Size**: ~2 files.

- [ ] **B52y.4. Glue Data Quality cannot read `cost_focus`: the ruleset's rules need the
  Parquet's own names.** The 2026-09-17 03:18 UTC result of `prod_env_cost_focus_dq`
  (dqresult-e882b05612b6bbd09b6c557a469fc54f7cc1bf9b) scores 0: `RowCount > 0` fails with 0 rows
  and `IsComplete "billed_cost"` with "Input data does not include column billed_cost", while
  Athena's `v_cost_daily` answers 5,871 rows for the same days. Glue DQ reads the table through
  Spark, which ignores `parquet.column.index.access` (`CostFocusTables.java` ~67) and so sees the
  export's PascalCase fields, and the zero row count says its reader also missed the projected
  `dt` partitions. In `DataQuality.java` (~99) make the cost_focus ruleset evaluate what Spark
  sees: either point the DQ target at the Parquet names (`BilledCost`) and a partition the reader
  can list, or read the table through a view the positional reader builds; In flight on `claude/b55-board`, PR #297; the proof is the
  next nightly ingestion's Data Quality result. **Source**: B52y.2's snapshot
  check; `PLAN_ONE_STOP_DASHBOARD.md` D13. **Owner**: Claude Code. **Model**: Sonnet. **Size**:
  ~1 file.

- [ ] **B30af.5. Branch deploys leave the ci apex: P1, the slot pool.**
  `_developers/DESIGN_CI_BRANCH_DEPLOYS_OFF_THE_APEX.md` (on `main`) settles the shape: four fixed
  slot hosts `ci-set1` to `ci-set4`, registered once with Cognito, HMRC and Companies House (the
  two hubs reject any unregistered redirect host, so per-deploy registration and per-deploy app
  clients lose), claimed per ref through an SSM parameter per slot; ci promotion moves to a
  `promote-ci-apex.yml` that runs after the probes pass, and `set-origins`/`rollback-origins` in
  `deploy.yml` become prod-only. P1: a `claim-ci-slot` action, the `names` job using it,
  `destroy-ci.yml` and `selfDestruct.js` releasing the slot. Proof: a branch deploy's `names` job
  logs `DEPLOYMENT_NAME=ci-set<N>` and the slot parameter reads back the run id. P3 to P5 follow
  (IdentityStack's callback list; non-prod `publicDomainName = deploymentDomainName` so every probe
  and Lambda moves together; the apex out of the deploy), P3 after P2's registrations. In flight on `claude/ci-1-slot-pool`, PR #295. Its deploy (35179085180) claimed
  `ci-set1` and stood the set up, and its deploy is green after `set origins` re-ran (the first
  attempt lost the apex CNAME race to PR #291's and #294's deploys). Rebased onto `main` after PR
  #296; the rebased head's runs were cancelled a minute in and re-run (deploy 35194697647,
  attempt 2, still at the environment wait). `ci-set1`'s self-destruct fired at 07:44 UTC during
  that wait, on the first claim's clock, and removed the Ops, Publish and Edge stacks; the redeploy
  recreates them (B30af.7 carries the clock). The merge is O49's. **Source**:
  issue #290; the design. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~7 files.

## Machine-only

## Machine-ask

- [ ] **B30al. `destroy-ci.yml`'s cron has not fired since its schedule changed.** The last
  scheduled sweep ran at 13:40 UTC on 2026-09-16 (the old cron's slot, after commit 58290819 at
  12:29 wrote `34 2,4,6,8,10,12 * * *`); none of the new slots has produced a run, so leftovers
  wait for the self-destruct fire or a `workflow_run` sweep. The `on:` block on `main` is
  well-formed and the workflow reports `active`. Re-register the schedule by toggling the
  workflow (an Actions-settings write, the operator's), then check for the next slot's run:
  `gh run list --workflow destroy-ci.yml --event schedule --limit 1`. If the toggle does not
  bring it back, a PR that touches the file does. **Source**: `gh run list --workflow
  destroy-ci.yml --event schedule`. **Owner**: operator (the toggle), then Claude Code.
  **Model**: Haiku. **Size**: ~0 files.

- [ ] **B52y.5. The ops GitHub token cannot read Dependabot or secret-scanning alerts.** The
  same nightly logs `GitHub API error fetching dependabot/alerts: 403 {"message":"Resource not
  accessible by personal access token"}` and the same for `secret-scanning/alerts`, and publishes a
  null row for each. The token is the one in `prod/submit/github/issue_bot_token` (and ci's). The
  operator grants it, at https://github.com/settings/tokens, repository permissions Dependabot
  alerts: read and Secret scanning alerts: read (a classic token: `security_events` covers code
  scanning only, so a fine-grained token is the shape that can). No code changes. **Source**: issue
  #249. **Owner**: operator (the token), then the next nightly. **Model**: Haiku. **Size**: ~0 files.

- [ ] **O49. PR #295 changes workflow files, which the session's GitHub token cannot merge.**
  The token has `repo` and not `workflow` scope: `gh pr merge` is refused for any PR touching
  `.github/workflows/*` ("refusing to allow an OAuth App to create or update workflow ... without
  `workflow` scope"). Either the operator merges #295 as they merged #291, #294 and #296, or
  refreshes the token once so the session can: `gh auth refresh -h github.com -s workflow`.
  **Source**: the refused merges of 2026-09-17. **Owner**: operator. **Model**: Haiku. **Size**:
  ~0 files.

- [ ] **B53.4. Delete the nine orphaned `prod/submit/*` secrets in the submit-ci account.**
  `REPORT_KEY_AUDIT.md` gap 4: nine `prod/submit/*` names sit in 367191799875, untouched since
  2026-02-21, with distinct ARNs from prod's real copies in 972912397388; nothing in ci reads a
  `prod/` name. No ci code references a `prod/` name (grep, 02:0x UTC on 2026-09-17); the delete
  is an AWS write the operator says go to: `aws --profile submit-ci secretsmanager delete-secret
  --secret-id <name> --recovery-window-in-days 30` per name. **Source**: REPORT_KEY_AUDIT.md gap 4.
  **Owner**: Claude Code on the operator's go. **Model**: Haiku. **Size**: ~0 files.

- [ ] **B53.7. The gyb Gmail-backup service-account key under a rotation plan.** Project
  `gyb-project-j7e-1uj-8n2` holds a service-account key for the workspace's mail mirror
  (`REPORT_KEY_AUDIT.md` gap 7), outside every plan and schedule. Either fold the project into
  `PLAN_EVERYTHING_AS_CODE.md`'s Google estate with the same key-rotation block, or record it in the
  workspace root's runbook with a date; a new key is a Google write the operator says go to.
  **Source**: REPORT_KEY_AUDIT.md gap 7. **Owner**: Claude Code on the operator's go. **Model**:
  Sonnet. **Size**: ~1 file.

- [ ] **B52n.2. Re-import the Ads conversions now `donate` is its own key event.** `main`'s
  `google apply` run 35171500236 created key event `donate` on GA4 property 523400333
  (`keyEvents/15792183948`, 02:1x UTC on 2026-09-17). The operator re-imports GA4's key events into
  the Google Ads account (its id is in the workspace root's runbook) so its Purchase conversion
  counts subscriptions only; the spreadsheets site's emitter still sends `purchase` for a donation
  until that repository lands the one-line change in its inbox. **Source**: B52n. **Owner**:
  Operator, in the Ads console. **Model**: none. **Size**: ~0 files.
- [ ] **O44. Tell Companies House's XML team what B34.6b submitted.** One email from your address
  to Neal at `xml@companieshouse.gov.uk`, naming: presenter E0000052288, company 06846849, test
  package reference 0012; submissions 000002 and 000003 (2026-09-13 18:19 UTC) rejected with error
  9999 "No element 'Authority'", since fixed; submission 000004 (19:04 UTC) acknowledged with no
  errors; and that every `GetSubmissionStatus` for 000004 answers 9999 "No presenter ID supplied", with the
  `PresenterID` plaintext (transaction 1789391567972, 2026-09-14 13:12:48 UTC) and hashed
  (transaction 1789481253426, 2026-09-15 14:07:33 UTC).
  Ask whether 000004 was accepted and whether status lookups are enabled for this presenter.
  **Source**: BACKLOG 34b. **Owner**: Claude Code drafts and sends from the operator's address on their go. **Model**: Haiku.

- [ ] **O33. Tell HMRC's SDS team the licence changed.** One paragraph: the MTD approval
  submission and the production-credentials email described the service as AGPL open source, and
  the PolyForm licence files are on main and on prod since prod-318271f. **Source**:
  `PLAN_LICENSING_UPLIFT_SUBMIT.md` H-LU-9. **Owner**: Claude Code drafts and sends from the operator's address on their go. **Model**: Haiku.

- [ ] **O38. Create the two GitHub Apps the audit ranks joint second.** `diya-ops`, to carry all
  three Lambdas' writes, which separates 55 alarm issues and every support ticket from the
  operator's own account and is the single move that fixes the worst disclosure gap; and
  `diya-agent`, for unattended model runs, so a reader can tell a model's PR from a pipeline's and
  our commits stop being attributed to the GitHub user `claude`. Both are free: an app to create
  and a private key into Secrets Manager. Neither depends on signing. The alarm Lambda reads
  `{env}/submit/github/issue_bot_token` and the support form reads
  `{env}/submit/github/support_bot_token` (B165), so the app's token goes into both secrets, or a
  second app carries the spreadsheets-only support writes. While deciding, settle recommendation 12 as well: the byline on articles
  and support replies, before the emails-to-articles pipeline is built, because that is the largest
  volume of machine-written public prose the company will produce. **Source**:
  `REPORT_IDENTITY_AUDIT.md` section 8, recommendations 2, 3 and 12. **Owner**: Operator.
  **Model**: none.

- [ ] **B11.T10. ITSA phase 2: the recognition pack.** `PLAN_ITSA_PHASE_2.md` T10, its inputs (T7r, T21, T22) on `main`:
  `_developers/hmrc/ITSA_PRODUCTION_APPROVALS_CHECKLIST.md`, an ITSA pass over the two
  questionnaires, and the two draft emails for the operator to send. One application now covers
  both approval stages, and the checklist answers for all nine APIs in the minimum functionality
  standards with a build behind each. **Source**: BACKLOG 11; `PLAN_ITSA_PHASE_2.md` T10.
  **Owner**: Claude Code re-runs the sandbox year on a ci set so the run sits inside HMRC's 14-day log window; then the operator sends `DRAFT_EMAIL_ITSA_RECOGNITION.md` (the pack is on `main` since PR #237, `_developers/hmrc/`) and `DRAFT_EMAIL_ITSA_PRODUCTION_CREDENTIALS.md` when SDST answers. **Model**: Haiku. **Size**: ~3 files.

- [ ] **B55.2. Google federation: the Lambdas' nightly proof, then the key goes.** The pool
  `submit-federation` and its three providers exist (apply run 35050290089); the federated GitHub
  path is proven (plan run 35050387182) and the prod environment's `SUBMIT_GOOGLE_AUTH_MODE` is
  `federated` since 03:4x UTC on 2026-09-16. Wave b45 (PR #247, merged 04:1x UTC on
  2026-09-16) puts `GA4_AUTH_MODE`, `GOOGLE_WIF_AUDIENCE` and `GA4_SERVICE_ACCOUNT_EMAIL` on the
  three GA4 Lambdas, ci in federated mode and prod on the key; `main`'s deploy carries them. Then: one
  nightly run of each Lambda on ci in federated mode
  (the provider's condition matches the generated role names, reasoned from the naming rule and
  proven by that run), then `.env.prod` to `federated`, then the key, both secrets, the
  `ga4/service_account` row, `scripts/gcp-key-rotate.js`, `google/identity.toml`'s
  `[service_account.key_rotation]` block and `google-key-rotate.yml` go (the removal list with file
  and line is in the b46 wave's agent report, 08:0x UTC on 2026-09-16). The three Lambdas run only
  inside the step function `ci-env-analytics-nightly` (`cron(15 2 ? * MON *)` UTC), whose last two
  runs (2026-09-07, 2026-09-14) failed on `ga4-event-export-pull`'s missing BigQuery export table
  for the day, a data-availability error unrelated to auth. No federated invocation exists yet.
  **Source**: B55; PRs #237, #241, #245, #247; `PLAN_EVERYTHING_AS_CODE.md` items 9 and 11. **Owner**:
  Operator starts, Claude Code finishes. **Model**: Sonnet. PR #271 (5cdaf30e, merged 20:5x UTC on
  2026-09-16) maps both AWS providers' `google.subject` to the role name, after the operator's start
  of `ci-env-analytics-nightly` at 19:28 UTC proved `ga4-daily-pull` and `ga4-report-pull` federated
  and failed `ga4-event-export-pull` on Google's 127-byte subject limit; `google apply` on `main`
  carries the mapping. The human half: one more start of the state machine
  (`../NEXT_OPERATOR_RUNBOOK.md`). The machine half after a clean run: `.env.prod` to
  `federated`, the key-mode code out of the three Lambdas and `IngestionStack`, the secret step and
  `GA4_SERVICE_ACCOUNT_ARN` out of `deploy-environment.yml`, `google-key-rotate.yml`,
  `scripts/gcp-key-rotate.js`, `google/identity.toml`'s `[service_account.key_rotation]` block and
  the `ga4/service_account` row gone (`GA4_SERVICE_ACCOUNT_JSON` is already off both GitHub
  environments, 2026-09-16). **Size**: ~12 files.

## Human-driven

## Blocked

- [ ] **B30af.7. A slot reclaim re-anchors the slot's self-destruct clock.** `ci-set1`'s
  `SelfDestructStack` keeps the schedule of the slot's first claim (`cron(44 7/4 * * ? *)` from
  03:47 UTC on 2026-09-17), so the redeploy of the same ref at 07:33 was cut across at 07:44 while
  it waited on the environment deploy: the self-destruct removed Ops, Publish and Edge under it.
  When `claim-ci-slot` reclaims a slot (same ref, or stale), the deploy must move the schedule
  to creation-plus-delay from the claim, or delete and recreate the `SelfDestructStack`, so a
  redeploy always has a full window. `SelfDestructStack.java`, `claim-ci-slot.mjs`, `deploy.yml`.
  **Source**: the self-destruct log `/aws/lambda/ci-env-self-destruct-eu-west-2` at 07:44 UTC on
  2026-09-17. **Owner**: Claude Code. **Model**: Sonnet. Blocked on PR #295 (P1) merging.
  **Size**: ~3 files.

- [ ] **B30af.6. Register the four slot hosts' redirect URIs with HMRC and Companies House (P2).**
  After P1 names the slots: eight URIs, `https://ci-set<N>.submit.diyaccounting.co.uk/activities/submitVatCallback.html`
  (HMRC Developer Hub, the sandbox application, which today holds the prod host, the ci apex and
  `local.submit…:3443`) and `https://ci-set<N>.submit.diyaccounting.co.uk/companies-house/filingCallback.html`
  (the Companies House "- test" application's web client). Both hubs are console forms with no
  API, so this is the operator's, signed in; the design's §6 names the unknown that decides N: HMRC's
  cap on redirect URIs per application. Proof: the design's §3 `curl` answers 200 for each slot
  host. Blocked on P1. **Source**: the design, P2. **Owner**: Operator, in both hubs. **Model**:
  none. **Size**: ~0 files.

- [ ] **O17. A sandbox sign-in for the filing suites, and four ci values.** Checked live at
  23:2x UTC on 2026-09-16: the sandbox has no registration page of its own
  (`identity-sandbox.../user/register` and `find-and-update-sandbox...` answer nothing) and no
  create-user API (the test-data generator makes companies only). Its sign-in page is reached
  only through `/oauth2/authorise` with the "- test" application's web client (`e5be4a0d…`, the
  ci client id), a registered redirect (`https://ci-submit.diyaccounting.co.uk/companies-house/filingCallback.html`;
  a branch set's host is not registered and gets 400) and a scope on the live hosts as
  `companiesHouseScope` already builds it (the `api-sandbox` form gets "there is a problem"). That
  page, "Sign in to Companies House", offers GOV.UK One Login, which lands on the production
  `signin.account.gov.uk/sign-in-or-create`, and a Companies House email sign-in for an existing
  account. So the test user is a GOV.UK One Login: the operator creates it at that page with a
  plus-address and an authenticator app (capturing the base32 secret), then signs in once through
  the sandbox chooser and completes whatever Companies House asks; the four ci values are the
  email (variable `TEST_COMPANIES_HOUSE_USER_ID`), the password and the secret (secrets
  `TEST_COMPANIES_HOUSE_PASSWORD`, `TEST_COMPANIES_HOUSE_TOTP_SECRET`) and the "- test"
  application's REST key (`COMPANIES_HOUSE_SANDBOX_API_KEY`). B34.7 then drives the chooser, the
  One Login screens and the permission page, which the suite's one-page `#userId`/`#password`
  selectors do not yet match, against the registered host. The operator tried the route at 00:4x UTC on 2026-09-17 and reached "Find and update company
  information: sorry we are experiencing technical difficulties": the sandbox web service
  `find-and-update-sandbox.company-information.service.gov.uk` answers no connection at all, so the
  One Login route cannot complete until Companies House restores it. Retry the same URL later; if
  it holds for a day, one email to Companies House developer support from the operator's address
  (a machine-ask) naming the host and the time. Blocked on Companies House's sandbox web service.
  Unblocks B34.7. **Source**: BACKLOG 34;
  the developer hub "- test" application, read by the operator 2026-09-16. **Owner**: the operator
  creates the One Login and runs the three secret writes; Claude Code sets the variable and runs
  B34.7. **Model**: Sonnet.

- [ ] **B34.6b. Companies House accounts filing: the sandbox proof.** Submission 000004 (presenter
  E0000052288, company 06846849, 2026-09-13 19:04 UTC) was ACCEPTED by the XML Gateway test
  service; every `GetSubmissionStatus` poll for it answers 9999 "No presenter ID supplied", with
  the body's `PresenterID` plaintext (transaction 1789391567972, 2026-09-14 13:12:48 UTC) and
  hashed (1789481253426, 2026-09-15 14:07:33 UTC); the body is plaintext on `main` (PR #222).
  Nothing on our side is left to try. When Companies House answers O44: if they enable status
  lookups, poll once more on a ci set and pin the result in the test; then apply the `prod`
  listing (held as unreferenced local commit 946251d4). **Source**: BACKLOG 34b. **Owner**:
  Claude Code. **Model**: Sonnet. Blocked on O44's answer from Companies House. **Size**: ~1 file.

- [ ] **B34.7. Run and fix the filing suites' sandbox sign-in.** Batch 9 (6957651c) carries
  the suites' sandbox sign-in with the authenticator step, off by default: `deploy.yml` and
  `probe-test.yml` run the two filing suites only when the dispatch input
  `runCompaniesHouseSandboxFiling` is `true`, and the run fails fast naming any of O17's four
  values that is empty. Against a standing ci set:
  `gh workflow run probe-test.yml -f environment-name=ci -f deployment-name=<ci-set>
  -f behaviour-test-suite=changeRegisteredOfficeBehaviour -f runCompaniesHouseSandboxFiling=true`
  and the same for `changeRegisteredEmailBehaviour`; the first run's screenshots guide any
  selector fix. **Source**: BACKLOG 34. **Owner**: Claude Code. **Model**: Sonnet.
  Blocked on O17. **Size**: ~1 file.

- [ ] **B52i. The company P&L and balance sheet on the dashboard.** `PLAN_ONE_STOP_DASHBOARD.md`
  D10, BACKLOG 52i: the company's diya-gl book saved to the DIYA cloud by
  `../PLAN_FINANCE_AUTOMATION.md` phase 2, derived nightly with the Ltd engine through M1c and M3,
  rendered above the eight objectives beside the last set filed at Companies House. **Source**:
  BACKLOG 52i; plan D10. **Owner**: Claude Code. **Model**: Sonnet. Blocked on the finance plan's
  phases 1 and 2 (the book in the cloud), M1c and M3. **Size**: ~3 files.

## Discipline

- **Push once per batch of landed tracks, never per track**, and prefer one dispatch that
  proves several things over several dispatches. A push per track turned one batch into six
  ci deploys and several environment deploys in a morning on 2026-09-06, each able to open
  alarm issues and cancel each other through the deploy concurrency group, and the operator
  froze pushes twice. A freeze, when the operator calls one, stops `git push`,
  `gh workflow run` and `gh pr create` until they lift it in their own words; local commits,
  worktree tracks and reading logs continue, and a failed job gets a proposed fix in the reply.

