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

**Prod runs deployment prod-a84311b** (PR #257, run 35085063660, promoted under the `deploy-ops` gate
at 10:5x UTC on 2026-09-16; the same run destroyed prod-7137772, which PR #255's run had promoted at
09:5x), verified against AWS at 11:2x UTC on 2026-09-16: nine stacks CREATE_COMPLETE, every composite
alarm OK, re-verified 19:2x UTC. **ci**: `ci-claudc4d2` (the b49 branch, created 18:24 UTC, ten
stacks) carries PR #266's redeploy and self-destructs at about 22:24 UTC; nothing else stands.

The board runs in five sections, in this order: **in flight** (a branch, a pull request or a run
in motion, each named in the row), **machine-only**, **human and machine**, **human-only**,
**blocked**. The section is the classification — what it takes to carry the row to
completion, not who owns it now — so no row carries a separate tag that could drift from where it
sits. `human-only` is work no session can do: an external registration, a console action with no
API, a filing against the operator's own company, an email from their address, a decision between
named alternatives. A row whose only human step is merging its PR is machine-only; that is the
standing workflow, not an action the row needs. Within a section, items run by the size of the
change to committed files, least first (operator, 2026-09-13); a row that changes nothing
committed — a comment, a run, a scan, a console action — comes before any code. Operator items
are briefed in `../BRIEF_OPERATOR_RUNBOOK_2026-09-13.md` at the workspace root,
with the detail behind each task in the four `../BRIEF_OPERATOR_TASKS_*.md` files
(`2026-09-13` carries the rows the earlier three do not).
Every item names its model: the lowest tier that fits (Fable > Opus > Sonnet > Haiku), or
`none` for a human step.

## In flight

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
  Claude Code. **Model**: Sonnet. In flight on `claude/b51-board` (worktree `b51-wif`): the operator's
  start of `ci-env-analytics-nightly` at 19:28 UTC on 2026-09-16 proved `ga4-daily-pull` and
  `ga4-report-pull` federated and failed `ga4-event-export-pull` on "The size of mapped attribute
  google.subject exceeds the 127 bytes limit", so `google/identity.toml`'s AWS providers map the
  subject to the role name instead of the assumed-role ARN; after `google apply` runs on `main`, the
  operator starts the state machine once more (`BRIEF_OPERATOR_TASKS_2026-09-16.md` task 5), and
  the key removal follows the clean run. **Size**: ~12 files.

- [ ] **O28. Send `Gov-Client-Multi-Factor` on every request: mandate MFA in the pool.** Every
  monthly advisory HMRC has raised is this header missing (`../REPORT_HMRC_HEADER_ADVISORIES.md`).
  Step 2b is on main (#198, b0e3d2be): the browser sends its Cognito ID token as
  `X-Id-Token`, `customAuthorizer.js` verifies it against the access token's `sub` and passes
  `custom:mfa_method`, the federated flag and `auth_time` to `buildFraudHeaders.js`, which builds
  the header (TOTP for an enrolled native user, OTHER for federated Google) and warns
  `HMRC REQUIRED HEADER MISSING:` for a password-only native user, whom only the pool setting
  reaches. The prod async-requests table holds nothing (TTL), so the scan could not size the
  cohorts; `prod-env-hmrc-api-requests` keeps 20 days and showed 3 production VAT POSTs from 3
  users, 2 without the header.
  Merged to `main` as f0800529 (PR #266, 19:5x UTC on 2026-09-16): `Mfa.REQUIRED` and the ci test
  user's TOTP rotation under it (`ensure-cognito-test-user.js` answers `MFA_SETUP` and
  `SOFTWARE_TOKEN_MFA`, each lane's secret at `<env>/submit/test/<lane>/totp-secret`); the branch
  redeploy's ci suites, `authBehaviour` included, passed with enrolment enforced. Main's deploy
  carries it to prod; the row closes when that deploy promotes. **Source**: `../REPORT_HMRC_HEADER_ADVISORIES.md`.
  **Owner**: Claude Code. **Model**: Haiku. **Size**: ~6 files.

## Machine-only

- [ ] **B30af. A deploy that starts during a scheduled prod probe still swaps the apex under it.**
  Issue #273 (20:31 UTC on 2026-09-16): the 19:46 UTC scheduled `probe-test.yml` run found no deploy
  in flight at its "Wait for a deploy in progress on main" step (lines 236–256), then PR #266's
  deploy of `main` started at 19:5x and promoted prod-f080052 while the probe's `submitVatBehaviour`
  and `tokenRefreshBehaviour` suites were navigating at 20:28: both failed with
  `ERR_SSL_VERSION_OR_CIPHER_MISMATCH` on the apex, everything before the navigation having passed
  (the new test-user rotation enrolled both prod lanes cleanly). The guard covers only a deploy
  already running. Either the guard re-checks immediately before each suite's navigation and waits
  again, or `deploy.yml`'s promotion step waits for a running scheduled probe; pick the one that
  does not hold a deploy for 40 minutes, then close #273. **Source**: issue #273; run 35142540653.
  **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~1 file.

- [ ] **B30ag. The alarm-to-issue Lambda opens two issues when SNS delivers twice.** #273 and #274
  were created in the same second for one transition of `prod-env-github-probe-failed`;
  `app/functions/ops/alarmToGithubIssue.js` lists open `alarm` issues before creating (lines
  264–281) and its own comment (268–270) names the race: two invocations of one notification both
  search before either creates. Make the create idempotent: a conditional write keyed on the alarm
  name and state-change timestamp (the existing DynamoDB table the ops Lambdas use, or a
  `PutItem` with `attribute_not_exists`) before the GitHub call, so the second invocation comments or
  exits. Unit test with two concurrent invocations. #274 is closed as the duplicate. **Source**:
  issues #273, #274. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~2 files.

- [ ] **B56. `test` and CodeQL as required status checks on `main`.** O46 settled on 2026-09-16:
  ruleset 16057564 keeps `Check commit signatures` required with the Admin role as its only bypass
  actor, `RELEASE_PAT` carries `publish.yml`'s bump, and a docs push by an admin lands directly.
  Add the contexts to the same ruleset body (`gh api -X PUT .../rulesets/16057564`): the check
  names on a code head are `npm test`, `maven test`, `eslint` and `CodeQL`. Decide first what a
  docs-only PR does, since `test.yml` and CodeQL skip it under their paths filters and the
  contexts would then read "expected" for a non-admin author (an admin's merge bypasses): either
  a job in `test.yml` that runs on every PR and reports the context, or leave docs-only PRs to the
  bypass. **Source**: BACKLOG 56. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~1 file.

## Human and machine

- [ ] **B11.T10. ITSA phase 2: the recognition pack.** `PLAN_ITSA_PHASE_2.md` T10, its inputs (T7r, T21, T22) on `main`:
  `_developers/hmrc/ITSA_PRODUCTION_APPROVALS_CHECKLIST.md`, an ITSA pass over the two
  questionnaires, and the two draft emails for the operator to send. One application now covers
  both approval stages, and the checklist answers for all nine APIs in the minimum functionality
  standards with a build behind each. **Source**: BACKLOG 11; `PLAN_ITSA_PHASE_2.md` T10.
  **Owner**: Claude Code re-runs the sandbox year on a ci set so the run sits inside HMRC's 14-day log window; then the operator sends `DRAFT_EMAIL_ITSA_RECOGNITION.md` (the pack is on `main` since PR #237, `_developers/hmrc/`) and `DRAFT_EMAIL_ITSA_PRODUCTION_CREDENTIALS.md` when SDST answers. **Model**: Haiku. **Size**: ~3 files.

## Human-only

- [ ] **O17. Register the Companies House sandbox test user and set four ci values.**
  Companies House has no create-test-user API, so the operator registers a throwaway account
  on identity-sandbox.company-information.service.gov.uk with an authenticator second factor
  and puts on the GitHub `ci` environment: the variable `TEST_COMPANIES_HOUSE_USER_ID` (its
  email) and the secrets `TEST_COMPANIES_HOUSE_PASSWORD`, `TEST_COMPANIES_HOUSE_TOTP_SECRET`
  (the authenticator secret) and `COMPANIES_HOUSE_SANDBOX_API_KEY` (the test application's
  REST key, for creating the run's test company). Unblocks B34.7. **Source**: BACKLOG 34; **Owner**: Operator. **Model**: none.

- [ ] **O44. Tell Companies House's XML team what B34.6b submitted.** One email from your address
  to Neal at `xml@companieshouse.gov.uk`, naming: presenter E0000052288, company 06846849, test
  package reference 0012; submissions 000002 and 000003 (2026-09-13 18:19 UTC) rejected with error
  9999 "No element 'Authority'", since fixed; submission 000004 (19:04 UTC) acknowledged with no
  errors; and that every `GetSubmissionStatus` for 000004 answers 9999 "No presenter ID supplied", with the
  `PresenterID` plaintext (transaction 1789391567972, 2026-09-14 13:12:48 UTC) and hashed
  (transaction 1789481253426, 2026-09-15 14:07:33 UTC).
  Ask whether 000004 was accepted and whether status lookups are enabled for this presenter.
  **Source**: BACKLOG 34b. **Owner**: Operator. **Model**: none.

- [ ] **O48. Rotate the GA4 service-account key: it was printed in public job logs.** Found 03:0x UTC
  on 2026-09-16: `google-apply.yml` passed the key's JSON to eight steps as a step env, GitHub's
  `add-mask` matched only the single-line value, and the pretty-printed JSON, private key included,
  appeared in the env block of every run's log on this public repository; the fifteen runs with logs
  (back to 2026-09-11) had their logs deleted at 03:0x UTC, and the session's local copies were
  removed. The account `ga4-report-pull@diyaccounting-ga4.iam.gserviceaccount.com` holds
  `roles/owner` on the project. Rotate now, through the code path (creates a new key, writes it to
  both environments' secrets, disables the old one):
  `gh workflow run google-key-rotate.yml --ref main -f apply=true`
  then read the run and confirm the old key id is disabled; the workflow fix that stops the printing
  is B55.3 (wave b44). Write the date into `secrets-rotation.toml`'s `ga4/service_account` row.
  **Source**: run 35049344705; this session. **Owner**: Operator. **Model**: none.

- [ ] **O23. Open a Google Ads account for the paid-traffic experiments.** Both earlier Ads
  accounts were cancelled (`google-analytics.toml`); the reinvestment loop (plan row D17) needs
  one with conversion import from GA4 property 523400333's key events, and a reserve floor
  the loop must not spend below. Name the floor to Claude Code with the account id; the first
  test is designed as on-off weeks before any spend. **Source**: `PLAN_ONE_STOP_DASHBOARD.md`
  D17. **Owner**: Operator. **Model**: none.

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

- [ ] **O33. Tell HMRC's SDS team the licence changed.** One paragraph: the MTD approval
  submission and the production-credentials email described the service as AGPL open source, and
  the PolyForm licence files are on main and on prod since prod-318271f. **Source**:
  `PLAN_LICENSING_UPLIFT_SUBMIT.md` H-LU-9. **Owner**: Operator. **Model**: none.

## Blocked

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

