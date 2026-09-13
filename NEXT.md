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

**Prod runs deployment prod-e371587** (PR #202's merge, promoted about 22:45 UTC on 2026-09-13
by run 34786322080, carrying batch b29, the filing-callback fix, the accounts envelope fix, the ITSA
dashboard fix and the lane-user fix); the same run is destroying `prod-a8cb1ea`, the only other set.
**ci at 23:10 UTC**: `ci-vatview` is live (pointer; main at `e3715879`; self-destructs 00:48 on
2026-09-14); `ci-b29w2` self-destructs at 23:11.

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

Nothing: no branch, pull request or run carries an open row.

## Machine-only

- [ ] **B131. keepalive red on main until its next run.** The fix is on main (#198: age
  allowance, `restore-drill.yml` exempted by name until O41x, youtube-check at 06:46 Monday).
  Closes when the next scheduled keepalive on `main` (weekly, about 2026-09-19) is green, or
  sooner by dispatch:
  ```
  ! gh workflow run keepalive.yml
  ```
  **Owner**: Claude Code. **Model**: Sonnet. **Size**: no committed files.

- [ ] **B30v. alarm-triage's budget guard swallowed a real alarm.** The grant is on
  `claude/b29-board` (7d44b687): the copy role had no identity-side allow on the FOCUS bucket;
  both environments' alarms clear on the next nightly after the batch deploys. What the
  investigation found instead: ci alarms never raise issues by design (`OpsStack.java:324-330`,
  Telegram only), but `prod-env-cost-focus-copy-errors` DID raise #173 at 02:46:53 on 2026-09-10
  and `alarm-triage.yml` run 34430781962 skipped it — its budget guard counted four triage runs in
  the prior 24 hours (a CIS-compliance burst), set `proceed=false`, and ended green with no comment
  on the issue, which was later closed unread. Fix: when the guard skips, post one comment on the
  issue saying so and why, and count only runs that actually triaged towards the budget, so a
  burst of skips does not extend the outage. Same family: triage run 34758499617 on #196 hit
  `--max-turns 30` after 148 seconds and posted nothing; post the partial result, or a note that
  the turn budget ran out, instead of silence. **Source**: run 34430781962; issue #173. **Owner**:
  Claude Code. **Model**: Sonnet. **Size**: ~1 file.

- [ ] **B30w. The triage role cannot read metric filters.** Issue #197: `alarm-triage-role` was
  denied `logs:DescribeMetricFilters` on `/aws/cloudtrail/prod-env-cloud-trail` during the triage
  of #196, which raised `prod-env-cis-unauthorized-api-calls` (OK since 13:07 on 2026-09-13).
  Add the action to the `ListLogGroups` statement in `ObservabilityStack.java` (about line 832;
  it takes no resource ARN, like `DescribeLogGroups` beside it) with the CDK test; the issue
  closes when the change reaches prod. **Source**: issue #197; run 34758720814. **Owner**: Claude
  Code. **Model**: Haiku. **Size**: ~2 files.

- [ ] **B127. A ci set expiring mid-deploy, three shapes.** Both vacate windows are closed on main
  (ef3aac19, a97d3e36). Seen on 2026-09-13, same family: three ci deploys at once contending for
  the apex alias (`CNAMEAlreadyExists` on PR #199's set-origins at 15:29) and rotating one shared
  Cognito lane user under each other (PR #202 fixes the lane-user half); and a branch's own redeploy
  torn down by its first set's self-destruct (`ci-claud20c8`, created 19:37, fired 21:37 while the
  rebased push was recreating `ApiStack`: "Function not found …custom-authorizer", run
  34783054685). For the third: a redeploy of an existing deployment name should reset or extend
  the `SelfDestructStack` schedule, or refuse to start inside its last 45 minutes. The lane-user half is on main (#202, e3715879): jobs that
  rotate a lane user queue on that user. **Source**: runs 34762675812, 34763080213, 34783054685. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~3 files.

- [ ] **O41x. Redeploy the backup account, then run the drill.** The code is on main (#198).
  Left, in order: dispatch `setup-backup-account.yml` and check the vault policy deploys; confirm
  main's environment deploy of `e8237145` gave ci's vault and key the copy-role grants; run
  `restore-drill.yml` once — B25c's proof and keepalive's exemption coming off.
  **Owner**: Claude Code. **Model**: Sonnet. **Size**: no committed files.

- [ ] **B17v.1. Capture the five walkthrough videos.** The three prod captures are done
  (`view-liabilities` run 34651931632, `view-payments` 34689643435, `view-penalties` 34689889022).
  The `itsa-quarterly-update` capture (run 34774550386) stalled on the dashboard defect PR #201
  fixed; both ci captures re-run against a ci set carrying `main` at `a8cb1ea6` or later: `ci-vatview`
  (main at `e3715879`) stands until its self-destruct at 00:48 UTC on 2026-09-14, after that a
  fresh ci deploy of `main`.
  Then check all five artifacts and write `videos/publish.json`, replacing the 2026-09-07
  `itsa-business-details` entry. Two things the scripts could not settle: the quarterly-update
  script stops with the form filled except `businessId` (only known at run time), and
  `itsa-business-details.json` may no longer pass since the activity's first page is
  `dashboard.html`. **Source**: BACKLOG 17b, 17c. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~1 file.

- [ ] **B140. `deploy.yml` cancels a push deploy that a named dispatch already covers.** Three
  times on 2026-09-13 the coordinator cancelled a push-triggered deploy by hand in its first minute
  because a `workflow_dispatch` with `deployment-name` was about to deploy the same head; left
  alone, the two run together and contend for the ci apex alias and the lane user. Make the
  workflow do it: in `deploy.yml`, a dispatch that names a deployment cancels any push-triggered
  run of the same `github.sha` that has not yet started a stack job (`gh run cancel` from the
  `params` job, or a concurrency group keyed on the sha with the cancel gated on the run's phase).
  Never cancel a run that has begun a stack deploy. **Source**: operator, 2026-09-13.
  **Owner**: Claude Code. **Model**: Haiku. **Size**: ~1 file.

- [ ] **B142. A sandbox proof iterates on a lean deploy.** B34.6b took three passes and spent
  submission numbers 000002 and 000003 on pre-fix code because each fix needed a full `deploy.yml`
  (35 minutes) to reach the ci set and the day's two-submission budget was gone before it could.
  `npm run deploy:app-ci -- --deployment <set>` updates Lambda code and web assets in three to
  five minutes. Put in the brief shape for any proof against a real service with a permanent
  cost per attempt: fix, lean-deploy, re-prove, in one agent turn, and only then spend the next
  number. **Source**: REPORT_SESSION_Kjw4C_2026-09-13.md. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~1 file.

- [ ] **B143. An agent reports before its long build returns.** Four agents on 2026-09-13 each
  stopped one to three times with "waiting for the build": a long foreground `./mvnw clean verify`
  is promoted to the background and ends the turn, and the agent's next turn only re-waits. Put
  in `do-next`'s brief shape: commit, start the build with `run_in_background`, and report at
  once with "build pending, surefire reports at `target/surefire-reports`"; the coordinator reads
  the reports on the merged tree rather than waiting for the agent's verdict. **Source**:
  REPORT_SESSION_Kjw4C_2026-09-13.md. **Owner**: Claude Code. **Model**: Haiku. **Size**: ~1 file.

- [ ] **B145. Guidance for the two blocks the operator keeps.** Four pastes on 2026-09-13: `aws sso
  login` twice (an SSO session lasts about eight hours and expired mid-session), `destroy-prod`
  for a set already gone, and `git branch -D` after a squash the do-next rule now allows. Write
  into `CLAUDE.md`: check `aws sts get-caller-identity` before dispatching an AWS-reading wave and
  ask for the login up front, not at the first failure; and list `git branch -D claude/*` after a
  proven squash among the commands to allow in `.claude/settings.json`, which is the operator's
  decision to make. **Source**: REPORT_SESSION_Kjw4C_2026-09-13.md. **Owner**: Claude Code;
  the allowlist is the operator's. **Model**: Haiku. **Size**: ~1 file.

- [ ] **B34.6b. Companies House accounts filing: the sandbox proof.** Submission 000004 (presenter
  E0000052288, company 06846849, 2026-09-13 19:04 UTC, from PR #200's ci set) was ACCEPTED by the
  XML Gateway test service: HTTP 201, `gatewayTimestamp 2026-09-13T20:04:10-00:00`, no errors.
  000002 and 000003 were rejected earlier for the `Authority` wrapper, which PR #200 removes. Left:
  every `GetSubmissionStatus` poll for 000004 (nine over 16 minutes) answers error 9999 "No
  presenter ID supplied", although `buildStatusRequest()` emits `SubmissionNumber` then
  `PresenterID` as `GetSubmissionStatus-v2-9.xsd` orders them and the same credentials
  authenticated the submission. The Lambdas log status codes only, so the raw XML was not
  captured. O44 asks Companies House whether 000004 was accepted downstream and whether status
  lookups are enabled for this presenter; meanwhile log the raw gateway request and response bodies
  (presenter code redacted) in `companiesHouseAccountsGet.js` so the next poll shows what the
  gateway saw. The `prod` listing stays off until a poll returns a status, because a customer must
  see the outcome of a filing; that commit is held as the unreferenced local commit
  946251d4 (no branch carries it). **Source**: BACKLOG 34b. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~1 file.

- [ ] **B52x. Two export views emit no rows.** The 02:15 UTC nightlies of 2026-09-12 and
  2026-09-13 both SUCCEEDED and wrote 21 CSVs and 8 JSONs under
  `s3://prod-env-analytics-lake-972912397388/exports/prod/<date>/`; the field counts for
  2026-09-12 are in `_developers/RAW_EXPORT_FIELD_COUNTS.md` (batch b29). Every field fills except:
  `v_compliance_status` and `v_subscription_renewals_daily` have zero rows, and three fields are
  sparse (`v_dora_runs_daily.median_lead_time_seconds` 5 of 8,
  `v_signup_to_first_submission.signup_day` 10 of 11 and `median_hours_to_first_submission` 3 of
  11). Renewals are empty because the first renewal is 2026-10-02. `v_compliance_status` being
  empty is not explained: the compliance panel reads it, so find whether the view's source table
  is unfed or the view's predicate excludes every row, and fix the feed or the view. Say whether
  the sparse three are expected (a median needs more than one sample). **Source**: BACKLOG 52;
  plan row D16. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~2 files.

- [ ] **B125. An HMRC 404 reaches the caller as a 400.** The 403 half is done (`e93bb2ea`, browser
  test in #198). `http404NotFoundFromHmrcResponse` at `app/services/hmrcApi.js:726` still ends in
  `http400BadRequestResponse`, the same mislabel; the page shows HMRC's text either way, so only
  the status code is wrong. Fix it the same way, with the unit test. **Source**: B125's proof.
  **Owner**: Claude Code. **Model**: Haiku. **Size**: ~2 files.

- [ ] **B141. A prod rollback and a failed scheduled probe each raise a GitHub issue.** main's
  deploy 34773988567 rolled the apex back to `prod-4e15028` after `submitVatBehaviour-prod` failed
  (job 103776012745); the new set stood unpromoted and nobody was told — a recovered prod incident
  with no record beyond the run. Open an issue (label `incident`, the same issue-bot token path
  `alarm-to-github-issue` uses) from `deploy.yml`'s `roll back apex to previous deployment` job
  naming the run, the failed probes, the set rolled back to and the set left standing; and from
  `probe-test.yml` when a scheduled run (`github.event_name == 'schedule'`) ends with a failed
  suite, naming the suite and environment. Close the deploy one automatically when a later deploy
  promotes a set; leave the probe one for `alarm-triage.yml` or the operator. **Source**: operator,
  2026-09-13. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~2 files.

- [ ] **B144. The watch script lives in the repository, written for this host's bash 3.2.** The
  `/watch` monitor was written twice on 2026-09-13 and died twice: macOS ships bash 3.2, which has no
  associative arrays, and the failure surfaced as `division by 0` on a branch name. Put the poll
  loop in `scripts/watch-ci.sh` (state in files, `#!/bin/bash` with a 3.2 guard, `jq` for the API
  reads) and make the skill run that file instead of composing one per session.
  **Source**: REPORT_SESSION_Kjw4C_2026-09-13.md. **Owner**: Claude Code. **Model**: Haiku. **Size**: ~2 files.

- [ ] **B136. The monthly fraud-header check's Telegram alert cannot publish from launchd.** On
  `claude/b29-board` (a4094df2): the check DID run on 2026-09-12 and wrote the August record, which
  was never committed, so `compliance.yml`'s lake job has always read an empty directory; the record
  is now tracked (`data/compliance/fraud-prevention-headers/2026-08.json`) and
  `fraud-header-check.yml` fails on the 15th when the month's record is missing. Left: the
  Telegram publish fails under launchd because `AWS_PROFILE=submit-prod` is SSO and cannot refresh
  unattended, and `publishActivityEvent` swallows the failure (`app/lib/activityAlert.js`). Either
  give the launchd job a non-SSO credential path or make the script exit non-zero when the publish
  fails so the watchdog sees it. O47 decides whether the fetch itself moves to CI. **Source**:
  `~/Library/Logs/co.uk.diyaccounting.submit.fraud-header-check.log`. **Owner**: Claude Code.
  **Model**: Sonnet. **Size**: ~2 files.

- [ ] **B11.T7r. ITSA phase 2: run the sandbox year.** On `claude/b29-board` (3f8e17b0): with
  `Gov-Test-Scenario: STATEFUL` business-details and itsa-status return the business the run
  created (O43's subscription works). The run now stops at
  `GET obligations/details/{nino}/income-and-expenditure`: 404 `NO_OBLIGATIONS_FOUND` for a
  test-support business, and HMRC's `obligations-api` OpenAPI has no STATEFUL scenario for it —
  `DYNAMIC` answers only for the three canned businesses (`XBIS12345678901` etc.). Nothing in this
  repository fixes that. Two ways on, choose in the runbook: file the quarterly periods without
  reading obligations (the period-summary endpoints take dates, not an obligation), or run the
  obligations-dependent calls against the canned `XBIS12345678901` under `DYNAMIC`. Then continue
  through annual submission, BSAS, calculation, final declaration and the losses and adjustments
  calls. **Source**: `_developers/hmrc/ITSA_PHASE_2_SANDBOX.md` run record. **Owner**: Claude
  Code. **Model**: Sonnet. **Size**: ~2 files.

- [ ] **B128. Alarm on the unpaid-charge log line.** The charge-after-success change is on main
  (#198). A charge failing after HMRC accepted is logged as `Token charge failed after HMRC
  success` and swallowed, so put a metric filter and alarm on that line, or it is a silent
  giveaway. **Source**: B117's wiring pass. **Owner**: Claude Code. **Model**: Haiku. **Size**: ~2 files.

- [ ] **B146. One trigger per commit for `test` and CodeQL.** Twelve pushed commits produced 16
  `test` and 16 CodeQL runs on 2026-09-13 (about 1,150 job-minutes): `push` and `pull_request`
  both trigger them on a branch with an open PR. Keep one — the spreadsheets repository chose
  `push` for branches and `pull_request` only for forks (its CQ-29) — and check `deploy.yml`'s
  `delegate to test workflow` does not add a third. **Source**: REPORT_SESSION_Kjw4C_2026-09-13.md.
  **Owner**: Claude Code. **Model**: Haiku. **Size**: ~3 files.

- [ ] **B122. Clear the last 13 eslint findings.** 39 of the 52 are on `claude/b29-board`
  (0036ec61 to 31a2eefc; three were real defects: an O(n²) email regex in
  `companiesHouseRegisteredEmailAddressPost.js`, `diff` resolved from PATH in
  `cdk-typescript/scripts/diff-templates.mjs`, a super-linear Link-header regex in
  `companiesHouseApi.js`). The 13 left sat in files other b29 tracks were editing:
  `no-unused-vars`/`sonarjs/unused-import` at line 9 of `hmrcItsaSelfEmploymentAnnualPut.js`,
  `hmrcItsaSelfEmploymentPeriodPut.js`, `hmrcItsaUkPropertyAnnualPut.js`,
  `hmrcItsaUkPropertyPeriodPut.js`; `sonarjs/regex-complexity` and `concise-regex` at
  `hmrcItsaFinalDeclarationPost.js:50`; `sonarjs/prefer-single-boolean-return` at
  `hmrcVatReturnPost.js:77`; `sonarjs/hashing` at `companiesHouseXmlGateway.js:92`;
  `promise/always-return` at `web/public/lib/analytics.js:100`. Re-count after the batch merges —
  the token and accounts-filing tracks touched those files — and clear what is left.
  **Source**: batch 27's lint job. **Owner**: Claude Code. **Model**: Haiku. **Size**: ~8 files.

- [ ] **B80b. The identity guard has to reach the other four repositories.** Submit carries
  `.github/allowed-commit-identities.yml`, `.github/workflows/identity-guard.yml` and
  `scripts/check-commit-identities.sh`: a pull-request check that fails when a commit's author email
  is not on a plain, human-edited allow list. Spreadsheets is the one with the actual incident —
  twenty commits authored `noreply@anthropic.com` by a sub-agent setting the identity inline — so it
  goes first; `www`, `root` and `archive` follow.
  **Operator decisions, 2026-09-12.** All four from worktrees in this session, one PR each, no
  sibling checkout touched — the method already used for the attribution-pointer PRs. Each allow
  list is derived from that repository's own author history, and the PR body prints every address
  with its commit count and date range for O46's review. The check fails the PR, matching submit,
  rather than reporting non-blocking.
  **Source**: B80's fix. **Owner**: Claude Code. **Model**: Haiku per repository. **Size**: ~12 files.

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

- [ ] **O32. View the five walkthrough videos.** After B17v.1: watch each recording and say
  which can go up and what reads wrong. **Source**: BACKLOG 17b, 17c. **Owner**: Operator.
  **Model**: none. Blocked on B17v.1.

- [ ] **O46. Approve the four allow lists.** Each of B80b's PRs prints every author address
  with its commit count and date range; strike or approve each before merge, because an address
  on the list is an identity the guard will accept from then on. **Source**: B80's fix.
  **Owner**: Operator. **Model**: none. Blocked on B80b.

- [ ] **B137. `uniqueReference` identifies the user, not the authentication event.** In the
  `Gov-Client-Multi-Factor` header, `uniqueReference` is a SHA-256 of `sub + ":" + factorType`, so
  it is stable per user per factor type by design. HMRC's spec expects a reference identifying the
  authentication **event**. They have not flagged it and it is no part of the current advisory, so
  this is a separate reading of the spec rather than a defect they have raised. Decide whether to
  change it, and note that O28's step 2b touches the same code — sequence it after, not with.
  **Source**: `../REPORT_HMRC_HEADER_ADVISORIES.md`. **Owner**: Claude Code. **Model**: Sonnet. Blocked on O28 step 2b. **Size**: ~1 file.

- [ ] **B17v.2. Publish the walkthrough videos.** After O32: fetch the recordings from their
  capture runs, upload them unlisted with `video-publish`, then the operator runs
  `npm run video:publish -- --public`. The VAT read-page videos publish beside the three VAT
  ones; the accounts and ITSA videos publish as sandbox previews. **Source**: BACKLOG 17b,
  17c. **Owner**: Claude Code, then Operator. **Model**: Haiku. Blocked on O32. **Size**: ~1 file.

- [ ] **B25c. Issue #11, backups outside the account.** The drill's own state is now known and
  written up in `_developers/RESTORE_DRILL.md`: `restore-drill.yml` has never run, and two things
  stop it. The vault's restore grant names a role nothing can assume (B105), and the backup
  account's stack has not been deployed since before that grant landed (O41). What is proven
  meanwhile is the copy side: fresh completed recovery points exist for all five critical prod
  tables and both books buckets, and `restore-test.yml`'s monthly in-account restore has passed
  three of its last four runs, most recently restoring 4826 receipt items against a live source of
  4832. That comment is posted (issuecomment-5653323425, 2026-09-13). Left: run `restore-drill.yml` and
  settle the issue on its result. **Source**: issue #11. **Owner**: Claude Code. **Model**: Sonnet.
  Blocked on O41x. **Size**: no committed files.

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

- [ ] **B70.LU15. Licensing: the brand package.** Pin `@diy-accounting-uk/brand`, copy assets
  and tokens at build, import the tokens, delete the local logo, favicon and token copies;
  the footer, favicon and title conventions read from the words file. **Source**:
  `PLAN_LICENSING_UPLIFT_SUBMIT.md` LU-15. **Owner**: Claude Code. **Model**: Sonnet.
  Blocked on the brand package existing, now planned in the spreadsheets repository's
  `PLAN_DIYACCOUNTING_BRAND.md`. **Size**: ~6 files.

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

## Discipline

- **Push once per batch of landed tracks, never per track**, and prefer one dispatch that
  proves several things over several dispatches. A push per track turned one batch into six
  ci deploys and several environment deploys in a morning on 2026-09-06, each able to open
  alarm issues and cancel each other through the deploy concurrency group, and the operator
  froze pushes twice. A freeze, when the operator calls one, stops `git push`,
  `gh workflow run` and `gh pr create` until they lift it in their own words; local commits,
  worktree tracks and reading logs continue, and a failed job gets a proposed fix in the reply.
