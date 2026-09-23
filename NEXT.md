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

**Prod runs deployment prod-d458f02** (PR #343's merge deploy).
**ci**: `ci-set1` is last-known-good and the only ci set standing; `ci-set2` was swept.
Pull requests open: diy-accounting-uk/www.diyaccounting.co.uk#33 (mergeable now: the sink admits
the gateway account), diy-accounting-uk/spreadsheets.diyaccounting.co.uk#136.

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

- [ ] **F2g1. PayPal statements into diya-gl lines.** Branch `claude/b87-board` (worktree
  `.claude/worktrees/b87`): `mcp/lib/finance/paypal-statement-lines.js` parses the monthly
  `<yyyy-mm> PayPal - transactions.PDF` in the Drive mirror
  (`../drive/DIY Accounting Limited/finance/2026-2027 accounts/paypal/`, `pdftotext -layout`),
  settled rows only, holds and reversals excluded, each month checked against its statement's
  balance movement. The API route (OF1, F1b, F2g) stays; this one unblocks F2d now. **Owner**:
  Claude Code. **Model**: Sonnet. **Size**: ~2 files.

- [ ] **B30at1. The sweep's claim check, proven.** Needs a claimed set that is not last-known-good
  (the sweep keeps the last-known-good set before it reads any claim): the next time two branches
  deploy at once, `gh workflow run destroy-ci.yml -f sweep-for-stacks=true` while the second holds
  `ci-set2`, and its log shows "stays: claimed by run". **Owner**: Claude Code. **Model**: Haiku.
  **Size**: 0 files.

## Machine-only

- [ ] **B30bb. A Markdown-only push leaves a PR blocked.** `main`'s ruleset (16057564) requires
  `Check commit signatures`, `npm test`, `maven test`, `eslint` and `CodeQL` on the PR head, but
  `.github/workflows/codeql.yml` ignores `**.md` on push and pull_request and has no
  `workflow_dispatch`, and `test.yml` skips a Markdown-only push too; PR #344's head `5175ec17`
  (a skill file) sat `BLOCKED` until the branch was moved back. Add `workflow_dispatch` to
  `codeql.yml`, and in `.claude/skills/auto-merge/SKILL.md` a step: when the PR head changes only
  `.md` files and a required check is missing, dispatch `test.yml` and `codeql.yml` on the head
  (`gh workflow run <file> --ref <headRef>`) and wait for them. Proof: a Markdown-only commit on a
  PR reaches `CLEAN` after the dispatches. Same agent as B30bc. **Owner**: Claude Code. **Model**:
  Sonnet. **Size**: 2 files.

- [ ] **B30bc. A secret and PII scan on every push, docs included.** No workflow scans what a
  push adds when the push is Markdown-only (CodeQL and `test.yml` skip it). Add
  `.github/workflows/content-scan.yml` on push (every branch, no path filter) and pull_request: scan
  the lines the push or PR adds with the patterns `scripts/redact-triage-output.mjs` already
  exports (`DENY_PATTERNS`: email, NINO, UTR, VRN, EORI, AWS keys, JWTs, bearer tokens, IP
  addresses), plus private-key blocks and common provider tokens (GitHub, Stripe, Google), with an
  allow-list for addresses and ids the repository publishes on purpose. Fail on a hit and print
  the file, line and label, never the matched value. Extend `redact-triage-output.mjs` or a
  sibling script with tests, as the capabilities rule asks. Adding `content scan` to the ruleset's
  required checks is OB30bc. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~4 files.

- [ ] **B52h2. Forecast Search at a match type and a bid ceiling.** `infra/google/ads/ads-forecast.js`
  sends every keyword as `BROAD` with no maximum cost per click (line 155), so the forecast of
  2026-09-23 read £38 a click for £50 a day. Add `--match-type <EXACT|PHRASE|BROAD>` and
  `--cpc-ceiling-gbp <n>` (maximize clicks with `cpcBidCeilingMicros`, or manual CPC), with tests,
  and in `.claude/skills/ads-advisor/SKILL.md` say to quote the match type and ceiling with any
  forecast. **Owner**: Claude Code. **Model**: Haiku. **Size**: 3 files.

- [ ] **OF1a. PayPal client id read from a variable.** The operator created the live app
  `diya-finance` and put `PAYPAL_CLIENT_SECRET` on the `prod` environment as a secret and
  `PAYPAL_CLIENT_ID` as a variable (2026-09-23). `.github/workflows/deploy-environment.yml`'s step
  "Create secret in AWS from secrets.PAYPAL_CLIENT_ID" (line 339) reads `secrets.PAYPAL_CLIENT_ID`,
  so it would skip. Change it to `vars.PAYPAL_CLIENT_ID` (and its step name), keep the secret step,
  then after merge dispatch `gh workflow run deploy-environment.yml --ref main -f environment-name=prod`
  (read the workflow for its inputs first) and confirm `prod/submit/paypal/client_id` and
  `client_secret` exist in Secrets Manager (read-only `describe-secret`). Then F1b runs.
  **Owner**: Claude Code. **Model**: Haiku. **Size**: 1 file.

- [ ] **ITSA8. The diversion note for income the build does not cover.** Row 8 of
  `_developers/hmrc/ITSA_PRODUCTION_APPROVALS_CHECKLIST.md` is "Not evidenced": a customer with
  foreign property or other income is not told where to finish their return. Add the note to
  `web/public/hmrc/itsa/dashboard.html` (and wherever the business picker shows a foreign-property
  business), with a browser test, and mark row 8 evidenced with the file and line. **Owner**:
  Claude Code. **Model**: Sonnet. **Size**: ~3 files.

- [ ] **ITSA13. WCAG 2.1 AA evidence for the 19 ITSA pages.** Row 13 of the checklist is "Not
  evidenced": `scripts/axe-quickscan.mjs`'s page list carries the VAT pages and none of the 19
  pages under `web/public/hmrc/itsa/`. Add them, run the scan against the simulator
  (`npm run` the script the accessibility workflow uses; read `.github/workflows/` for it), fix
  what it finds, and record the result in the checklist and `REPORT_ACCESSIBILITY_PENETRATION.md`.
  **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~4 files.

- [ ] **ROPA. A record of processing for the practice client list.** `_developers/ICO_CHECKLIST.md`
  "Practice licence: client data" (line 68 onward) marks "Records of processing: client list"
  `Pending`: no document lists what the client list holds, why, where (`{env}-env-practice-clients`,
  eu-west-2), who (the practice as controller for its clients, DIY Accounting as processor for the
  roster and controller for its own records), retention (archived rows kept, receipts seven years)
  and how rights are met. Write it as `_developers/RECORDS_OF_PROCESSING.md` from the checklist's
  rows (they carry the file and line evidence), mark the checklist row met, and mark its
  "Registration scope requires update" row not applicable: the ICO register records name,
  address, number, tier, dates and DPO only
  (<https://ico.org.uk/about-the-ico/what-we-do/register-of-fee-payers/>). **Owner**: Claude Code.
  **Model**: Haiku. **Size**: 2 files.

## Machine-ask

## Human-driven

- [ ] **OB30bc. Make the content scan a required check.** After B30bc merges, add `content scan` to
  the required status checks of ruleset 16057564
  (<https://github.com/diy-accounting-uk/submit.diyaccounting.co.uk/rules/16057564>), so no PR merges
  past a secret or PII hit. **Owner**: Operator. **Model**: none. **Size**: 0 files.

- [ ] **OPU7n. Go for the practice licence launch.** Say go when `resident-pro` should go on sale at
  £199 a year and £19.99 a month (the catalogue flip, the nav link, the Stripe live prices, PU-7n).
  **Owner**: Operator. **Model**: none. **Size**: 0 files.

- [ ] **O34d. Send the XML Gateway email.** Send `../DRAFT_EMAIL_XMLGW_000004.md` from `antony@diyaccounting.co.uk`
  as a reply on the `xml@companieshouse.gov.uk` thread, and paste the answer into B34.6c's row when
  it comes. **Source**: BACKLOG 34d. **Owner**: Operator. **Model**: none. **Size**: 0 files.

- [ ] **O11. The ITSA send day.** Name the day the recognition email goes, write it into B11.T10's
  row, and on that day send `_developers/hmrc/DRAFT_EMAIL_ITSA_RECOGNITION.md` to
  `SDSTeam@hmrc.gov.uk`, then `_developers/hmrc/DRAFT_EMAIL_ITSA_PRODUCTION_CREDENTIALS.md` when
  SDST answers. **Source**: BACKLOG 11; `PLAN_ITSA_PHASE_2.md` T10. **Owner**: Operator. **Model**:
  none. **Size**: 0 files.

## Blocked

- [ ] **F1b. PayPal's six months staged.** Run `scripts/finance/paypal-stage.js` (the credential
  read from Secrets Manager `prod/submit/paypal/client_id` and `prod/submit/paypal/client_secret`
  with `AWS_PROFILE=submit-prod`) for each month from March to August 2026, writing
  `../staging/<year-end>/paypal/<yyyy-mm-dd>-paypal-transactions.json`. F2g reads the output.
  Blocked on OF1a. **Source**: `../PLAN_FINANCE_AUTOMATION.md` route 1. **Owner**: Claude Code.
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

- [ ] **F2d. DIYA's book, assembled and verified.** The lines from F2a (Stripe), F2g1 (PayPal statements),
  `mcp/lib/finance/bank-lines.js` over the NatWest statements in the Drive mirror
  (`../drive/DIY Accounting Limited/finance/2025-2026 accounts/bank/` for March,
  `../drive/DIY Accounting Limited/finance/2026-2027 accounts/bank/` for April to August, CSV and
  PDF per month, named `<Current|Savings> <account> <dd-mm-yyyy> to <dd-mm-yyyy>` or with a hyphen
  between the dates; April's current account also has a 1–10 April part-month file, which the
  full-month file supersedes) and `mcp/lib/finance/mail-invoices.js`,
  plus `mcp/lib/finance/book-from-workbook.js`'s `book.toml` for 1 March to 31 August 2026,
  validated with `validateBook` and `validateLines` from the diya-gl package, written under
  `../staging/2026-2027/book/` (private); March 2026 matched line for line against the completed
  2025-26 workbook (the control), every month's bank closing balance equal to the statement's,
  gross income and fees separate, no hold posted, each check a line in
  `../staging/2026-2027/book/VERIFICATION.md`. F2a's `mcp/lib/finance/stripe-lines.js` is on `main`.
  The operator copies the book and `VERIFICATION.md` into Drive (operator, 2026-09-23). Blocked
  on F2g1.
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
  that repository's own PR. Blocked on OPU7n, the operator's go for the launch (the ICO fee register
  records no processing purposes, so ZB070902 needs no change). **Source**: `PLAN_PRICE_UPDATE.md` §(d); operator 2026-09-22. **Owner**: Claude
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

