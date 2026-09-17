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

**Prod runs deployment prod-b8bd2f3** (the scheduled `deploy.yml` run 35205082047 of main's docs head
b8bd2f37, the same code as PRs #294 and #291; last-known-good set at 10:07 UTC on 2026-09-17; it is
destroying prod-9284434). **ci**: `ci-set1` (PR #295's set, last-known-good at 10:06 UTC) is live; its self-destruct schedule from
the slot's first claim fires next at 11:44 UTC (B30af.7). PR #295 merged as 53bc2d1c; `main`'s
deploy 35210720771 is running.

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

- [ ] **B30af.8. The main-deploy guard waits for main's whole run, not for its apex move.**
  `wait-for-main-deploy.mjs` holds every branch probe while any `deploy.yml` run on `main` is
  not completed. On 2026-09-17 PRs #295 and #297 sat in that wait from 08:39 UTC while main's
  run 35194544211 deployed its prod stacks and destroyed the previous prod set, though the ci
  apex is only touched by main's `set origins` job, which had finished; the guard's 40-minute
  ceiling released them, and the same guard runs again inside every behaviour job ("Wait for a
  deploy in progress on main before navigating the apex"), where the daily scheduled prod deploy
  (35205082047, 09:25 UTC) caught #295's last two suites for a second 40 minutes; behind that,
  #297's `wait for previous cleanup` gave up after its 90-minute ceiling waiting for #295's run.
  Read main's in-flight run's jobs (`/actions/runs/<id>/jobs`) and wait
  only until its `set origins` job (and `roll back apex` if it runs) is completed, or until the
  run ends; `.github/actions/wait-for-main-deploy/wait-for-main-deploy.mjs` and its unit test.
  In flight on `claude/b57-board` (agent working). **Source**: runs 35194697647 and 35196041181's probe `params` jobs. **Owner**: Claude Code.
  **Model**: Sonnet. **Size**: ~2 files.

- [ ] **B30af.7. A slot reclaim re-anchors the slot's self-destruct clock.** `ci-set1`'s
  `SelfDestructStack` keeps the schedule of the slot's first claim (`cron(44 7/4 * * ? *)` from
  03:47 UTC on 2026-09-17), so the redeploy of the same ref at 07:33 was cut across at 07:44 while
  it waited on the environment deploy: the self-destruct removed Ops, Publish and Edge under it.
  When `claim-ci-slot` reclaims a slot (same ref, or stale), the deploy must move the schedule
  to creation-plus-delay from the claim, or delete and recreate the `SelfDestructStack`, so a
  redeploy always has a full window. `SelfDestructStack.java`, `claim-ci-slot.mjs`, `deploy.yml`.
  In flight on `claude/b57-board` (agent working). **Source**: the self-destruct log `/aws/lambda/ci-env-self-destruct-eu-west-2` at 07:44 UTC on
  2026-09-17. **Owner**: Claude Code. **Model**: Sonnet.
  **Size**: ~3 files.

- [ ] **B30am. Alarm #298: the prod activity Telegram forwarder errors under a burst.**
  `prod-env-activity-stack-health` fired at 08:14 UTC on 2026-09-17 on
  `check-prod-env-activity-telegram-forwarder-errors` (back to OK at 08:15). Lambda `Errors` for
  `prod-env-activity-telegram-forwarder`: 9 in the five minutes from 07:50 UTC and 1 at 08:10,
  during an invocation burst (32, 49, then 96 per five minutes) from the two prod deploys'
  behaviour tests; the log holds eight `Telegram API error` warns at 07:55:09 (`429 Too Many
  Requests: retry after 5`, chat -5204035635) and no ERROR or timeout line, so the nine errors
  left no log. `sendTelegramMessage` (`activityTelegramForwarder.js` ~112) posts once and only
  warns on a non-2xx; `check-...-log-errors` stayed OK. Find what the runtime counted as the nine
  errors (the REPORT lines of those invocations, `Status: error`, or an init failure), then honour
  `retry_after` with one bounded retry so a burst is delayed rather than dropped, and tell the
  triage the alarm exists: its comment said the alarm and function are gone, which
  `describe-alarms` contradicts. Found: ten invocations hit the Lambda's 10 s timeout on an unbounded fetch; the send is
  now bounded at 4 s with one 429 retry. In flight on `claude/b56-board`, PR #299. **Source**: issue #298. **Owner**: Claude Code. **Model**:
  Sonnet. **Size**: ~2 files.

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

## Machine-only

## Machine-ask

- [ ] **B52y.5. The ops GitHub token cannot read Dependabot or secret-scanning alerts.** The
  same nightly logs `GitHub API error fetching dependabot/alerts: 403 {"message":"Resource not
  accessible by personal access token"}` and the same for `secret-scanning/alerts`, and publishes a
  null row for each. The token is the one in `prod/submit/github/issue_bot_token` (and ci's). The
  operator grants it, at https://github.com/settings/tokens, repository permissions Dependabot
  alerts: read and Secret scanning alerts: read (a classic token: `security_events` covers code
  scanning only, so a fine-grained token is the shape that can). No code changes. **Source**: issue
  #249. **Owner**: operator (the token), then the next nightly. **Model**: Haiku. **Size**: ~0 files.

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

- [ ] **B30af.6. Register the four slot hosts' redirect URIs with HMRC and Companies House (P2).**
  After P1 names the slots: eight URIs, `https://ci-set<N>.submit.diyaccounting.co.uk/activities/submitVatCallback.html`
  (HMRC Developer Hub, the sandbox application, which today holds the prod host, the ci apex and
  `local.submit…:3443`) and `https://ci-set<N>.submit.diyaccounting.co.uk/companies-house/filingCallback.html`
  (the Companies House "- test" application's web client). Both hubs are console forms with no
  API, so this is the operator's, signed in; the design's §6 names the unknown that decides N: HMRC's
  cap on redirect URIs per application. Proof: the design's §3 `curl` answers 200 for each slot
  host. **Source**: the design, P2. **Owner**: Operator, in both hubs. **Model**:
  none. **Size**: ~0 files.

## Blocked

- [ ] **B30af.5. Branch deploys leave the ci apex: P3 to P5.** P1 (the slot pool) is on `main`
  (PR #295): a ci branch deploy claims `ci-set1` to `ci-set4` through SSM. Left, in
  `_developers/DESIGN_CI_BRANCH_DEPLOYS_OFF_THE_APEX.md`: P3, `IdentityStack` lists the four slot
  hosts as Cognito callback and logout URLs; P4, a non-prod set's public host is its own host so
  every probe and Lambda moves together; P5, `set-origins` and `rollback-origins` become prod-only
  and a `promote-ci-apex.yml` runs after the probes. P3 follows the hub registrations. **Source**:
  the design. **Owner**: Claude Code. **Model**: Sonnet. Blocked on B30af.6 (P2). **Size**: ~9
  files.

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

