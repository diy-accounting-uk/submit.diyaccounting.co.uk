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

**Prod runs deployment prod-7fbea34**, eleven stacks, live since the scheduled `deploy.yml` run
34749667957 set the pointer at 10:04 UTC on 2026-09-13, every prod probe green. It is the only prod
set: that run's `destroy previous` job removed `prod-4918a0d` between 10:05 and 10:25 UTC.
**No ci deployment exists.** All three sets have gone — `ci-claudc83b`, `ci-claudd44f` and the
long-overdue `ci-mainb28b` — and `/submit/ci/last-known-good-deployment` reads `None`. Three ready
rows need a ci set before they can run: B73's email-restricted pass, B71.S3e's remaining sync and
verification steps, and B34.6b's sandbox filing. Each needs a `deploy.yml` run against ci first,
and cool-down holds that.

The board runs in four sections, in this order: **machine-only**, **human and machine**,
**human-only**, **blocked**. The section is the classification — what it takes to carry the row to
completion, not who owns it now — so no row carries a separate tag that could drift from where it
sits. `human-only` is work no session can do: an external registration, a console action with no
API, a filing against the operator's own company, an email from their address, a decision between
named alternatives. A row whose only human step is merging its PR is machine-only; that is the
standing workflow, not an action the row needs. Within a section, items run by the size of the
change to committed files, least first (operator, 2026-09-13); a row that changes nothing
committed — a comment, a run, a scan, a console action — comes before any code. Operator items
are briefed for Claude Cowork in `../BRIEF_OPERATOR_TASKS_2026-09-04.md` at the workspace root.
Every item names its model: the lowest tier that fits (Fable > Opus > Sonnet > Haiku), or
`none` for a human step.

## Machine-only

- [ ] **B139. The live registered-email filing loops back to the company-number step.** On prod
  (prod-7fbea34) at about 14:30 UTC on 2026-09-13 the operator tried O21 for real: company
  06846849, change of registered email. After the Companies House authorise screen the browser
  landed back on the page that asks for the company number, and entering it again went round the
  same loop; nothing was filed. The ci click-through of 2026-09-06 against the sandbox did not do
  this. Candidates: state lost across the redirect (return path not carried in `state`, token
  stored under a key the page does not read, the callback sending the user to the activity's first
  page), the token exchange failing on prod (redirect URI, live client, scope), or a CloudFront
  behaviour on `/companies-house/*` that ci does not have. Investigating on `claude/ltd-filing-loop`
  off `main`, kept out of b29 by the operator's instruction; when it is ready the operator says
  whether it ships alone or folds into the batch. Same branch, separate commit: 06846849 is the
  operator's real company and must not stand as example data — replace it in the plan, the unit and
  system tests and the simulator scenarios with an example Companies House itself publishes,
  leaving only the legal pages and README where it is the company's own identity.
  **Source**: operator report, 2026-09-13. **Owner**: Claude Code. **Model**: Opus.

- [ ] **B73. Prove an email-restricted pass works end to end.** The secret and the grant are both
  in place: `ci/submit/email-hash-secret` and `prod/submit/email-hash-secret` hold independent
  48-byte random values, and `EmailHashSecretHelper` grants them to the four pass Lambdas that
  reach `passService.js` — `passGet`, `passPost`, `passAdminPost`, `passGeneratePost` (PR #191,
  merged as `926e783d`). `passMyPassesGet` is excluded because it does not use `passService`.
  `initializeEmailHashSecret()` had never succeeded in any deployed environment, and the
  warn-and-carry-on path hid it, so nothing has yet exercised the working path. Remaining: create
  and redeem an email-restricted pass against ci and confirm the secret is fetched rather than
  warned past. **Source**: ci `pass-post` log, 2026-09-09; PR #191. **Owner**: Claude Code.
  **Model**: Haiku.

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
  plan row D16. **Owner**: Claude Code. **Model**: Sonnet.
- [ ] **B130. A superseded deploy reports a failed job.** On `claude/b29-board` (44f35d1b):
  `record-dora` skips when the run was cancelled or `names` produced no environment. Closes when
  the batch merges. **Owner**: Claude Code. **Model**: Haiku.
- [ ] **B30v. alarm-triage's budget guard swallowed a real alarm.** The grant is on
  `claude/b29-board` (7d44b687): the copy role had no identity-side allow on the FOCUS bucket;
  both environments' alarms clear on the next nightly after the batch deploys. What the
  investigation found instead: ci alarms never raise issues by design (`OpsStack.java:324-330`,
  Telegram only), but `prod-env-cost-focus-copy-errors` DID raise #173 at 02:46:53 on 2026-09-10
  and `alarm-triage.yml` run 34430781962 skipped it — its budget guard counted four triage runs in
  the prior 24 hours (a CIS-compliance burst), set `proceed=false`, and ended green with no comment
  on the issue, which was later closed unread. Fix: when the guard skips, post one comment on the
  issue saying so and why, and count only runs that actually triaged towards the budget, so a
  burst of skips does not extend the outage. **Source**: run 34430781962; issue #173. **Owner**:
  Claude Code. **Model**: Sonnet.
- [ ] **B133. destroy-prod reports failure when the set is already gone.** On `claude/b29-board`
  (79fbe839): a name with no live stacks succeeds when CloudFormation holds a `DELETE_COMPLETE`
  record for it and the pointer does not name it; fails with neither. Closes when the batch
  merges. **Owner**: Claude Code. **Model**: Haiku.
- [ ] **B134. Persist `Gov-Client-Device-ID`.** On `claude/b29-board` (2389f27f):
  `localStorage.hmrcDeviceId`, generated once, never regenerated while present, not cleared at
  sign-out. Closes when the batch merges. **Owner**: Claude Code. **Model**: Haiku.
- [ ] **B125. Return a real 403 from HMRC, and show HMRC's reason.** Proven: `e93bb2ea` already
  routed every page through `hmrcErrorMessage()`, and `web/browser-tests/vatObligations.error403.browser.test.js`
  on `claude/b29-board` (5d99f40c) shows the banner carries HMRC's text. Closes when the batch
  merges. Adjacent: `http404NotFoundFromHmrcResponse` (`app/services/hmrcApi.js:726`) still
  returns a 400 for an HMRC 404 — the same mislabel; fix it the same way. **Owner**: Claude Code.
  **Model**: Haiku.
- [ ] **B127. The apex-alias vacate races any expiring ci set.** On `claude/b29-board` (a97d3e36):
  the API Gateway window at `set-origins/action.yml` classifies a `NotFoundException` on the old
  domain as already-vacated, the same as ef3aac19 did for CloudFront. Closes when the batch merges;
  the real-run proof arrives when a ci set next expires mid-deploy. **Owner**: Claude Code.
  **Model**: Sonnet.
- [ ] **B71.S3e. Migrate the books bucket, steps 2 to 7.** Step 1 shipped in PR #180: the
  `{prefix}-diya-gl-{account}` bucket exists beside `{prefix}-books-{account}` and both are in the
  backup selection. The books stay where they are until the rest runs.
  The sequence is in `PLAN_DIYA_GL_NAMING.md`: sync, cut the DIYA-GL Lambdas over and deploy,
  **re-sync until it copies nothing** — the step that cannot be skipped, because the app writes to
  the old bucket for the tens of minutes the deploy takes — verify a read, confirm an on-demand
  backup recovery point, then remove the old bucket. The old bucket goes only after the verified
  read and the recovery point, both.
  Handled as customer data whoever the books belong to, because this is the migration path the
  service needs the first time the answer is unambiguously a customer. Steps 2, 4 and 6 are AWS
  writes against prod data.
  **Operator decision, 2026-09-12: run unattended.** No per-step approval. The ordinary rule that
  an AWS write waits for the operator does not apply to this row. The safety is in the sequence
  rather than in a prompt: the re-sync must copy nothing before the cutover is believed, and the old
  bucket goes only after both a verified read and a confirmed on-demand recovery point. Do not
  reorder or skip either gate to save a step, and record the object counts at each sync. **Source**: `PLAN_DIYA_GL_NAMING.md`
  NM-S3. **Owner**: Claude Code, with the operator at the write gates. **Model**: Sonnet.
  **Code merged in #192, ci step 1 run.** PR #180 created the new bucket but left
  every DIYA-GL Lambda's `DIYA_GL_BUCKET_NAME` pointed at the old one; that is closed, and
  `_developers/RUNBOOK_DIYA_GL_BUCKET_CUTOVER.md` holds the six AWS steps per environment with both
  gates. ci step 1 copied 6 objects from `ci-env-books-367191799875` to
  `ci-env-diya-gl-367191799875`; both buckets now hold 6. prod starts at 16 objects / 146,299 B and
  waits behind ci's step 6, as the runbook orders it.
  Next, now #192 has deployed: ci steps 3 to 6, then prod steps 1 to 6. Step 6 removes the old
  bucket through CDK, never a raw `aws s3` delete.

- [ ] **B17v.1. Capture the five walkthrough videos.** One video each for the three VAT read
  pages (liabilities, payments, penalties; against prod, where B17b.1 is now live, in the 17a
  pattern: `videos/*.json`, `auth: "user"`, `site-video-capture`), one for the micro-entity
  accounts filing and a fresh one for ITSA (business details through the quarterly update),
  both against a ci set since neither activity goes to prod, each described on screen and in
  its `publish.json` entry as a sandbox preview. The ITSA recording replaces the 2026-09-07
  `itsa-business-details` one. The `view-liabilities` capture against prod succeeded at 22:04 UTC
  on 2026-09-11 (video-capture run 34651931632); payments and penalties are next, one at a time
  because the workflow toggles Cognito native auth around each run. All three prod captures have now
  succeeded: `view-liabilities` (run 34651931632), `view-payments` (34689643435) and
  `view-penalties` (34689889022). Remaining: the two ci captures, then check all five
  artifacts and write `videos/publish.json`. **Source**: BACKLOG 17b, 17c. **Owner**: Claude
  Code. **Model**: Sonnet.
  **The two missing scene scripts are merged**: `videos/file-micro-entity-accounts.json`
  and `videos/itsa-quarterly-update.json`, both saying on screen that they are sandbox previews, and
  `video-capture.yml`'s `script` choice list now offers them — a script absent from that list cannot
  be dispatched however valid the file is. The ITSA one supersedes `itsa-business-details`, whose
  `publish.json` entry goes when the new capture is checked.
  Two things the scripts could not settle. The quarterly-update script stops with the form filled
  except `businessId`: a `businessId` only exists after HMRC answers Business Details at run time,
  and the scene-script format has no way to carry a value from one scene into a later scene's input,
  so filling it would mean inventing one. And `itsa-business-details.json` may no longer pass at all
  — it clicks the Self Assessment activity then awaits `#itsaBusinessDetailsForm`, but the
  `self-employed` activity's first `.html` path is now `dashboard.html`, whose form is
  `#businessPickerForm`. Check that on the next capture rather than assuming.

- [ ] **B131. keepalive fails on main.** On `claude/b29-board` (ab63bcca): a workflow younger than
  its cadence is not a miss (age from the workflows API `created_at`), `restore-drill.yml` is
  exempted by name until O41x, and `youtube-check.yml` runs at 06:46 Monday. Left: the next
  scheduled keepalive on `main` (weekly, about 2026-09-19) green. **Owner**: Claude Code.
  **Model**: Sonnet.
- [ ] **B135. Point the support requests at the spreadsheets repository's issues.** On
  `claude/b29-board` (bc0096d1): the two page links and the Lambda's `SUPPORT_GITHUB_REPO` (its
  own prop, `GITHUB_REPO` untouched); the template is spreadsheets PR #109, issues are already
  enabled there. Left: #109 merges; the Lambda posts there only once O45's token is on the
  environments. **Owner**: Claude Code. **Model**: Sonnet.
- [ ] **B138. Land the homebrew tap's release trigger and its ruleset.** Ruleset 23169518 is
  applied. The receiving trigger is homebrew-diya-gl PR #2; the sending step is spreadsheets PR
  #110, which fails the publish until O36's `HOMEBREW_DISPATCH_TOKEN` exists. Merge #2 first,
  #110 after O36. **Owner**: Operator merges; Claude Code if either PR goes red. **Model**: Sonnet.
- [ ] **B129. Deleting an ITSA loss claim or adjustment is free.** On `claude/b29-board`
  (8714e811): `self-employed-year-end-delete` at `tokenCost = 0`, both delete handlers on it.
  Closes when the batch merges. **Owner**: Claude Code. **Model**: Haiku.
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
  **Model**: Sonnet.
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
  Code. **Model**: Sonnet.
- [ ] **B34.6b. Companies House accounts filing: the sandbox proof.** The code half is on
  `claude/b29-board` (d8f17ec0): `COMPANIES_HOUSE_GATEWAY_TEST` ("true" on ci, "false"
  elsewhere) and `COMPANIES_HOUSE_PACKAGE_REFERENCE` ("0012" on ci, unset elsewhere so a live
  filing fails `validateEnv()` rather than going out blank) reach both accounts Lambdas from
  `CompaniesHouseStack.java`; the poll carries the flag too. Left, against the ci set the batch
  deploys, with the test presenter credentials already on ci: submit one FRS 105 set, settle the
  `Authority` element (the checked-in `FormSubmission-v2-11.xsd` wants a bare `DateSigned` after
  `FormHeader`; the worked example wraps it in `Authority/Designation`; the builder follows the
  example), confirm `parseGatewayResponse()` parses the real acknowledgement and
  `GetSubmissionStatus` shapes, capture what the sandbox returned as fixtures under
  `fixtures/companies-house-xmlgw/` and align the simulator, check the counter table exists in the
  deployment before the first submission, then add `prod` to the `file-micro-entity-accounts`
  activity and `resident-ltd`'s listing. The live package reference is still unknown. O44 tells
  Companies House what was submitted. **Source**: BACKLOG 34b; the XML team's email of
  2026-09-11. **Owner**: Claude Code. **Model**: Sonnet.
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
  **Source**: batch 27's lint job. **Owner**: Claude Code. **Model**: Haiku.
- [ ] **O41x. Redeploy the backup account, then run the drill.** On `claude/b29-board`
  (e60b504d to 68817c6b): the refused restore grant is gone from the vault policy; a
  `backup-copy-role` in the backup account copies a recovery point into `ci-env-primary-vault`
  (a copy job resolves `SourceBackupVaultName` in the calling account, so it starts from the backup
  account, not ci); ci's vault and key accept that role; `restore-drill.yml` copies then restores
  under ci's own role and cleans up both. Left, after the batch merges: dispatch
  `setup-backup-account.yml` and check the vault policy deploys, then the environment deploy for
  ci's new grants, then one `restore-drill.yml` run — which is B25c's proof and keepalive's
  exemption coming off. **Source**: run 34638032553. **Owner**: Claude Code. **Model**: Sonnet.
- [ ] **B128. A failed HMRC submission must not cost a token.** On `claude/b29-board`
  (0fab6c3c): `hasTokensForActivity` gates before HMRC without decrementing;
  `chargeTokenOnSuccess` decrements once, in each handler's shared adaptor, only after HMRC
  answers ok; a test per handler proves no charge on 4xx or 5xx. Chosen over refund-on-failure
  because a crash between the HMRC call and the write then under-counts rather than overcharges.
  Left: the charge failing after HMRC accepted is logged as `Token charge failed after HMRC
  success` and swallowed, so put a metric filter and alarm on that line, or it is a silent
  giveaway. **Source**: B117's wiring pass. **Owner**: Claude Code. **Model**: Haiku.
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
  **Source**: B80's fix. **Owner**: Claude Code. **Model**: Haiku per repository.


## Human and machine

- [ ] **O28. Send `Gov-Client-Multi-Factor` on every request: mandate MFA in the pool.** Every
  monthly advisory HMRC has raised is this header missing (`../REPORT_HMRC_HEADER_ADVISORIES.md`).
  Step 2b is on `claude/b29-board` (b0e3d2be): the browser sends its Cognito ID token as
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
  **Owner**: Operator decides, Claude Code changes. **Model**: Haiku.


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

- [ ] **O45. A token that can write issues in the spreadsheets repository.** The support
  Lambda's token (`{env}/submit/github/issue_bot_token`, read through `OPS_GITHUB_TOKEN_SECRET_ARN`)
  is scoped to this repository, so B135's form cannot post there until it is replaced. Two named
  alternatives: a fine-grained PAT covering both repositories as the interim, or O38's `diya-ops`
  app installed on both as the destination. Either way the value goes on the `ci` and `prod`
  GitHub environments and reaches Secrets Manager through `deploy-environment.yml`; tell Claude
  Code which so B135's Lambda change can land. **Source**: B135. **Owner**: Operator.
  **Model**: none.

- [ ] **O36. A dispatch token for the homebrew tap.** Create a fine-grained PAT scoped to
  `homebrew-diya-gl` with contents read and write and put it on
  `spreadsheets.diyaccounting.co.uk` as `HOMEBREW_DISPATCH_TOKEN`, because the default
  `GITHUB_TOKEN` cannot dispatch across repositories. `REPORT_HOMEBREW_DIYA_GL_CRON.md` has the
  exact scopes. B138 carries the ruleset and the two workflow edits. **Source**: B81's report.
  **Owner**: Operator. **Model**: none.

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

- [ ] **O47. Where the monthly fraud-header check reads HMRC's email from.** Today it runs on
  the laptop against the local Gmail mirror and its record has to be committed and pushed by hand
  each month. Two named alternatives: keep it there and commit the record monthly (the b29
  watchdog fails on the 15th if it is missing); or move the fetch into a scheduled workflow, which
  needs a Gmail read credential for antony@diyaccounting.co.uk (an OAuth refresh token or
  app password) as a GitHub Actions secret — mailbox access from CI is your call. **Source**:
  B136. **Owner**: Operator. **Model**: none.

## Blocked

- [ ] **O21. File one registered-office or registered-email change on prod.** Both activities
  are live on submit.diyaccounting.co.uk since prod-4463ec1 (2026-09-07 00:5x UTC), free on the
  `default` bundle, with the live Companies House filing client. A real filing changes a real
  company's register, so this is the operator's own company and sign-in. First attempt on
  2026-09-13 looped at the authorise callback (B139). Try again once B139 is on prod; a receipt
  or an error message is enough. **Source**: BACKLOG 34. **Owner**: Operator. **Model**: none.
  Blocked on B139.


- [ ] **O32. View the five walkthrough videos.** After B17v.1: watch each recording and say
  which can go up and what reads wrong. **Source**: BACKLOG 17b, 17c. **Owner**: Operator.
  **Model**: none. Blocked on B17v.1.

- [ ] **O44. Tell Companies House's XML team what B34.6b submitted.** Neal at
  `xml@companieshouse.gov.uk` reviews test submissions once told they exist. One email from the
  operator's address naming the submission numbers and the presenter id, with what the sandbox
  returned. **Source**: BACKLOG 34b; the XML team's email of 2026-09-11. **Owner**: Operator.
  **Model**: none. Blocked on B34.6b.

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
  **Source**: `../REPORT_HMRC_HEADER_ADVISORIES.md`. **Owner**: Claude Code. **Model**: Sonnet. Blocked on O28 step 2b.

- [ ] **B17v.2. Publish the walkthrough videos.** After O32: fetch the recordings from their
  capture runs, upload them unlisted with `video-publish`, then the operator runs
  `npm run video:publish -- --public`. The VAT read-page videos publish beside the three VAT
  ones; the accounts and ITSA videos publish as sandbox previews. **Source**: BACKLOG 17b,
  17c. **Owner**: Claude Code, then Operator. **Model**: Haiku. Blocked on O32.

- [ ] **B25c. Issue #11, backups outside the account.** The drill's own state is now known and
  written up in `_developers/RESTORE_DRILL.md`: `restore-drill.yml` has never run, and two things
  stop it. The vault's restore grant names a role nothing can assume (B105), and the backup
  account's stack has not been deployed since before that grant landed (O41). What is proven
  meanwhile is the copy side: fresh completed recovery points exist for all five critical prod
  tables and both books buckets, and `restore-test.yml`'s monthly in-account restore has passed
  three of its last four runs, most recently restoring 4826 receipt items against a live source of
  4832. That comment is posted (issuecomment-5653323425, 2026-09-13). Left: run `restore-drill.yml` and
  settle the issue on its result. **Source**: issue #11. **Owner**: Claude Code. **Model**: Sonnet.
  Blocked on O41x.

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
  **Owner**: Claude Code. **Model**: Sonnet. Blocked on the operator lifting the 2026-09-12 halt.

- [ ] **B34.7. Run and fix the filing suites' sandbox sign-in.** Batch 9 (6957651c) carries
  the suites' sandbox sign-in with the authenticator step, off by default: `deploy.yml` and
  `probe-test.yml` run the two filing suites only when the dispatch input
  `runCompaniesHouseSandboxFiling` is `true`, and the run fails fast naming any of O17's four
  values that is empty. Against a standing ci set:
  `gh workflow run probe-test.yml -f environment-name=ci -f deployment-name=<ci-set>
  -f behaviour-test-suite=changeRegisteredOfficeBehaviour -f runCompaniesHouseSandboxFiling=true`
  and the same for `changeRegisteredEmailBehaviour`; the first run's screenshots guide any
  selector fix. **Source**: BACKLOG 34. **Owner**: Claude Code. **Model**: Sonnet.
  Blocked on O17.

- [ ] **B70.LU15. Licensing: the brand package.** Pin `@diy-accounting-uk/brand`, copy assets
  and tokens at build, import the tokens, delete the local logo, favicon and token copies;
  the footer, favicon and title conventions read from the words file. **Source**:
  `PLAN_LICENSING_UPLIFT_SUBMIT.md` LU-15. **Owner**: Claude Code. **Model**: Sonnet.
  Blocked on the brand package existing, now planned in the spreadsheets repository's
  `PLAN_DIYACCOUNTING_BRAND.md`.

- [ ] **B11.T10. ITSA phase 2: the recognition pack.** `PLAN_ITSA_PHASE_2.md` T10:
  `_developers/hmrc/ITSA_PRODUCTION_APPROVALS_CHECKLIST.md`, an ITSA pass over the two
  questionnaires, and the two draft emails for the operator to send. One application now covers
  both approval stages, and the checklist answers for all nine APIs in the minimum functionality
  standards with a build behind each. **Source**: BACKLOG 11; `PLAN_ITSA_PHASE_2.md` T10.
  **Owner**: Claude Code, then Operator. **Model**: Haiku. Blocked on B11.T7r, B11.T21 and
  B11.T22.

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
  and on `PLAN_SUBMISSION_MCP.md` M1.


## Discipline

- **Push once per batch of landed tracks, never per track**, and prefer one dispatch that
  proves several things over several dispatches. A push per track turned one batch into six
  ci deploys and several environment deploys in a morning on 2026-09-06, each able to open
  alarm issues and cancel each other through the deploy concurrency group, and the operator
  froze pushes twice. A freeze, when the operator calls one, stops `git push`,
  `gh workflow run` and `gh pr create` until they lift it in their own words; local commits,
  worktree tracks and reading logs continue, and a failed job gets a proposed fix in the reply.
