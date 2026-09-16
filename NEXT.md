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
alarm OK; the SSO session expired at 16:5x UTC, so AWS is unverified since. **ci**: `ci-claud6618`
(the b46 branch) and `ci-claudaafa` (the b47 branch, last-known-good) both passed their self-destruct
times by 13:46 UTC; their lone `SelfDestructStack`s go on the next sweep past the 8-hour minimum age.

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

## Machine-only

- [ ] **B30ad. The ci sweep's second trigger is on `main`; its first run proves it.** PR #259
  (58290819, merged 12:0x UTC on 2026-09-16) adds `workflow_run` on `deploy` completion to
  `destroy-ci.yml`, routed down the sweep path like `schedule`; the cron stays (it fired one or two
  of six slots a day for the past week, 60 to 90 minutes late, GitHub's scheduler and not the
  file). Read the first `workflow_run`-triggered sweep after the next deploy completes (`gh run list
  --workflow destroy-ci.yml`, event `workflow_run`): all four jobs green and `ci-clauda982`'s lone
  `SelfDestructStack` gone (its set self-destructed at 07:3x UTC and the pointer has moved).
  By hand meanwhile: `gh workflow run destroy-ci.yml --ref main -f sweep-for-stacks=true`.
  **Source**: this board; `destroy-ci.yml`. **Owner**: Claude Code. **Model**: Haiku. **Size**:
  ~0 files.

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

- [ ] **B11.T10. ITSA phase 2: the recognition pack.** `PLAN_ITSA_PHASE_2.md` T10, its inputs (T7r, T21, T22) on `main`:
  `_developers/hmrc/ITSA_PRODUCTION_APPROVALS_CHECKLIST.md`, an ITSA pass over the two
  questionnaires, and the two draft emails for the operator to send. One application now covers
  both approval stages, and the checklist answers for all nine APIs in the minimum functionality
  standards with a build behind each. **Source**: BACKLOG 11; `PLAN_ITSA_PHASE_2.md` T10.
  **Owner**: Claude Code re-runs the sandbox year on a ci set so the run sits inside HMRC's 14-day log window; then the operator sends `DRAFT_EMAIL_ITSA_RECOGNITION.md` (the pack is on `main` since PR #237, `_developers/hmrc/`) and `DRAFT_EMAIL_ITSA_PRODUCTION_CREDENTIALS.md` when SDST answers. **Model**: Haiku. **Size**: ~3 files.

## Human-only

- [ ] **O47. Apply the Actions allow list and require SHA pinning.** Every action in the repository is
  pinned since PR #241 (B57, B57.2); the settings write is denied to sessions, so run:
  `cd /Users/antony/projects/diy-accounting-limited/submit.diyaccounting.co.uk && scripts/github-actions-permissions.sh --require-sha`
  (sets `allowed_actions: selected` with the six owners the workflows use and
  `sha_pinning_required: true`). **Source**: BACKLOG 57; B57.2. **Owner**: Operator. **Model**: none.

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

- [ ] **O49. Give the ops GitHub token the code-scanning scope.** The security lake nightly reads
  `dependabot`, `secret-scanning` and `code-scanning` alerts with the token in
  `prod/submit/github/issue_bot_token` (`OPS_GITHUB_TOKEN_SECRET_ID`); `code-scanning/alerts` answers
  403 "Resource not accessible by personal access token" (03:20 UTC on 2026-09-16), so that row is
  null every night. Add `security_events` to the classic token, or the Code scanning alerts
  read permission to the fine-grained one, and put the new value on the GitHub `prod` (and `ci`)
  environment secret so `deploy-environment.yml` carries it. O38's `diya-ops` app replaces this
  token when it exists. **Source**: B52y.3; issue #249. **Owner**: Operator. **Model**: none.

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

- [ ] **O46. Decide how the signature check gates `main`.** B166's check runs on every PR since PR
  #226 and fails one carrying an unsigned commit (run 35027270496 passed). Ruleset 16057564 has
  carried it as a required status check since 21:57 UTC on 2026-09-15 (`active`, no bypass actors):
  every commit to `main` since has gone through a PR (twelve merges to #252), a direct docs push is
  refused ("Required status check \"Check commit signatures\" is expected"), GitHub refuses the
  GitHub Actions app as a repository-level bypass actor, and `publish.yml` has not run since, so its
  version bump fails at its next run. Alternatives: (1) remove the check from the ruleset and leave
  it advisory, red on the PR and enforced by `/auto-merge`'s gate, until BACKLOG 54 moves the runner
  pushes onto an app; (2) keep the rule, add the admin role as its only bypass actor and move
  `publish.yml`'s bump onto a PAT or the contents API first (a Claude Code change); (3) an
  organisation-level ruleset, where the Actions app is an allowed bypass actor. **Source**:
  B166; ruleset 16057564. **Owner**: Operator. **Model**: none.

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
  `/aws/lambda/prod-env-security-lake-nightly`: no "Invoke Error", a warn line for `code_scanning`
  (null until O49), rows written for the day; then close #249. **Source**: issue #249. **Owner**:
  Claude Code. **Model**: Haiku. Blocked on the 03:15 UTC run on 2026-09-17 and on the AWS SSO session
  (`aws sso login --sso-session diyaccounting`; expired 16:5x UTC on 2026-09-16). **Size**: ~0 files.

- [ ] **B52y.4. The cost views are live; check the Glue Data Quality ruleset after its next run.**
  PR #255 (319a9e89) made `cost_focus` resolve its Parquet columns by position and typed the four
  period columns and `x_Discounts` as the file has them; after main's environment deploy
  `v_cost_daily` answers 5,871 rows for 2026-09-01 to 09-15 (11:2x UTC on 2026-09-16). Left: Glue
  Data Quality reads the table through Spark, which may not honour `parquet.column.index.access`,
  so `COST_FOCUS_RULESET`'s `IsComplete "billed_cost"` (`DataQuality.java` ~99–105) may still report
  incomplete; read the ruleset's next result and, if it does, give the rules the positional reader
  or the Parquet names. **Source**: B52y.2's snapshot check; `PLAN_ONE_STOP_DASHBOARD.md` D13.
  **Owner**: Claude Code. **Model**: Sonnet. Blocked on the ruleset's next run and on the AWS SSO session
  (`aws sso login --sso-session diyaccounting`; expired 16:5x UTC on 2026-09-16). **Size**: ~1 file.

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
  Claude Code. **Model**: Sonnet. Blocked on a federated run of the three ci Lambdas: Monday
  2026-09-21 02:15 UTC, or sooner if the operator starts one:
  `aws --profile submit-ci stepfunctions start-execution --state-machine-arn arn:aws:states:eu-west-2:367191799875:stateMachine:ci-env-analytics-nightly`.
  **Size**: ~12 files.

- [ ] **B56. `test` and CodeQL as required status checks on `main`.** BACKLOG 56: added to ruleset
  16057564 beside the signature check, once O46 settles how the ruleset gates direct pushes. **Source**:
  BACKLOG 56. **Owner**: Claude Code. **Model**: Haiku. Blocked on O46. **Size**: ~0 files.

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

- [ ] **B52l. The optimiser over the raw export.** `PLAN_ONE_STOP_DASHBOARD.md` D16, BACKLOG 52l:
  a notebook over the raw export computing the per-block correlations, fitting the block models
  (linear cost, log-linear funnels, Hill curves for spend), ranking levers by effect per unit cost
  and proposing the next experiment with its predicted effect and interval; Bayesian optimisation
  for the continuous knobs and a Thompson-sampling bandit for allocations once experiments exist;
  one line per objective on the dashboard page. Two chunks: the model design as a section of the
  plan (Opus), then the notebook and the page line (Sonnet). **Source**: BACKLOG 52l; plan D16.
  **Owner**: Claude Code. **Model**: Opus for the models, Sonnet for the notebook. Blocked on three
  months of the raw export, whose first night was 2026-09-09: from 2026-12-09. **Size**: ~3 files.

- [ ] **B52i. The company P&L and balance sheet on the dashboard.** `PLAN_ONE_STOP_DASHBOARD.md`
  D10, BACKLOG 52i: the company's diya-gl book saved to the DIYA cloud by
  `../PLAN_FINANCE_AUTOMATION.md` phase 2, derived nightly with the Ltd engine through M1c and M3,
  rendered above the eight objectives beside the last set filed at Companies House. **Source**:
  BACKLOG 52i; plan D10. **Owner**: Claude Code. **Model**: Sonnet. Blocked on the finance plan's
  phases 1 and 2 (the book in the cloud), M1c and M3. **Size**: ~3 files.

- [ ] **B52m. The reinvestment loop on the dashboard.** `PLAN_ONE_STOP_DASHBOARD.md` D17, BACKLOG
  52m: trailing income, reserve, budget, return per pound and payback on the page; the reinvestment
  fraction as a lever with the reserve floor the operator names; paid traffic and article boosts as
  experiment rows with on-off or geographic controls; GA4 conversion import from the Ads account.
  **Source**: BACKLOG 52m; plan D17. **Owner**: Claude Code, with the operator's fraction and floor.
  **Model**: Sonnet. Blocked on B52l, on the cost panel carrying revenue (B52e, done when the
  first renewal posts on 2026-10-02, BACKLOG 43) and on O23. **Size**: ~3 files.

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

- [ ] **B70.LU15. Licensing: the brand package.** Pin `@diy-accounting-uk/brand`, copy assets
  and tokens at build, import the tokens, delete the local logo, favicon and token copies;
  the footer, favicon and title conventions read from the words file. **Source**:
  `PLAN_LICENSING_UPLIFT_SUBMIT.md` LU-15. **Owner**: Claude Code. **Model**: Sonnet.
  Blocked on the brand package existing, now planned in the spreadsheets repository's
  `PLAN_DIYACCOUNTING_BRAND.md`. **Size**: ~6 files.

## Discipline

- **Push once per batch of landed tracks, never per track**, and prefer one dispatch that
  proves several things over several dispatches. A push per track turned one batch into six
  ci deploys and several environment deploys in a morning on 2026-09-06, each able to open
  alarm issues and cancel each other through the deploy concurrency group, and the operator
  froze pushes twice. A freeze, when the operator calls one, stops `git push`,
  `gh workflow run` and `gh pr create` until they lift it in their own words; local commits,
  worktree tracks and reading logs continue, and a failed job gets a proposed fix in the reply.

