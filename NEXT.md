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

**Prod runs deployment prod-cdbc557**.
**ci**: `ci-set1` is last-known-good. Open pull requests: #333 (`claude/b79-developers`), red until its fix pushes; #334
(`claude/b80-board`), its ci deploy starting.

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

- [ ] **B81. Wave b81 on `claude/b81-board`.** Three commits, the batch proof running before the
  push: PU-7m (a0bd6686: the practice licence suite green on the simulator lane, the
  practice-clients table bootstrapped for the local lanes, `resident-pro` granted through checkout
  so `subscriptionStatus` is set), AS7a (0caff823: the `STRICT_ENV_VALIDATION` flag gone, strict
  validation the default, the local-server system test loading `.env.test`) and AS1 (f3538afa:
  the `**/.claude/**` coverage exclude matched every file inside a worktree under
  `.claude/worktrees/`, so both providers reported nothing; the project config's misplaced
  `pool`/`include` block flattened; thresholds 76/68/86/77 from the measured run, a point above
  fails and the committed numbers pass). The suite's ci and prod variants need a sandbox agent
  authorisation the simulator shortcut has no equivalent for, so they run only when one exists.
  **Source**: the rows named. **Owner**: Claude Code. **Model**: Sonnet and Haiku. **Size**: ~20
  files.
- [ ] **PU-7. Practice licence build.** PU-7a to PU-7l are on `main`. In flight on
  `claude/b81-board` (wave b81, one agent): PU-7m, the
  behaviour test `behaviour-tests/practiceLicence.behaviour.test.js`: two clients added through
  the practice routes, a derive and a submit for each against the HMRC sandbox, over the MCP's
  `run_for_clients`; its `package.json` script and its `deploy.yml` and `probe-test.yml` jobs in
  the shape the other suites use. Then,
  in `PLAN_PRICE_UPDATE.md` §(d) (lines 227 to 236):  PU-7e on the operator's grant numbers; the
  `resident-pro` catalogue values (`enable = "always"`, `hidden = false`,
  `allocation = "on-subscription"`) and the practice page's nav link in
  `web/public/widgets/page-chrome.js` flip in the launch step after PU-7m, with the four ci probes
  that reach resident-pro through a pass updated in the same change. **Source**:
  `PLAN_PRICE_UPDATE.md` PU-7. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~4 files for
  PU-7m, ~8 for the launch step after it.

- [ ] **B80. Wave b80 on `claude/b80-board`, PR #334.** Three agents: AS8 (the two RUM deployed-environment skips out of the unit runner; AS1's
  coverage commit rejected, the finding on its own row), AS4 and AS7 (the ESLint config cleanup; the strict-mode TODO and warning
  comments), AS6 and AS5 (prettier and Spotless checks in `test.yml`, with the 218 files they reformat; the
  lint job as a baseline ratchet at zero errors). Its `test` run went red on the new prettier check (one file the AS8 commit left unformatted);
  the fix is committed and pushes when deploy 35761188691 ends. **Source**: the
  rows named. **Owner**: Claude Code. **Model**: Sonnet and Haiku. **Size**: ~10 files plus the
  directives.

- [ ] **B79. The developer archive leaves the repository, PR #333.** `_developers/archive`,
  `backlog`, `design`, `aws-multi-account` and the dated reports (213 files) now live in the
  private workspace tree `../developers/submit`, indexed as the corpus source `developers`; the
  vendor API specs move to `reference/`; `_developers/` keeps `hmrc/` and the live runbooks.
  Its ci deploy 35753852365 went red in `diyaGlSubscriptionBehaviour`: the durable test user
  has reached the tier's book limit because runs that failed mid-way today left their books
  behind; the fix (delete the user's leftover books before the PUT) is the branch's second commit e895c1d0; a behaviour-test change triggers no
  deploy, so the proof is the dispatched deploy 35766211386 (`ci-b79-probe`). After the merge: repoint `NEXT.md` and `BACKLOG.md` on `main`, and
  land AS15 and AS18, which touch the same files. The spreadsheets and www moves are merged (their PRs #133 and #32). **Source**: operator 2026-09-22. **Owner**: Claude
  Code. **Model**: Sonnet. **Size**: 262 files.

## Machine-only

- [ ] **AS15. A dead-code pass with knip.** The assessment's dead-code scan used `ts-prune` on
  a JavaScript tree and reported zero, which is "not analysed". Run `npx knip` once at the root
  (a `knip.json` naming `app/bin/server.js`, the Lambda handlers under `app/functions/**` and the
  `mcp/` package as entries, so handlers are not reported as unused), read every finding against
  the code, and delete what is dead in one commit; anything ambiguous becomes a row here with the
  finding quoted. No CI gate. **Source**: the AI-readiness assessment of 2026-09-18 (`.assess/assess-report.md` on the `bjcoombs` fork at 45bcc054). **Owner**: Claude Code. **Model**: Haiku.
  **Size**: ~1 file plus the deletions.

- [ ] **AS18. One assistant guide, aligned with CLAUDE.md.** Junie is no longer used: delete
  `.junie/guidelines.md` and `_developers/Junie.md`, and the "Other AI assistants" lines in
  `CLAUDE.md` that name them. Then read `.github/copilot-instructions.md` against `CLAUDE.md`
  and the tree, and correct every statement in it that CLAUDE.md or the code contradicts (the
  assessment found the Multi-Site section of CLAUDE.md false and expects more). Proof: every
  backticked path in both files exists in a fresh clone. **Source**: the AI-readiness assessment of 2026-09-18 (`.assess/assess-report.md` on the `bjcoombs` fork at 45bcc054), opportunity
  list; operator 2026-09-22. **Owner**: Claude Code. **Model**: Haiku. **Size**: ~4 files.

- [ ] **B52d. The visitors panel.** `operatorSnapshotPublish.js` already reads
  `v_visitors_by_kind_daily` (lines 176 to 191: the `human` and `bot` rows; add `synthetic`) into
  the snapshot; `web/public/operator/dashboard.html` shows nothing from it. Add a visitors panel
  (human, bot, synthetic per day, the last 30 days) in the shape the page's other panels use,
  reading the snapshot's existing fields, with a case in the page's unit test. Proof: the panel
  renders from a snapshot fixture carrying the three kinds. **Source**: BACKLOG 67;
  `PLAN_ONE_STOP_DASHBOARD.md` D4. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~3 files.

- [ ] **B52e. Donations on the revenue panel.** `infra/stripe/stripe.toml` (lines 53 to 60)
  says the spreadsheets site's donation Payment Links live in the same Stripe account and carry
  `payment_intent_data.metadata.bundleId`, which `v_revenue_daily` groups by (`coalesce(bundle_id,
  'unknown')`). Prove it on live data: with `AWS_PROFILE=submit-prod`, query the view for the last
  90 days (`aws athena start-query-execution` with the analytics database and workgroup
  `operatorSnapshotPublish.js` names) and read whether donation charges appear under their
  product or under `unknown`; if `unknown`, read a recent donation charge from Stripe live
  (`infra/stripe/stripe-sync.js`'s key lookup, read-only) for whether the metadata is missing on
  the link or dropped in the pull (`scripts/finance/stripe-stage.js` or the revenue ingestion
  Lambda), and fix that layer. PayPal donations join through F1b once OF1 lands. **Source**:
  BACKLOG 66; `PLAN_ONE_STOP_DASHBOARD.md` D2. **Owner**: Claude Code. **Model**: Sonnet.
  **Size**: ~2 files.

- [ ] **B52f. Web vitals on all three sites.** The page-experience panel wants LCP, INP and CLS
  at p75 for submit, spreadsheets and the apex; RUM on submit records LCP and INP. Read the RUM
  app monitor's `telemetries` in `infra/main/java/.../EdgeStack.java` (or wherever
  `AppMonitor` is built) and the client config in `web/public/lib/analytics.js`, and add CLS if
  it is not collected; read `../spreadsheets.diyaccounting.co.uk/web/spreadsheets.diyaccounting.co.uk/public/lib/analytics.js`
  and its `site-rum-loader.browser.test.js` for whether spreadsheets has an app monitor of its
  own (its CDK under `../spreadsheets.diyaccounting.co.uk/infra`), and add one if not; the apex
  (`../www.diyaccounting.co.uk`) the same. Then the GA4 side: cross-domain linking across the
  three hosts and the key events, as code through `infra/google/` (backlog 49's tooling; the
  Admin API script there). Three repositories, one PR each, this repository's panel reading the
  three monitors. **Source**: BACKLOG 62; `PLAN_ONE_STOP_DASHBOARD.md` D3. **Owner**: Claude
  Code. **Model**: Sonnet. **Size**: ~6 files across three repositories.

## Machine-ask

## Human-driven

- [ ] **O34d. Send the XML Gateway email.** Send `../DRAFT_EMAIL_XMLGW_000004.md` from `antony@diyaccounting.co.uk`
  as a reply on the `xml@companieshouse.gov.uk` thread, and paste the answer into B34.6c's row when
  it comes. **Source**: BACKLOG 34d. **Owner**: Operator. **Model**: none. **Size**: 0 files.

- [ ] **OF1. The PayPal app credentials.** In the PayPal developer dashboard
  (<https://developer.paypal.com/dashboard/applications/live>), create a live REST API app for
  the company account and put its client id and secret on the `prod` GitHub environment as
  `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`
  (<https://github.com/diy-accounting-uk/submit.diyaccounting.co.uk/settings/environments>); the
  next `deploy-environment.yml` run lands them, and F1b's six-month run follows. **Source**:
  `../PLAN_FINANCE_AUTOMATION.md` route 1. **Owner**: Operator. **Model**: none. **Size**: 0 files.

- [ ] **O11. The ITSA send day.** Name the day the recognition email goes, write it into B11.T10's
  row, and on that day send `_developers/hmrc/DRAFT_EMAIL_ITSA_RECOGNITION.md` to
  `SDSTeam@hmrc.gov.uk`, then `_developers/hmrc/DRAFT_EMAIL_ITSA_PRODUCTION_CREDENTIALS.md` when
  SDST answers. **Source**: BACKLOG 11; `PLAN_ITSA_PHASE_2.md` T10. **Owner**: Operator. **Model**:
  none. **Size**: 0 files.

- [ ] **F1d. NatWest statements to staging.** The operator signs in to NatWest and downloads, for
  each of March to August 2026, the current account `600947-80597386` and the savings account
  `600947-80634672` statements as CSV and PDF into `../staging/2025-2026/bank/` (March) and
  `../staging/2026-2027/bank/` (April to August; both directories exist, with `../staging/README.md`
  naming the layout), named
  `<yyyy-mm-dd>-natwest-<current|savings>-<account>.<csv|pdf>` with the month's last day, the shape
  of the 2025-26 files in the Drive mirror. No automation touches the bank sign-in. **Source**:
  `../PLAN_FINANCE_AUTOMATION.md` route 3. **Owner**: Operator. **Model**: none. **Size**: 24 files
  outside any repository.

## Blocked

- [ ] **B11.T10. ITSA phase 2: the testing evidence inside the window.** Within the 14 days before
  the day O11 names, re-run `scripts/itsa-sandbox-year.js` for 2023-24, 2025-26 and 2026-27 (the
  commands in `_developers/hmrc/ITSA_PHASE_2_SANDBOX.md` lines 69 to 79; B11.T7c's output directory
  under `../itsa-sandbox/<tax-year>/`) and update the "Testing in the last two weeks" row of
  `_developers/hmrc/hmrc_questionnaire_itsa_pass_diy_accounting_limited_v1.md` (line 28) with the
  run dates and commit. Blocked on O11's day. **Source**: BACKLOG 11; `PLAN_ITSA_PHASE_2.md` T10.
  **Owner**: Claude Code. **Model**: Haiku. **Size**: ~1 file.

- [ ] **B34.6c. Companies House accounts filing: the sandbox proof.** When O34d's answer says
  lookups are enabled: poll 000004 through `GET /api/v1/companies-house/accounts/000004` on a
  standing ci set and pin the returned `StatusCode` and any rejections as a case in
  `app/unit-tests/functions/companiesHouseAccountsGet.test.js`. The prod catalogue listing is
  BACKLOG 34c's: prod carries no `COMPANIES_HOUSE_XMLGW_URI` and no presenter secret ARNs. Blocked
  on O34d's answer. **Source**: BACKLOG 34b. **Owner**: Claude Code. **Model**: Sonnet. **Size**:
  ~1 file.

- [ ] **B52l. The optimiser over the raw export.** A notebook over `../analytics/prod/` (pulled by
  `scripts/analytics-pull.sh`, one CSV per view in `rawExportPublish.js`'s `VIEW_NAMES`): per-block
  correlations, the block models fitted (linear cost from `v_cost_daily`, log-linear funnels from
  `v_login_to_submission_funnel` and `v_ga4_funnel_daily`, Hill curves for spend), levers ranked by
  effect per unit cost, and the next experiment proposed with its predicted effect and interval as a
  row ready for `experiments.toml`; Bayesian optimisation for the continuous knobs and a
  Thompson-sampling bandit for allocations once experiments exist. The model design as a section
  under `PLAN_ONE_STOP_DASHBOARD.md` D16 first, then the notebook, then one line per objective on
  `web/public/operator/dashboard.html`. Blocked until three months of nightly export exist under
  `exports/prod/`: first written 2026-09-08, so the gate is 2026-12-09, checked with `aws --profile
  submit-prod s3 ls s3://prod-env-analytics-lake-<account>/exports/prod/`. **Source**: BACKLOG 52l;
  `PLAN_ONE_STOP_DASHBOARD.md` D16. **Owner**: Claude Code. **Model**: Opus for the models, Sonnet
  for the notebook. **Size**: ~3 files.

- [ ] **B52m. The reinvestment loop.** Trailing income, reserve, budget, return per pound and payback
  as one block on `web/public/operator/dashboard.html`, fed by observations over `v_revenue_daily`
  and `v_cost_vs_target_monthly` in `operatorSnapshotPublish.js`; the reinvestment fraction as a
  lever with the reserve floor (operator, 2026-09-22: the fraction is 20% of trailing income, the
  reserve floor £2,000, one experiment may take at most 10% of the budget unless the operator
  names a larger share for it, and the trailing window is 30 days); paid traffic and article boosts as `experiments.toml` rows with
  on-off or geographic controls; GA4 conversion import from the Ads account, which exists as code
  (`infra/google/ads/ads.toml`: customer `8142685080`, four conversion actions imported from GA4
  events, one Performance Max campaign); the cost-per-session ceiling PU-15 wrote into D17 is the
  starting bid ceiling. Blocked on B52l's fitted models (the return-per-pound figure), the cost
  panel carrying revenue (BACKLOG 43, from 2026-10-02). **Source**: BACKLOG
  52m; `PLAN_ONE_STOP_DASHBOARD.md` D17. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~3
  files.

- [ ] **B52i. The company P&L and balance sheet on the dashboard.** The company's diya-gl book,
  derived nightly and rendered above the eight objectives beside the last set filed at Companies
  House. Shape: a nightly Lambda beside `app/functions/analytics/` calling `mcp/lib/accounts-tools.js`
  `derive_micro_entity_accounts` over the cloud book, writing JSON lines to `curated/finance/` with
  a Glue table on `Ga4DailyTables.java`'s pattern, one observation set in
  `operatorSnapshotPublish.js`, and a block above `renderSnapshot`'s objectives in
  `web/public/operator/dashboard.html`. Blocked on OF2 (DIYA's book saved to the DIYA cloud, the last of the F1 and F2 rows). **Source**: BACKLOG 52i; `PLAN_ONE_STOP_DASHBOARD.md` D10. **Owner**:
  Claude Code. **Model**: Sonnet. **Size**: ~4 files.

- [ ] **F2d. DIYA's book, assembled and verified.** The lines from F2a and F2b plus F2c's
  `book.toml` for 1 March to 31 August 2026, validated with `validateBook` and `validateLines`
  from the diya-gl package, written under `../staging/2026-2027/book/` (private); March 2026 matched
  line for line against the completed 2025-26 workbook (the control), every month's bank closing
  balance equal to the statement's, gross income and fees separate, no hold posted, each check a
  line in `../staging/2026-2027/book/VERIFICATION.md`. Blocked on F1b's run (OF1), F1d, F2a's Stripe and PayPal parsers, F2c and F2f.
  **Source**: `../PLAN_FINANCE_AUTOMATION.md` phase 2 and its verification. **Owner**: Claude Code.
  **Model**: Sonnet. **Size**: ~2 files.

- [ ] **F2e. The MCP writes a populated spreadsheets package.** A tool in `mcp/lib/finance/` that
  takes the book and lines and writes a DIY Accounting spreadsheets package, reconciled under the
  spreadsheets repository's existing reconciliation harness rather than a new check; nothing
  automated writes to Google Drive. Blocked on F2d. **Source**: `../PLAN_FINANCE_AUTOMATION.md`
  phase 2. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~3 files.

- [ ] **OF2. DIYA's book saved to the DIYA cloud.** With the operator signed in through B61's
  sign-in, `save_book` writes F2d's verified book to the DIYA cloud, which is B52i's unblock event.
  Blocked on F2d. **Source**: `../PLAN_FINANCE_AUTOMATION.md` phase 2. **Owner**: Claude
  Code; the operator signs in. **Model**: Haiku. **Size**: 0 files.

## Discipline

- **Push once per batch of landed tracks, never per track**, and prefer one dispatch that
  proves several things over several dispatches. A push per track turned one batch into six
  ci deploys and several environment deploys in a morning on 2026-09-06, each able to open
  alarm issues and cancel each other through the deploy concurrency group, and the operator
  froze pushes twice. A freeze, when the operator calls one, stops `git push`,
  `gh workflow run` and `gh pr create` until they lift it in their own words; local commits,
  worktree tracks and reading logs continue, and a failed job gets a proposed fix in the reply.

