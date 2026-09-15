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

**Prod runs deployment prod-70b0a8e** (PR #222, run 34984108471), promoted under the `deploy-ops`
gate; it is the only prod set. **ci**: no set stands; `ci-claud727f`'s
self-destruct fired at 18:22 UTC on 2026-09-15 and left its `ApiStack` DELETE_FAILED on the Cognito
authorizer, which the next `destroy-ci.yml` sweep (02:34 UTC on 2026-09-16) force-deletes (parked in
`PARKED.md`).

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

- [ ] **B52y.2. Check the nightly snapshot after the SecurityLakeStack reaches prod.** PR #218
  (9b695aab) adds the `deploy-security-lake` job and the per-observation null; prod's environment
  deploy of that merge creates the Glue tables. After the next 03:15 UTC run, read
  `snapshots/prod/latest.json`: `generatedAt` past 2026-09-16 03:15, `failedObservationCount` 0,
  and any observation answering null where its view has rows (two views are monthly or quarterly
  grain, so a 30-day window can be empty by design). Issue #208 closes when the alarm clears.
  **Source**: `PLAN_ONE_STOP_DASHBOARD.md` D7, D13, D14, D15. **Owner**: Claude Code. **Model**:
  Haiku. **Size**: ~0 files.

- [ ] **B30z. Exclude the deploy role from the four CIS metric filters.** B30y's re-count: the CIS
  families `unauthorized-api-calls` (16 fires), `iam-policy` (12), `s3-bucket-policy` (6) and
  `route-table` (6) are new since 2026-09-08 and 36 of their 40 fires sit inside deploy windows,
  because the deploy role's own CloudFormation calls match the filters. Exclude the deploy role's
  principal in the four filters in `SecurityDetectionStack`, both accounts, with the CDK test.
  **Source**: `_developers/ALARM_AUDIT_2026-09.md`, 2026-09-15 section. **Owner**: Claude Code.
  **Model**: Sonnet. **Size**: ~2 files.

- [ ] **B30aa. The api-5xx fire inside a fresh set's own deploy.** B30y's re-count: `app-api-5xx`
  fires once per fresh set during its deploy (before promotion) and then only for real errors.
  Find which route answers 5xx while the set is still deploying (the probes against an
  unpromoted API, or a Lambda before its provisioned alias exists) and either fix the route or hold
  the alarm's actions until promotion. **Source**: `_developers/ALARM_AUDIT_2026-09.md`, 2026-09-15
  section. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~2 files.

- [ ] **M1b. `derive_vat_return` from a diya-gl book.** The nine VAT boxes from a book's journal
  and its VAT codes, as an MCP tool in `mcp/`, with the mapping written as a table in
  `PLAN_SUBMISSION_MCP.md` first (Opus) and unit tests over both example books against the figures
  their published reports show. **Source**: `PLAN_SUBMISSION_MCP.md` M1. **Owner**: Claude Code.
  **Model**: Opus for the mapping, Sonnet for the tool. **Size**: ~3 files.

- [ ] **M1c. `derive_micro_entity_accounts` from a diya-gl book.** The seven FRS 105 balance-sheet
  lines from a book, passed through the existing `buildMicroEntityAccounts` and the public validator
  script, with unit tests over BrickWork Pro's example. **Source**: `PLAN_SUBMISSION_MCP.md` M1.
  **Owner**: Claude Code. **Model**: Opus for the mapping, Sonnet for the tool.
  **Size**: ~3 files.

- [ ] **B11.T9. ITSA phase 2: the DIYA-GL-to-submission path.** Two chunks, M1a on `main` since PR #226: **T9a**, the
  MCP tools `derive_itsa_quarterly_update` (a period's figures in a dated year, a running total in a
  cumulative one, from the same book, calling whichever derivation the tax year names, sending an
  omission for any of the 31 field slots the template cannot source, never a zero) and
  `derive_itsa_annual_submission`, over the spreadsheets side's `app/lib/calculators/se-derivations.js`
  (on their main); **T9b**, an import control on `annualSubmission.html` that fills the form from a
  book through the same derivation. SED-10: the self-employed field set changes by tax year
  (`sa103-mtd-mapping.json`: two allowances gone from 2025-26, an adjustment gone from 2026-27, two
  fields added) and their `se-derivations.js` reads none of it, so T9a filters the field set by tax
  year on this side unless the operator says to wait for their SED-10. **Source**: BACKLOG 11;
  `PLAN_ITSA_PHASE_2.md` T9. **Owner**: Claude Code. **Model**: Sonnet. **Size**:
  ~5 files.

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

## Blocked

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

- [ ] **B11.T10. ITSA phase 2: the recognition pack.** `PLAN_ITSA_PHASE_2.md` T10:
  `_developers/hmrc/ITSA_PRODUCTION_APPROVALS_CHECKLIST.md`, an ITSA pass over the two
  questionnaires, and the two draft emails for the operator to send. One application now covers
  both approval stages, and the checklist answers for all nine APIs in the minimum functionality
  standards with a build behind each. **Source**: BACKLOG 11; `PLAN_ITSA_PHASE_2.md` T10.
  **Owner**: Claude Code, then Operator. **Model**: Haiku. Blocked on B11.T7r, B11.T21 and
  B11.T22. **Size**: ~3 files.

## Discipline

- **Push once per batch of landed tracks, never per track**, and prefer one dispatch that
  proves several things over several dispatches. A push per track turned one batch into six
  ci deploys and several environment deploys in a morning on 2026-09-06, each able to open
  alarm issues and cancel each other through the deploy concurrency group, and the operator
  froze pushes twice. A freeze, when the operator calls one, stops `git push`,
  `gh workflow run` and `gh pr create` until they lift it in their own words; local commits,
  worktree tracks and reading logs continue, and a failed job gets a proposed fix in the reply.
