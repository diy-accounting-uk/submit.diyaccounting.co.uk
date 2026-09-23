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

**Prod runs deployment prod-184afec**; `main`'s deploy 35860344955 of PR #339's merge (`d9cb6432`)
is in progress and moves it on.
**ci**: `ci-set1` is last-known-good and the only ci set standing; `ci-set2` was swept.
Pull requests open: diy-accounting-uk/www.diyaccounting.co.uk#33,
diy-accounting-uk/spreadsheets.diyaccounting.co.uk#136.

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

Shared facts for the analytics rows (B52d, B52e, B52l, B52m): the prod Athena database is
`prod_env_analytics` and the workgroup `prod-env-analytics` (eu-west-2, `AWS_PROFILE=submit-prod`);
`OperatorSnapshotPublish.java` passes them to the Lambda as `GLUE_DATABASE_NAME` and
`ATHENA_WORK_GROUP_NAME` (lines 103 to 104).

## In flight

- [ ] **B83w. Wave b83 on `main`: the deploy.** PR #339 merged as `d9cb6432` with B30av, B30ay,
  B30at, B30ax, B30au, AS1a, B84, B85, B72a, B52d, B52e, B52f3, B52g, B52h, B52k, B52n, B52o,
  F2a, AS18 and the us-east-1 sink policy admitting the gateway account. `main`'s deploy
  35860344955 is in progress. When it is green: (1) B30ay's proof, one dispatch
  `gh workflow run deploy.yml --ref main -f environment-name=ci -f deployment-name=ci-x -f skipTestScenarios=false`
  that must end in under two minutes with the "must be ci-set1 or ci-set2" error; (2) B30at's
  proof, `gh workflow run destroy-ci.yml -f sweep-for-stacks=true` while b84's branch deploy holds
  a slot, whose log must show "stays: claimed by run"; (3) B52e1 below. **Owner**: Claude Code.
  **Model**: Haiku. **Size**: 0 files.

- [ ] **B84w. Wave b84: AS15 and B83.** Branch `claude/b84-board` (worktree
  `.claude/worktrees/b84`, from b83's tip). AS15: knip found 3 dead files and 7 unused
  devDependencies (worktree branch `worktree-agent-afff35e978f85fb7b`); it lands with
  `cdk-typescript/scripts/diff-templates.mjs` restored (`cdk-typescript/package.json`'s `diff`
  script runs it) and `package-lock.json` regenerated. B83: the per-file walk is complete
  (1,295 files, 1,525 capabilities under `target/capabilities/`); a Sonnet pass is writing
  `REPORT_CAPABILITIES.md` and the `CLAUDE.md` link. Then the full suite, one push, one PR.
  **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~6 files.

- [ ] **B52f1. The gateway's RUM monitor and GA4 linker.** PR
  diy-accounting-uk/www.diyaccounting.co.uk#33 (branch `claude/obs-gateway-rum`), green locally
  (`./mvnw clean verify`, 25 unit, 13 browser). Merges after B83w's deploy, which admits account
  283165661847 to the sink its `CfnLink` targets; the `CfnLink` is refused before that.
  **Owner**: Claude Code (the operator merges in that repository). **Model**: Haiku. **Size**:
  11 files.

- [ ] **B52f2. GA4 cross-domain linking on the spreadsheets site.** PR
  diy-accounting-uk/spreadsheets.diyaccounting.co.uk#136 (branch `claude/obs-ga4-linker`),
  pre-push green. **Owner**: Claude Code (the operator merges in that repository). **Model**:
  Haiku. **Size**: 2 files.

## Machine-only

- [ ] **B30az. A ci slot set self-destructs while it is last-known-good.** `ci-set1` (created
  09:35 UTC on 2026-09-23, last-known-good since PR #335's dispatch) lost its
  `SelfDestructStack` at 12:45 and every other stack by 13:04, while
  `/submit/ci/last-known-good-deployment` still named it; b84's first deploy 35863587199 claimed
  the slot at 12:55 and failed in `deploy AccountStack` with "Stack … is in DELETE_IN_PROGRESS
  state and can not be updated". `app/functions/infra/selfDestruct.js` deletes on its schedule
  with no check of last-known-good or of a live slot claim (it only releases the slot after,
  line 190), and a redeploy of a slot set does not move the timer, which is anchored to the
  set's first creation. **Problem**: the ci apex's set disappears on a timer, and any deploy that
  claims its slot in that window races the teardown. **Fixed when**: the self-destruct Lambda
  reads `/submit/ci/last-known-good-deployment` and `/submit/ci/slots/<slot>` before deleting,
  skips (and reschedules itself by the delay) when its set is last-known-good or claimed by an
  unfinished run (`slot-claim-active.mjs`'s rule, B30at), with unit tests in
  `app/unit-tests/functions/selfDestruct.test.js`; proof is a week with no deploy failing on
  `DELETE_IN_PROGRESS`. **Source**: runs 35863587199 and 35862205311 (the operator's
  refused `destroy-ci` dispatch at 12:42 for the same set). **Owner**: Claude Code. **Model**:
  Sonnet. **Size**: ~3 files.

- [ ] **B30ba. One push starts two deploys of the same head.** The push of `claude/b84-board` at
  12:55 UTC on 2026-09-23 (head `ec28d64b`) started `deploy` twice (35863587199 and
  35863589011, one second apart), and `test` and CodeQL twice; both deploys ran against
  `ci-set1` at once. **Problem**: two deploys of one head are pure cost and can race each other on
  one set. **Fixed when**: `deploy.yml`'s `cancel-superseded-push-deploy` job (line 242) also
  cancels a push-triggered deploy when an older in-progress or queued `deploy` run exists for the
  same branch and head SHA (keep the older), and a push that GitHub delivers twice runs one
  deploy; proof is the next new-branch push showing one deploy run. Read that job first: it
  already cancels a push deploy covered by a named dispatch. **Source**: runs 35863587199,
  35863589011, 35863585902, 35863588138. **Owner**: Claude Code. **Model**: Haiku. **Size**:
  1 file.

- [ ] **B52j. The `ads-advisor` skill.** `.claude/skills/ads-advisor/SKILL.md`: how to run B52g
  and B52h, how to read CTR, CPC, conversion rate and cost per session against the funnel's
  break-even cost per session (£0.36, `PLAN_ONE_STOP_DASHBOARD.md` D17) and the reinvestment
  numbers on B52m, how to answer "how many clicks for £N a day" (forecast, then the report for
  what the live campaign does) and "optimise for the same result" (B52k's bidding vocabulary:
  which strategy and parameters, written into `ads.toml` as a PR whose plan shows the change),
  and when to say the spend cannot pay back. Registered in `CLAUDE.md`'s skills list. B52g's
  `ads-report.js`, B52h's `ads-forecast.js` and B52k's `[campaign.bidding]` are on `main`; the
  forecast answers live once OB52h lands, and the skill says so. **Source**: operator 2026-09-22; `PLAN_ONE_STOP_DASHBOARD.md` D17; BACKLOG 52. **Owner**: Claude Code. **Model**: Haiku.
  **Size**: ~2 files.

## Machine-ask

- [ ] **B52e1. Backfill the revenue labels for 1 to 21 September.** After B83w's deploy puts the
  Payment Link fallback into the prod `stripeReconcile` Lambda, invoke it once per date so each
  day's `curated/stripe/stripe_charges/dt=<date>/charges.json.gz` is rewritten with the resolved
  `bundle_id`. The Lambda invoke is a prod AWS write outside a workflow, so the operator approves
  it; the command, run from the repository root with `AWS_PROFILE=submit-prod`:
  `for d in $(seq -w 1 21); do aws lambda invoke --function-name <prod stripeReconcile function> --payload "{\"date\":\"2026-09-$d\"}" --cli-binary-format raw-in-base64-out /dev/stdout; done`
  (the function name is read from `aws lambda list-functions` at the time). Proof: `v_revenue_daily`
  for September shows the donations under `donation-10`/`-20`/`-45`/`-custom` and the £0.99
  charges under `resident-vat`. **Owner**: Claude Code; the operator approves. **Model**: Haiku.
  **Size**: 0 files.

## Human-driven

- [ ] **OICO. Update the ICO registration.** With the "Practice licence: client data" section of
  `_developers/ICO_CHECKLIST.md` (line 68; registration ZB070902, whose scope row at line 83 is
  `Pending`), sign in to the ICO's registration portal and update DIY Accounting Limited's entry
  to cover the practice licence's client data; note the date in that row. PU-7n waits on this
  alone. **Source**: operator 2026-09-22. **Owner**: Operator. **Model**: none. **Size**: 0 files.

- [ ] **OB52h. Basic access for the Ads API project.** `infra/google/ads/ads-forecast.js` (on
  `claude/b83-board`) gets `DEVELOPER_TOKEN_NOT_APPROVED`, "This method is not allowed for use with
  explorer access", from `KeywordPlanIdeaService`; the Cloud project `diyaccounting-ga4` holds
  Explorer access, which serves `googleAds:search` only. Since 2026-09-09 the access level sits on
  the Cloud project: complete brand verification for `diyaccounting-ga4` (Google Auth Platform,
  Branding, <https://console.cloud.google.com/auth/branding?project=diyaccounting-ga4>), then on the
  Google Ads API overview page
  (<https://console.cloud.google.com/apis/api/googleads.googleapis.com/overview?project=diyaccounting-ga4>)
  expand "Apply for next access level" and apply for Basic. B52h's live proof follows.
  **Source**: B52h's run 2026-09-23. **Owner**: Operator. **Model**: none. **Size**: 0 files.

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

- [ ] **B52h1. `ads-forecast.js`'s live proof.** The script is on `main` (49 unit tests green);
  Google refuses `KeywordPlanIdeaService` under Explorer access (`DEVELOPER_TOKEN_NOT_APPROVED`).
  After OB52h: `AWS_PROFILE=submit-prod node infra/google/ads/ads-forecast.js --keywords "submit vat return,mtd vat software" --budget-gbp 50`
  prints a forecast. Blocked on OB52h. **Owner**: Claude Code. **Model**: Haiku. **Size**: 0
  files.


- [ ] **F1b. PayPal's six months staged.** Run `scripts/finance/paypal-stage.js` (the credential
  read from Secrets Manager `prod/submit/paypal/client_id` and `prod/submit/paypal/client_secret`
  with `AWS_PROFILE=submit-prod`) for each month from March to August 2026, writing
  `../staging/<year-end>/paypal/<yyyy-mm-dd>-paypal-transactions.json`. F2g reads the output.
  Blocked on OF1. **Source**: `../PLAN_FINANCE_AUTOMATION.md` route 1. **Owner**: Claude Code.
  **Model**: Haiku. **Size**: 0 files.

- [ ] **F2g. PayPal transactions into diya-gl lines.** `mcp/lib/finance/paypal-lines.js` over
  F1b's staged files, on F2a's pattern: settled transactions only, holds and their reversals
  excluded (the March 2026 holds case as a test), a receipt as `sales`, a bill payment as
  `purchases` matched to the mailbox invoice, posted to the PayPal wallet's cash account
  (`Cashaccount.xlsx` is that ledger, per `../REPORT_FINANCE_SOURCES_2025-26.md`) so the bank
  sees only the withdrawals; validated with `validateLines`; a unit test over a recorded page.
  Blocked on F1b. **Source**: `../PLAN_FINANCE_AUTOMATION.md` phase 2. **Owner**: Claude Code.
  **Model**: Sonnet. **Size**: ~2 files.

- [ ] **B11.T10. ITSA phase 2: the testing evidence inside the window.** Within the 14 days before
  the day O11 names, re-run `scripts/itsa-sandbox-year.js` for 2023-24, 2025-26 and 2026-27 (the
  command in `_developers/hmrc/ITSA_PHASE_2_SANDBOX.md` "The command", lines 66 to 80, output
  under `../itsa-sandbox/<tax-year>/`) and update the "Testing in the last two weeks" row of
  `_developers/hmrc/hmrc_questionnaire_itsa_pass_diy_accounting_limited_v1.md` (line 28, today
  "2026-09-21 (`5f2ff46a`)") with the run dates and commit. Blocked on O11's day. **Source**:
  BACKLOG 11; `PLAN_ITSA_PHASE_2.md` T10. **Owner**: Claude Code. **Model**: Haiku. **Size**:
  ~1 file.

- [ ] **B34.6c. Companies House accounts filing: the sandbox proof.** When O34d's answer says
  lookups are enabled: poll 000004 through `GET /api/v1/companies-house/accounts/000004` on a
  standing ci set and pin the returned `StatusCode` and any rejections as a case in
  `app/unit-tests/functions/companiesHouseAccountsGet.test.js`. The prod catalogue listing is
  BACKLOG 34c's: prod carries no `COMPANIES_HOUSE_XMLGW_URI` and no presenter secret ARNs. Blocked
  on O34d's answer. **Source**: BACKLOG 34b. **Owner**: Claude Code. **Model**: Sonnet. **Size**:
  ~1 file.

- [ ] **B52l. The optimiser over the raw export.** A notebook over `../analytics/prod/` (pulled by
  `scripts/analytics-pull.sh`, one CSV per view in `app/functions/analytics/rawExportPublish.js`'s
  `VIEW_NAMES` (line 21)): per-block correlations, the block models fitted (linear cost from
  `v_cost_daily`, log-linear funnels from `v_login_to_submission_funnel` and `v_ga4_funnel_daily`,
  Hill curves for spend), levers ranked by effect per unit cost, and the next experiment proposed
  with its predicted effect and interval as a row ready for `experiments.toml`; Bayesian
  optimisation for the continuous knobs and a Thompson-sampling bandit for allocations once
  experiments exist. The model design as a section under `PLAN_ONE_STOP_DASHBOARD.md` D16 first,
  then the notebook, then one line per objective on `web/public/operator/dashboard.html`. Blocked
  until three months of nightly export exist under `exports/prod/`: first written 2026-09-08, so
  the gate is 2026-12-09, checked with `aws --profile submit-prod s3 ls
  s3://prod-env-analytics-lake-<account>/exports/prod/`. **Source**: BACKLOG 52l;
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

- [ ] **F2d. DIYA's book, assembled and verified.** The lines from F2a (Stripe), F2g (PayPal),
  `mcp/lib/finance/bank-lines.js` over F1d's statements and `mcp/lib/finance/mail-invoices.js`,
  plus `mcp/lib/finance/book-from-workbook.js`'s `book.toml` for 1 March to 31 August 2026,
  validated with `validateBook` and `validateLines` from the diya-gl package, written under
  `../staging/2026-2027/book/` (private); March 2026 matched line for line against the completed
  2025-26 workbook (the control), every month's bank closing balance equal to the statement's,
  gross income and fees separate, no hold posted, each check a line in
  `../staging/2026-2027/book/VERIFICATION.md`. F2a's `mcp/lib/finance/stripe-lines.js` is on `main`.
  Blocked on F1d and F2g.
  **Source**: `../PLAN_FINANCE_AUTOMATION.md` phase 2 and its verification. **Owner**: Claude Code.
  **Model**: Sonnet. **Size**: ~2 files.

- [ ] **F2e. The MCP writes a populated spreadsheets package.** A tool in `mcp/lib/finance/` that
  takes the book and lines and writes a DIY Accounting spreadsheets package, reconciled under the
  spreadsheets repository's existing reconciliation harness rather than a new check; nothing
  automated writes to Google Drive. Blocked on F2d. **Source**: `../PLAN_FINANCE_AUTOMATION.md`
  phase 2. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~3 files.

- [ ] **PU-7n. The practice licence launch.** Operator, 2026-09-22: `resident-pro` at £199 a
  year and £19.99 a month, the monthly price shown only on `bundles.html` (the DIYA-GL page shows
  annual prices alone, for `resident` too). `web/public/submit.catalogue.toml`'s `resident-pro`
  block (line 208: `enable = "on-pass"`, `hidden = true`, `allocation = "on-pass-on-subscription"`,
  one monthly price of 999) flips to `enable = "always"`, `hidden = false`,
  `allocation = "on-subscription"` with the two prices on its prices table, then
  `stripe-catalogue-sync` test and live for the price ids into `.env.ci` and `.env.prod`
  (machine-ask for the live run); a practice page nav link is added to
  `web/public/widgets/page-chrome.js` (it has none today); the four ci probes that reach
  `resident-pro` through a pass are updated in the same change; the DIYA-GL page
  (`../spreadsheets.diyaccounting.co.uk/web/diya-gl.co.uk/public/index.html`, whose tier list at
  line 73 shows `resident` at £39 a year alone) gains a `resident-pro` line at £199 a year, in
  that repository's own PR. Blocked on OICO (the register must cover the client data before the
  tier is sold). **Source**: `PLAN_PRICE_UPDATE.md` §(d); operator 2026-09-22. **Owner**: Claude
  Code. **Model**: Sonnet. **Size**: ~9 files.

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

