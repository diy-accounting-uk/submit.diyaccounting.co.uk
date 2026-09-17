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
2026-09-17), verified against AWS at 01:1x UTC: the pointer names it, nine stacks; the same run is
still on its last jobs and destroys prod-3ce4693 when they end. **ci**: `ci-claud0bad` (main's
set) is live; `ci-claudafe1` (b52 branch) self-destructs at about 02:39 UTC; `ci-claud86af` (b53,
PR #282) is standing up; `ci-claudc4d2` has one stack left past its time, for the 02:34 UTC sweep.

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

- [ ] **B53.1. A key audit: every long-lived credential the company holds, where it lives, who can
  read it, when it last rotated.** The operator (2026-09-17), after the GA4 key exposure (O48).
  From records: `secrets-rotation.toml` (twelve third-party secrets), `RUNBOOK_INFORMATION_SECURITY.md`
  §2.1 and §3.3, both AWS accounts' Secrets Manager (`aws secretsmanager list-secrets`, names, tags,
  `LastChangedDate`, resource policies), the GitHub environments' secrets (names and dates from
  `gh secret list --env ci|prod`, repository secrets), the Google service accounts' keys
  (`gcloud iam service-accounts keys list` per account in each project), OAuth client secrets, the
  `RELEASE_PAT` and `AGENT_TOKEN`/`AUTO_MERGE_TOKEN` PATs (`gh api /user` under each for scopes and
  expiry), SSH signing keys, and the local `.env` and `cognito-native-test-credentials.json`. Write
  `REPORT_KEY_AUDIT.md`: one table (credential, kind, lives in, readable by, last rotated, expiry,
  rotation path as code or manual, exposure surface), the gaps, and the rows this creates.
  In flight on `claude/ops-key-audit` (worktree `.claude/worktrees/key-audit`, agent running). **Source**: operator, 2026-09-17; O48. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~1 file.

- [ ] **B53.2. A key-rotation entry in `RUNBOOK_INFORMATION_SECURITY.md`.** §3 has Google OAuth
  (3.1) and HMRC (3.2) client secrets and a schedule (3.3); it has no entry for the GA4 service-account
  key, whose rotation is code (`google-key-rotate.yml`, `scripts/gcp-key-rotate.js`, monthly on the
  1st) and whose exposure response ran by hand on 2026-09-16 (O48: rotate, delete the old key,
  audit-log read on `serviceAccountKeyName`, the GitHub copies deleted, the org policy
  `iam.serviceAccountKeyExposureResponse`). Add §3.5 "Service-account keys": the scheduled path, the
  exposure procedure as the six CLI steps, and the two rows §3.3 needs (`ga4/service_account`,
  rotated 2026-09-16, next 2026-10-01 by the workflow); cross-link `secrets-rotation.toml`. Then
  generalise: one entry per credential kind B53.1 finds without a documented path. In flight on `claude/ops-key-runbook` (worktree `.claude/worktrees/key-runbook`, agent running).
  **Source**: operator, 2026-09-17; O48. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~1 file.

- [ ] **B124.3. The board and pr agent workflows have the same prompt-versus-tools gaps.** Found
  while fixing B124.2: `agentic-lib-board.yml` allows `git commit` but sets no git identity, and
  its prompt's board skill runs `npx vitest run app/unit-tests/nextShape.test.js` before the
  `NEXT.md` commit while the allow-list grants only `npx prettier`; `agentic-lib-pr.yml`'s
  auto-merge skill reaches for `git diff`, `git rebase`, `git worktree` and `git push
  --force-with-lease` in its overlap and conflict parts, none of which its allow-list grants, and
  the CI prompt excuses only Part 1. Apply the B124.2 shape: identity before the agent, the
  allow-list matching the skill's reads, and the prompt naming the parts that do not run in CI.
  In flight on `claude/ops-agentic-siblings` (worktree `.claude/worktrees/agentic-siblings`, PR #283). **Source**: the b53 handover agent's report. **Owner**: Claude Code. **Model**: Sonnet.
  **Size**: ~3 files.

- [ ] **B30af.3. A branch deploy's ci probes navigate the ci apex, which main's deploy swaps under
  them.** Run 35161068061 (`claude/ops-triage-budget`, 23:35 to 23:41 UTC on 2026-09-16):
  `tokenEnforcementBehaviour-ci` navigated `https://ci-submit.diyaccounting.co.uk` (15 requests in
  its log) while `main`'s deploy 35161551059 promoted the ci pointer to `ci-claud0bad`; the VAT
  return POST answered `403 {"message":"Forbidden"}` from the other set and the retry found the
  submit button enabled. Same race as B30af on prod, on ci and for branch deploys: either a branch
  deploy's `probe-test` calls run against the branch's own set host (`https://<deployment>.submit…`),
  which it owns, or the wait-for-main-deploy action guards the ci probes too. Pick the first
  unless the suites need the apex. Then re-run any red the race caused. In flight on `claude/b53-board` (wave b53, worktree `.claude/worktrees/b53`, PR #282). **Source**: run
  35161068061. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~2 files.

- [ ] **B124.2. The code agent's prompt asks for what its tool list denies.** Both code proofs
  (runs 35159801420 and 35160283767, from `claude/b52-board`) picked the simplest ready row,
  checked `main` was green and wrote a specific handover, and neither could finish the shape
  `prompts/do-next-ci.md` asks for: the `permission_denials` in each run's `claude-output.json`
  are `gh run download` into `${OUT_DIR}/prior` (the workflow already downloads them, lines
  ~127-142), `mkdir -p /tmp/do-next-out/...`, `git config user.email/name` (so `git commit`
  cannot run), `git checkout main`, `git rev-parse origin/main`, and `git diff ... > work.patch`
  (the workflow takes the patch itself, line ~245); the allow-list is `Read,Grep,Glob,Edit,Write`
  and `git status/diff/log/add/commit/apply/ls-remote/show`. So the handover landed in the
  checkout each time (batch de3033ea moves it out) and the "complete, push a branch and open a
  PR" path is unreachable: no `git push`, no `gh pr create`. Align the two: the workflow sets the
  git identity before the agent and creates the branch and PR from the patch when the handover
  says complete; the prompt drops the download, identity, checkout and redirect instructions,
  names `${OUT_DIR}/CHANGES.md` for the Write tool, and says the workflow takes the patch; then
  one more 10-minute run proves a PR. In flight on `claude/b53-board` (wave b53, worktree `.claude/worktrees/b53`, PR #282). **Source**: runs 35159801420, 35160283767; BACKLOG 73.
  **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~2 files.

- [ ] **B49a. The key-exposure org policy as code.** `iam.serviceAccountKeyExposureResponse` is
  set to `DISABLE_KEY` on organization 936151157673 by hand (22:40 UTC on 2026-09-16, O48). Carry it
  in `google/identity.toml` under a new `[org_policy]` table and have `scripts/gcp-identity-sync.js`
  read and apply it through the Org Policy API (`orgpolicy.googleapis.com`, enabled on the project
  the same day) so `google apply` owns it like the pool and providers. In flight on `claude/b53-board` (wave b53, worktree `.claude/worktrees/b53`, PR #282). The service
  account holds `roles/orgpolicy.policyAdmin` on the organization since 01:1x UTC on 2026-09-17, so
  `main`'s first `google apply` after the merge is the proof: the org policy line reads "matches". **Source**: O48; BACKLOG 49.
  **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~2 files.

- [ ] **B52n. Subscriptions and donations need separate GA4 event names before D17 bids on them.**
  `google/analytics.toml` maps both `subscribe` and `donate` to the event name `purchase`, so the
  Google Ads account's Purchase conversion (imported 2026-09-17, O23 done: account, GA4 property
  523400333 linked, key events imported, reserve floor recorded at the workspace root) cannot tell
  one from the other. Give each its own event name in the toml and wherever the site emits them,
  re-run the GA4 sync, and re-import the key events in Ads. Campaign 1 (Performance Max, £1 a day)
  is running since 2026-09-17 on Purchase and Sign-up, so until then its Purchase signal mixes
  the two.
  In flight on `claude/b53-board` (wave b53, worktree `.claude/worktrees/b53`, PR #282). **Source**: Cowork, 2026-09-17; `PLAN_ONE_STOP_DASHBOARD.md` D17. **Owner**: Claude Code.
  **Model**: Sonnet. **Size**: ~3 files.

## Machine-only

- [ ] **B30ai. Alarm triage reads evidence again: prove it on the next run.** PR #280 (d47884f6)
  tells the agent to call `aws` with no `--profile`, after `REPORT_ALARM_TRIAGE_COST.md` found all
  eight triaged runs denied their `aws logs` and `aws cloudwatch` reads (21 denials) for that
  prefix. Read the next `alarm-triage.yml` run's log for a successful `aws logs` call; #279's
  triage (run 35159428845, before the fix) still shows the pattern. **Source**:
  REPORT_ALARM_TRIAGE_COST.md. **Owner**: Claude Code. **Model**: Haiku. **Size**: ~0 files.

## Machine-ask

- [ ] **B52n.2. Create the `donate` key event and re-import the Ads conversions.** After PR #282
  is on `main`: `gh workflow run google-apply.yml --ref main -f apply=true` creates the `donate`
  key event on GA4 property 523400333 (`scripts/ga4-sync.js` plans it today); then the operator
  re-imports GA4's key events into Google Ads account 814-268-5080 so its Purchase conversion
  counts subscriptions only. The spreadsheets site's emitter still sends `purchase` for a donation
  until that repository lands the one-line change in its inbox. **Source**: B52n. **Owner**: Claude
  Code runs the apply; the operator re-imports in Ads. **Model**: Haiku. **Size**: ~0 files.

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

