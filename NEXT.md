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

**Prod runs deployment prod-a8703b3** (PR #364's merge deploy, run 36198078131, 2026-09-25; the confirmation statement activity is listed on ci only).
**ci**: `ci-set2` is last-known-good (built 2026-09-25 20:17 UTC by PR #363's deploy) and the only ci set standing.
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

Shared facts for the analytics rows (SR-11, B52l, B52m): the prod Athena database is
`prod_env_analytics` and the workgroup `prod-env-analytics` (eu-west-2, `AWS_PROFILE=submit-prod`);
`OperatorSnapshotPublish.java` passes them to the Lambda as `GLUE_DATABASE_NAME` and
`ATHENA_WORK_GROUP_NAME` (lines 102 to 103).

## In flight

## Machine-only

- [ ] **B30q. Text the operator when prod loses service.** `submit-prod` can send SMS since 2026-09-26: sender ID `DIYACCT` (GB, transactional), the operator's number verified in the End User Messaging sandbox and stored in the SecureString `/submit/prod/operator-sms-number`, and the skill `text-antony-submit-prod` sends one by hand through `pinpoint-sms-voice-v2 send-text-message` (SNS `publish --phone-number` accepted two texts that never arrived; an SNS SMS subscription may fail the same way, so the alarm path needs its delivery proven on a phone, or a small Lambda on the alarm topic that calls `send-text-message`). Remaining: an SMS subscription, reading the number from that parameter, on the SNS topic the prod probe and API-availability alarms publish to (find the topic in `OpsStack.java` and the alarm routing `SubmitApplicationCdkResourceTest` asserts), limited to the alarms that mean customers cannot use the service so the $1-a-month `MonthlySpendLimit` holds; a CDK test for the subscription; proof by one alarm set to ALARM with `aws cloudwatch set-alarm-state` on a ci set. **Source**: operator, 2026-09-26. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~3 files.

- [ ] **B30o. Prove the operator snapshot publish finishes (alarm #361, closed by PR #362).** PR #362 merged as `397962b0`; `prod-env-operator-snapshot-publish` carries a 900 s timeout and image `env-analytics-397962b0…` since 2026-09-25 21:03 UTC. Remaining: the next run (the 03:15 UTC schedule on 2026-09-26, or an operator invoke) reports a duration under 900 s with `Status` absent, and the operator dashboard's Activities tab shows the table; read with `aws --profile submit-prod logs filter-log-events --log-group-name /aws/lambda/prod-env-operator-snapshot-publish --filter-pattern REPORT`. A timeout again reopens #361. **Source**: alarm #361; BACKLOG 30. **Owner**: Claude Code. **Model**: Haiku. **Size**: 0 files.

## Machine-ask

- [ ] **CS-H1. The new presenter on the live gateway, from 2026-09-26.** Companies House opened the credit account on 2026-09-25 (£500 limit) under a new presenter ID instead of E0000052288; the identifiers are in `../NEXT_OPERATOR_RUNBOOK.md` task A, which the repository does not carry. The operator's choice: file confirmation statements (and accounts) as the new presenter, so the fee lands on that account. `GetSubmissionStatus` for 06846849 as the new presenter on 2026-09-25 16:40 UTC answered 502 "Authorisation Failure" on the test service (`GatewayTest` 1; expected, test filings use test presenter 66666727000) and on the live service (`GatewayTest` 0); the code letter's subject is "Credit account code letter 2 valid from tomorrow". Exchanges, raw and masked, are in `../staging/xmlgw-new-presenter/`. **On 2026-09-26 the session asks the operator before it runs**: `node scripts/companies-house-xmlgw-poll.js --out-dir ../staging/xmlgw-new-presenter` with `COMPANIES_HOUSE_XMLGW_POLL_COMPANY_NUMBER=06846849`, the new presenter's id and code (runbook task A) in `COMPANIES_HOUSE_PRESENTER_ID` and `COMPANIES_HOUSE_PRESENTER_CODE`, and `COMPANIES_HOUSE_GATEWAY_TEST` unset. A status or an empty status list: the new presenter is the live presenter, and O34c and CS-11 name it. 502 again: add the question to CS-H2's email (is the new presenter enabled for software filing, and can it replace E0000052288), or send `../DRAFT_EMAIL_CH_CREDIT_ACCOUNT_LINK.md`. **Source**: `PLAN_COMPANIES_HOUSE_CONFIRMATION_STATEMENT.md` (Tasks table). **Owner**: Claude Code with the operator. **Model**: Haiku. **Size**: 0 files.

## Human-driven

- [ ] **O11. The ITSA send day.** The proof is on `main` (PR #352, 2026-09-25): the eight ITSA suites pass on the simulator and run in CI, and the sandbox year ran clean on 2023-24, 2025-26 and 2026-27 on 2026-09-25 with a real `Gov-Client-Multi-Factor` header (`VALID_HEADERS`, no warnings), inside HMRC's 14 days until 2026-10-09. Send `_developers/hmrc/DRAFT_EMAIL_ITSA_RECOGNITION.md` to `SDSTeam@hmrc.gov.uk` from the operator's address (prod-23d9a7e carries PR #352), then `_developers/hmrc/DRAFT_EMAIL_ITSA_PRODUCTION_CREDENTIALS.md` when SDST answers. **Source**: BACKLOG 11; `PLAN_ITSA_PHASE_2.md` T10. **Owner**: Operator. **Model**: none. **Size**: 0 files.

- [ ] **CS-H2. Send the confirmation-statement email.** Send `../DRAFT_EMAIL_XMLGW_CS01.md` on the `xml@companieshouse.gov.uk` thread, and paste the answers into CS-9's row. **Source**: `PLAN_COMPANIES_HOUSE_CONFIRMATION_STATEMENT.md` (its Tasks table carries the files). **Owner**: Operator. **Model**: none. **Size**: 0 files.

## Blocked

- [ ] **B34.6c. Companies House accounts filing: the sandbox proof.** The XML team was asked on 2026-09-23 22:22 UTC in a new thread (from antony@, subject "Submission 000004 status and
  GetSubmissionStatus query") whether 000004 was accepted and whether lookups are enabled for test
  presenter 66666727000. When the answer says they are: poll 000004 through `GET /api/v1/companies-house/accounts/000004` on a
  standing ci set and pin the returned `StatusCode` and any rejections as a case in
  `app/unit-tests/functions/companiesHouseAccountsGet.test.js`. The prod catalogue listing is
  BACKLOG 34c's: prod carries no `COMPANIES_HOUSE_XMLGW_URI` and no presenter secret ARNs. Blocked
  on IT at Companies House: the XML team answered on 2026-09-25 13:59 that the test presenter's account "was not set up successfully, causing the error", and will reply when IT answers. They asked for the request and response on 2026-09-24; the reply went the same day with transactions 1790285530232 (9999) and 1790285532345 (502), masked (`../DRAFT_EMAIL_XMLGW_000004_REPLY.md`; the unmasked set, from the 21:42 run, is `../DRAFT_EMAIL_XMLGW_000004_REPLY_UNMASKED.md`). In the 9999 response the gateway echoes `Method` CHMD5 with an empty `Value`. **Source**: BACKLOG 34b. **Owner**: Claude Code. **Model**: Sonnet. **Size**:
  ~1 file.

- [ ] **B52l. The optimiser over the raw export.** A notebook over `../analytics/prod/` (pulled by
  `scripts/analytics-pull.sh`, one CSV per view in `app/functions/analytics/rawExportPublish.js`'s
  `VIEW_NAMES` (line 20)): per-block correlations, the block models fitted (linear cost from
  `v_cost_daily`, log-linear funnels from `v_login_to_submission_funnel` and `v_ga4_funnel_daily`,
  Hill curves for spend), levers ranked by effect per unit cost, and the next experiment proposed
  with its predicted effect and interval as a row ready for `experiments.toml`; Bayesian
  optimisation for the continuous knobs and a Thompson-sampling bandit for allocations once
  experiments exist. The model design as a section under `PLAN_ONE_STOP_DASHBOARD.md` D16 first,
  then the notebook, then one line per objective on `web/public/operator/dashboard.html`. Blocked
  until three months of nightly export exist under `exports/prod/`: first written 2026-09-10, so
  the gate is 2026-12-10, checked with `aws --profile submit-prod s3 ls
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

- [ ] **B34c. Companies House accounts filing launched on prod.** BACKLOG 34c steps 4 to 6: `CompaniesHouseStack.java` sets the prod values (`COMPANIES_HOUSE_GATEWAY_TEST=false`, the live package reference) instead of leaving them unset; one filing on the prod lane for a company the operator controls, polled to a terminal state; `prod` added to `file-micro-entity-accounts`' `environments` and `resident`'s listing in `web/public/submit.catalogue.toml`, with the activity page and the accounts video no longer calling it a sandbox preview. Blocked on B34.6c and O34c. **Source**: BACKLOG 34c. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~5 files.

- [ ] **F-BS1. The 2026-27 company book's negative balance-sheet lines.** Cowork's check of `../staging/2026-2027/book/` (diya-gl 1.2.34, 2026-09-24): every check passes, but the published balance sheet shows trade debtors −£425.36 and trade creditors −£681.52, and net assets £1,337.3033 against shareholders' funds £1,337.3233 (2p). Causes it named: `BANK-2026-04-13-15-SUSPENSE` £527.41 (bank code DR; the 13 April "POLYCODE LIMITED, DL REPAYMENT" of the same amount is the likely pair); six "PAYPAL PAYMENT 5JX22222WZGH6" top-ups (£184.64) coded CR with no purchases line, which are transfers into the PayPal wallet; ICO ZB070902 £47.00 on 22 May with no purchases line although the label map (`../staging/labels/diya-labels.toml`) has an ICO rule; "Matthew Grundy, DIY ACCOUNTING" £70.00 on 22 April. Resolve against the operator's own reference set of accounts, line by line, then rebuild and verify with the `company-book` skill. Blocked on the operator's reference set of accounts. **Owner**: Claude Code. **Model**: Sonnet. **Size**: 0 files (the book and the label map are under `../staging/`, a label-rule or parser fix is ~2 files).

- [ ] **CS-11. Confirmation statement prod launch.** `prod` on the activity, prod gateway values, `COMPANIES_HOUSE_CS_FEE_MODE=operator` wired through `CompaniesHouseStack.java` for the operator's own company (the Lambda reads it but no CDK prop sets it, so operator mode is unreachable when deployed), `compliance.toml` rows for the credit account and the authorisation. Shares BACKLOG 34c steps 3 and 4 with the accounts launch. Blocked on CS-9, CS-H4 and CS-H6. **Source**: `PLAN_COMPANIES_HOUSE_CONFIRMATION_STATEMENT.md` (its Tasks table carries the files). **Owner**: Claude Code. **Model**: Haiku. **Size**: 5 files.

- [ ] **CS-13. PSC verification statement (VS01).** A builder over `PSCVerificationStatement-v1-0.xsd`, a submit and poll Lambda pair, a result-view section for each director who is also a PSC, filed after the statement inside the window starting the day after the review date (the report's V4). Blocked on CS-9. **Source**: `PLAN_COMPANIES_HOUSE_CONFIRMATION_STATEMENT.md` (its Tasks table carries the files). **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~8 files.

- [ ] **CS-9. Confirmation statement sandbox proof.** On the endpoint CS-H2's answer names: a CompanyDataRequest, a no-change statement, a SIC change, one with `Shareholdings`, one with a blank director code, each polled to a terminal state and pinned in the simulator; settles Q2 and Q3. Blocked on CS-H1 and CS-H2 (CS-5's Lambdas and CS-7's suite are on `main`); machine-ask when it runs (live credentials). **Source**: `PLAN_COMPANIES_HOUSE_CONFIRMATION_STATEMENT.md` (its Tasks table carries the files). **Owner**: Claude Code. **Model**: Sonnet. **Size**: 3 files.

- [ ] **O34c. Companies House clears the presenter for live accounts filing.** BACKLOG 34c steps 2 and 3, after B34.6c's sandbox proof: ask the XML team (`xml@companieshouse.gov.uk`) to clear presenter E0000052288 for the live service and issue the live package reference (the test one is 0012); then set the live presenter id, presenter code and `COMPANIES_HOUSE_PACKAGE_REFERENCE` on GitHub's `prod` environment (Settings, Environments, prod), which `deploy-environment.yml` carries into Secrets Manager. Blocked on B34.6c. **Source**: BACKLOG 34c. **Owner**: Operator. **Model**: none. **Size**: 0 files.

- [ ] **CS-H4. Software authorisation for the confirmation statement.** The XML team tests CS-9's submissions and issues the package reference for the form. Blocked on CS-9. **Source**: `PLAN_COMPANIES_HOUSE_CONFIRMATION_STATEMENT.md` (its Tasks table carries the files). **Owner**: Operator. **Model**: none. **Size**: 0 files.

- [ ] **CS-H6. Go for the prod confirmation statement.** Give the go for a second, fee-free statement for 06846849 through Submit in the 2026-27 payment period (the statement for the 2026-09-21 review date went by WebFiling on 2026-09-24, submission 119-158484, accepted), knowing it moves the next review date. Blocked on CS-11 and CS-H4 (the directors' codes are ready). **Source**: `PLAN_COMPANIES_HOUSE_CONFIRMATION_STATEMENT.md` (its Tasks table carries the files). **Owner**: Operator. **Model**: none. **Size**: 0 files.

## Discipline

- **Push once per batch of landed tracks, never per track**, and prefer one dispatch that
  proves several things over several dispatches. A push per track turned one batch into six
  ci deploys and several environment deploys in a morning on 2026-09-06, each able to open
  alarm issues and cancel each other through the deploy concurrency group, and the operator
  froze pushes twice. A freeze, when the operator calls one, stops `git push`,
  `gh workflow run` and `gh pr create` until they lift it in their own words; local commits,
  worktree tracks and reading logs continue, and a failed job gets a proposed fix in the reply.

