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

**Prod runs deployment prod-a453b95** (PR #404's merge deploy, run 36388849074 attempt 2, 2026-09-28), the only prod set standing.
**ci**: `ci-set1` is last-known-good and the only set standing (created 19:04 UTC 2026-09-27).

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

## Machine-only

- [ ] **VID10a/VID10b/VID10c. Publish itsa-year, file-micro-entity-accounts, mcp-diya-gl and change-registered-email, public, on videos.html.** Branch `claude/kestrel-videos` (worktree `.claude/worktrees/kestrel`, commits 32e28484 and 121ac90e, not pushed) adds itsa-year (capture run 36366746493, the whole year to HMRC's acceptance of the final declaration; the partial itsa-year-part is not published), points file-micro-entity-accounts (run 36342977308) and mcp-diya-gl (run 36334808802) at their artifacts, and change-registered-email at a simulator recording (ci capture cannot sign in to Companies House: `TEST_COMPANIES_HOUSE_USER_ID` and `TEST_COMPANIES_HOUSE_PASSWORD` are unset). All four files sit under the worktree's `target/videos/`; `--check` passes. YouTube answered `uploadLimitExceeded` at 07:10 UTC 2026-09-28: the limit runs 24 hours from the last upload (21:22 UTC 2026-09-27), so the upload runs after 21:30 UTC. Remainder, in the kestrel worktree: `AWS_PROFILE=submit-prod npm run video:publish`, then `-- --public`, then `node scripts/youtube-upload.js --sync-status --apply`, then `npm run videos:manifest`; push and PR. **Source**: operator, 2026-09-27. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~2 files.

- [ ] **B82b. Reasoned job filter, dual-run trial (BACKLOG 82b).** Advisory `select-jobs` on test.yml and deploy.yml merged in PR #403 (632a9876); every job still runs and each run saves `select-jobs-decision-test-<run>` / `select-jobs-decision-deploy-<run>`. Remainder: once branch pushes have accrued advised skips, run `node scripts/ci/select-jobs-trial.mjs --workflow deploy.yml --limit 200` and `--workflow test.yml`, record the per-job table in BACKLOG row 82b, and name the job classes that meet the bar (zero misses over at least 50 advised skips) for B82c. **Source**: operator, 2026-09-27. **Owner**: Claude Code. **Model**: Haiku. **Size**: ~1 file.

- [ ] **B30v. Alarm #386: `prod-env-rum-cls-p75`.** The header-chrome and dashboard reservations merged in PR #401 (7c5ec086). Remainder: a day after prod runs 7c5ec086, read CLS events for `/` and `/operator/dashboard.html` (`aws --profile submit-prod rum get-app-monitor-data --name prod-env-rum`, millisecond epochs); #386 closed itself at 00:36 UTC 2026-09-28 when the alarm went OK, so reopen it with the events if p75 CLS returns above the threshold; the dashboard is still under-reserved between about 600 and 800 px wide. **Source**: alarm #386, 2026-09-27. **Owner**: Claude Code. **Model**: Haiku. **Size**: 0 files.

- [ ] **DB5. Confirm the dashboard's Started columns fill.** The fix (dec85080) is live since prod-64b82c3's 19:38 UTC deploy on 2026-09-27, and started events reach `prod_env_analytics.activity_events` with their `activity_id`; the 20:45 snapshot's `::started` values are null because no customer has used the site since then (after 09:00 UTC only `test-user`, `synthetic`, `visitor` and `system` events, Athena query cb307e6c). `v_activity_started_daily` counts `actor = 'customer'` only. Remainder: once `activity_events` shows a customer event after 2026-09-27 19:38 UTC, read the next snapshot for a non-zero `::started` beside its `::completed`. **Source**: operator, 2026-09-27. **Owner**: Claude Code. **Model**: Haiku. **Size**: 0 files.

- [ ] **B30u3. The seven Firehose-written lake tables move to a `dt` date projection.** Merged in PR #392 (d747c5f6), commits 0e36173b and d5ded1bc (the second also makes data quality register the compliance tables' dt partitions, which prod had never registered). The ci relayout for days before 2026-09-27 ran (run 36317675770, 2,579 objects copied). `AnalyticsStack.java` (curated `activity_events`: `dt date`, `projection.dt.type=date`, range `2026-08-01,NOW`, Firehose prefix `dt=!{timestamp:yyyy-MM-dd}/`), `TableChangeDelivery.java` (the four `dynamo_*` tables), `AlarmStateChangeDelivery.java`, `activity_events_all.sql` (`dt` in place of year, month, day), the two hourly views (`dt >= current_date - interval '8' day`), `dataQualityRun.js` (the two tables join `DT_PARTITIONED_TABLES`), `DataQuality.java`, and their tests (`dataQualityRun.test.js`, `AnalyticsStackTest`, `TableChangeDeliveryTest`, `AlarmStateChangeDeliveryTest`, `DataQualityTest`). `cloudfront_requests` keeps y/m/d (its only reader prunes by equality in 0.13 s). On ci: both relayouts ran (runs 36317675770 and 36322003686), Firehose writes after 13:01 UTC land under `dt=2026-09-27/`, `v_submissions_daily` plans in 212 ms, and object counts per day match between layouts. Remainder: the ci nightly Data Quality run passes. **Source**: B30u design. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~13 files.

- [ ] **VID14a. Video: view and amend a filed quarterly update (self-employment).** The operator holds this row until they release it (2026-09-27). `selfEmploymentPeriods.html`, `selfEmploymentPeriodView.html`, `selfEmploymentPeriodAmend.html`: list the filed quarters, open one, amend it and resubmit. **Source**: operator, 2026-09-27. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~2 files.

- [ ] **VID14b. Video: UK property beyond the quarter (view, amend, annual submission, adjustments).** The operator holds this row until they release it (2026-09-27). `ukPropertyPeriods.html`, `ukPropertyPeriodView.html`, `ukPropertyPeriodAmend.html`, `ukPropertyAnnualSubmission.html`, `ukPropertyAdjustments.html`. **Source**: operator, 2026-09-27. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~2 files.

- [ ] **VID14c. Video: the annual submission imported from a book, with the exemptions and the trading income allowance.** The operator holds this row until they release it (2026-09-27). `annualSubmission.html`'s "Import from a book" path, the non-financial details (over State Pension age, diver, non-resident) and the trading income allowance. **Source**: operator, 2026-09-27. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~2 files.

- [ ] **VID14d. Video: an in-year estimate of the tax bill.** The operator holds this row until they release it (2026-09-27). `taxCalculation.html` with "In-year estimate", before the year's final figures. **Source**: operator, 2026-09-27. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~2 files.

- [ ] **VID14e. Video (partial): loss carry back, carry sideways and the order of preference.** The operator holds this row until they release it (2026-09-27). `lossesAndClaims.html`'s carry-back and carry-sideways claims and its preference-order section. Titled "(partial)" and may stop at the claim form while VID10c fixes the losses scene. **Source**: operator, 2026-09-27. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~2 files.

- [ ] **VID14f. Video (partial): foreign property losses.** The operator holds this row until they release it (2026-09-27). `lossesAndClaims.html` for a foreign property business. Titled "(partial)" while VID10c fixes the losses scene. **Source**: operator, 2026-09-27. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~2 files.

- [ ] **VID14g. Video (partial): what a carry-back claim saves (tax liability adjustments).** The operator holds this row until they release it (2026-09-27). `taxLiabilityAdjustments.html`, after a carry-back claim. Titled "(partial)" while VID10c fixes the losses scene. **Source**: operator, 2026-09-27. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~2 files.

## Machine-ask

## Human-driven

- [ ] **OVID1. Read how YouTube serves a 4K upload.** Capture run 36334326190 (view-obligations, ci, 3840x2160 H.264, faststart, every timing check passed) is uploaded unlisted as https://youtu.be/W-nKFdBIj3Y ("view your VAT obligations (4K test)"; not in `videos/publish.json`). Remainder: once YouTube has finished its 4K processing (up to a few hours), the operator opens it at 1080p and at 2160p, right-clicks the player, chooses "Stats for nerds", and writes the codec and resolution seen at each into this row; Claude Code then puts the settings that serve best into the `site-video-capture` skill and deletes the test upload. **Source**: operator, 2026-09-26. **Owner**: operator (reading), Claude Code (skill). **Model**: Haiku. **Size**: ~1 file.

- [ ] **O11. The ITSA send day.** The proof is on `main` (PR #352, 2026-09-25): the eight ITSA suites pass on the simulator and run in CI, and the sandbox year ran clean on 2023-24, 2025-26 and 2026-27 on 2026-09-25 with a real `Gov-Client-Multi-Factor` header (`VALID_HEADERS`, no warnings), inside HMRC's 14 days until 2026-10-09. Evidence for every claim in the email, with how to check each, is in `../itsa-recognition-evidence/README.md`. Send `_developers/hmrc/DRAFT_EMAIL_ITSA_RECOGNITION.md` to `SDSTeam@hmrc.gov.uk` from the operator's address (prod-23d9a7e carries PR #352), then `_developers/hmrc/DRAFT_EMAIL_ITSA_PRODUCTION_CREDENTIALS.md` when SDST answers. **Source**: BACKLOG 11; `PLAN_ITSA_PHASE_2.md` T10. **Owner**: Operator. **Model**: none. **Size**: 0 files.

## Blocked

- [ ] **OYT1. YouTube's advanced features, to lift the daily upload limit.** The upload API answered `uploadLimitExceeded` after the eleventh upload on 2026-09-27. A higher daily upload limit is an advanced feature (YouTube Help, answer 9891124). The operator verified the channel's phone number and submitted video verification under YouTube Studio → Settings → Channel → Feature eligibility → Advanced features on 2026-09-28; YouTube reviews it, usually within 24 hours. Remainder: when the review clears, Feature eligibility shows advanced features enabled. Blocked on YouTube's review. **Source**: VID10a, 2026-09-27. **Owner**: operator. **Model**: none. **Size**: 0 files.

- [ ] **B43. Cost optimisation after the first renewal (BACKLOG 43).** From 2026-10-02: confirm the renewal refreshes tokens (`subscription-renewed` published), check the bill against the steady-state target ($64.77 a month before VAT) on the cost panel's `v_cost_vs_target_monthly`, and the GCP billing account holding the GA4 export (`../developers/submit/archive/PLAN_COST_OPTIMISATION.md`). Blocked on the date, 2026-10-02. **Source**: BACKLOG 43. **Owner**: Claude Code. **Model**: Haiku. **Size**: 0 files.

- [ ] **B82c. Reasoned job filter, gradual rollout (BACKLOG 82c).** Enforce per workflow and job class, unit-level first, deploy stacks last, each kept while misses stay at zero; `main` stays on a full run. Blocked on B82b. **Source**: operator, 2026-09-27. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~3 files.

- [ ] **B82d. Reasoned job filter, rules from evidence (BACKLOG 82d).** Turn repeated skips in B82b's records into mechanical `paths:`/`changes` rules by PR. Blocked on B82b. **Source**: operator, 2026-09-27. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~1 file.

- [ ] **B80. Replies to YouTube comments (BACKLOG 80).** Model-drafted replies sent from the channel once BACKLOG 78's acceptance-rate gate exists (`PLAN_REPOSITORY_AUTOMATION.md` Phase 5). Blocked on BACKLOG 78 (support replies graduating from drafts). **Source**: BACKLOG 80. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~3 files.

- [ ] **B52i. The company P&L and balance sheet on the dashboard (BACKLOG 52i).** The company's diya-gl book, saved to the DIYA cloud by `../PLAN_FINANCE_AUTOMATION.md` phase 2 and derived nightly with the Ltd engine through `PLAN_SUBMISSION_MCP.md` M1 and M3, rendered above the eight objectives beside the last set filed at Companies House (`PLAN_ONE_STOP_DASHBOARD.md` D10). Blocked on the finance plan's phases 1 and 2 and on BACKLOG 61 (M3). **Source**: BACKLOG 52i. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~6 files.

- [ ] **VID14z. Re-record the partial ITSA videos complete.** Once VID10c's whole-year video publishes: re-record VID14e, VID14f, VID14g and VID10a's itsa-year-part through to a completed submission, drop "(partial)" from their titles, replace their entries in `videos/publish.json`, and set the partial uploads to unlisted. Blocked on VID10c. **Source**: operator, 2026-09-27. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~4 files.

- [ ] **CS-A3. The harness's statement cases, pinned.** Harness run 36295600451 on `main` (d19cd6df): all six confirmation statement submissions (five ConfirmationAndVerificationStatement v1-0 cases and the v1-3 ConfirmationStatement case) now pass the gateway at submit; each status poll answers 9999 `No presenter ID supplied` from `GetSubmissionStatus`, the test-presenter account fault Companies House's XML team reported on their side (B34.6c waits on the same). The two blank-code cases are pinned at schema error 100. Remainder: when a poll returns a terminal status, dispatch `companies-house-test-service.yml` on `main` and pin each case's accepted or rejected outcome (the wrong-authentication-code case should reject). Blocked on Companies House fixing the test presenter account (B34.6c). **Source**: `PLAN_COMPANIES_HOUSE.md`. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~1 file.

- [ ] **CS-13b. PSC verification statement (VS01): the test-service proof.** Harness run 36295600451: the director-PSC case for 04549236 passes the gateway at submit and its status poll answers 9999 `No presenter ID supplied` (the test-presenter fault, as CS-A3); the blank-code case is pinned at error 100. Remainder: pin the director-PSC case's outcome with CS-A3's next run. Blocked on Companies House fixing the test presenter account (B34.6c). **Source**: `PLAN_COMPANIES_HOUSE.md`. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~1 file.

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

