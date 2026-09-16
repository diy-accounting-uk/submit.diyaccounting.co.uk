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

**Prod runs deployment prod-9f58aaa** (PR #226, run 35028380205); `main`'s deploy of PR #232 (b41, run
35037156633) succeeded at 01:1x UTC on 2026-09-16 and its promotion is read at the next render; `main`'s
deploy of PR #237 (b42) started at 01:44 UTC. **ci**: the b41 and b42 branch sets stand until their
self-destructs.

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

Wave b43 rides **`claude/b43-board`, PR #241** (pushed 02:3x UTC on 2026-09-16, two commits: B55.2's
project number and masked exit status, B57.2's pinning of the seven remaining workflows). After the
merge: the push runs `google-apply.yml` through the key path and creates the pool, then the federated
plan dispatch proves B55.2; the operator's `scripts/github-actions-permissions.sh --require-sha`
finishes B57.2.

- [ ] **B55.2. Prove Google federation and wire the Lambdas.** `google-apply.yml` ran on the push of
  PR #237 through the key path (run 35045218215) but its identity-sync step failed on the wrong
  project number in `identity.toml` (670010122633 read off an OAuth client id; the project is
  958354756046) while the job reported success, because `| tee` masked the exit status; so no pool
  exists and the federated plan dispatch (run 35047179597) answered `invalid_target`. Wave b43 fixes
  the number and the masking (in flight). Then `gh workflow run google-apply.yml --ref main -f auth-mode=federated -f apply=false` must
  read live state with the key step skipped; then `gh variable set SUBMIT_GOOGLE_AUTH_MODE --env prod
  --body federated`. The Lambdas: `IngestionStack.java` puts `GA4_AUTH_MODE`, `GOOGLE_WIF_AUDIENCE`
  (the `aws-ci` / `aws-prod` audience the sync step prints) and `GA4_SERVICE_ACCOUNT_EMAIL` on the
  three GA4 functions, proven on ci by one nightly run of each in federated mode, then prod; then the
  key, both secrets, the `ga4/service_account` row and the rotation script go. **Source**: B55; PR
  #237; `PLAN_GOOGLE_AS_CODE.md` items 9 and 11. **Owner**: Claude Code. **Model**: Sonnet. **Size**:
  ~4 files.

- [ ] **B57.2. Pin the five agent and Google workflows and require SHA pinning.** `alarm-triage.yml`,
  the three `agentic-lib-*.yml` and `google-apply.yml` stayed on tags in B57 because other batches
  were editing them; pin their `uses:` lines, then `scripts/github-actions-permissions.sh --require-sha`
  (the operator runs the script: the settings write is denied to the session). **Source**: B57; PR
  #237. **Owner**: Claude Code, then Operator. **Model**: Haiku. **Size**: ~5 files.

## Machine-only

- [ ] **B30ac.2. Prove the triage agent queries.** The telemetry policy is on the triage role since
  `main`'s environment deploy of PR #237 (02:0x UTC on 2026-09-16). The dispatch
  `gh workflow run alarm-triage.yml --ref main -f issue-number=229` at 02:14 UTC was skipped by the
  workflow's own budget of three triage runs per 24 hours (four posted since 02:14 UTC on
  2026-09-15); the budget frees after 16:41 UTC on 2026-09-16. Dispatch again then and read the new
  comment on #229 for a quoted Logs Insights query and the alarm history; then close #229 and #230
  (the old set's snapshot 500, fixed by B52v and gone with `prod-70b0a8e`). **Source**: B30ac; PR
  #237. **Owner**: Claude Code. **Model**: Haiku. Date-gated: from 16:41 UTC on 2026-09-16. **Size**:
  ~0 files.

- [ ] **B59.2. Prove the kill switch.** The parameter exists in both environments since the same
  deploy; `agent-kill-switch.yml` set prod's to `on` (run 35047169215) and back to `off` (run
  35047303339) at 02:1x UTC on 2026-09-16, but the triage dispatch meant to stop at the switch was
  skipped by the triage budget first, so the stop is unproven. When B30ac.2's budget frees: switch
  `on` for prod, dispatch `alarm-triage.yml -f issue-number=229` and see it fail at "Stop when the
  agent kill switch is on", switch `off`, then run B30ac.2's dispatch. **Source**: B59; PR #237.
  **Owner**: Claude Code. **Model**: Haiku. Date-gated: from 16:41 UTC on 2026-09-16. **Size**: ~0
  files.

- [ ] **B52y.2. Check the nightly snapshot after the SecurityLakeStack reaches prod.** PR #218
  (9b695aab) adds the `deploy-security-lake` job and the per-observation null; prod's environment
  deploy of that merge creates the Glue tables. After the next 03:15 UTC run, read
  `snapshots/prod/latest.json`: `generatedAt` past 2026-09-16 03:15, `failedObservationCount` 0,
  and any observation answering null where its view has rows (two views are monthly or quarterly
  grain, so a 30-day window can be empty by design). Issue #208 closes when the alarm clears.
  **Source**: `PLAN_ONE_STOP_DASHBOARD.md` D7, D13, D14, D15. **Owner**: Claude Code. **Model**:
  Haiku. **Size**: ~0 files.

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

- [ ] **O46. Decide how the signature check gates `main`.** B166's check runs on every PR since PR
  #226 and fails one carrying an unsigned commit (run 35027270496 passed). Adding it to ruleset
  16057564 as a required status check (tried 2026-09-15 21:58 UTC, reverted at 22:03) gates every
  push to `main`, so the board write-back and the docs exception stopped landing ("Required status
  check \"Check commit signatures\" is expected"), and GitHub refuses the GitHub Actions app as a
  repository-level bypass actor, so `publish.yml`'s version bump would stop too. Alternatives: (1)
  leave the check advisory, red on the PR and enforced by `/auto-merge`'s gate, until BACKLOG 54
  moves the runner pushes onto an app; (2) add the rule with the admin role as the only bypass
  actor and move `publish.yml`'s bump onto a PAT or the contents API first (a Claude Code change);
  (3) an organisation-level ruleset, where the Actions app is an allowed bypass actor. **Source**:
  B166; ruleset 16057564. **Owner**: Operator. **Model**: none.

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

- [ ] **B11.T10. ITSA phase 2: the recognition pack.** `PLAN_ITSA_PHASE_2.md` T10, its inputs (T7r, T21, T22) on `main`:
  `_developers/hmrc/ITSA_PRODUCTION_APPROVALS_CHECKLIST.md`, an ITSA pass over the two
  questionnaires, and the two draft emails for the operator to send. One application now covers
  both approval stages, and the checklist answers for all nine APIs in the minimum functionality
  standards with a build behind each. **Source**: BACKLOG 11; `PLAN_ITSA_PHASE_2.md` T10.
  **Owner**: Operator: the pack is on `main` (PR #237, `_developers/hmrc/`): send `DRAFT_EMAIL_ITSA_RECOGNITION.md` after re-running the sandbox year inside HMRC's 14-day log window, then `DRAFT_EMAIL_ITSA_PRODUCTION_CREDENTIALS.md` when SDST answers. **Model**: Haiku. **Size**: ~3 files.

## Blocked

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

