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

**Prod runs deployment prod-b0a9715** (PR #369's merge deploy, run 36257819517, 2026-09-26; the confirmation statement activity is listed on ci only). `prod-cceeba8` stands as a spare until the operator destroys it.
**ci**: `ci-set1` is last-known-good (updated 2026-09-26 11:05 UTC by `claude/kraken-ops`' deploy, run 36237395655) and the only ci set standing; no slot is claimed (a free slot has no `/submit/ci/slots/<set>` parameter).
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

## In flight

- [ ] **DB3. Actor on bundle and pass records.** On `claude/mirage-analytics`, commit 4dfc8b50 (not yet pushed). DB1 found `dynamo_bundles` and `dynamo_passes` carry no actor, so 104 new accounts with no matching activity event count as customer, and most redeemed passes (`day-guest`, `resident-vat`, `invited-guest` types) mix real and test use. Write an actor (or test flag) on the item where it is created (`app/services/passService.js`, `app/data/dynamoDbBundleRepository.js`, from `resolveActorClass` in `app/lib/activityAlert.js`), project it through `app/functions/analytics/dynamoStreamToFirehose.js`, add the Glue column in `TableChangeDelivery.java`, and exclude on it in the new-accounts and passes views (`infra/main/resources/analytics/views/`). **Source**: DB1, 2026-09-26. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~7 files.

- [ ] **DB4. The dashboard's human, bot and synthetic session rows are blank.** On `claude/mirage-analytics`, commits 1eead3fa and 9f3b8812 (not yet pushed): the downloads aggregates filtered `file_download` while the site fires `runner_download`; and all four BigQuery daily tables reached the lake empty because the scheduled queries ran at 04:30 UTC and wrote D-2 after the 02:15 UTC pull had asked for it, so they now run at 01:00 UTC with `scheduleOptions.timeZone` pinned. Remainder after merge: `google-apply.yml` applies the schedules; confirm rows per day in the four tables through GCP1's `scripts/gcp-as-sso.sh`. `sessions_by_host_source_daily` (the source of `v_visitors_by_kind_daily`) has never held a row. Find why `app/functions/analytics/ga4DailyPull.js` writes nothing there (its BigQuery query, the lake prefix it writes, the Glue table's location and projection, the schedule and its logs in submit-prod) and fix the layer found, with a test. **Source**: DB1, 2026-09-26. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~3 files.

- [ ] **GCP1. Google access from a session through AWS SSO, with no key file.** On `claude/mirage-analytics`, commit bd6db30b (not yet pushed): the submit-prod provider accepts `AWSReservedSSO_AdministratorAccess`; the existing `infra/google/gcp/credentials/aws-prod.json` serves a local session because google-auth-library 10.5.0 reads AWS credentials from the environment first; `scripts/gcp-as-sso.sh` passes them to one child process. Remainder after merge: `google-apply.yml` applies the condition; one read-only BigQuery query through the script proves it. Writing the GA4 service-account key (`prod/submit/ga4/service_account`) to disk is blocked by auto mode as credential materialization, and three blocks in a row stop an agent on an operator prompt (2026-09-26, DB4). In `infra/google/gcp/identity.toml`, extend the submit-prod provider's `attribute_condition` (line 70) with `|| attribute.aws_role.contains("AWSReservedSSO_AdministratorAccess")` (the operator's role is `AWSReservedSSO_AdministratorAccess_88cf4f996ac93525`), and commit beside it an external-account credential config (no secret) that exchanges the caller's AWS credentials for a short-lived Google token through that provider and impersonates `ga4-report-pull@diyaccounting-ga4.iam.gserviceaccount.com`, used as `AWS_PROFILE=submit-prod GOOGLE_APPLICATION_CREDENTIALS=<file>`. Put it in `infra/google/gcp/credentials/` beside the existing configs and follow their shape. `google-apply.yml` applies the provider change on merge; prove it after merge with one read-only BigQuery query from the session. **Source**: operator, 2026-09-26. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~3 files.

- [ ] **CS-A3. The harness's first live run, pinned.** On `claude/mirage-analytics`, commit 6f50c61d (not yet pushed): the first run on `main` (run 36257856248, 2026-09-26 17:06 UTC, submissions 000005 to 00000B) failed every case: error 100 on the fixture's 11-character company authentication codes (limit 8), and error 505 "Invalid schema URI supplied" on every confirmation statement envelope, a product defect in the builder's schema URI (the test service lists `ConfirmationAndVerificationStatement-v1-0.xsd`). The 505 was the shared `FormSubmission` wrapper missing `xsi:schemaLocation` (`FormSubmission-v2-11.xsd`), affecting confirmation statement, VS01 and accounts envelopes; fixed. Fixture codes are 6 to 8 character placeholders (no real test-company code is recorded). Error numbers map to plain words on the page; simulator scenarios for 100, 505 and 9999. Remainder after merge: dispatch `companies-house-test-service.yml` on `main` and pin the outcomes it observes. After CS-A2 merges: `gh workflow run companies-house-test-service.yml --ref main`, wait for it (a sleep loop in one Bash call), download its artefacts, and pin every observed response as a case in `app/http-simulator/routes/companies-house-xmlgw.js`; map each observed reject code and `GovTalkErrors` number (9999 "No presenter ID supplied" among them while B34.6c's blocker stands) to plain words on `web/public/companies-house/fileConfirmationStatement.html`, with a unit test for the map. Settles Q2 and Q3 in `PLAN_COMPANIES_HOUSE.md`. **Source**: `PLAN_COMPANIES_HOUSE.md`. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~3 files.

- [ ] **CS-13b. PSC verification statement (VS01): the test-service proof.** On `claude/mirage-analytics`, commit 408b486d (not yet pushed): two cases for test company 04549236 (Alan James Morgan, director and PSC), one with a blank personal code; the runner gained the VS01 path. Add the PSC verification statement's cases to CS-A2's harness fixture (one director-PSC per test company that has one, plus a blank-code case); the weekly `companies-house-test-service.yml` run then carries them with the rest. **Source**: `PLAN_COMPANIES_HOUSE.md`. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~2 files.

- [ ] **O11v. A video of the whole ITSA year.** On `claude/nebula-o11v` (agent writing and proving the scene script locally). The two ITSA scene scripts (`videos/itsa-business-details.json`, `videos/itsa-quarterly-update.json`) stop at the quarterly update form; the last good recording is run 34904726583 (ci, 2026-09-14), and both prod recordings on 2026-09-20 failed. Write `videos/itsa-year.json` for the full journey on `web/public/hmrc/itsa/dashboard.html`: quarterly updates for both businesses, annual submission, adjustments, losses, the calculation with its disclaimer, the final declaration; iterate locally against the simulator per `.claude/skills/site-video-capture/SKILL.md`, add it to `video-capture.yml`'s `script` options, then record it against ci after merge. For the operator's review, uploaded unlisted by the operator (`video-publish` skill), never published. **Source**: operator, 2026-09-26. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~2 files.

## Machine-only

- [ ] **SEC1. Scan alerts: one message per burst, and CloudFront history across releases.** `wafScanDetect.js` sends one message per source IP per invocation (prod since PR #369). Two remainders: (1) group a burst across invocations (a DynamoDB item keyed by client IP with a short TTL, and a flush rule), because a burst split over several log deliveries still sends one message each; (2) the lake's `cloudfront_requests` holds data only from 2026-09-26 11:49 UTC because `CloudFrontAccessLogs.java` recreates log delivery per deployment, so a 30-day path history cannot be answered: keep delivery to a stable prefix across releases. **Source**: operator, 2026-09-26. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~4 files.

## Machine-ask

## Human-driven

- [ ] **O11. The ITSA send day.** The proof is on `main` (PR #352, 2026-09-25): the eight ITSA suites pass on the simulator and run in CI, and the sandbox year ran clean on 2023-24, 2025-26 and 2026-27 on 2026-09-25 with a real `Gov-Client-Multi-Factor` header (`VALID_HEADERS`, no warnings), inside HMRC's 14 days until 2026-10-09. Evidence for every claim in the email, with how to check each, is in `../itsa-recognition-evidence/README.md`. Send `_developers/hmrc/DRAFT_EMAIL_ITSA_RECOGNITION.md` to `SDSTeam@hmrc.gov.uk` from the operator's address (prod-23d9a7e carries PR #352), then `_developers/hmrc/DRAFT_EMAIL_ITSA_PRODUCTION_CREDENTIALS.md` when SDST answers. **Source**: BACKLOG 11; `PLAN_ITSA_PHASE_2.md` T10. **Owner**: Operator. **Model**: none. **Size**: 0 files.

## Blocked

- [ ] **CS-A4. Software authorisation: send the evidence.** Claude Code assembles the pack from a `companies-house-test-service.yml` run inside the last 14 days, against `PLAN_COMPANIES_HOUSE.md`'s criteria table: product and forms, one line per case with its submission number and outcome, the run link, the page's axe result (`scripts/axe-quickscan.mjs`), a declaration screenshot, contact. It drafts the email at the workspace root. The operator sends it to `xml@companieshouse.gov.uk` from their own address and asks for the live package reference for the confirmation statement (or confirmation that the accounts reference from O34c covers it), then sets it on GitHub's `prod` environment. Every case needs a terminal `ACCEPT` or `REJECT`, which `GetSubmissionStatus` cannot return while it answers 9999 (B34.6c's blocker). Blocked on CS-A3 and on Companies House IT repairing the test presenter. **Source**: `PLAN_COMPANIES_HOUSE.md`. **Owner**: Claude Code (the pack), Operator (the send). **Model**: Sonnet. **Size**: 0 files.

- [ ] **CS-11b. Confirmation statement's customer prod launch.** DIY Accounting Limited already files its own statements through Submit under its credit-account presenter; CS-11b takes the same activity to customers on prod. `file-confirmation-statement` already lists `bundles = ["resident", "resident-pro"]`, so no operator-only gate is needed — add `prod` to its `environments` (`web/public/submit.catalogue.toml` lines 436 to 444; the VS01 activity too, when CS-13a adds one), and a live Stripe price alongside the existing one for the £61.35 fee. Prove it first: the prod gateway values and the live package reference from CS-A4, then one fee-free operator proof filing (a second statement for 06846849 in the 2026-27 payment period, its fee waived by CS-11a's company list; the operator approved it; it moves the next review date to about a year after the filing day) before the listing goes live. Then `compliance.toml` rows for the credit account and the authorisation. Shares BACKLOG 34c steps 3 and 4 with the accounts launch. Blocked on CS-A4. **Source**: `PLAN_COMPANIES_HOUSE.md`. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~7 files.

- [ ] **CS-P1. Filing under a customer's own presenter.** A customer can give their own Companies House presenter id and authentication code instead of Submit's; Submit presents under their presenter, Companies House charges the £50 confirmation statement fee to the customer's own credit account, and Submit skips its £61.35 fee. Outside ACSP (`PLAN_COMPANIES_HOUSE_ACSP.md`), since Submit is not the one paying or engaging Companies House. Build: the page option on `web/public/companies-house/fileConfirmationStatement.html` (credentials entered per filing, never stored, with the credit-account requirement explained); `PaymentPeriodsRequest` still decides whether a fee is due; the Stripe checkout skipped at the same fee gate CS-11a's company list skips (`app/functions/companies-house/companiesHouseConfirmationStatementPost.js` line 244); the simulator route and its tests. Micro-entity accounts carry no fee, so the option there only changes whose presenter shows on the filing. Blocked on CS-11b, since it adds a second payment path to the journey CS-11b launches. **Source**: `PLAN_COMPANIES_HOUSE.md`. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~5 files.

- [ ] **B34.6c. Companies House accounts filing: the sandbox proof.** The XML team was asked on 2026-09-23 22:22 UTC in a new thread (from antony@, subject "Submission 000004 status and
  GetSubmissionStatus query") whether 000004 was accepted and whether lookups are enabled for test
  presenter 66666727000. When the answer says they are: poll 000004 through `GET /api/v1/companies-house/accounts/000004` on a
  standing ci set and pin the returned `StatusCode` and any rejections as a case in
  `app/unit-tests/functions/companiesHouseAccountsGet.test.js`. The prod catalogue listing is
  BACKLOG 34c's: prod carries no `COMPANIES_HOUSE_XMLGW_URI` and no presenter secret ARNs. Blocked
  on IT at Companies House: the XML team answered on 2026-09-25 13:59 that the test presenter's account "was not set up successfully, causing the error", and will reply when IT answers. They asked for the request and response on 2026-09-24; the reply went the same day with transactions 1790285530232 (9999) and 1790285532345 (502), masked (`../DRAFT_EMAIL_XMLGW_000004_REPLY.md`; the unmasked set, from the 21:42 run, is `../DRAFT_EMAIL_XMLGW_000004_REPLY_UNMASKED.md`). In the 9999 response the gateway echoes `Method` CHMD5 with an empty `Value`. A re-poll on 2026-09-26 13:43 UTC still answered 9999 (`../staging/xmlgw-000004-poll/`); no reply on the thread since 2026-09-25 16:16. **Source**: BACKLOG 34b. **Owner**: Claude Code. **Model**: Sonnet. **Size**:
  ~1 file.

- [ ] **O34c. Companies House clears the presenter for live accounts filing.** BACKLOG 34c steps 2 and 3, after B34.6c's sandbox proof: ask the XML team (`xml@companieshouse.gov.uk`) to clear the new presenter that holds the credit account (its id in `../NEXT_OPERATOR_RUNBOOK.md` task A; it authenticates on the live gateway since 2026-09-26) for the live service and issue the live package reference (the test one is 0012); then set the live presenter id, presenter code and `COMPANIES_HOUSE_PACKAGE_REFERENCE` on GitHub's `prod` environment (Settings, Environments, prod), which `deploy-environment.yml` carries into Secrets Manager. Blocked on B34.6c. **Source**: BACKLOG 34c. **Owner**: Operator. **Model**: none. **Size**: 0 files.

- [ ] **B34c. Companies House accounts filing launched on prod.** BACKLOG 34c steps 4 to 6: `CompaniesHouseStack.java` sets the prod values (`COMPANIES_HOUSE_GATEWAY_TEST=false`, the live package reference) instead of leaving them unset; one filing on the prod lane for a company the operator controls, polled to a terminal state; `prod` added to `file-micro-entity-accounts`' `environments` and `resident`'s listing in `web/public/submit.catalogue.toml`, with the activity page and the accounts video no longer calling it a sandbox preview. Blocked on B34.6c and O34c. **Source**: BACKLOG 34c. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~5 files.

- [ ] **F-BS1. The 2026-27 company book's negative balance-sheet lines.** Cowork's check of `../staging/2026-2027/book/` (diya-gl 1.2.34, 2026-09-24): every check passes, but the published balance sheet shows trade debtors −£425.36 and trade creditors −£681.52, and net assets £1,337.3033 against shareholders' funds £1,337.3233 (2p). Causes it named: `BANK-2026-04-13-15-SUSPENSE` £527.41 (bank code DR; the 13 April "POLYCODE LIMITED, DL REPAYMENT" of the same amount is the likely pair); six "PAYPAL PAYMENT 5JX22222WZGH6" top-ups (£184.64) coded CR with no purchases line, which are transfers into the PayPal wallet; ICO ZB070902 £47.00 on 22 May with no purchases line although the label map (`../staging/labels/diya-labels.toml`) has an ICO rule; "Matthew Grundy, DIY ACCOUNTING" £70.00 on 22 April. Resolve against the operator's own reference set of accounts, line by line, then rebuild and verify with the `company-book` skill. Blocked on the operator's reference set of accounts. **Owner**: Claude Code. **Model**: Sonnet. **Size**: 0 files (the book and the label map are under `../staging/`, a label-rule or parser fix is ~2 files).

## Discipline

- **Push once per batch of landed tracks, never per track**, and prefer one dispatch that
  proves several things over several dispatches. A push per track turned one batch into six
  ci deploys and several environment deploys in a morning on 2026-09-06, each able to open
  alarm issues and cancel each other through the deploy concurrency group, and the operator
  froze pushes twice. A freeze, when the operator calls one, stops `git push`,
  `gh workflow run` and `gh pr create` until they lift it in their own words; local commits,
  worktree tracks and reading logs continue, and a failed job gets a proposed fix in the reply.

