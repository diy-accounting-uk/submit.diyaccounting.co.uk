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

**Prod runs deployment prod-29f3405** (PR #281, run 35167028767, promoted at 01:0x UTC on
2026-09-17), verified against AWS at 01:2x UTC: the pointer names it, nine stacks; run 35167028767 ended green
at 02:0x UTC having destroyed prod-3ce4693; PR #282's deploy of `main` (35171500590) is running.
The SSO token expired at 02:2x UTC: `aws sso login --sso-session diyaccounting` before the next
AWS read. **ci**: `ci-claud0bad` (main's
set) is live; `ci-claudafe1` (b52 branch) self-destructs at about 02:39 UTC; `ci-claud86af` (b53,
PR #282) is standing up; `ci-claudc4d2`'s last stack is being removed by `destroy-ci.yml` run 35170510768 (the 01:2x sweep kept
it as a deployed name).

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

- [ ] **B55.4. Alarm #289: the prod GA4 Lambdas lost their secret ARN when the GitHub copy of
  the key went.** `prod-env-ga4-report-pull-errors` fired at 02:17 UTC on 2026-09-17 (the nightly,
  deployment prod-29f3405); the triage (run at 02:19) found `GA4_SERVICE_ACCOUNT_ARN` unset on the
  Lambda while `GA4_AUTH_MODE=key`, so `resolveServiceAccountCredentialsJson()` throws "Neither
  GA4_SERVICE_ACCOUNT_JSON nor GA4_SERVICE_ACCOUNT_ARN is set". O48 step B deleted
  `GA4_SERVICE_ACCOUNT_JSON` from both GitHub environments on 2026-09-16 (the AWS secrets hold the
  rotated keys), and the ARN the app stacks receive was derived from that secret's presence in
  `deploy-environment.yml`. The AWS secret `prod/submit/ga4/service_account` exists, so the ARN must
  come from the secret's name, not the GitHub secret. In flight on `claude/ops-ga4-arn` (agent
  running). Then close #289 with the next nightly's success. **Source**: issue #289. **Owner**:
  Claude Code. **Model**: Sonnet. **Size**: ~2 files.

- [ ] **B30af.4. The main-deploy guard missed a deploy in the waiting state.** Run 35171600510
  (PR #285's branch deploy): the guard answered "no deploy.yml run in progress or queued on main"
  at 02:54 UTC on 2026-09-17 while `main`'s deploy 35171500590 sat between jobs in GitHub's
  `waiting` status (an environment-protected job), and six ci suites then met CloudFront's "The
  request could not be satisfied" on the apex. `wait-for-main-deploy.mjs` now reads every recent
  run on `main` and counts the ones not completed. In flight on `claude/ops-wait-guard` (PR
  #291); the six jobs are re-running after main's deploy ended green. **Source**: run
  35171600510. **Owner**: Claude Code. **Model**: Haiku. **Size**: ~1 file.

- [ ] **B30aj. Alarm #284: CloudWatch alarms cannot publish to the prod security-findings topic.**
  The re-run triage (run 35172745844, Haiku first pass, 02:02 UTC on 2026-09-17, the first comment
  posted under PR #281's shape) read the alarm history: an alarm fires, its action fails with
  "CloudWatch Alarms is not authorized to perform: SNS:Publish on
  arn:aws:sns:eu-west-2:972912397388:prod-env-security-findings", and that failed publish is itself
  the AccessDenied that `prod-env-cis-unauthorized-api-calls` counts, so the alarm re-fires on its
  own action. The `security-findings` topic in `ObservabilityStack` (or wherever it is declared)
  needs a topic policy statement allowing `cloudwatch.amazonaws.com` to `SNS:Publish`, scoped to
  the account's alarms. In flight on `claude/b54-board` (wave b54, PR #288). Then close #284
  with the fix's run. **Source**: issue #284; run 35172745844. **Owner**: Claude Code. **Model**:
  Sonnet. **Size**: ~2 files.

- [ ] **B53.2. The runbook's rotation entries follow the key audit.** `REPORT_KEY_AUDIT.md`
  (on `main`): §3.3 asserts Google, HMRC and HMRC-sandbox rotation dates that `secrets-rotation.toml`
  leaves blank, so the two disagree and the true dates are unknown; §3.4 names `SUPPORT_ISSUE_PAT`
  and `TEST_HMRC_PASSWORD`, neither of which exists (the bot tokens are `ISSUE_BOT_TOKEN` and
  `SUPPORT_BOT_TOKEN`); `email-hash-secret` has no rotation entry and no code path. Make the toml
  the one source of dates (blank where unknown, §3.3 reading from it), correct §3.4, add an
  `email-hash-secret` entry that names its path once B53.5 lands, and one entry per remaining
  credential kind the report lists without a documented path. In flight on `claude/b54-board` (wave b54, worktree `.claude/worktrees/b54`, PR #288). **Source**: REPORT_KEY_AUDIT.md §3
  gaps 1, 2, 8. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~2 files.

- [ ] **B53.3. `secrets-rotation.toml` and the tracked `.env.*` files, tidied against the audit.**
  The toml's Companies House `presenter_id`/`presenter_code` comment says "not yet set in either
  environment" while ci holds both (`REPORT_KEY_AUDIT.md` gap 5); `.env.simulator`, `.env.test` and
  `.env.proxy` carry secret-named variables in this public repository (gap 6): read each value in the
  tracked files and confirm it is a mock or a public id, replacing any that is not with a reference
  to the environment's secret, and say so in the toml. In flight on `claude/b54-board` (wave b54, worktree `.claude/worktrees/b54`, PR #288). **Source**: REPORT_KEY_AUDIT.md gaps 5, 6.
  **Owner**: Claude Code. **Model**: Haiku. **Size**: ~4 files.

- [ ] **B53.5. A rotation path for `email-hash-secret`.** Created once by hand, no script or
  workflow rotates it (`REPORT_KEY_AUDIT.md` gap 2); the salt (`RUNBOOK_INFORMATION_SECURITY.md` §4)
  has the pattern: a versioned secret, the reader accepting the current and previous version, a
  workflow that mints and promotes. Build the same for the email hash. In flight on `claude/b54-board` (wave b54, worktree `.claude/worktrees/b54`, PR #288). **Source**: REPORT_KEY_AUDIT.md
  gap 2. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~4 files.

## Machine-only

- [ ] **B30af.5. Every ci deploy swaps the shared ci apex, so branch deploys race each other.**
  Incident #290 (03:00 UTC on 2026-09-17): PR #285's branch deploy 35171600510 promoted the apex to
  its set `ci-claud0f3a`, its `submitVatBehaviour` probe met CloudFront's "The request could not be
  satisfied" on the apex, and the run rolled the apex back to `ci-claud86af`, leaving its set
  standing unpromoted. B30af.3's guard only waits for `main`; two branch deploys, or a branch and
  a rollback, still contend. The clean shape is a branch deploy that never touches the apex: its
  probes navigate `https://<deployment>.submit.diyaccounting.co.uk`, which needs each deployment's
  host among the Cognito app client's callback and logout URLs (`IdentityStack.java`
  `buildCallbackUrls`/`buildLogoutUrls`, apex and public domain only today) and the probe base URL
  switched per ref. Design the URL list (one callback per standing set, added and removed by the
  deploy, or a wildcard the pool allows), then build it; only `main`'s deploy promotes the apex.
  **Source**: issue #290; run 35171600510. **Owner**: Claude Code. **Model**: Opus for the design,
  Sonnet to build. **Size**: ~4 files.

## Machine-ask

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
  **Source**: B55; PRs #237, #241, #245, #247; `PLAN_GOOGLE_AS_CODE.md` items 9 and 11. **Owner**:
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

- [ ] **B52y.3. The security lake nightly's fix is on prod; the next nightly proves it.** PR #255
  (57d7c31e) degrades a failed GitHub alert endpoint to a null row, and main's environment deploy
  (run 35078117666, 09:5x UTC on 2026-09-16) carried it. Read the 03:15 UTC run on 2026-09-17 in
  `/aws/lambda/prod-env-security-lake-nightly`: no "Invoke Error", no warn line for a GitHub alert
  endpoint (the token gained security-events read on 2026-09-16, 20:1x UTC), rows for all three
  alert types written for the day; then close #249. **Source**: issue #249. **Owner**:
  Claude Code. **Model**: Haiku. Blocked on the 03:15 UTC run on 2026-09-17. **Size**: ~0 files.

- [ ] **B52y.4. The cost views are live; check the Glue Data Quality ruleset after its next run.**
  PR #255 (319a9e89) made `cost_focus` resolve its Parquet columns by position and typed the four
  period columns and `x_Discounts` as the file has them; after main's environment deploy
  `v_cost_daily` answers 5,871 rows for 2026-09-01 to 09-15 (11:2x UTC on 2026-09-16). Left: Glue
  Data Quality reads the table through Spark, which may not honour `parquet.column.index.access`,
  so `COST_FOCUS_RULESET`'s `IsComplete "billed_cost"` (`DataQuality.java` ~99–105) may still report
  incomplete; read the ruleset's next result and, if it does, give the rules the positional reader
  or the Parquet names. **Source**: B52y.2's snapshot check; `PLAN_ONE_STOP_DASHBOARD.md` D13.
  **Owner**: Claude Code. **Model**: Sonnet. Blocked on the ruleset's next run: `prod_env_cost_focus_dq` last ran at 02:16 UTC on
  2026-09-16, before the deploy, so the first result on the fixed table is 2026-09-17's
  (`aws --profile submit-prod glue list-data-quality-results`). **Size**: ~1 file.

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

