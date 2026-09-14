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

**Prod runs deployment prod-b364438** (main at b364438e, the daily 04:11 UTC deploy cron run
5h39m late as run 34830100013, promoted 10:22 UTC on 2026-09-14 and `prod-5ca7bca` destroyed by 10:42);
the only prod set.
**ci at 12:00 UTC**: no app stack in the account and `/submit/ci/last-known-good-deployment`
is None (the 08:04 sweep, run 34820856912).

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

**COOL-DOWN is on since 2026-09-14T13:40:19Z.** No new board rows except a degradation. Agents commit
and stop. One branch is driven green at a time. Lifted only by the operator in their own words.

- [ ] **B17v.1. Capture the five walkthrough videos.** The three prod captures are done
  (`view-liabilities` run 34651931632, `view-payments` 34689643435, `view-penalties` 34689889022).
  The `itsa-quarterly-update` capture (run 34774550386) stalled on the dashboard defect PR #201
  fixed; the three `itsa-business-details` captures on `ci-vatview` (runs 34790185457,
  34790343028, 34790629770) failed on browser errors and the scene fix sits on local branch
  `main` (dd45a7bb, PR #209 merged 14:41 UTC on 2026-09-14 as 658f986e). The three prod recordings are checked and in
  `videos/publish.json` on local branch `claude/b31-videos` (c5d394b4, unpushed, held until
  cool-down lifts). The three ci captures of 2026-09-14 (runs 34847383246, 34849517903,
  34850667197, all `-f deployment-name=ci-claud3123`) died on the sign-in return: the browser
  started login on `https://ci-claud3123.submit.diyaccounting.co.uk/`, Cognito's `redirect_uri`
  is the apex `https://ci-submit.diyaccounting.co.uk/`, and the OAuth state stored on the first
  origin is absent on the second ("OAuth state mismatch", `hasStoredState: false`). Re-dispatch
  each without `deployment-name`, so the base URL is the apex the set serves:
  `gh workflow run video-capture.yml --ref claude/b31-board -f script=<script> -f environment-name=ci`,
  against a standing ci set; then replace the 2026-09-07 `itsa-business-details` entry and add
  `itsa-quarterly-update` to the manifest.
  Then check all five artifacts and write `videos/publish.json`, replacing the 2026-09-07
  `itsa-business-details` entry. Two things the scripts could not settle: the quarterly-update
  script stops with the form filled except `businessId` (only known at run time), and
  `itsa-business-details.json` may no longer pass since the activity's first page is
  `dashboard.html`. **Source**: BACKLOG 17b, 17c. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~1 file.


- [ ] **B80b. The identity guard has to reach the other four repositories.** Submit carries
  `.github/allowed-commit-identities.yml`, `.github/workflows/identity-guard.yml` and
  `scripts/check-commit-identities.sh`: a pull-request check that fails when a commit's author email
  is not on a plain, human-edited allow list. Spreadsheets carries it on main (29e13023); the other
  three are open PRs on branch `claude/ops-identity-guard` in each repository, awaiting O46's
  review of their allow lists: www #31, root #32, archive #35, all three green and mergeable at
  12:00 UTC on 2026-09-14. Left here: merge each once O46 approves it.
  **Operator decisions, 2026-09-12.** All four from worktrees in this session, one PR each, no
  sibling checkout touched — the method already used for the attribution-pointer PRs. Each allow
  list is derived from that repository's own author history, and the PR body prints every address
  with its commit count and date range for O46's review. The check fails the PR, matching submit,
  rather than reporting non-blocking.
  **Source**: B80's fix. **Owner**: Claude Code. **Model**: Haiku per repository. **Size**: ~12 files.

- [ ] **B34.6b. Companies House accounts filing: the sandbox proof.** Submission 000004 (presenter
  E0000052288, company 06846849, 2026-09-13 19:04 UTC) was ACCEPTED by the XML Gateway test
  service; every `GetSubmissionStatus` poll for it answers 9999 "No presenter ID supplied", the
  tenth at 13:12:48 UTC on 2026-09-14 (transaction 1789391567972, on `ci-claud3123`). The logged
  request is schema-correct: `SubmissionNumber` then `PresenterID` in the
  `xmlgw.companieshouse.gov.uk` namespace, and the same header authenticated the accepted
  submission. One asymmetry is left to try: the header's `SenderID` is `md5(presenterId)`, the
  body's `PresenterID` is plaintext. Sending the hashed form is on local branch
  `claude/ltd-status-poll` (474c7240, one file and its test, unpushed, held until cool-down
  lifts); then a ci deploy carrying it and one poll settle it. O44 asks Companies House in
  parallel and can cite the 13:12:48 transaction. The `prod` listing (held as unreferenced local
  commit 946251d4) waits on a poll that returns a status. **Source**: BACKLOG 34b. **Owner**:
  Claude Code. **Model**: Sonnet. **Size**: ~1 file.

## Machine-only

- [ ] **B156. The alarm-triage skip comment runs `gh` without a repository.** Run 34862119217
  (15:26 UTC on 2026-09-14, issue #212) failed at "Comment that triage was skipped": the `triage`
  job has no checkout, so `gh issue comment` (`.github/workflows/alarm-triage.yml:94`) cannot infer
  the repository and dies with "not a git repository", and the issue gets no comment, which is the
  case the step exists for. Add `--repo "$GITHUB_REPOSITORY"`. **Source**: run 34862119217.
  **Owner**: Claude Code. **Model**: Haiku. **Size**: ~1 file.

- [ ] **B157. One alarm transition opened two issues.** #210 and #212 carry the same alarm
  (`prod-env-github-probe-failed`), state change and timestamp (15:26:00.881 UTC on 2026-09-14).
  `app/functions/ops/alarmToGithubIssue.js` dedupes by a GitHub search for an open issue with the
  title (line 270), and two invocations of the same notification a moment apart both search before
  either has created, and the search index lags anyway. Make the create idempotent: a conditional
  put keyed on alarm name and state-change timestamp in an existing ops table before the create, or
  list open issues through the REST issues endpoint (not search) and set the function's reserved
  concurrency to 1; then close #212 as the duplicate. **Source**: issues #210, #212. **Owner**:
  Claude Code. **Model**: Sonnet. **Size**: ~2 files.

- [ ] **B155. `video-capture.yml` prints the capture lane's password and TOTP secret in its log.**
  The `Record <script>` step's `env:` block echoes `TEST_AUTH_PASSWORD` and `TEST_AUTH_TOTP_SECRET`
  unmasked (run 34850667197, 13:42 UTC on 2026-09-14) because they come from a step output, which
  GitHub does not mask. The lane's user is rotated per run and native auth is disabled after, so
  the exposure is the run's own window, in a public repository's log. Emit `::add-mask::` for both
  values in the step that produces them (the `cognito-test-user` step or its script), and check
  `probe-test.yml` and `deploy.yml` for the same pattern. **Source**: run 34850667197. **Owner**:
  Claude Code. **Model**: Haiku. **Size**: ~2 files.

- [ ] **B154. `youtube-check.yml` compares channel handles case-sensitively.** Its first
  scheduled run (34848766784, 13:21 UTC on 2026-09-14) failed: the stored refresh token resolves
  to `@diyaccountingsubmit`, `google/youtube.toml` declares `@DIYAccountingSubmit`, and
  `scripts/youtube-upload.js`'s comparison (around line 363) treats those as different channels.
  YouTube handles are case-insensitive; compare them so, with a unit test. **Source**: run
  34848766784. **Owner**: Claude Code. **Model**: Haiku. **Size**: ~2 files.

- [ ] **B153. The prod drift check fails on API Gateway's own normalisation.** The first
  Monday run on the new slot (34847862007, 13:13 UTC on 2026-09-14) reports
  `prod-b364438-app-ApiStack` DRIFTED: API Gateway stores the CORS `ExposeHeaders` added by
  f7654464 (`Location`, `Retry-After`, `ETag`) in lowercase, and the default stage's access-log
  `DestinationArn` without the `:*` suffix `LogGroup.getLogGroupArn()` appends
  (`ApiStack.java:169` and `:247`). Write both the way API Gateway stores them, with the CDK test,
  so the template matches. **Source**: run 34847862007. **Owner**: Claude Code. **Model**: Haiku.
  **Size**: ~2 files.

- [ ] **B52y. The nightly snapshot has not published since 2026-09-13 03:16.** Issue #208
  (`prod-env-operator-snapshot-publish-errors`, 03:18 UTC on 2026-09-14): the 03:15 run's
  three invocations each died in `pollUntilTerminal`
  (`app/functions/analytics/operatorSnapshotPublish.js:408`) with Athena `TABLE_NOT_FOUND:
  awsdatacatalog.prod_env_analytics.security_hub_findings`, so `snapshots/prod/latest.json`
  still dates from 2026-09-13 03:16 and none of PR #207's five objectives has filled.
  Cause: `SecurityLakeStack` (`SubmitEnvironment.java:399`, Glue tables `security_hub_findings`,
  `guardduty_findings`, `github_alerts` and the nightly writer) is in the CDK app but
  `deploy-environment.yml` deploys eight env stacks and not that one, so the tables do not exist
  on prod (Glue database `prod_env_analytics` has no `security_*` table). Two fixes, one row:
  add the `env-SecurityLakeStack` job to `deploy-environment.yml` where its dependencies place
  it, and make one observation's failed query answer null for that observation instead of failing
  the whole publish. Then check `latest.json` for any observation that answers null where its
  view has rows (two views are monthly or quarterly grain, so a 30-day window can be empty by
  design). **Source**: `PLAN_ONE_STOP_DASHBOARD.md` D7, D13, D14, D15. Closes #208. **Owner**:
  Claude Code. **Model**: Sonnet. **Size**: ~3 files.

- [ ] **B30x. The CIS console-sign-in-without-MFA alarm fires on SSO sign-ins.** Issue #206:
  `prod-env-cis-console-signin-without-mfa` fired at 23:42 UTC on 2026-09-13 for the operator's
  own SSO console sign-in (CloudTrail: `ConsoleLogin`, `userIdentity.type = AssumedRole`,
  `AWSReservedSSO_AdministratorAccess`, `MFAUsed = No`, which is what every federated sign-in
  reports). CIS 3.2's own filter adds `$.userIdentity.type = "IAMUser"`; add that clause to the
  metric filter in `ObservabilityStack.java` with its test, and the issue closes when it reaches
  prod. **Source**: issue #206. **Owner**: Claude Code. **Model**: Haiku. **Size**: ~2 files.

- [ ] **B52v. The 5xx behind the operator dashboard's first open.** The sign-in path is on
  `main` (82ea7ab8, PR #209) and reaches prod with 658f986e's deploy (run 34856840995): the activity is listed for a signed-in operator, the denial names
  the pass, the page uses the shared header and returns to itself after sign-in. The 5xx of 23:38
  UTC on 2026-09-13 (issues #204 `prod-e371587-app-api-5xx` and #203
  `operator-snapshot-get-log-errors`) is not reproduced: that deployment's logs are gone,
  `prod-b364438`'s `operator-snapshot-get` log group has no events, the Lambda's role holds
  `dynamodb:Query` on `prod-env-bundles` and `s3:GetObject` on `snapshots/prod/*`, and the
  object exists. Left: read `/aws/lambda/prod-<set>-app-operator-snapshot-get` after B52z's
  attempt on `prod-658f986` and fix what it logs; both issues close then. `auth-status.js`'s
  `logout()` awaits `window.envReady` unconditionally, which throws on a page that never loads
  `submit.js` (the agent's finding, unfixed). **Source**: operator, 2026-09-13. **Owner**: Claude
  Code. **Model**: Sonnet. **Size**: ~1 file.

## Human and machine

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
  Left, the human half first: `IdentityStack.java:184` is `.mfa(Mfa.OPTIONAL)`. With REQUIRED a
  returning native-auth customer who never enrolled meets Cognito's hosted-UI "Set up multi-factor
  authentication" interstitial right after their password — QR code or manual secret, then a
  6-digit confirm — with no skip; federated Google users see nothing. Walk that path once as a new
  customer on ci and say go. Then the machine half: the one-word change, its CDK test, and a ci
  deploy proving native sign-in still completes. **Source**: `../REPORT_HMRC_HEADER_ADVISORIES.md`.
  **Owner**: Operator decides, Claude Code changes. **Model**: Haiku. **Size**: ~2 files.

## Human-only

- [ ] **B52z. Issue the operator pass and open the dashboard.** The `operator` pass type is on
  main (PR #207) and on prod since prod-5ca7bca. The operator's half:
  ```
  ! gh workflow run generate-pass.yml -f pass-type=operator -f email=<the email you sign in to submit with> -f environment=prod
  ```
  redeem the QR from the run's artifact, and open
  https://submit.diyaccounting.co.uk/operator/dashboard.html. **Source**: `PLAN_ONE_STOP_DASHBOARD.md`
  D1. **Owner**: Operator. **Model**: none.

- [ ] **O46. Approve the three allow lists.** Each of B80b's PRs (www #31, root #32, archive #35)
  prints every author address with its commit count and date range; strike or approve each before
  merge, because an address on the list is an identity the guard will accept from then on.
  **Source**: B80's fix. **Owner**: Operator. **Model**: none.

- [ ] **O17. Register the Companies House sandbox test user and set four ci values.**
  Companies House has no create-test-user API, so the operator registers a throwaway account
  on identity-sandbox.company-information.service.gov.uk with an authenticator second factor
  and puts on the GitHub `ci` environment: the variable `TEST_COMPANIES_HOUSE_USER_ID` (its
  email) and the secrets `TEST_COMPANIES_HOUSE_PASSWORD`, `TEST_COMPANIES_HOUSE_TOTP_SECRET`
  (the authenticator secret) and `COMPANIES_HOUSE_SANDBOX_API_KEY` (the test application's
  REST key, for creating the run's test company). Unblocks B34.7. **Source**: BACKLOG 34; **Owner**: Operator. **Model**: none.

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
  and a private key into Secrets Manager. Neither depends on signing. B77's support-form work now reads the same
  `OPS_GITHUB_TOKEN_SECRET_ARN` config point the alarm Lambda uses, so rotating the secret
  `{env}/submit/github/issue_bot_token` in ci and prod to the app's token moves both public-write
  paths onto it at once, with no code change and no new secret name. While deciding, settle recommendation 12 as well: the byline on articles
  and support replies, before the emails-to-articles pipeline is built, because that is the largest
  volume of machine-written public prose the company will produce. **Source**:
  `REPORT_IDENTITY_AUDIT.md` section 8, recommendations 2, 3 and 12. **Owner**: Operator.
  **Model**: none.

- [ ] **O33. Tell HMRC's SDS team the licence changed.** One paragraph: the MTD approval
  submission and the production-credentials email described the service as AGPL open source, and
  the PolyForm licence files are on main and on prod since prod-318271f. **Source**:
  `PLAN_LICENSING_UPLIFT_SUBMIT.md` H-LU-9. **Owner**: Operator. **Model**: none.

- [ ] **O45. A token that can write issues in the spreadsheets repository.** The support form's
  page links, its Lambda's `SUPPORT_GITHUB_REPO` and the spreadsheets `support.md` template are all
  on the two mains (PR #198, spreadsheets PR #109). The Lambda's token
  (`{env}/submit/github/issue_bot_token`, read through `OPS_GITHUB_TOKEN_SECRET_ARN`) is scoped to
  submit, so the form cannot post there until it is replaced. Two named alternatives: a fine-grained
  PAT covering both repositories as the interim, or O38's `diya-ops` app installed on both as the
  destination. Either way the value goes on the `ci` and `prod` GitHub environments under the
  existing secret name and reaches Secrets Manager through `deploy-environment.yml`. **Source**:
  B135. **Owner**: Operator. **Model**: none.


- [ ] **O37. Turn on SSH commit signing.** `REPORT_GIT_CONFIG.md` settles what the config should
  be and why: keep `pull.rebase=true`, because a rebase re-signs each replayed commit when
  `commit.gpgsign` is a standing default rather than a per-commit flag, and keep
  `rerere.enabled=true`, whose guard is `rerere.autoupdate` staying unset so a replayed resolution
  still pauses for review. What is left is three global lines and registering the key: set
  `gpg.format ssh`, `user.signingkey` and `commit.gpgsign true`, and add the SSH key as a signing
  key on the GitHub account. One global config covers all six repositories, since each has one
  committer. `verify-commit-signatures.yml` is on the batch and reports each commit's
  `verification.verified` in the job summary without failing, because no commit is signed yet;
  flip its last step to fail and make it a required ruleset check once signing is routine. This
  is what every auto-merge policy in `PLAN_REPOSITORY_AUTOMATION.md` rests on. **Source**:
  `REPORT_GIT_CONFIG.md`; `REPORT_IDENTITY_AUDIT.md` section 9. **Owner**: Operator. **Model**:
  none.


- [ ] **O44. Tell Companies House's XML team what B34.6b submitted.** One email from your address
  to Neal at `xml@companieshouse.gov.uk`, naming: presenter E0000052288, company 06846849, test
  package reference 0012; submissions 000002 and 000003 (2026-09-13 18:19 UTC) rejected with error
  9999 "No element 'Authority'", since fixed; submission 000004 (19:04 UTC) acknowledged with no
  errors; and that every `GetSubmissionStatus` for 000004 answers 9999 "No presenter ID supplied".
  Ask whether 000004 was accepted and whether status lookups are enabled for this presenter.
  **Source**: BACKLOG 34b. **Owner**: Operator. **Model**: none.

## Blocked

- [ ] **B137. `uniqueReference` identifies the user, not the authentication event.** In the
  `Gov-Client-Multi-Factor` header, `uniqueReference` is a SHA-256 of `sub + ":" + factorType`, so
  it is stable per user per factor type by design. HMRC's spec expects a reference identifying the
  authentication **event**. They have not flagged it and it is no part of the current advisory, so
  this is a separate reading of the spec rather than a defect they have raised. Decide whether to
  change it, and note that O28's step 2b touches the same code — sequence it after, not with.
  **Source**: `../REPORT_HMRC_HEADER_ADVISORIES.md`. **Owner**: Claude Code. **Model**: Sonnet. Blocked on O28 step 2b. **Size**: ~1 file.

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

- [ ] **B124. Prove the three agent workflows by dispatch, in order.** All three are on main,
  `workflow_dispatch` only, every event trigger commented out until a hand-run has earned it.
  **`agentic-lib-board.yml` first**, with `write-back=false`: it changes nothing, so a bad render costs only a
  job. Compare its five parts against a `/board` in the terminal — same rows, same alarm families,
  same deployment table, or the skill is being read differently in CI. Then `write-back=true` and
  check the reluctance actually holds: a second run minutes later should say the board is already
  true and commit nothing.
  **`agentic-lib-pr.yml` next**, `dry-run=true`, after O42. Its tables must match a
  `/auto-merge-dry-run` here. Only then a live run against one PR.
  **`agentic-lib-code.yml` last**, 10 minute budget. The questions that matter: did it take the simplest
  ready task rather than the most interesting; did it check whether `main` was green first; if it
  finished, is the PR one you would merge; if it did not, does `work.patch` apply and is
  `CHANGES.md` specific enough that a different agent could take the next step from it alone. Then
  dispatch a second run against a deliberately unfinished first and check the resume judgement and
  the `Resumed-From:` chain.
  Uncomment a trigger only after that workflow's hand-run has produced something worth keeping.
  **O42 is done** and the first dispatch already failed, which is what this row exists to find.
  Run 34716604299, `agentic-lib-board.yml` with `write-back=false`, died at step 5
  "Configure AWS role via GitHub OIDC": "Credentials could not be loaded". Cause: all three
  workflows read `role-to-assume: ${{ vars.SUBMIT_ACTIONS_ROLE_ARN }}` from a job that declares no
  `environment:`, and that variable exists only on the `ci` and `prod` environments, never at
  repository level. So it resolves to empty and the action has no role to assume. `alarm-triage.yml`
  gets this right with `environment: ${{ needs.triage.outputs.environment-name }}`; these three
  copied the step and not the environment. Same root cause as B130.
  `agentic-lib-board.yml` needs more than an `environment:` line: its Part 4 reads **both** accounts,
  so one environment cannot serve it. Decide between two jobs keyed by environment, a second assume
  into the other account, and repo-level role ARNs for both. Also ask, per workflow, whether it
  needs AWS at all — `/auto-merge` reads GitHub and nothing else, so `agentic-lib-pr.yml`'s OIDC
  step may simply be surplus.
  **Halted by the operator, 2026-09-12 20:2x UTC**, during cool-down. The agent fixing the
  credential wiring was stopped while still reading; nothing was committed and no worktree was
  left behind. Its one finding, kept so it is not rediscovered: the `/auto-merge` skill contains no
  AWS reference at all, so `agentic-lib-pr.yml`'s OIDC step is surplus and should be deleted rather
  than given an environment. Do not dispatch this row again until the operator says so.
  **Source**: `.github/workflows/agentic-lib-*.yml`; run 34716604299.
  **Owner**: Claude Code. **Model**: Sonnet. Blocked on the operator lifting the 2026-09-12 halt. **Size**: ~3 files.

- [ ] **B11.T10. ITSA phase 2: the recognition pack.** `PLAN_ITSA_PHASE_2.md` T10:
  `_developers/hmrc/ITSA_PRODUCTION_APPROVALS_CHECKLIST.md`, an ITSA pass over the two
  questionnaires, and the two draft emails for the operator to send. One application now covers
  both approval stages, and the checklist answers for all nine APIs in the minimum functionality
  standards with a build behind each. **Source**: BACKLOG 11; `PLAN_ITSA_PHASE_2.md` T10.
  **Owner**: Claude Code, then Operator. **Model**: Haiku. Blocked on B11.T7r, B11.T21 and
  B11.T22. **Size**: ~3 files.

- [ ] **B11.T9. ITSA phase 2: the DIYA-GL-to-submission path.** `PLAN_ITSA_PHASE_2.md` T9: the
  MCP tools `derive_itsa_quarterly_update` and `derive_itsa_annual_submission` in the MCP
  package, and an import control on `annualSubmission.html` that fills the form from a book.
  The spreadsheets side's T8 design finds the shipped self-employed template cannot source 31
  of the 55 ITSA field slots, so the derivations omit those fields; this row must send an
  omission, never a zero, for a field the book does not carry. Two findings from their side carry
  SED ids and one changes what this row must do: SED-10 says the self-employed field set changes by
  tax year — `sa103-mtd-mapping.json` records two allowances gone from 2025-26, an adjustment gone
  from 2026-27 and two fields added — and their `se-derivations.js` reads none of it, so a book for
  a year past 2024-25 can carry a field HMRC no longer accepts. The figures are year-agnostic; only
  the field set moves. Either wait for their SED-10 or filter by year on this side, and say which.
  SED-2 is theirs: fourteen disallowable categories, seven annual fields and four adjustments the
  shipped template cannot source at all, which arrive omitted rather than zeroed.
  **Source**: BACKLOG 11; `PLAN_ITSA_PHASE_2.md` T9. **Owner**: Claude Code. **Model**:
  Sonnet. Blocked on the spreadsheets repository's ITSA-T8 (the two self-employed derivations)
  and on `PLAN_SUBMISSION_MCP.md` M1. **Size**: ~4 files.

- [ ] **B70.LU15. Licensing: the brand package.** Pin `@diy-accounting-uk/brand`, copy assets
  and tokens at build, import the tokens, delete the local logo, favicon and token copies;
  the footer, favicon and title conventions read from the words file. **Source**:
  `PLAN_LICENSING_UPLIFT_SUBMIT.md` LU-15. **Owner**: Claude Code. **Model**: Sonnet.
  Blocked on the brand package existing, now planned in the spreadsheets repository's
  `PLAN_DIYACCOUNTING_BRAND.md`. **Size**: ~6 files.

- [ ] **B17v.2. Publish the walkthrough videos.** After O32: fetch the recordings from their
  capture runs, upload them unlisted with `video-publish`, then the operator runs
  `npm run video:publish -- --public`. The VAT read-page videos publish beside the three VAT
  ones; the accounts and ITSA videos publish as sandbox previews. **Source**: BACKLOG 17b,
  17c. **Owner**: Claude Code, then Operator. **Model**: Haiku. Blocked on O32. **Size**: ~1 file.

- [ ] **O32. View the five walkthrough videos.** After B17v.1: watch each recording and say
  which can go up and what reads wrong. **Source**: BACKLOG 17b, 17c. **Owner**: Operator.
  **Model**: none. Blocked on B17v.1.

## Discipline

- **Push once per batch of landed tracks, never per track**, and prefer one dispatch that
  proves several things over several dispatches. A push per track turned one batch into six
  ci deploys and several environment deploys in a morning on 2026-09-06, each able to open
  alarm issues and cancel each other through the deploy concurrency group, and the operator
  froze pushes twice. A freeze, when the operator calls one, stops `git push`,
  `gh workflow run` and `gh pr create` until they lift it in their own words; local commits,
  worktree tracks and reading logs continue, and a failed job gets a proposed fix in the reply.
