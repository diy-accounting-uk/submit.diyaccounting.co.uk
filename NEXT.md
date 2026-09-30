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

**Prod runs deployment prod-ecfc67e** (PR #431's merge deploy, 2026-09-30); PR #432's deploy 36752297382 is replacing it.
**ci**: `ci-set1` (last-known-good, created 14:30 UTC 2026-09-30) and `ci-set2` (created 12:57 UTC) stand.

Rows F-BS3 and LP-* change the spreadsheets repository (`../spreadsheets.diyaccounting.co.uk/`): their batch branches, PRs and CI run there, under that repository's `CLAUDE.md` and tests; their plans (`../private.diyaccounting.co.uk/strategy/PLAN_DIYA_GL_LAUNCH.md`, `../private.diyaccounting.co.uk/strategy/PLAN_DIYA_GL_INDIA.md`, `PLAN_DIYACCOUNTING_BRAND.md`) are at this root. LP rows' briefs are in `../private.diyaccounting.co.uk/strategy/PLAN_DIYA_GL_LAUNCH.md` under "Briefs"; `../private.diyaccounting.co.uk/strategy/PLAN_DIYA_GL_INDIA.md` carries its own board.

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

- [ ] **BRW1. Browser in the lake: measure Edge's share of visitors and of paid customers.** The lake has no browser column, so `PLAN_PAID_GOOGLE_SEARCH.md` §7c could not measure how many visitors use Edge (the proxy for the Windows and Office customer, and the case for Bing, BING1). Two sources:
  - (1) The GA4 export pull selects `device.category` and `device.operating_system` (`app/functions/analytics/ga4EventExportPull.js` lines ~134–135) but not `device.web_info.browser` or `device.web_info.browser_version`. Add them as `device_browser` and `device_browser_version` there and in the `ga4_bq_events` columns (`infra/main/java/co/uk/diyaccounting/submit/stacks/analytics/Ga4Tables.java` line ~241), keeping the column order the writer uses. This covers GA4 events, including the cookieless pings.
  - (2) The CloudFront access logs (`cloudfront_requests`, `CloudFrontAccessLogs.java`) hold `cs_user_agent` for every request, with no consent dependency. Add a view `v_visitors_by_browser_daily` beside `v_visitors_by_kind_daily.sql` that classifies the user agent (Edge `Edg/`, Chrome, Firefox, Safari, other) and the OS, per day, for page requests only, excluding the crawlers `v_visitors_by_kind_daily` already excludes; register it in `BusinessViews.java`.

  Proof: `AthenaViewColumnTypesTest`, the export pull's unit test with the new fields in its fixture, and a prod `SELECT * FROM (<view sql>) LIMIT 0` (workgroup `prod-env-analytics`, database `prod_env_analytics`) with the column types read back. Then one query: Edge's share of page visitors over the last 30 days, and of the sessions that reached `begin_checkout`, written into the plan's §7c. Built: view counts page requests (the table forbids `c_ip` in views) and excludes the behaviour tests by their `DIYAccountingProbe/1` marker; first reading, Edge 25 of 561 page requests (4.5%) over 7 days. Remainder: merge, then the 30-day Edge share into the plan's §7c. **In flight**: batch `claude/voyager-consent`, PR #436 (with the named-query count fix). **Source**: `PLAN_PAID_GOOGLE_SEARCH.md` evidence gap, operator 2026-09-30. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~5 files.

- [ ] **ADS2a. Store nothing and send nothing to Google before consent.** `../private.diyaccounting.co.uk/PLAN_PAID_CLICK_MEASUREMENT.md` (outcome 4) found two gaps. First, `web/public/lib/analytics.js` writes `gclid`, UTM and `ref` to `localStorage` `attribution.landing` for 90 days before any choice (`captureLandingAttribution`, line ~118). Second, the GA4 tag runs in advanced consent mode, sending cookieless pings to Google, while `web/public/privacy.html` line ~177 says no tracking data goes to Google until consent. The final ICO guidance (2026-04-29) puts ad measurement outside the statistics exception. Rows R1, R2 and R4 of the plan:
  - R1: all four consent types default to `denied`; `gtag.js` loads only after Accept (basic mode); `attribution.landing` is written only after Accept and deleted on Reject.
  - R2: `session-beacon.js` and `sessionBeaconPost.js` send attribution fields only after Accept, and no beacon after Reject.
  - R4: `privacy.html` states what is stored (`attribution.landing`, `__diy_session__`, `consent.*`, `rum.config`), the Google Ads measurement use, and consent as the basis.

  Proof: unit and browser tests for both consent states, and the behaviour suites. **In flight**: batch `claude/voyager-consent`, PR #436, CI running. **Source**: OADS2 research, 2026-09-30. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~7 files.

- [ ] **ADS2b. Paid customers carry their acquisition source.** `billingWebhookPost.js` (lines ~259–274) writes no `acquisition` on the paid bundle. `v_paid_subscribers_by_channel.sql` (lines ~15–21, 56) joins on `hashed_sub` + `bundle_id`, so paid sources read `unknown`. `bundlePost.js` line ~450 keeps the first grant's record, so an untagged first day pass blocks a later ad click. Rows R5 and R6 of `../private.diyaccounting.co.uk/PLAN_PAID_CLICK_MEASUREMENT.md`:
  - R5: consented attribution goes into Stripe checkout metadata (`bundles.html`, `billingCheckoutPost.js`) and is written as `acquisition` on the paid bundle by the webhook.
  - R6: the view joins acquisition on `hashed_sub` only; a tagged record replaces an untagged `{landedAt}`-only one.

  Proof: unit tests for each, `AthenaViewColumnTypesTest`, and a prod `SELECT * FROM (<view sql>) LIMIT 0`. **In flight**: batch `claude/voyager-consent`, PR #436, CI running. **Source**: OADS2 research, 2026-09-30. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~6 files.

## Machine-only

## Machine-ask

- [ ] **O75. Send the licence-change email.** The draft is committed (private a687b05). The operator says go and sends `../private.diyaccounting.co.uk/hmrc/correspondence/DRAFT_EMAIL_LICENCE_CHANGE.md` from antony@diyaccounting.co.uk to `SDSTeam@hmrc.gov.uk`; the session then adds the send date and recipient to `../private.diyaccounting.co.uk/hmrc/vat/HMRC_MTD_API_APPROVAL_SUBMISSION.md` and `../private.diyaccounting.co.uk/hmrc/correspondence/HMRC_PRODUCTION_CREDENTIALS_EMAIL.md`. **Source**: BACKLOG 75. **Owner**: Operator (the send), Claude Code (the annotation). **Model**: Haiku. **Size**: 0 files in this repository.

## Human-driven

- [ ] **O11. The ITSA send day.** The proof is on `main` (PR #352, 2026-09-25): the eight ITSA suites pass on the simulator and run in CI, and the sandbox year ran clean on 2023-24, 2025-26 and 2026-27 on 2026-09-25 with a real `Gov-Client-Multi-Factor` header (`VALID_HEADERS`, no warnings), inside HMRC's 14 days until 2026-10-09. Evidence for every claim in the email, with how to check each, is in `../private.diyaccounting.co.uk/hmrc/itsa/evidence/README.md`. Send `../private.diyaccounting.co.uk/hmrc/itsa/DRAFT_EMAIL_ITSA_RECOGNITION.md` to `SDSTeam@hmrc.gov.uk` from the operator's address (prod-065f06a carries PR #352), then `../private.diyaccounting.co.uk/hmrc/itsa/DRAFT_EMAIL_ITSA_PRODUCTION_CREDENTIALS.md` when SDST answers. After recognition, a session adds the Income Tax ad group to `infra/google/ads/ads.toml`'s "Search: MTD VAT" campaign (its keywords and ad copy are in the parent of 8816f93c, PR #414) and applies it with `npm run ads:sync -- --apply` on the operator's yes. **Source**: BACKLOG 11; `PLAN_ITSA_PHASE_2.md` T10. **Owner**: Operator. **Model**: none. **Size**: 0 files.

- [ ] **OB52i. Save the company book to your DIYA account.** Open https://diya-gl.co.uk, load the book at `../staging/2026-2027/book/`, sign in with your own account (second factor) and choose "Save to my account". B52i then reads the saved book's id and owner prefix. **Source**: BACKLOG 52i. **Owner**: Operator. **Model**: none. **Size**: 0 files.

- [ ] **O34d. File DIY Accounting Limited's PSC verification by 5 October 2026.** The window for the company's own director-PSCs runs 22 September to 5 October 2026 and Submit cannot file the codes in time, so they go through Companies House's PSC web service (https://find-and-update.company-information.service.gov.uk/). **Source**: `PLAN_COMPANIES_HOUSE.md` "Operator dates"; BACKLOG 34. **Owner**: Operator. **Model**: none. **Size**: 0 files.

- [ ] **OBING1. Open a Microsoft Advertising account.** Edge's default search engine is Bing, and Google Search cannot target a browser, so Bing is the route to the Windows and Edge customer (`../private.diyaccounting.co.uk/PLAN_PAID_GOOGLE_SEARCH.md` §7c, experiment E7). Steps: (1) sign up at https://ads.microsoft.com as DIY Accounting Limited (Microsoft now accepts sign-up with the Google account antony@diyaccounting.co.uk); (2) business details as Google Ads: company number 06846849, 37 Sutherland Avenue, Leeds, LS8 1BY, D-U-N-S 211569182; (3) add a payment method and complete any advertiser verification it asks for; (4) create no campaign; write the Microsoft Advertising account number into BING1. **Source**: operator, 2026-09-30. **Owner**: Operator. **Model**: none. **Size**: 0 files.

- [ ] **OADS2. Confirm the ads landing consent dialog, and answer two legal questions.** The research (`../private.diyaccounting.co.uk/PLAN_PAID_CLICK_MEASUREMENT.md`) recommends outcome 4. The ads landing page shows a consent dialog with equal Accept and Reject buttons, both of which open the page. The first-party `gclid` pipeline runs only for visitors who accept. Option A alone fails PECR reg. 6, because the ICO's final guidance excludes ad measurement from the statistics exception. The ads land on `/`, so the dialog shows there for every visitor unless the plan's separate landing page (LP-1) exists first. Its estimated opt-in is 30% to 70%, and answer counts replace the estimate after two weeks. Write here:
  - (a) yes to outcome 4, on `/` or on a separate ads landing page;
  - (b) whether forwarding `new-session` events to Telegram is "sharing with any other person" under PECR Schedule A1 para. 5;
  - (c) whether a script reading `gclid` from the page URL with no storage counts as "access". Outcome 4 does not depend on (c).

  **Source**: OADS2 research, 2026-09-30. **Owner**: Operator. **Model**: none. **Size**: 0 files.

## Blocked

- [ ] **B17d. The walkthrough videos: test data, repeated scenes, file size (BACKLOG 17d).** HMRC's sandbox answers "No liabilities/payments/penalties found" on the three VAT read pages, so their videos show the search and not a result; every recording repeats the day-pass and HMRC-authorisation scenes; the full recordings are large. `videos/publish.json` lists 29 videos over 33 scene scripts (`videos/*.json`): review each against its scene script, pick sandbox data that returns a result, cut the repeated scenes to one shared intro, compress, re-record what changes with the `site-video-capture` skill and republish with `video-publish` (unlisted first, the operator watches, then public). **Live** on prod-e78b1a9 (PR #428): sandbox scenarios on the three read videos, a new `hmrc-authorise` video the others fast-forward to and link, crf 22 encode. Recorded on prod 2026-09-30 and checked (timings pass, result tables filled): `hmrc-authorise` 36729544300, `view-liabilities` 36730456608, `view-payments` 36731270921, `view-penalties` 36732079635. Not uploaded: they show the nav on two rows (NAV1), no "Rates" link and unseparated amounts (FMT1). NAV1 and FMT1 are live on prod-ecfc67e. After the deploys of PR #432 (36752297382) and PR #433 (merge 53757de16) settle the apex, re-record these four on prod with `video-capture.yml`, one at a time (its concurrency group cancels an in-progress capture of the same environment), then the other changed videos; then one branch sets each entry's `sourceRun` (clearing `videoId` for re-recorded ones) in `videos/publish.json`, uploads unlisted with `npm run video:publish` (`hmrc-authorise` first; the others' descriptions link to it), and the operator watches before `--public`. Blocked on the PR #432 and #433 deploys. **Source**: BACKLOG 17d; `PLAN_ITSA_PHASE_2.md` 17d. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~6 files.

- [ ] **B66. Close alarm issue #430 once the PayPal pull alarm is back to OK (BACKLOG 66).** PayPal donations are on the revenue panel: March to September 2026 are in the lake, and `v_revenue_daily` on prod shows September's 6 PayPal rows (2026-09-03, 07, 20, 24, 25, 28). `prod-env-paypal-donations-pull-errors` has been in ALARM since 2026-09-30 14:31 UTC. It counts over a 86,400 s period with missing data treated as OK, so it returns to OK once a day passes without errors. Check on 2026-10-01 after 15:00 UTC: `aws --profile submit-prod --region eu-west-2 cloudwatch describe-alarms --alarm-names prod-env-paypal-donations-pull-errors --query 'MetricAlarms[].StateValue'`; if it shows OK, `gh issue close 430 --comment "Alarm back to OK after the retry deploy (prod-ecfc67e)"`. Blocked until 2026-10-01. **Source**: BACKLOG 66; `PLAN_ONE_STOP_DASHBOARD.md` D2. **Owner**: Claude Code. **Model**: Haiku. **Size**: 0 files.

- [ ] **ADS3. Check "Search: MTD VAT" serves now the account is verified.** Advertiser verification for customer 814-268-5080 completed 2026-09-30 20:29 (all five policy tasks). "Search: MTD VAT" was rebuilt and applied on 2026-09-30 about 21:30 (PR #437, `claude/walrus-ads-phrases`): £1 a day, maximise clicks with a £1 ceiling, six ad groups with 34 phrase keywords, 162 campaign negatives, the three old groups paused. The forecast is about 40 clicks a month at £0.75. PR #437 merged as 32dc1006b. On 2026-10-02, run `AWS_PROFILE=submit-prod AWS_REGION=eu-west-2 npm run ads:report -- --from 2026-10-01 --to 2026-10-01` and record the impressions, clicks and cost per ad group; on 2026-10-14, read the search-terms report for the words that drew clicks and add the wasteful ones to the negatives. If there are none, check the campaign's serving status and keyword statuses (low search volume, not eligible) in the report's JSON (`--json`) and name the cause; the keyword set is for BACKLOG 76's plan (`../private.diyaccounting.co.uk/PLAN_PAID_GOOGLE_SEARCH.md`) to change. Blocked until 2026-10-02, when 2026-10-01 is a whole day. **Source**: the verification, 2026-09-30. **Owner**: Claude Code. **Model**: Haiku. **Size**: 0 files.

- [ ] **BING1. Bing search: forecast, measure, then import the Google campaign (BACKLOG 76, experiment E7).** (1) With the account from OBING1, read Bing's Keyword Planner CPCs and volumes for the plan's phase-1 VAT phrases and write them into `../private.diyaccounting.co.uk/PLAN_PAID_GOOGLE_SEARCH.md` §7c, replacing the unforecast Bing CPC. (2) Store `msclkid` like `gclid`: add it to `ATTRIBUTION_URL_PARAMS` in `web/public/lib/analytics.js` (the plan's LP-8), after Accept only, as ADS2a stores `gclid`, and join it to paid conversions as the `gclid` path does. (3) Import the proven Google VAT campaign with Import > Import from Google Ads (Advanced import, the chosen campaigns only; https://about.ads.microsoft.com/en/tools/productivity/import-tools), at the budget E7 names, and compare cost per paid against Google over 150 Bing clicks. Blocked on OBING1 and ADS2a; step 3 also waits on the plan's phase 1 proving a Google campaign. **Source**: `PLAN_PAID_GOOGLE_SEARCH.md` E7, LP-8. **Owner**: Claude Code; the import is the operator's go. **Model**: Sonnet. **Size**: ~3 files.

- [ ] **ADS2c. The consent dialog and the Google Ads conversion upload.** Rows R3, R7 and R8 of `../private.diyaccounting.co.uk/PLAN_PAID_CLICK_MEASUREMENT.md`:
  - R3: a consent dialog with equal buttons on the ads landing page (`web/public/submit.js`, the page OADS2 names, a browser test), the banner shown without depending on RUM config, answer counts, and a "Cookie choices" footer link.
  - R7: `googleadservices.com` and `googleads.g.doubleclick.net` in the CSP (`EdgeStack.java` lines ~820–821, ~903–904).
  - R8: `infra/google/ads/ads-conversions-upload.js` uploads paid conversions through the Data Manager API with `gclid`, the invoice id as `transactionId` and `adUserData` granted, listed in `ads.toml` and `REPORT_CAPABILITIES.md`.

  Blocked on OADS2 (a) and on ADS2a and ADS2b landing. **Source**: OADS2 research. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~7 files.

- [ ] **B30z. ci's GA4 BigQuery export dataset appears.** PR #424 (merged) gives ci's property 552917343 a managed `bigquery_link` (daily export, no streaming); events arrive (171 on the plan's count). As of 2026-09-29 19:30 UTC the dataset was still absent: `ci-env-ga4-event-export-pull` logged "GA4 BigQuery export dataset does not exist yet; writing a zero-row day". Check once on 2026-10-01 from AWS, which needs no gcloud login: `aws --profile submit-ci logs filter-log-events --log-group-name /aws/lambda/ci-env-ga4-event-export-pull --start-time <epoch-ms of 2026-10-01> --filter-pattern '"does not exist yet"'`; no match after a run means the dataset exists. If it still does not, read the link through the Admin API in the next `google-apply.yml` plan's log (excluded events, dataset location) and fix the layer it names. Blocked until 2026-10-01. **Source**: refine, 2026-09-28. **Owner**: Claude Code. **Model**: Haiku. **Size**: 0 files.

- [ ] **B52m-a. Income, reserve and budget on the dashboard (BACKLOG 52m).** Trailing 30-day income, the reserve with its £2,000 floor, the budget at 20% of trailing income, and the reinvestment fraction as a lever. Blocked until 2026-10-02, when the cost panel starts carrying revenue (BACKLOG 43). **Source**: BACKLOG 52m; `PLAN_ONE_STOP_DASHBOARD.md` D17. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~2 files.

- [ ] **B52i. The company P&L and balance sheet on the dashboard: switch the pull on (BACKLOG 52i).** The build is on main: `app/functions/analytics/companyBookPull.js`, its Glue table, snapshot observation and dashboard block (374c1ce47, c9be409d2). `{env}-env-company-book-pull` exists only when `COMPANY_BOOK_ID` (a v4 UUID) and `COMPANY_BOOK_OWNER_PREFIX` (64 lowercase hex) are set (`IngestionStack.java` lines ~637-668), from GitHub prod variables `SUBMIT_COMPANY_BOOK_ID` and `SUBMIT_COMPANY_BOOK_OWNER_PREFIX` through `deploy-environment.yml`; neither is set. After OB52i: read the saved book's `users/<prefix>/books/<id>/` key read-only, run `gh variable set SUBMIT_COMPANY_BOOK_ID --env prod` and `gh variable set SUBMIT_COMPANY_BOOK_OWNER_PREFIX --env prod` on the operator's go, dispatch `deploy-environment.yml` for prod, and check the block after the next nightly run. Blocked on OB52i. **Source**: BACKLOG 52i; `PLAN_ONE_STOP_DASHBOARD.md` D10. **Owner**: Claude Code. **Model**: Haiku. **Size**: 0 files.

- [ ] **B10. ITSA phase 1: closes with O11 (BACKLOG 10).** The quarterly-update build is on main and proven: the sandbox year ran clean on 2023-24, 2025-26 and 2026-27 on 2026-09-25 and the eight ITSA suites run in CI. Nothing is left to build; the row closes when O11's recognition email goes, and the backlog row with it. Blocked on O11. **Source**: BACKLOG 10; `PLAN_ITSA_PHASE_2.md`. **Owner**: Claude Code. **Model**: none. **Size**: 0 files.

- [ ] **B34. Companies House accounts filing and the confirmation statement launch (BACKLOG 34).** Live on prod: the company lookup and the registered-office and registered-email filings. Remaining, in `PLAN_COMPANIES_HOUSE.md` "Tasks": accounts filing through the XML Gateway waits on Companies House IT repairing the test presenter (B34.6c; last word from xml@companieshouse.gov.uk 2026-09-24, no repair recorded), then the live clearance (O34c) and the prod launch (B34c); the confirmation statement's customer launch (CS-11b) follows CS-A3 and CS-A4, which also wait on B34.6c. Blocked on Companies House IT (B34.6c). **Source**: BACKLOG 34; `PLAN_COMPANIES_HOUSE.md`. **Owner**: Claude Code. **Model**: Sonnet. **Size**: see the plan's tasks.

- [ ] **B52l. The optimiser notebook (BACKLOG 52l).** A notebook over the raw export computing the per-block correlations, fitting the block models (linear cost, log-linear funnels, Hill curves for spend), ranking levers by effect per unit cost and proposing the next experiment with its predicted effect and interval; Bayesian optimisation for continuous knobs and a Thompson-sampling bandit for allocations once experiments exist; one line per objective on the dashboard page. Two chunks: the model design as a plan section (Opus), then the notebook and the page line (Sonnet). B52m-b consumes its fitted models. Blocked until 2026-12-10, when three months of `exports/prod/` exist (`aws --profile submit-prod s3 ls s3://prod-env-analytics-lake-972912397388/exports/prod/`); database `prod_env_analytics`, workgroup `prod-env-analytics`. **Source**: BACKLOG 52l; `PLAN_ONE_STOP_DASHBOARD.md` D16. **Owner**: Claude Code. **Model**: Opus, then Sonnet. **Size**: ~3 files.

- [ ] **B52m-b. Return, payback and experiments on the dashboard (BACKLOG 52m).** Return per pound and payback; paid traffic and article boosts as experiment rows with on-off or geographic controls, at most 10% of the budget per experiment unless the operator names more; GA4 conversion import from the Ads account (`infra/google/ads/ads.toml`, customer `8142685080`). Builds on B52m-a's panel. Blocked on B52l's fitted models. **Source**: BACKLOG 52m; `PLAN_ONE_STOP_DASHBOARD.md` D17. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~2 files.

## Discipline

- **Push once per batch of landed tracks, never per track**, and prefer one dispatch that
  proves several things over several dispatches. A push per track turned one batch into six
  ci deploys and several environment deploys in a morning on 2026-09-06, each able to open
  alarm issues and cancel each other through the deploy concurrency group, and the operator
  froze pushes twice. A freeze, when the operator calls one, stops `git push`,
  `gh workflow run` and `gh pr create` until they lift it in their own words; local commits,
  worktree tracks and reading logs continue, and a failed job gets a proposed fix in the reply.

