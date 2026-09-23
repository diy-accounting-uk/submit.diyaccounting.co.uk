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

**Prod runs deployment prod-d458f02** (PR #343's merge deploy; #344 and #345 changed no deployed code).
**ci**: `ci-set1` is last-known-good and the only ci set standing; `ci-set2` was swept.
No pull request is open in this repository or its siblings.

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

**COOL-DOWN is on since 2026-09-23T19:29:15Z.** No new board rows except a degradation. Agents commit
and stop. One branch is driven green at a time. Lifted only by the operator in their own words.

## Machine-only

- [ ] **B30bh. Record a source location in memory when the operator names it.** Five operator
  messages on 2026-09-23 corrected where a source lives (the Drive finance path, `authuser=1`, the
  spreadsheets MCP meaning the published diya-gl package, Polycode as a creditor, the mail mirror
  path); the first two are memories (`finance-sources-in-drive-mirror.md`,
  `google-console-steps-need-a-web-check.md`), the other three are in
  `.claude/skills/company-book/SKILL.md` (lines 26, 55, 94). Add one feedback memory in
  `~/.claude/projects/-Users-antony-projects-diy-accounting-limited-submit-diyaccounting-co-uk/memory/`:
  when the operator names a path, account, URL parameter or meaning, write or update the memory
  (or the skill that owns the fact) in the same turn, before acting on it, and index it in
  `MEMORY.md`. Changes nothing committed. **Source**: session report Mc+ncD.
  **Owner**: Claude Code. **Model**: Haiku. **Size**: 0 files.

- [ ] **B30be. Refine pass 2 names the call site and the forbidden patterns.** The coordinator
  corrected 6 agent results on 2026-09-23 (knip deleting a used file, a Stripe API pin on every
  client, a `GITHUB_ENV` name clash, a compatibility alias, a stack-update heuristic, a
  `.dockerignore` excluding `infra/`). In `.claude/skills/refine/SKILL.md` pass 2 (`## Pass 2 —
  feasibility`, line 52), require every
  brief to name the exact call site (file:line) the change lands on, and to list the patterns the
  rules forbid that the change could reach: aliases, a setting applied wider than the call that
  needs it, whole-tree formatting or deletion tools, broad ignore rules. **Source**: session
  report Mc+ncD. **Owner**: Claude Code. **Model**: Haiku. **Size**: 1 file.

- [ ] **OF1a. PayPal client id read from a variable.** The operator created the live app
  `diya-finance` and put `PAYPAL_CLIENT_SECRET` on the `prod` environment as a secret and
  `PAYPAL_CLIENT_ID` as a variable (2026-09-23). `.github/workflows/deploy-environment.yml`'s step
  "Create secret in AWS from secrets.PAYPAL_CLIENT_ID" (line 339) reads `secrets.PAYPAL_CLIENT_ID`,
  so it would skip. Change it to `vars.PAYPAL_CLIENT_ID` (and its step name), keep the secret step.
  The merge's push to `main` runs `deploy-environment.yml` itself (the workflow's own path is in
  its `push.paths`); confirm that run's environment is prod, and only if it is not, dispatch
  `gh workflow run deploy-environment.yml --ref main -f environment-name=prod`. Then confirm
  `prod/submit/paypal/client_id` and `client_secret` exist (`aws --profile submit-prod
  secretsmanager describe-secret --secret-id <id>`; both were absent on 2026-09-23). Then F1b runs.
  **Owner**: Claude Code. **Model**: Haiku. **Size**: 1 file.

- [ ] **B30bf. A parser brief carries one real month and its expected residual.** The PayPal
  statement parser took 4 rounds (0.67M tokens) because the activity-summary parse was overwritten
  by a later bare heading and no fixture caught it. In `.claude/skills/refine/SKILL.md` pass 2 and
  `.claude/skills/company-book/SKILL.md`'s `## Build` (line 32), require a parser brief to name one real
  source month (its path under `../drive/…/finance/`) and the expected reconciliation residual
  (0) as the first test. Shares `refine/SKILL.md` with B30be: one agent. **Source**: session
  report Mc+ncD. **Owner**: Claude Code. **Model**: Haiku. **Size**: 2 files.

- [ ] **B30bb. A Markdown-only push leaves a PR blocked.** `main`'s ruleset (16057564) requires
  `Check commit signatures`, `npm test`, `maven test`, `eslint` and `CodeQL` on the PR head, but
  `.github/workflows/codeql.yml` ignores `**.md` on push and pull_request (lines 19 and 23) and has
  no `workflow_dispatch`, and `test.yml` skips a Markdown-only push too (line 57; it already has
  `workflow_dispatch`, line 8); PR #344's head `5175ec17` (a skill file) sat `BLOCKED` until the
  branch was moved back. `Check commit signatures` comes from `verify-commit-signatures.yml` on
  `pull_request`, so it runs. Add `workflow_dispatch` to `codeql.yml` (the analyze job's `if:` at
  line 42 already admits it), and in `.claude/skills/auto-merge/SKILL.md` a step after the
  `gh pr list` read (line 47): when the PR head changes only `.md` files and a required check is
  missing, dispatch `test.yml` and `codeql.yml` on the head (`gh workflow run <file> --ref
  <headRef>`) and wait for them. Proof: a Markdown-only commit on a
  PR reaches `CLEAN` after the dispatches. Saves about 20 minutes and a force-push per Markdown-only
  head (session report Mc+ncD). Same agent as B30bc. **Owner**: Claude Code. **Model**:
  Sonnet. **Size**: 2 files.

- [ ] **B30bd. Worker agents start no agents.** The capabilities-report agent forked itself
  recursively on 2026-09-23: 0.78M tokens reported, more unreported, and duplicate writers whose
  errors had to be relayed and corrected. In `.claude/skills/do-next/SKILL.md` and
  `.claude/skills/iterate/SKILL.md`, make every worker brief say it must not call the `Agent` tool
  or fork, and that only the coordinator fans out; a brief whose work needs splitting is split by
  the coordinator before dispatch. **Source**: session report Mc+ncD. **Owner**: Claude Code.
  **Model**: Haiku. **Size**: 2 files.

- [ ] **B30bg. Sibling-repository worktrees push in one attempt.** The spreadsheets push on
  2026-09-23 took 3 attempts, one of them a 41-minute run: the worktree had an empty
  `node_modules`, and `../spreadsheets.diyaccounting.co.uk/.githooks/pre-push` wrote about 100
  generated files (and changed `provenance-data.js`) that then sat uncommitted. In
  `.claude/skills/do-next/SKILL.md`, make a sibling-repository brief symlink the main checkout's
  `node_modules` into its worktree; in the spreadsheets repository, make the pre-push hook fail
  with the list of files it wrote when `git status --porcelain` is not clean after
  `node scripts/test-scope.mjs --base "$base"` runs (both calls, lines 127 and 132, today end the
  hook with that command's exit status) (a branch and PR there). Shares `do-next/SKILL.md` with B30bd: one agent. **Source**: session report
  Mc+ncD. **Owner**: Claude Code. **Model**: Sonnet. **Size**: 2 files (one per repository).

- [ ] **B52h2. Forecast Search at a match type and a bid ceiling.** `infra/google/ads/ads-forecast.js`
  sends every keyword as `BROAD` with no maximum cost per click (line 155), so the forecast of
  2026-09-23 read £38 a click for £50 a day. Add `--match-type <EXACT|PHRASE|BROAD>` and
  `--cpc-ceiling-gbp <n>` (the API's field is `maxCpcBidCeilingMicros` inside
  `maximizeClicksBiddingStrategy`, line 154), with cases in `app/unit-tests/scripts/adsForecast.test.js`,
  and in `.claude/skills/ads-advisor/SKILL.md` say to quote the match type and ceiling with any
  forecast. **Owner**: Claude Code. **Model**: Haiku. **Size**: 3 files.

- [ ] **ITSA8. The diversion note for income the build does not cover.** Row 8 of
  `_developers/hmrc/ITSA_PRODUCTION_APPROVALS_CHECKLIST.md` is "Not evidenced": a customer with
  foreign property or other income is not told where to finish their return. Worse,
  `applyPickedBusinessToLinks` in `web/public/hmrc/itsa/dashboard.html` (line 295) routes every
  type that is not `self-employment` to the `ukProperty*` pages, so a picked `foreign-property`
  business is sent to UK property forms. Make a `foreign-property` pick show the diversion note and
  no step 3 to 8 links, add the note beside the picker (line 331), cover both in
  `web/browser-tests/itsaDashboard.browser.test.js` (its `page.route` pattern, line 45), and mark
  row 8 (checklist line 41) evidenced with the file and line. `obligations.html` (line 74) and
  `lossesAndClaims.html` (line 76) offer `foreign-property` as a type; leave them, HMRC's
  obligations and losses cover it. **Owner**:
  Claude Code. **Model**: Sonnet. **Size**: ~3 files.

- [ ] **B30bc. A PII scan on every push, docs included.** GitHub secret scanning with push
  protection and non-provider patterns is on for this repository, so provider tokens and private
  keys are blocked at push already; nothing scans what a push adds for personal data. Add
  `.github/workflows/content-scan.yml` on push (every branch, no path filter) and pull_request: scan
  the lines the push or PR adds with the patterns `scripts/redact-triage-output.mjs` already
  exports (`DENY_PATTERNS`, line 19: email, NINO, UTR, VRN, EORI, AWS keys, JWTs, bearer tokens,
  IP addresses), with an allow-list for addresses and ids the repository publishes on purpose. Fail on a hit and print
  the file, line and label, never the matched value. Extend `redact-triage-output.mjs` or a
  sibling script with tests, as the capabilities rule asks. Adding `content scan` to the ruleset's
  required checks is OB30bc. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~4 files.

- [ ] **ITSA13. WCAG 2.1 AA evidence for the 19 ITSA pages.** Row 13 of the checklist is "Not
  evidenced": no scan names any of the 19 pages under `web/public/hmrc/itsa/`. Three lists carry
  the scanned pages: `scripts/axe-quickscan.mjs`'s `PAGES` (line 12; run as `node
  scripts/axe-quickscan.mjs <baseUrl> wcag2a,wcag2aa,wcag21a,wcag21aa`), `package.json`'s
  `accessibility:axe-*` URL lists (lines 328 to 330), and `.pa11yci.{proxy,ci,prod}.json`, which
  `.github/workflows/compliance.yml`'s pa11y job runs (line 151). Add the 19 pages to all of them.
  Signed out, a page scans only its empty state; scan the populated state too with a browser test
  that serves the page as `web/browser-tests/itsaDashboard.browser.test.js` does (`page.route`,
  line 45) and injects `node_modules/axe-core/axe.min.js` (installed). Fix what either finds and
  record the result in the checklist (row 13, line 46) and `REPORT_ACCESSIBILITY_PENETRATION.md`.
  **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~8 files.

## Machine-ask

## Human-driven

- [ ] **OF2d. Copy DIYA's book into Drive.** The book for 1 March to 31 August 2026 is in
  `../staging/2026-2027/book/` (`book.toml`, `lines.jsonl` with 488 lines, `VERIFICATION.md`, and `book-diya-gl.zip` for the spreadsheets MCP):
  bank balances match every statement, Stripe and PayPal reconcile with no residual, validation
  passes, and the review items (the £200 Polycode creditor payment, Hiscox, Linktree) are
  resolved in `VERIFICATION.md`. Copy the three files into Drive under
  `finance/2026-2027 accounts/`. That copy is OF2's input. **Owner**: Operator. **Model**: none.
  **Size**: 0 files.

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

- [ ] **B30at1. The sweep's claim check, proven.** Needs a claimed set that is not last-known-good
  (the sweep keeps the last-known-good set before it reads any claim): the next time two branches
  deploy at once, `gh workflow run destroy-ci.yml -f sweep-for-stacks=true` while the second holds
  `ci-set2`, and its log shows "stays: claimed by run". Blocked on two branches deploying at once. **Owner**: Claude Code. **Model**: Haiku.
  **Size**: 0 files.

- [ ] **F1b. PayPal's six months staged.** Run `scripts/finance/paypal-stage.js` (the credential
  read from Secrets Manager `prod/submit/paypal/client_id` and `prod/submit/paypal/client_secret`
  with `AWS_PROFILE=submit-prod`) for each month from March to August 2026, writing
  `../staging/<year-end>/paypal/<yyyy-mm-dd>-paypal-transactions.json`. F2g reads the output.
  Blocked on OF1a. **Source**: `../PLAN_FINANCE_AUTOMATION.md` route 1. **Owner**: Claude Code.
  **Model**: Haiku. **Size**: 0 files.

- [ ] **F2g. PayPal transactions into diya-gl lines.** `mcp/lib/finance/paypal-lines.js` over
  F1b's staged files, on `mcp/lib/finance/stripe-lines.js`'s pattern. The statement route,
  `mcp/lib/finance/paypal-statement-lines.js`, already applies the rules this route needs
  (settled only; holds and their releases unposted, `isHoldCandidate` line 288 and
  `isReleaseCandidate` line 301; a receipt gross to `sales` with its fee to `purchases`; bank
  transfers and currency conversions unposted, `isCurrencyConversionOrTransfer` line 274): reuse
  those functions where the API's record shape allows. A bill payment is `purchases` matched to
  the mailbox invoice (`mcp/lib/finance/mail-invoices.js`). Validated with `validateLines`; a unit
  test over a recorded page; the proof is that the API route's `sales` and `purchases` lines for
  March to August 2026 equal the PayPal lines the statement route wrote into
  `../staging/2026-2027/book/lines.jsonl`.
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

- [ ] **F2e. The MCP writes a populated spreadsheets package.** A tool in `mcp/lib/finance/` that
  takes the book and lines and writes a DIY Accounting spreadsheets package, reconciled under the
  spreadsheets repository's existing reconciliation harness rather than a new check; nothing
  automated writes to Google Drive. Blocked on OF2d. **Source**: `../PLAN_FINANCE_AUTOMATION.md`
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
  Blocked on OF2d. **Source**: `../PLAN_FINANCE_AUTOMATION.md` phase 2. **Owner**: Claude
  Code; the operator signs in. **Model**: Haiku. **Size**: 0 files.

## Discipline

- **Push once per batch of landed tracks, never per track**, and prefer one dispatch that
  proves several things over several dispatches. A push per track turned one batch into six
  ci deploys and several environment deploys in a morning on 2026-09-06, each able to open
  alarm issues and cancel each other through the deploy concurrency group, and the operator
  froze pushes twice. A freeze, when the operator calls one, stops `git push`,
  `gh workflow run` and `gh pr create` until they lift it in their own words; local commits,
  worktree tracks and reading logs continue, and a failed job gets a proposed fix in the reply.

