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

**Prod runs deployment prod-afa6508** (dispatch 36621491788 of afa65083, 2026-09-29); main's deploy of PR #424 (8f10c301) replaces it.
**ci**: `ci-set1` (last-known-good, PR #424's branch deploy, created 20:47 UTC 2026-09-29) and `ci-set2` (created 18:51 UTC) stand; each self-destructs 4 hours after creation.

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

**COOL-DOWN is on since 2026-09-29T21:21:54Z.** No new board rows except a degradation. Agents commit
and stop. One branch is driven green at a time. Lifted only by the operator in their own words.

- [ ] **PRV1. The private repository: the spreadsheets half.** In flight: spreadsheets `claude/docs-private-repo`, PR #147 (removes the 29 HMRC publications under `_developers/hmrc-references/` and one coverage report, references rewritten to `../private.diyaccounting.co.uk/`). Submit (PR #426) and root (PR #35) are merged; the documents live in `diy-accounting-uk/private.diyaccounting.co.uk`, cloned at `../private.diyaccounting.co.uk/`. **Source**: operator, 2026-09-29. **Owner**: Claude Code. **Model**: none. **Size**: 0 files in this repository.

## Machine-only


- [ ] **B66. PayPal donations on the revenue panel (BACKLOG 66).** `v_revenue_daily` reads Stripe charges only (donations there are labelled by product through `stripeReconcile.js`). PayPal donation receipts are already staged (`scripts/finance/paypal-stage.js`) and turned into lines (`mcp/lib/finance/paypal-lines.js`); bring them into the lake as a table with a projection file and into the view by product (`PLAN_ONE_STOP_DASHBOARD.md` D2). The Athena database is `prod_env_analytics`, workgroup `prod-env-analytics`; views live in `infra/main/resources/analytics/views/` and register in `BusinessViews.java`; `AthenaViewColumnTypesTest` and a ci `SELECT ... LIMIT 0` type proof apply to a changed view. **Source**: BACKLOG 66; `PLAN_ONE_STOP_DASHBOARD.md` D2. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~4 files.

- [ ] **B17d. The walkthrough videos: test data, repeated scenes, file size (BACKLOG 17d).** HMRC's sandbox answers "No liabilities/payments/penalties found" on the three VAT read pages, so their videos show the search and not a result; every recording repeats the day-pass and HMRC-authorisation scenes; the full recordings are large. `videos/publish.json` now lists 29 videos (the row was written for eight): review each against its scene script under `videos/*.json`, pick sandbox data that returns a result, cut the repeated scenes to one shared intro, compress, re-record what changes with the `site-video-capture` skill and republish with `video-publish` (unlisted first, the operator watches, then public). **Source**: BACKLOG 17d; `PLAN_ITSA_PHASE_2.md` 17d. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~6 files.
## Machine-ask


- [ ] **B75. Tell HMRC's SDS team the licence changed (BACKLOG 75).** One email from antony@diyaccounting.co.uk to `SDSTeam@hmrc.gov.uk`, three facts: the MTD approval submission and the production-credentials email described the service as AGPL open source; the licence is now PolyForm Internal Use 1.0.0 with an additional grant for accountants and bookkeepers, and the service stays free to use; the change is live in production (`Gov-Vendor-License-IDs` behaviour is unchanged). Claude Code drafts it into `../private.diyaccounting.co.uk/hmrc/correspondence/`; the operator says go and sends; then both source documents (`../private.diyaccounting.co.uk/hmrc/vat/HMRC_MTD_API_APPROVAL_SUBMISSION.md`, `../private.diyaccounting.co.uk/hmrc/correspondence/HMRC_PRODUCTION_CREDENTIALS_EMAIL.md`) get the date and recipient. Kept apart from O11's recognition email. **Source**: BACKLOG 75; `PLAN_ITSA_PHASE_2.md` 75. **Owner**: Claude Code (draft, annotation), Operator (the send). **Model**: Haiku. **Size**: 0 files in this repository.
## Human-driven


- [ ] **O34d. File DIY Accounting Limited's PSC verification by 5 October 2026.** The window for the company's own director-PSCs runs 22 September to 5 October 2026 and Submit cannot file the codes in time, so they go through Companies House's PSC web service (https://find-and-update.company-information.service.gov.uk/). **Source**: `PLAN_COMPANIES_HOUSE.md` "Operator dates"; BACKLOG 34. **Owner**: Operator. **Model**: none. **Size**: 0 files.
- [ ] **O11. The ITSA send day.** The proof is on `main` (PR #352, 2026-09-25): the eight ITSA suites pass on the simulator and run in CI, and the sandbox year ran clean on 2023-24, 2025-26 and 2026-27 on 2026-09-25 with a real `Gov-Client-Multi-Factor` header (`VALID_HEADERS`, no warnings), inside HMRC's 14 days until 2026-10-09. Evidence for every claim in the email, with how to check each, is in `../private.diyaccounting.co.uk/hmrc/itsa/evidence/README.md`. Send `../private.diyaccounting.co.uk/hmrc/itsa/DRAFT_EMAIL_ITSA_RECOGNITION.md` to `SDSTeam@hmrc.gov.uk` from the operator's address (prod-d6f7537 carries PR #352), then `../private.diyaccounting.co.uk/hmrc/itsa/DRAFT_EMAIL_ITSA_PRODUCTION_CREDENTIALS.md` when SDST answers. After recognition, a session adds the Income Tax ad group to `infra/google/ads/ads.toml`'s "Search: MTD VAT" campaign (its keywords and ad copy are in the parent of 8816f93c, PR #414) and applies it with `npm run ads:sync -- --apply` on the operator's yes. **Source**: BACKLOG 11; `PLAN_ITSA_PHASE_2.md` T10. **Owner**: Operator. **Model**: none. **Size**: 0 files.

## Blocked


- [ ] **B10. ITSA phase 1: closes with O11 (BACKLOG 10).** The quarterly-update build is on main and proven: the sandbox year ran clean on 2023-24, 2025-26 and 2026-27 on 2026-09-25 and the eight ITSA suites run in CI. Nothing is left to build; the row closes when O11's recognition email goes, and the backlog row with it. Blocked on O11. **Source**: BACKLOG 10; `PLAN_ITSA_PHASE_2.md`. **Owner**: Claude Code. **Model**: none. **Size**: 0 files.

- [ ] **B34. Companies House accounts filing and the confirmation statement launch (BACKLOG 34).** Live on prod: the company lookup and the registered-office and registered-email filings. Remaining, in `PLAN_COMPANIES_HOUSE.md` "Tasks": accounts filing through the XML Gateway waits on Companies House IT repairing the test presenter (B34.6c), then the live clearance (O34c) and the prod launch (B34c); the confirmation statement's customer launch (CS-11b) follows CS-A3 and CS-A4. Blocked on Companies House IT (B34.6c). **Source**: BACKLOG 34; `PLAN_COMPANIES_HOUSE.md`. **Owner**: Claude Code. **Model**: Sonnet. **Size**: see the plan's tasks.

- [ ] **B52m. The reinvestment loop on the dashboard (BACKLOG 52m).** Trailing income, reserve, budget, return per pound and payback on the page; the reinvestment fraction as a lever with the reserve floor; paid traffic and article boosts as experiment rows with on-off or geographic controls; GA4 conversion import from the Ads account (`infra/google/ads/ads.toml`, customer `8142685080`). The operator's settings: 20% of 30-day trailing income, a £2,000 floor, at most 10% of the budget per experiment unless the operator names more. Blocked on B52l's fitted models and on the cost panel carrying revenue (from 2026-10-02, BACKLOG 43). **Source**: BACKLOG 52m; `PLAN_ONE_STOP_DASHBOARD.md` D17. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~3 files.

- [ ] **B52l. The optimiser notebook (BACKLOG 52l).** A notebook over the raw export computing the per-block correlations, fitting the block models (linear cost, log-linear funnels, Hill curves for spend), ranking levers by effect per unit cost and proposing the next experiment with its predicted effect and interval; Bayesian optimisation for continuous knobs and a Thompson-sampling bandit for allocations once experiments exist; one line per objective on the dashboard page. Two chunks: the model design as a plan section (Opus), then the notebook and the page line (Sonnet). Blocked until 2026-12-10, when three months of `exports/prod/` exist (`aws --profile submit-prod s3 ls s3://prod-env-analytics-lake-972912397388/exports/prod/`); database `prod_env_analytics`, workgroup `prod-env-analytics`. **Source**: BACKLOG 52l; `PLAN_ONE_STOP_DASHBOARD.md` D16. **Owner**: Claude Code. **Model**: Opus, then Sonnet. **Size**: ~3 files.
- [ ] **B30z. ci's GA4 BigQuery export dataset appears.** PR #424 (merged) gives ci's property 552917343 a managed `bigquery_link` (daily export, no streaming) and prints each property's event count in the Google plan; the plan counted 171 events on ci's property for yesterday to today, so events arrive, and the live link's flags differed from the config (applied by `google apply` on `main`). Check once on 2026-10-01: `bq ls --project_id=diyaccounting-ga4` lists `analytics_552917343`. If it does not, read the link through the Admin API in the next plan's log (the export's excluded events and the dataset location) and fix the layer it names. **Source**: refine, 2026-09-28. **Owner**: Claude Code. **Model**: Haiku. **Size**: 0 files.

- [ ] **B52i. The company P&L and balance sheet on the dashboard (BACKLOG 52i).** The company's diya-gl book, saved to the DIYA cloud by `../private.diyaccounting.co.uk/finance/PLAN_FINANCE_AUTOMATION.md` phase 2 and derived nightly with the Ltd engine through `PLAN_SUBMISSION_MCP.md` M1 and M3, rendered above the eight objectives beside the last set filed at Companies House (`PLAN_ONE_STOP_DASHBOARD.md` D10). Blocked on the finance plan's phases 1 and 2 and on M3 of `PLAN_SUBMISSION_MCP.md`. **Source**: BACKLOG 52i. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~6 files.

- [ ] **LP-24a. Google Drive store: the prod check.** The Drive client id (`670010122633-56q89d0h9c4skb9cpj4h9j2gr3kq06vd.apps.googleusercontent.com`) is recorded in `infra/google/gcp/oauth.toml` (PR #425) and set in `../spreadsheets.diyaccounting.co.uk/web/diya-gl.co.uk/public/cloud-config.js` `googleClientId` (spreadsheets branch `claude/drive-client-id`). After that spreadsheets PR merges and deploys, save a book to Drive from your own account and check the folder, the file and a second revision at https://drive.google.com/drive/my-drive (`../private.diyaccounting.co.uk/strategy/PLAN_DIYA_GL_LAUNCH.md` "Operator steps"). Blocked on the spreadsheets PR's prod deploy. **Source**: `../private.diyaccounting.co.uk/strategy/PLAN_DIYA_GL_LAUNCH.md`. **Owner**: Operator. **Model**: none. **Size**: 0 files.

## Discipline

- **Push once per batch of landed tracks, never per track**, and prefer one dispatch that
  proves several things over several dispatches. A push per track turned one batch into six
  ci deploys and several environment deploys in a morning on 2026-09-06, each able to open
  alarm issues and cancel each other through the deploy concurrency group, and the operator
  froze pushes twice. A freeze, when the operator calls one, stops `git push`,
  `gh workflow run` and `gh pr create` until they lift it in their own words; local commits,
  worktree tracks and reading logs continue, and a failed job gets a proposed fix in the reply.

