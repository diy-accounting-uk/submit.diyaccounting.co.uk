<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# NEXT — current state & kickoff

Living handover for this repository. Rules and shape: `../NEXT.md` (DONE or OPEN only, nothing
deferred; a bug found fixing item A is A's remainder, not a new item; this file holds ONLY what
to do next — completed work lives in `git log`). Plans of record: `PLAN_*.md` at this root. The ITSA production approval rows (IA1 to IA10) are boarded in `PLAN_ITSA_APPROVAL.md`, not here.

## Open items

Every item ends with a tag line: **Source** (the `PLAN_*.md` that owns it, a GitHub issue, or
none), **Owner** (`Operator` for steps a workflow cannot do, `Claude Code` for steps a sub-agent
runs), and for Claude Code steps the **Model** a sub-agent should use (Fable > Opus > Sonnet >
Haiku; the lowest tier that fits). Anything touching code goes through a `claude/*` branch and
PR; the operator merges.

**Prod runs deployment prod-7cf71b6** (PR #529, deploy 39808661362 attempt 2 green on 2026-10-22). The site's `script-src` carries no `'unsafe-inline'`.
**ci**: `ci-set1` is last-known-good (12 stacks, created 2026-10-20 10:46 UTC; the pointer last written 15:09 UTC on 2026-10-22). Its self-destruct fires every four hours from creation and skips while the set is last-known-good inside the 12 h window from the pointer's last write, so it goes at the 06:46 UTC firing on 2026-10-23 unless a branch deploy renews it first.

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

## Machine-only

## Machine-ask

## Human-driven

- [ ] **B34. Companies House: the reply on the XML team's thread, carrying the live-clearance asks (PLAN_COMPANIES_HOUSE B34.6c, PLAN_COMPANIES_HOUSE_APPROVAL O34c and CS-A4).** The replacement test presenter is proven: every statement case settles on its first poll (harness run 38029097822 and three earlier green runs on 2026-10-10, every case pinned in `scripts/fixtures/companies-house-test-service-cases.json`), and the accounts submission 00002Y answers PENDING on every poll (279 polls to 06:25 UTC on 2026-10-11, run 38030268952; 276 polls again to POLL_TIMEOUT on 2026-10-20, run 39345324672), which the fixture pins. The operator sends `../private.diyaccounting.co.uk/companies-house/correspondence/DRAFT_EMAIL_XMLGW_REPLACEMENT_PRESENTER_REPLY.md` on the thread with the pack `../private.diyaccounting.co.uk/companies-house/xmlgw-evidence/SOFTWARE_AUTHORISATION_PACK_2026-10-10.md` attached: the success report, the two observations (accounts stay PENDING on the test service; the wrong-authentication-code case was accepted), and the asks: clear the credit-account presenter for live accounts filing with its live package reference (O34c), and the live package reference for the confirmation statement and the PSC verification statement (CS-A4). After the answer: the live values on GitHub's `prod` environment (O34c), then B34c. **Source**: `PLAN_COMPANIES_HOUSE.md` B34.6c; `PLAN_COMPANIES_HOUSE_APPROVAL.md` O34c, CS-A4. **Owner**: Operator. **Model**: none. **Size**: 0 files. Unblocks O34c, CS-A4, B34c, CS-11b, CS-P1.

- [ ] **OF2p. September's statements.** Put September's files in Drive (absent from the mirror after a `drive/pull.sh finance` on 2026-10-10) under `finance/2026-2027 accounts/`: `bank/Current 600947-80597386 01-09-2026-30-09-2026.csv`, `bank/Savings 600947-80634672 01-09-2026-30-09-2026.csv`, `paypal/2026-09 PayPal - transactions.PDF`, `paypal/2026-09 PayPal - statement.PDF`. **Source**: F2p's build, 2026-10-01. **Owner**: Operator. **Model**: none. **Size**: 0 files. Unblocks F2p.

- [ ] **O34g. HMRC Corporation Tax test-service credentials (PLAN_COMPANIES_HOUSE_APPROVAL O34g).** Register with HMRC's Software Developers Support Team (SDST) for the Corporation Tax online test service (ETS). SDST issues an ETS sender ID, its password and a 4-digit vendor ID. Set the three as secrets on GitHub's `ci` environment (Settings, Environments, ci); the classifier denies `gh secret set` to sessions, so a session hands each write over as a `!` command. B34g1 then sends the TPVS-proven return to `https://test-transaction-engine.tax.service.gov.uk/submission`, with the vendor ID in `ChannelRouting/Channel/URI`. **Source**: `PLAN_COMPANIES_HOUSE_APPROVAL.md` O34g. **Owner**: Operator. **Model**: none. **Size**: 0 files. Unblocks B34g1, B34g2b.

- [ ] **ORA4. Support automation: two decisions before the build (PLAN_REPOSITORY_AUTOMATION Phase 4).** The inbound triage runs (`.github/workflows/support-triage.yml`); it drafts a reply into the run's step summary only. Two decisions remain before a session builds the rest. (1) Where the automatic customer lookup writes. It runs `.claude/skills/vat-submission-failure-alarm-user-lookup/SKILL.md` when a `prod-env-hmrc-submission-failure` or `prod-env-itsa-submission-failure` issue opens; the issues are public, so the choices are a file in the private repository `../private.diyaccounting.co.uk/`, a Telegram message, or the run's step summary on this public repository (visible to anyone with read access). (2) Whether reply drafts go into the support@diyaccounting.co.uk mailbox as Gmail drafts; yes needs a Gmail API credential for that mailbox only, stored as a GitHub `prod` secret, and drafts stay unsent (plan Q6). Write both answers into this row; a session then builds the machine part. **Source**: `PLAN_REPOSITORY_AUTOMATION.md` Phase 4, Q6. **Owner**: Operator. **Model**: none. **Size**: 0 files.

- [ ] **OBING1. Open a Microsoft Advertising account.** Edge's default search engine is Bing, and Google Search cannot target a browser, so Bing is the route to the Windows and Edge customer (`../private.diyaccounting.co.uk/PLAN_PAID_GOOGLE_SEARCH.md` §7c, experiment E7). Steps: (1) sign up at https://ads.microsoft.com as DIY Accounting Limited (Microsoft now accepts sign-up with the Google account antony@diyaccounting.co.uk); (2) business details as Google Ads: company number 06846849, 37 Sutherland Avenue, Leeds, LS8 1BY, D-U-N-S 211569182; (3) add a payment method and complete any advertiser verification it asks for; (4) create no campaign; write the Microsoft Advertising account number into BING1. **Source**: operator, 2026-09-30. **Owner**: Operator. **Model**: none. **Size**: 0 files.

## Blocked

- [ ] **F2p. Company book: rebuild through September.** The six coding fixes from the workspace inbox are in the book (`../staging/2026-2027/book/`, 562 lines, 1 April to 31 August): 1200, 1210 and 1220 match every statement April to August, trade creditors −£111.23, checks 16 rules 0 failing and 762 report checks 0 non-pass. The parser change behind fix 4 (`paypalWalletLinesFromStatementPdf`, pound figures for foreign-currency bills, label rule fields `documentType` and `skipJournalLine`) is on main (PR #447). Remaining: when OF2p's September files are in the Drive mirror, `drive/pull.sh "finance"`, then `node ../staging/2026-2027/book/builder/build.mjs <outDir> --through 2026-09` (it imports the main checkout's `mcp/lib/finance/`), verify per the skill and re-zip; then the same with `--through 2026-10` when October's data is in, which is the book OB52i saves. Stripe September is staged and reconciles (residual 0). The five coding decisions (operator, 2026-10-10): the director bears the £29.30 PayPal fee on the £1,000 payment (profit +£29.30; the one change from the build); the five AWS "Other: AWS EMEA" PayPal credits stay purchases credit notes; opening 1220 stays PayPal's March statement £94.27; the £2.28 cashback stays a wallet receipt coded `K`; Stripe payouts stay debtor receipts with 1230 at £136.47. **Source**: workspace `INBOX.md`, 2026-10-01. Blocked on OF2p. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~4 files.

- [ ] **B34g1. The CT600 ETS proof (PLAN_COMPANIES_HOUSE).** The envelope, IRmark, CT600 XML and computations iXBRL are on main (PR #475) and HMRC's TPVS accepts them (`node scripts/hmrc-tpvs-ct600.js`). Remaining: the same payload through HMRC's External Test Service once O34g gives credentials. **Source**: `PLAN_COMPANIES_HOUSE.md`. **Owner**: Claude Code. **Model**: Sonnet. **Size**: 0 files. Blocked on O34g.

- [ ] **BING1. Bing search: forecast, measure, then import the Google campaign (`../private.diyaccounting.co.uk/PLAN_PAID_GOOGLE_SEARCH.md` E7).** (1) With the account from OBING1, read Bing's Keyword Planner CPCs and volumes for the plan's phase-1 VAT phrases and write them into `../private.diyaccounting.co.uk/PLAN_PAID_GOOGLE_SEARCH.md` §7c, replacing the unforecast Bing CPC. (2) Import the proven Google VAT campaign with Import > Import from Google Ads (Advanced import, the chosen campaigns only; https://about.ads.microsoft.com/en/tools/productivity/import-tools), at the budget E7 names, and compare cost per paid against Google over 150 Bing clicks, joining on the `msclkid` BING1a stores. Blocked on OBING1; step 2 also waits on the plan's phase 1 proving a Google campaign (ADS4's reading). **Source**: `../private.diyaccounting.co.uk/PLAN_PAID_GOOGLE_SEARCH.md` E7. **Owner**: Claude Code; the import is the operator's go. **Model**: Sonnet. **Size**: ~1 file (private).

- [ ] **HA8. The published VAT Assist contract (PLAN_HMRC_ASSIST).** When HMRC publishes the VAT Assist (MTD) API's documentation and the sandbox lists it: subscribe the Developer Hub application, rewrite the VAT half of `app/lib/hmrcAssistApi.js`, its tests and `app/http-simulator/routes/vat-assist.js` to the published paths, bodies and scenarios, run the `hmrcAssistBehaviour` suite against the sandbox, and record the run in `../private.diyaccounting.co.uk/hmrc/vat/hmrc-assist/` for the early adopter proof. Blocked on HMRC's reply to the early adopter email (sent 2026-10-20 to hmrcassist@hmrc.gov.uk) and HMRC publishing the API (slides: sandbox from July 2026, production for early adopters from January 2027). **Source**: `PLAN_HMRC_ASSIST.md` HA8. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~4 files.

- [ ] **OB52i. Save the company book, with October's data, to a DIYA account that keeps it.** The operator saves it once October's data is in, which the EGM also needs; October's statements exist after 2026-10-31. Steps:
  - (1) F2p rebuilds the book through October once the data is in.
  - (2) On https://diya-gl.co.uk, open `../staging/2026-2027/book/book-diya-gl.zip`, check the title reads DIY Accounting Limited, and choose Save to my account.
  - (3) Keep it: a book without Resident retention expires after about 35 days (`expiryLabel` in `../spreadsheets.diyaccounting.co.uk/web/diya-gl.co.uk/public/cloud.js`). Either subscribe that account to Resident, so it reads "kept until you delete it", or re-save it at least monthly.

  The BrickWork sample saved on 2026-09-30 is not needed and can be deleted. B52i then reads the saved book's id and owner prefix. Blocked until October's data is in. **Source**: `PLAN_ONE_STOP_DASHBOARD.md` D10; operator, 2026-09-30. **Owner**: Operator. **Model**: none. **Size**: 0 files.

- [ ] **B52i. The company P&L and balance sheet on the dashboard: switch the pull on (PLAN_ONE_STOP_DASHBOARD D10).** The build is on main: `app/functions/analytics/companyBookPull.js`, its Glue table, snapshot observation and dashboard block (374c1ce47, c9be409d2). `{env}-env-company-book-pull` exists only when `COMPANY_BOOK_ID` (a v4 UUID) and `COMPANY_BOOK_OWNER_PREFIX` (64 lowercase hex) are set (`infra/main/java/co/uk/diyaccounting/submit/stacks/IngestionStack.java` lines ~654–690), from GitHub prod variables `SUBMIT_COMPANY_BOOK_ID` and `SUBMIT_COMPANY_BOOK_OWNER_PREFIX` through `deploy-environment.yml` (line ~1195); neither is set. After OB52i: read the saved book's `users/<prefix>/books/<id>/` key read-only, run `gh variable set SUBMIT_COMPANY_BOOK_ID --env prod` and `gh variable set SUBMIT_COMPANY_BOOK_OWNER_PREFIX --env prod` on the operator's go, dispatch `deploy-environment.yml` for prod, and check the block after the next nightly run; then the dashboard's reserve (the bank balance from the book, against the £2,000 floor, beside B52m-a's income and budget). Blocked on OB52i. **Source**: `PLAN_ONE_STOP_DASHBOARD.md` D10. **Owner**: Claude Code. **Model**: Haiku. **Size**: 0 files.

- [ ] **ADS4. "Search: MTD VAT" at the £2 CPC ceiling: read the first fortnight.** The ceiling went from £1.00 to £2.00 on 2026-10-18 (PR #499, `infra/google/ads/ads.toml` `cpc_bid_ceiling_gbp`; applied by main's `google apply` run 39123022047 at 11:25 UTC). Blocked on the date: on 2026-11-01 run `AWS_PROFILE=diya-submit-prod npm run ads:report -- --from 2026-10-18 --to 2026-10-31` and write the reading into `../private.diyaccounting.co.uk/PLAN_PAID_GOOGLE_SEARCH.md` under "Proposal 2026-10-18" (the forecast there expects about 44 clicks a month on the £1 daily budget); a reading of 0 impressions at £2 means the ceiling is still below the first-page bids (`npm run ads:forecast`) and the next proposal is the budget, not the bid. **Source**: ADS3's reading, 2026-10-18. **Owner**: Claude Code. **Model**: Haiku. **Size**: 1 file.

- [ ] **B34g2b. The CT600 filing journey proven against HMRC's test service (PLAN_COMPANIES_HOUSE B34g2).** One ETS filing from B34g2a's page on ci with the SDST test credentials and vendor id, polled and deleted, its IRmark receipt stored; then `prod` on the activity's `environments`. Blocked on B34g1 and O34g (B34g2a is on main in PR #511). **Source**: `PLAN_COMPANIES_HOUSE.md` design. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~2 files.

- [ ] **B52l. The optimiser notebook (PLAN_ONE_STOP_DASHBOARD D16).** A notebook over the raw export computing the per-block correlations, fitting the block models (linear cost, log-linear funnels, Hill curves for spend), ranking levers by effect per unit cost and proposing the next experiment with its predicted effect and interval; Bayesian optimisation for continuous knobs and a Thompson-sampling bandit for allocations once experiments exist; one line per objective on the dashboard page. Two chunks: the model design as a plan section (Opus), then the notebook and the page line (Sonnet). B52m-b consumes its fitted models. Blocked until 2026-12-10, when three months of `exports/prod/` exist (the first export is dated 2026-09-10; 40 daily prefixes on 2026-10-20) (`aws --profile diya-submit-prod s3 ls s3://prod-env-analytics-lake-972912397388/exports/prod/`); database `prod_env_analytics`, workgroup `prod-env-analytics`. **Source**: `PLAN_ONE_STOP_DASHBOARD.md` D16. **Owner**: Claude Code. **Model**: Opus, then Sonnet. **Size**: ~3 files.

- [ ] **B52m-b. Return, payback and experiments on the dashboard (PLAN_ONE_STOP_DASHBOARD D17).** Return per pound and payback; paid traffic and article boosts as experiment rows with on-off or geographic controls, at most 10% of the budget per experiment unless the operator names more; GA4 conversion import from the Ads account (`infra/google/ads/ads.toml`, customer `8142685080`). Ads spend per day comes from ADS4's `v_ads_cost_daily`. Builds on B52m-a's panel. Blocked on B52l's fitted models. **Source**: `PLAN_ONE_STOP_DASHBOARD.md` D17. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~2 files.

## Discipline

- **Push once per batch of landed tracks, never per track**, and prefer one dispatch that
  proves several things over several dispatches. A push per track turned one batch into six
  ci deploys and several environment deploys in a morning on 2026-09-06, each able to open
  alarm issues and cancel each other through the deploy concurrency group, and the operator
  froze pushes twice. A freeze, when the operator calls one, stops `git push`,
  `gh workflow run` and `gh pr create` until they lift it in their own words; local commits,
  worktree tracks and reading logs continue, and a failed job gets a proposed fix in the reply.

