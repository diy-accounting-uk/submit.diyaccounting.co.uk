<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Unified Backlog

Compiled 2026-08-25 from every source: GitHub issues (#3 to #20), local plan docs (repo root and `_developers/`), customer and HMRC emails, CI signals, live AWS audit, cost analysis, the market survey, and the strategic review in [../private.diyaccounting.co.uk/strategy/STRATEGY.md](../private.diyaccounting.co.uk/strategy/STRATEGY.md). Sibling-repo items are marked with their repo.

**How items are valued.** Each item gets a value class and a one-line reason:

- **Existential**: losing this loses customers' data or the HMRC relationship. Price is irrelevant; it outranks everything.
- **Revenue**: directly moves paying-subscriber count or unlocks a priced tier.
- **Insight**: makes the business measurable. Ranked high because every growth decision downstream depends on it.
- **Trust**: makes monitoring and alerts truthful. Cheap items here rank high because false alarms train us to ignore real ones.
- **Autonomy**: removes recurring operator effort. Valued by hours saved per month.
- **Hygiene**: correctness and cost cleanups. Ranked by cost or risk removed per unit effort.

**How items are ranked.** Existential first when cheap relative to the risk. Then items that make everything else measurable or truthful, because they compound. Then the revenue path in dependency order. Effort tiebreaks: a small item with the same value class outranks a large one. [DE] marks items in the data engineering layer, with the certification domain they exercise.

## Live status (updated 2026-09-29)

Queued and in-flight state lives on `NEXT.md`; this block mirrors it so the backlog reads
truthfully on its own. Machine-ask and human-driven steps are briefed in
`../private.diyaccounting.co.uk/operator/NEXT_OPERATOR_RUNBOOK.md`, one file rewritten in place.

- Prod runs prod-afa6508; `ci-set2` is the ci set. PR #424 (B30ae, B30z, AV1, WT1, docs cleanup) is open.
- **Open alarm issues**: #420 (RUM CLS p75); its fix is in PR #424.
- **ITSA production approval**: rows 10 and 11 moved to `PLAN_ITSA_APPROVAL.md` on 2026-10-03; HMRC accepts no 2026-27 application, the 2027-28 process is announced by early 2027.
- **Date-gated**: 43 from 2026-10-02; 48 the week of 2026-11-29; 52l from 2026-12-10.
- **Blocked**: Companies House accounts filing (34) on Companies House IT repairing the test presenter (B34.6c); 52i on the finance plan's phases 1 and 2 and on M3 of `PLAN_SUBMISSION_MCP.md`; LP-24a on the deploy of the spreadsheets cloud-config PR that sets the Drive client id.
- **Tier 3 and 4 in motion**: 30's remedy closer runs hourly (`alarm-remedy-close.yml`); 52l and 52m carry the dashboard's remaining panels.

## Tier 1: do next

Refined items live on `NEXT.md` under the labels in the second column.

| # | NEXT.md items | Item | Source | Effort | Value |
|---|---|---|---|---|---|

## Tier 2: revenue path (start now, runs weeks to months)

Each row names what has to happen before it can start.

| # | Item | Source | Effort | Value |
|---|---|---|---|---|
| 34 | Companies House / limited company filing. Live on prod: the company-lookup page and the registered-office and registered-email filings, both proven on DIY Accounting Limited (`../private.diyaccounting.co.uk/engineering/submit/archive/PLAN_COMPANIES_HOUSE_REST_FILING.md`). Remaining: accounts filing through the XML Gateway waits on Companies House IT repairing the test presenter (B34.6c), then the live clearance (O34c) and the prod launch (B34c); the confirmation statement's customer launch (CS-11b) follows CS-A3 and CS-A4; the company's own PSC verification goes through Companies House's web service by 2026-10-05. | Issue #15; `PLAN_COMPANIES_HOUSE.md` | L | Revenue. Real demand signal (customers asked when the joint service closed); promoted by the operator 2026-08-31 to sit alongside ITSA rather than behind it. |
| 76 | Paid Google search that converts to paid at under £1 each. Revisit "Campaign #1" (Performance Max, `infra/google/ads/ads.toml` lines ~103–113, "Asset Group 1", paused): it bought all 188 clicks of 2026-09-17 to 2026-09-29 (18,423 impressions, £12.12, £0.064 a click, typical of low-intent Display and YouTube placements), and "maximise conversions" had no conversion signal because GA4 sees about 2% of paid clicks (ADS2). The reasoned proposal for the search phrases, targeting and bidding, with its method, is `../private.diyaccounting.co.uk/PLAN_PAID_GOOGLE_SEARCH.md`. Start when GA4 (or the first-party beacon, OADS2 option A) attributes paid traffic, or on the proposal alone; needs the account verified (OADS1). | Operator, 2026-09-30; `../private.diyaccounting.co.uk/PLAN_PAID_GOOGLE_SEARCH.md` | M | Revenue. Paid search is the lever the dashboard's budget (BACKLOG 52m) spends; a campaign that converts under £1 pays for itself at 99p a month within two months of a subscription. |

## Tier 3: autonomy (ongoing workstream)

| # | Item | Source | Effort | Value |
|---|---|---|---|---|
| 43 | **Due from 2026-10-02** (the first monthly renewal of the 2026-09-02 subscription, then the September bill). Cost optimisation, remainder after `../private.diyaccounting.co.uk/engineering/submit/archive/PLAN_COST_OPTIMISATION.md`: confirm the next real renewal refreshes tokens (`subscription-renewed` published); September's submit-prod bill totaled $449.07, $384.30 above the $64.77 target, with top three services S3 $122.21, CloudWatch $92.50, CloudFront $89.74; and the GCP billing account holding the GA4 export (budget alert set 2026-08-31). Feeds row 30. | Operator; `PLAN_ONE_STOP_DASHBOARD.md` (cost panel) | S | Hygiene. Closes the loop on the plan's numbers. |
| 30 | Cut the alarms and canary runs the audit shows are dead weight. The triage chain and the hourly remedy closer (`alarm-remedy-close.yml`) run; the PR #147 resolver change waits on the next real alarm. The only open alarm issue is #420 (RUM CLS p75), fixed in PR #424. | Cost analysis; `../private.diyaccounting.co.uk/engineering/submit/archive/PLAN_ALARM_CONSOLIDATION.md`; `PLAN_ONE_STOP_DASHBOARD.md` | M | Hygiene. Largest recurring CloudWatch line after the composite consolidation. |
| 48 | **Due the week of 2026-11-29.** Manual `certbot renew`: run `aws sso login --sso-session diyaccounting` first, command in `_developers/SETUP.md`. The weekly launchd renew agent is wired, but both AWS profiles it needs are SSO-backed and cannot refresh unattended | Certbot setup; runbook task P in `../private.diyaccounting.co.uk/operator/NEXT_OPERATOR_RUNBOOK.md` | S | Hygiene. The local dev certificate lapses without it; date-gated, operator session needed. |
| 32a | Ask SDST to update DIY Accounting Submit's entry on HMRC's software-choices listing so it shows viewing liabilities, payments and penalties as well as obligations and returns. Optional: the production credentials already cover the whole VAT (MTD) API, so this is a listing edit, not an approval. One email from antony@diyaccounting.co.uk to `SDSTeam@hmrc.gov.uk`, separate from row 75's. | Issue #19; `PLAN_ITSA_PHASE_2.md` 32a | S | Revenue, minor. The listing is where HMRC sends people looking for software. Operator. |
| 49 | Infrastructure as code for Google Cloud and GA4. On main and applied by `google-apply.yml`: the `diyaccounting-ga4` project's APIs, IAM and billing budget, the service account with workload identity federation in place of a key, the API keys, the GA4 properties, streams and BigQuery links, and the YouTube channel handle. Remaining: ci's BigQuery link as a `[property.bigquery_link]` block (NEXT.md B30z, PR #424), and the OAuth consent screen and clients, which the operator creates in the console and records in `infra/google/gcp/oauth.toml` (its checker verifies the brand, the sign-in client id and the granted scopes; redirect URIs stay a maintained record). | Operator, 2026-09-06; `PLAN_ONE_STOP_DASHBOARD.md` | M | Autonomy. Every Google change today is the operator copying generated ids between console tabs; that is error-prone and the operator does not want to do any of it. |
| 52 | The one-stop dashboard (`PLAN_ONE_STOP_DASHBOARD.md`): the lake views, GA4 aggregates, security, compliance, retention, operator-effort and cost panels, the raw export and the operator page are on main and fill as the nightly jobs run. Open: 52l, 52i and 52m below, and ci's GA4 export dataset (NEXT.md B30z, PR #424). | Operator, 2026-09-07 notebook; `PLAN_ONE_STOP_DASHBOARD.md` | L | Autonomy. Replaces the operator reading five consoles; the accounts panel is the finance plan's payoff. |
| 52l | A notebook over the raw export computing the per-block correlations, fitting the block models (linear cost, log-linear funnels, Hill curves for spend), ranking levers by effect per unit cost and proposing the next experiment with its predicted effect and interval; Bayesian optimisation for the continuous knobs and a Thompson-sampling bandit for allocations once experiments exist; one line per objective on the dashboard page. Two chunks: the model design as a section of the plan (Opus), then the notebook and the page line (Sonnet). **Owner**: Claude Code. **Size**: ~3 files. Starts from 2026-12-10, when three months of the raw export under `exports/prod/` exist (first night 2026-09-10); check with `aws --profile submit-prod s3 ls s3://prod-env-analytics-lake-972912397388/exports/prod/`. The Athena database is `prod_env_analytics`, the workgroup `prod-env-analytics`. | `PLAN_ONE_STOP_DASHBOARD.md` D16 | L | Insight. The point of the dashboard: which lever to pull next. Opus for the models, Sonnet for the notebook. |
| 52i | The company P&L and balance sheet on the dashboard page: the company's diya-gl book saved to the DIYA cloud by phase 2 of `../private.diyaccounting.co.uk/finance/PLAN_FINANCE_AUTOMATION.md`, derived nightly with the Ltd engine through `PLAN_SUBMISSION_MCP.md` M1 and M3, rendered above the eight objectives beside the last set filed at Companies House. Blocked on the finance plan's phases 1 and 2 and on M3 (NEXT.md B52i). | Operator, 2026-09-07; `PLAN_ONE_STOP_DASHBOARD.md` D10 | M | Autonomy. The finance plan's payoff on the page. |
| 54 | Require signed commits on `main` with GitHub's `required_signatures` rule on ruleset 16057564, which today carries `deletion`, `non_fast_forward` and `required_status_checks`. Before the rule: (1) `publish.yml`'s version bump and `agentic-lib-board.yml`'s write-back commit through GitHub's contents API as the app (commits made through the API are signed by GitHub and attributed to the app), instead of `git push` from the runner; (2) `alarm-triage.yml` and `agentic-lib-code.yml` open their PRs the same way, or keep `git push` to a branch, which the rule does not gate; (3) every session that pushes docs to `main` signs: this machine does, Cowork's VM and other machines need the key configured or must go through a PR; (4) then add the rule with the app as the sole bypass actor and remove the `github-actions[bot]` exception from `verify-commit-signatures.yml`. Until then the required status checks on the ruleset are the guard. | Operator, 2026-09-15; `PLAN_REPOSITORY_AUTOMATION.md` (commit signature verification) | M | Trust. The auto-merge policies in `PLAN_REPOSITORY_AUTOMATION.md` rest on every commit on `main` being attributable; the status check gates PRs only. |
| 52m | Trailing income, reserve, budget, return per pound and payback on the page; the reinvestment fraction as a lever with the reserve floor the operator names; paid traffic and article boosts as experiment rows with on-off or geographic controls; GA4 conversion import from the Ads account. **Owner**: Claude Code, with the operator's fraction and floor. **Model**: Sonnet. **Size**: ~3 files. Blocked on 52l's fitted models and on the cost panel carrying revenue (from 2026-10-02, row 43). The operator's settings: the fraction is 20% of trailing income, the reserve floor £2,000, one experiment takes at most 10% of the budget unless the operator names a larger share, and the trailing window is 30 days; the Ads account is code (`infra/google/ads/ads.toml`, customer `8142685080`). | Operator, 2026-09-07; `PLAN_ONE_STOP_DASHBOARD.md` D17 | M | Revenue. The loop that turns income into growth; the operator sets the fraction and the floor. |
| 34e | FRS 102 section 1A small-company accounts through the XML Gateway: the same envelope as the micro-entity accounts filing with the wider tag set and a directors' report. Undesigned; needs a design row (Opus) before any build. | `PLAN_COMPANIES_HOUSE.md` Horizons | M | Revenue. The next company size up from micro-entity, the same filing path. |
| 34f | Dormant company accounts (DCA) through the XML Gateway: the narrower case with its own rules in the accounts technical interface specification. Undesigned; needs a design row (Opus) before any build. | `PLAN_COMPANIES_HOUSE.md` Horizons | S | Revenue. The simplest accounts filing, a frequent one for one-person companies. |
| 34g | Pairing the accounts filing with a CT600 to HMRC, so one balance sheet serves both filings; the combination customers asked about when the joint filing service closed. Undesigned; needs a design row (Opus) before any build. | `PLAN_COMPANIES_HOUSE.md` Horizons | L | Revenue. The joint filing customers lost when HMRC and Companies House closed theirs. |
| OCH1 | A Companies House sandbox user for the opt-in ci filing suites (`runCompaniesHouseSandboxFiling=true` in `deploy.yml` and `probe-test.yml`, which sign in on `https://identity-sandbox.company-information.service.gov.uk`). When the sandbox identity site is up: create a throwaway account (own email, password, authenticator; keep the base32 key); on GitHub's `ci` environment set variable `TEST_COMPANIES_HOUSE_USER_ID` and secrets `TEST_COMPANIES_HOUSE_PASSWORD`, `TEST_COMPANIES_HOUSE_TOTP_SECRET`, `COMPANIES_HOUSE_SANDBOX_API_KEY`. Nothing on NEXT.md waits on it: the Companies House videos record on the simulator and the suites are off by default. | Run 36340607940; `PLAN_COMPANIES_HOUSE.md` OCH1 | S | Trust. Re-proves the two REST filings against Companies House's sandbox from ci. Operator. |

## Why this order

Tier 1 holds what starts next; it is empty while `NEXT.md` carries the refined rows.

Tier 2 is the income engine. The ITSA bet leads (10, 11) because its lead time is external: HMRC's recognition. Companies House filing (34) runs beside it and waits on Companies House IT.

Tier 3 converts operator hours into agent hours, which is the stated aim of the whole service. It runs continuously. Date gates order it: 43 from 2026-10-02, 48 the week of 2026-11-29, 52l from 2026-12-10, with 52m after 52l. The HMRC listing emails (32a, 75) and the Companies House rows 34e to 34g and OCH1 sit here until an operator step or a design row starts them.


Within a tier, a small item outranks a large one of the same value class.
