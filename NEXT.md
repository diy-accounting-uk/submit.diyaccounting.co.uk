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

**Prod runs deployment prod-0db1730** (main's dispatched deploy 35399752208, green at 23:2x UTC on
2026-09-18, nine stacks created 22:1x UTC, the only prod set standing; the deploy destroyed prod-0f77333
itself). **ci**: `ci-set1` (the B30af.8 proof branch's set, claimed 22:1x UTC on 2026-09-18) is live,
the only ci set standing; its self-destruct fires from 02:1x UTC on 2026-09-19.

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

- [ ] **O38. The two GitHub Apps carry every machine write.** Both apps exist and are installed on
  the org (23:0x UTC on 2026-09-18): `diyaccounting-ops` (App ID 4995449, installation 162872904 on
  submit and spreadsheets; Issues write, code scanning, Dependabot and secret scanning alerts read) and
  `diyaccounting-agent` (App ID 4995481, installation 162872977 on submit; Contents, Pull requests and
  Issues write). The keys are the repository secrets `OPS_APP_PRIVATE_KEY` and `AGENT_APP_PRIVATE_KEY`;
  the ids are the variables `OPS_APP_ID`, `OPS_APP_INSTALLATION_ID`, `AGENT_APP_ID`,
  `AGENT_APP_INSTALLATION_ID`. The code is `claude/b61-board` (worktree b61, one Sonnet agent): a
  shared installation-token module, the three Lambdas (alarm issues, support tickets, security lake)
  reading `{env}/submit/github/ops_app_private_key` instead of the two PATs, the CDK plumbing,
  `deploy-environment.yml` writing that secret, and `alarm-triage.yml` pushing and opening its draft
  PR as `diyaccounting-agent[bot]`. Proof on ci then prod: an alarm issue, a support ticket and the
  nightly's alert rows written by the app (`user.type: Bot`), and a triage PR authored by the agent
  app. Then the PAT secrets `ISSUE_BOT_TOKEN`, `SUPPORT_BOT_TOKEN` and `PERSONAL_ACCESS_TOKEN` and
  the Secrets Manager entries `{env}/submit/github/issue_bot_token` and `support_bot_token` go.
  **Source**: `REPORT_IDENTITY_AUDIT.md` section 8, recommendations 2, 3 and 12. **Owner**: Claude
  Code. **Model**: Sonnet. **Size**: ~12 files.

## Machine-only

- [ ] **B52y.3. The security lake nightly's two GitHub alert rows: the next run proves the token.**
  The WAF half is proven and #249 is closed. The 2026-09-18 run answered 403 `Resource not accessible
  by personal access token` on `dependabot/alerts` and `secret-scanning/alerts`; the operator has since
  granted the stored token (`prod/submit/github/issue_bot_token`, the repository secret
  `ISSUE_BOT_TOKEN`) both read permissions in place, with no regeneration, so no secret write or
  deploy-environment run is needed. Proof: the 03:15 UTC run on 2026-09-19 in
  `/aws/lambda/prod-env-security-lake-nightly` logs no 403 and its `github-alerts` count covers all
  three alert types. **Source**: issue #249. **Owner**: Claude Code. **Model**: Haiku. **Size**: ~0 files.

- [ ] **B52n.2. The spreadsheets donation event lands as `donate`.** The Ads half is done (key event
  `donate` imported from GA4 property 523400333 into Ads account 814-268-5080 as a secondary
  conversion, 23:2x UTC on 2026-09-17) and the spreadsheets repository's `download-page.js` sends
  `donate` since its PR #123 merged (b27eb8c4, 08:26 UTC on 2026-09-18). Proof on 2026-09-19: the
  `key_events_daily` view shows the spreadsheets host's donations under `donate`. **Source**: B52n.
  **Owner**: Claude Code. **Model**: Haiku. **Size**: ~0 files.

## Machine-ask

- [ ] **B11.T10. ITSA phase 2: the recognition pack.** `PLAN_ITSA_PHASE_2.md` T10, its inputs (T7r, T21, T22) on `main`:
  `_developers/hmrc/ITSA_PRODUCTION_APPROVALS_CHECKLIST.md`, an ITSA pass over the two
  questionnaires, and the two draft emails for the operator to send. One application now covers
  both approval stages, and the checklist answers for all nine APIs in the minimum functionality
  standards with a build behind each. **Source**: BACKLOG 11; `PLAN_ITSA_PHASE_2.md` T10.
  **Owner**: Claude Code re-runs the sandbox year on a ci set so the run sits inside HMRC's 14-day log window; then the operator sends `DRAFT_EMAIL_ITSA_RECOGNITION.md` (the pack is on `main` since PR #237, `_developers/hmrc/`) and `DRAFT_EMAIL_ITSA_PRODUCTION_CREDENTIALS.md` when SDST answers. **Model**: Haiku. **Size**: ~3 files.



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
  Nothing on our side is left to try. When Companies House answers BACKLOG 34d: if they enable status
  lookups, poll once more on a ci set and pin the result in the test; then apply the `prod`
  listing (held as unreferenced local commit 946251d4). **Source**: BACKLOG 34b. **Owner**:
  Claude Code. **Model**: Sonnet. Blocked on BACKLOG 34d's answer from Companies House. **Size**: ~1 file.

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

