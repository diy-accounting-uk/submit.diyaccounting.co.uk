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

**Prod runs deployment prod-0ac6862** (PR #440). PR #441's merge (7c757d6fe) is deploying: `deploy.yml` 36835392530.
**ci**: `ci-set1` (last-known-good, 10 stacks, first created 01:57 UTC 2026-10-01).

Rows F-BS3 and LP-* change the spreadsheets repository (`../spreadsheets.diyaccounting.co.uk/`): their batch branches, PRs and CI run there, under that repository's `CLAUDE.md` and tests; their plans (`../private.diyaccounting.co.uk/strategy/PLAN_DIYA_GL_LAUNCH.md`, `../private.diyaccounting.co.uk/strategy/PLAN_DIYA_GL_INDIA.md`, `PLAN_DIYACCOUNTING_BRAND.md`). LP rows' briefs are in `../private.diyaccounting.co.uk/strategy/PLAN_DIYA_GL_LAUNCH.md` under "Briefs"; `../private.diyaccounting.co.uk/strategy/PLAN_DIYA_GL_INDIA.md` carries its own board.

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
`../private.diyaccounting.co.uk/operator/NEXT_OPERATOR_RUNBOOK.md`, one file rewritten in place. Every item
names its model: the lowest tier that fits (Fable > Opus > Sonnet > Haiku), or `none` for a human
step.

## In flight

- [ ] **FORM2d. ITSA inline validation errors.** `PLAN_FORM_AUDIT.md` A15: missing fields raise only a status banner. Add the error summary, inline error per field and `aria-invalid` from `web/public/docs/hmrc-form-field-standards/validation.js`, as a shared module used by every ITSA form. FORM2b is on main (PR #441). Proof: browser tests for an empty submit on each form, the ITSA behaviour suites. **Source**: FORM1 audit. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~20 files. **In flight**: batch `claude/arclight-itsa`, agent worktree `.claude/worktrees/arclight-form2d`.

- [ ] **B30z. ci's GA4 BigQuery export never creates its dataset.** PR #424 gave ci's property 552917343 a `bigquery_link` (`properties/552917343/bigQueryLinks/YMgIZ3AlTimUkRNIAua9lA`, project 958354756046, europe-west2, daily export on). On 2026-10-01 a manual run of `ci-env-analytics-nightly` (`manual-b30z-20261001`) still logged "GA4 BigQuery export dataset does not exist yet" for `diyaccounting-ga4.analytics_552917343`; only `analytics_523400333` (prod) and `ga4_daily` exist. Two faults to settle: (1) why GA4 writes no dataset for ci although the link reports daily export on and the property has events: read the link's full resource (`exportStreams`, `excludedEvents`, `includeAdvertisingId`) and the property's data retention and data filters through the Admin API in a `google-apply.yml` plan (`infra/google/ga4/ga4-sync.js`), and compare with prod's working link `oqZmMBnUTXen4Z6D5CcGHw`; (2) `ga4-sync.js` plans "would update ... to dailyExport=true streamingExport=false" on every run and PATCHes the ci link each apply (main run 36826569480), so its comparison never matches (likely a `false` the API omits, around lines ~382 and ~733): fix the comparison and add a unit test. ci's nightly is weekly (`ci-env-analytics-nightly-schedule`, Mondays 02:15 UTC). **Source**: refine, 2026-09-28; check 2026-10-01. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~2 files. **In flight**: `claude/zenith-ga4`, PR #442 (the comparison fix and the link printout; the dataset cause is read from this PR's plan log).

- [ ] **OADS2f. Prove the Ads upload end to end.** The Ads refresh token was re-consented on 2026-10-01 with the adwords and Data Manager scopes (`prod/submit/google/ads/refresh_token`, rotated-at 2026-10-01). A `--validate-only` call with a one-row events file then got 403 "Data Manager API has not been used in project 958354756046 before or it is disabled"; PR #442 enables `datamanager.googleapis.com` in `infra/google/gcp/project.toml`, applied by `google-apply.yml` on merge. After that: `AWS_PROFILE=submit-prod AWS_REGION=eu-west-2 node infra/google/ads/ads-conversions-upload.js --events-file <one-row file> --validate-only` (row columns `gclid, invoice_id, net_minor, currency, created` with `created` in epoch seconds), then `--apply` once the lake holds a consented paid conversion with `acq_gclid`.  **Source**: ADS2c report, 2026-10-01. **Owner**: Claude Code. **Model**: Haiku. **Size**: 0 files. **In flight**: `claude/zenith-ga4`, PR #442.

## Machine-only

## Machine-ask

- [ ] **O75. Send the licence-change email.** The draft is committed (private a687b05). The operator says go and sends `../private.diyaccounting.co.uk/hmrc/correspondence/DRAFT_EMAIL_LICENCE_CHANGE.md` from antony@diyaccounting.co.uk to `SDSTeam@hmrc.gov.uk`; the session then adds the send date and recipient to `../private.diyaccounting.co.uk/hmrc/vat/HMRC_MTD_API_APPROVAL_SUBMISSION.md` and `../private.diyaccounting.co.uk/hmrc/correspondence/HMRC_PRODUCTION_CREDENTIALS_EMAIL.md`. **Source**: BACKLOG 75. **Owner**: Operator (the send), Claude Code (the annotation). **Model**: Haiku. **Size**: 0 files in this repository.

## Human-driven

- [ ] **O11. The ITSA send day.** The proof is on `main` (PR #352, 2026-09-25): the eight ITSA suites pass on the simulator and run in CI, and the sandbox year ran clean on 2023-24, 2025-26 and 2026-27 on 2026-09-25 with a real `Gov-Client-Multi-Factor` header (`VALID_HEADERS`, no warnings), inside HMRC's 14 days until 2026-10-09. Evidence for every claim in the email, with how to check each, is in `../private.diyaccounting.co.uk/hmrc/itsa/evidence/README.md`. Send `../private.diyaccounting.co.uk/hmrc/itsa/DRAFT_EMAIL_ITSA_RECOGNITION.md` to `SDSTeam@hmrc.gov.uk` from the operator's address (prod carries PR #352), then `../private.diyaccounting.co.uk/hmrc/itsa/DRAFT_EMAIL_ITSA_PRODUCTION_CREDENTIALS.md` when SDST answers. After recognition, a session adds the Income Tax ad group to `infra/google/ads/ads.toml`'s "Search: MTD VAT" campaign (its keywords and ad copy are in the parent of 8816f93c, PR #414) and applies it with `npm run ads:sync -- --apply` on the operator's yes. **Source**: BACKLOG 11; `PLAN_ITSA_PHASE_2.md` T10. **Owner**: Operator. **Model**: none. **Size**: 0 files.

- [ ] **OBING1. Open a Microsoft Advertising account.** Edge's default search engine is Bing, and Google Search cannot target a browser, so Bing is the route to the Windows and Edge customer (`../private.diyaccounting.co.uk/PLAN_PAID_GOOGLE_SEARCH.md` §7c, experiment E7). Steps: (1) sign up at https://ads.microsoft.com as DIY Accounting Limited (Microsoft now accepts sign-up with the Google account antony@diyaccounting.co.uk); (2) business details as Google Ads: company number 06846849, 37 Sutherland Avenue, Leeds, LS8 1BY, D-U-N-S 211569182; (3) add a payment method and complete any advertiser verification it asks for; (4) create no campaign; write the Microsoft Advertising account number into BING1. **Source**: operator, 2026-09-30. **Owner**: Operator. **Model**: none. **Size**: 0 files.

## Blocked

- [ ] **B66. Close alarm issue #430 once the PayPal pull alarm is back to OK (BACKLOG 66).** PayPal donations are on the revenue panel: March to September 2026 are in the lake, and `v_revenue_daily` on prod shows September's 6 PayPal rows (2026-09-03, 07, 20, 24, 25, 28). `prod-env-paypal-donations-pull-errors` has been in ALARM since 2026-09-30 14:31 UTC. It counts over a 86,400 s period with missing data treated as OK, so it returns to OK once a day passes without errors. Check on 2026-10-01 after 15:00 UTC: `aws --profile submit-prod --region eu-west-2 cloudwatch describe-alarms --alarm-names prod-env-paypal-donations-pull-errors --query 'MetricAlarms[].StateValue'`; if it shows OK, `gh issue close 430 --comment "Alarm back to OK after the retry deploy (prod-ecfc67e)"`. Blocked until 2026-10-01. **Source**: BACKLOG 66; `PLAN_ONE_STOP_DASHBOARD.md` D2. **Owner**: Claude Code. **Model**: Haiku. **Size**: 0 files.

- [ ] **ADS3. Check "Search: MTD VAT" serves now the account is verified.** Advertiser verification for customer 814-268-5080 completed 2026-09-30 20:29 (all five policy tasks). "Search: MTD VAT" was rebuilt and applied on 2026-09-30 about 21:30 (PR #437, merged as 32dc1006b): £1 a day, maximise clicks with a £1 ceiling, six ad groups with 34 phrase keywords, 162 campaign negatives, the three old groups paused. The forecast is about 40 clicks a month at £0.75. On 2026-10-02, run `AWS_PROFILE=submit-prod AWS_REGION=eu-west-2 npm run ads:report -- --from 2026-10-01 --to 2026-10-01` and record the impressions, clicks and cost per ad group; on 2026-10-14, read the search-terms report for the words that drew clicks and add the wasteful ones to the negatives. If there are none, check the campaign's serving status and keyword statuses (low search volume, not eligible) in the report's JSON (`--json`) and name the cause; the keyword set is for BACKLOG 76's plan (`../private.diyaccounting.co.uk/PLAN_PAID_GOOGLE_SEARCH.md`) to change. Blocked until 2026-10-02, when 2026-10-01 is a whole day. **Source**: the verification, 2026-09-30. **Owner**: Claude Code. **Model**: Haiku. **Size**: 0 files.

- [ ] **B52m-a. Income, reserve and budget on the dashboard (BACKLOG 52m).** Trailing 30-day income, the reserve with its £2,000 floor, the budget at 20% of trailing income, and the reinvestment fraction as a lever. Blocked until 2026-10-02, when the cost panel starts carrying revenue (BACKLOG 43). **Source**: BACKLOG 52m; `PLAN_ONE_STOP_DASHBOARD.md` D17. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~2 files.

- [ ] **OB52i. Save the company book, with October's data, to a DIYA account that keeps it.** The operator saves it once October's data is in, which the EGM also needs, expected about 2026-10-02. Steps:
  - (1) Rebuild the book with October (`company-book` skill).
  - (2) On https://diya-gl.co.uk, open `../staging/2026-2027/book/book-diya-gl.zip`, check the title reads DIY Accounting Limited, and choose Save to my account.
  - (3) Keep it: a book without Resident retention expires after about 35 days (`expiryLabel` in `../spreadsheets.diyaccounting.co.uk/web/diya-gl.co.uk/public/cloud.js`). Either subscribe that account to Resident, so it reads "kept until you delete it", or re-save it at least monthly.

  The BrickWork sample saved on 2026-09-30 is not needed and can be deleted. B52i then reads the saved book's id and owner prefix. Blocked until October's data is in. **Source**: BACKLOG 52i; operator, 2026-09-30. **Owner**: Operator. **Model**: none. **Size**: 0 files.

- [ ] **B52i. The company P&L and balance sheet on the dashboard: switch the pull on (BACKLOG 52i).** The build is on main: `app/functions/analytics/companyBookPull.js`, its Glue table, snapshot observation and dashboard block (374c1ce47, c9be409d2). `{env}-env-company-book-pull` exists only when `COMPANY_BOOK_ID` (a v4 UUID) and `COMPANY_BOOK_OWNER_PREFIX` (64 lowercase hex) are set (`IngestionStack.java` lines ~646–677), from GitHub prod variables `SUBMIT_COMPANY_BOOK_ID` and `SUBMIT_COMPANY_BOOK_OWNER_PREFIX` through `deploy-environment.yml` (line ~1195); neither is set. After OB52i: read the saved book's `users/<prefix>/books/<id>/` key read-only, run `gh variable set SUBMIT_COMPANY_BOOK_ID --env prod` and `gh variable set SUBMIT_COMPANY_BOOK_OWNER_PREFIX --env prod` on the operator's go, dispatch `deploy-environment.yml` for prod, and check the block after the next nightly run. Blocked on OB52i. **Source**: BACKLOG 52i; `PLAN_ONE_STOP_DASHBOARD.md` D10. **Owner**: Claude Code. **Model**: Haiku. **Size**: 0 files.

- [ ] **B17d. Re-record and upload every walkthrough video once the video fixes are on prod (BACKLOG 17d).** VID18 changes the burned-in overlay, so all 30 published videos change; VID16, VID17, VID19, NAV2 and FORM1 (a), (a2) and (b) change what the ITSA and VAT videos show. The 2026-09-30 recordings on prod-e433b4c (`hmrc-authorise` 36760837562, `view-liabilities` 36770456137, `view-payments` 36762412157, `view-penalties` 36763267394, `view-obligations` 36767164093, `view-return` 36767906895, `submit-return` 36769104507) predate them. Steps, once those rows are on prod: (1) `npm run video:stale` (VID20) and dispatch every re-record it lists, one at a time through VID21's queue; (2) check each run's stills and timings for the nav on one row with the new "HMRC Tax Rates and Allowances" label, £1,234.50-style amounts, no "99999999999", and HMRC's answer in each ITSA video's final still; (3) on one branch, set each entry's `sourceRun` in `videos/publish.json` and clear `videoId` for re-recorded videos; (4) run `npm run video:publish` to upload unlisted, `hmrc-authorise` first (the other descriptions link to it); (5) the operator watches before `--public`. Blocked on PR #441 (FORM2c) reaching prod: deploy 36835392530; the video fixes and FORM2a are on main (PRs #439, #440). **Source**: BACKLOG 17d; `PLAN_ITSA_PHASE_2.md` 17d. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~2 files.

- [ ] **BING1. Bing search: forecast, measure, then import the Google campaign (BACKLOG 76, experiment E7).** (1) With the account from OBING1, read Bing's Keyword Planner CPCs and volumes for the plan's phase-1 VAT phrases and write them into `../private.diyaccounting.co.uk/PLAN_PAID_GOOGLE_SEARCH.md` §7c, replacing the unforecast Bing CPC. (2) Store `msclkid` like `gclid`: add it to `ATTRIBUTION_URL_PARAMS` in `web/public/lib/analytics.js` (line ~96; the plan's LP-8), after Accept only, as ADS2a stores `gclid`, and join it to paid conversions as the `gclid` path does. (3) Import the proven Google VAT campaign with Import > Import from Google Ads (Advanced import, the chosen campaigns only; https://about.ads.microsoft.com/en/tools/productivity/import-tools), at the budget E7 names, and compare cost per paid against Google over 150 Bing clicks. Blocked on OBING1; step 3 also waits on the plan's phase 1 proving a Google campaign. **Source**: `PLAN_PAID_GOOGLE_SEARCH.md` E7, LP-8. **Owner**: Claude Code; the import is the operator's go. **Model**: Sonnet. **Size**: ~3 files.

- [ ] **B10. ITSA phase 1: closes with O11 (BACKLOG 10).** The quarterly-update build is on main and proven: the sandbox year ran clean on 2023-24, 2025-26 and 2026-27 on 2026-09-25 and the eight ITSA suites run in CI. Nothing is left to build; the row closes when O11's recognition email goes, and the backlog row with it. Blocked on O11. **Source**: BACKLOG 10; `PLAN_ITSA_PHASE_2.md`. **Owner**: Claude Code. **Model**: none. **Size**: 0 files.

- [ ] **DEP1. Three Dependabot alerts wait on an `aws-cdk-lib` release.** Alerts #101–#103 are brace-expansion 5.0.9 in `cdk-typescript/package-lock.json`. That copy is bundled inside the `aws-cdk-lib` tarball, which ignores `overrides`, and 2.272.0 (the latest on 2026-09-30) still bundles 5.0.9. When an `aws-cdk-lib` release bundles brace-expansion 5.0.12 or later (`npm view aws-cdk-lib@latest version`, then check `node_modules/aws-cdk-lib/node_modules/brace-expansion/package.json`), bump it in `cdk-typescript/package.json` and the Maven CDK version together. Blocked on that release. **Source**: Dependabot, 2026-09-30. **Owner**: Claude Code. **Model**: Haiku. **Size**: ~3 files.

- [ ] **B34. Companies House accounts filing and the confirmation statement launch (BACKLOG 34).** Live on prod: the company lookup and the registered-office and registered-email filings. Remaining, in `PLAN_COMPANIES_HOUSE.md` "Tasks": accounts filing through the XML Gateway waits on Companies House IT repairing the test presenter (B34.6c; last word from xml@companieshouse.gov.uk 2026-09-24, no repair recorded), then the live clearance (O34c) and the prod launch (B34c); the confirmation statement's customer launch (CS-11b) follows CS-A3 and CS-A4, which also wait on B34.6c. Blocked on Companies House IT (B34.6c). **Source**: BACKLOG 34; `PLAN_COMPANIES_HOUSE.md`. **Owner**: Claude Code. **Model**: Sonnet. **Size**: see the plan's tasks.

- [ ] **B52l. The optimiser notebook (BACKLOG 52l).** A notebook over the raw export computing the per-block correlations, fitting the block models (linear cost, log-linear funnels, Hill curves for spend), ranking levers by effect per unit cost and proposing the next experiment with its predicted effect and interval; Bayesian optimisation for continuous knobs and a Thompson-sampling bandit for allocations once experiments exist; one line per objective on the dashboard page. Two chunks: the model design as a plan section (Opus), then the notebook and the page line (Sonnet). B52m-b consumes its fitted models. Blocked until 2026-12-10, when three months of `exports/prod/` exist (`aws --profile submit-prod s3 ls s3://prod-env-analytics-lake-972912397388/exports/prod/`); database `prod_env_analytics`, workgroup `prod-env-analytics`. **Source**: BACKLOG 52l; `PLAN_ONE_STOP_DASHBOARD.md` D16. **Owner**: Claude Code. **Model**: Opus, then Sonnet. **Size**: ~3 files.

- [ ] **B52m-b. Return, payback and experiments on the dashboard (BACKLOG 52m).** Return per pound and payback; paid traffic and article boosts as experiment rows with on-off or geographic controls, at most 10% of the budget per experiment unless the operator names more; GA4 conversion import from the Ads account (`infra/google/ads/ads.toml`, customer `8142685080`). Ads spend per day comes from ADS4's `v_ads_cost_daily`. Builds on B52m-a's panel. Blocked on B52l's fitted models. **Source**: BACKLOG 52m; `PLAN_ONE_STOP_DASHBOARD.md` D17. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~2 files.

## Discipline

- **Push once per batch of landed tracks, never per track**, and prefer one dispatch that
  proves several things over several dispatches. A push per track turned one batch into six
  ci deploys and several environment deploys in a morning on 2026-09-06, each able to open
  alarm issues and cancel each other through the deploy concurrency group, and the operator
  froze pushes twice. A freeze, when the operator calls one, stops `git push`,
  `gh workflow run` and `gh pr create` until they lift it in their own words; local commits,
  worktree tracks and reading logs continue, and a failed job gets a proposed fix in the reply.

