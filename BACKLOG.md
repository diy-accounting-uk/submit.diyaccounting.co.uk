# Unified Backlog

Compiled 2026-08-25 from every source: GitHub issues (#3 to #20), local plan docs (repo root and `_developers/`), customer and HMRC emails, CI signals, live AWS audit, cost analysis, the market survey, and the strategic review in [STRATEGY.md](STRATEGY.md). Sibling-repo items are marked with their repo.

**How items are valued.** Each item gets a value class and a one-line reason:

- **Existential**: losing this loses customers' data or the HMRC relationship. Price is irrelevant; it outranks everything.
- **Revenue**: directly moves paying-subscriber count or unlocks a priced tier.
- **Insight**: makes the business measurable. Ranked high because every growth decision downstream depends on it.
- **Trust**: makes monitoring and alerts truthful. Cheap items here rank high because false alarms train us to ignore real ones.
- **Autonomy**: removes recurring operator effort. Valued by hours saved per month.
- **Hygiene**: correctness and cost cleanups. Ranked by cost or risk removed per unit effort.

**How items are ranked.** Existential first when cheap relative to the risk. Then items that make everything else measurable or truthful, because they compound. Then the revenue path in dependency order. Effort tiebreaks: a small item with the same value class outranks a large one. [DE] marks items in the data engineering layer, with the certification domain they exercise.

## Live status (updated 2026-09-05)

Queued and in-flight state lives on `NEXT.md`; this block mirrors it so the backlog reads
truthfully on its own. Operator-only steps are briefed for Claude Cowork in
`../BRIEF_OPERATOR_TASKS_2026-09-04.md` at the workspace root.

- **PR #118** merged and deployed to prod (prod-cea27f8) on 2026-09-05 with its three
  migrations run: videos, probe schedule, alarm cuts, the mode rename, the ci pipeline fixes, the
  Companies House lookup. Two of its items wait on a later event to verify (B32.4, B30d).
- **PR #132** merged 2026-09-05: Google roles, GA4 property sync and the GCP billing assert as
  code (the stray project is gone and the budget stands), the first ITSA endpoint (B10.1, whose
  prod recording remains), deploy.yml running every suite, and the Companies House authorizer
  fix. No integration branch is open; the next one starts from main.
- **Tier 1 = `NEXT.md`**: every Tier 1 row below is refined on `NEXT.md` into items with
  source, owner and model. 27c waits in Tier 3 on the ICO register's certificate search. The GA4 `purchase` residuals (G2b as O1b–O1e, G2c, G3) are on
  `NEXT.md` only; they have no backlog row.
- **Date-gated (Tier 3)**: 47 due 2026-09-06/07 (O9); 43 due from 2026-10-02 (GCP part is
  B43a); 48 due the week of 2026-11-29.
- **Tier 2**: 10's first endpoint is merged (B10.1 remainder on NEXT.md); 11a moved here on the operator's decision of 2026-09-05
  to build against HMRC's test APIs first; 34 is B34.1 and B34.3a on `NEXT.md` with the XML Gateway half parked as 34b; 40d is B40d.2.

## Tier 1: do next

Refined items live on `NEXT.md` under the labels in the second column.

| # | NEXT.md items | Item | Source | Effort | Value |
|---|---|---|---|---|---|
| 32 | B32.4 (deployed; next scheduled probe run) | Optional VAT endpoints: liabilities, payments, penalties are merged and verified on the real sandbox (2026-09-04); add the suites to the 4-hourly schedule | Issue #19, vat-api-operations | S | Revenue, minor. Completes the listed feature set. |
| 30 | B30d (deployed; next alarm), B30f and O10 (operator) | Cut the alarms and canary runs the audit shows are dead weight | Cost analysis; PLAN_ALARM_CONSOLIDATION | M | Hygiene. Largest recurring CloudWatch line after the composite consolidation. |
| 17a | B17a.3 (prod recording), B17a.5 | Demo videos: a human-audience Playwright capture pattern (spike), one video per journey, then publish. Channel: https://www.youtube.com/@DIYAccountingSubmit | Operator directive 2026-08-26, reversed 2026-09-04 | M | Revenue. A usable walkthrough of the real product. |

## Tier 2: revenue path (start now, runs weeks to months)

Each row names what has to happen before it can start.

| # | Item | Source | Effort | Value |
|---|---|---|---|---|
| 10 | ITSA build, phase 1: sandbox integration with self-employment quarterly update APIs (Business Details, Obligations, SE Business). **In flight**: the spike passed 2026-09-05 (`_developers/hmrc/ITSA_SPIKE.md`) and the first endpoint, Business Details list, is NEXT.md B10.1; the rest splits into one item per endpoint the way B32 did, against the paths the spike lists (the design doc's paths are for an older API version). | Issues #16, #20; strategy | L | Revenue. The strategic bet. Voluntary sign-up is open now and HMRC auto-enrolment starts September 2026. |
| 11 | ITSA build, phase 2: annual summaries, final declaration, then the ITSA recognition application and finder listing. **Ready when** phase 1 files a quarterly update in the sandbox; the recognition questionnaire and HMRC's production-window answer (11a) come after that, by operator decision. | Strategy | L | Revenue. The recognition lead time is HMRC's; starting early is the only control we have over April 2027. |
| 11a | ITSA recognition questionnaire from SDST, and HMRC's answer on a 2027-28 production window. **Parked by operator decision 2026-09-05**: build against the test APIs and have something running before making the case; the two emails to HMRC then go out together. | Split from #11 | S | Revenue. The standards decide what #10 has to contain. |
| 34 | Refined 2026-09-04 as NEXT.md B34.1 (lookup), B34.2 (accreditation, operator) and B34.3 (filing). Companies House / limited company filing. No code exists; `plans/issues/PLAN_ISSUE_15_limited_company_endpoints.md` splits it into read-only company lookup (public API key, no accreditation) and accounts filing (Companies House software-filing accreditation, weeks of lead time). **Ready when** the operator decides two things: whether the read-only lookup alone is worth shipping first, and whether to apply for filing accreditation now (an operator application) so the filing half has a date. With those, the lookup half is a Sonnet-sized item. | Issue #15 | L | Revenue. Real demand signal (customers asked when the joint service closed); promoted by the operator 2026-08-31 to sit alongside ITSA rather than behind it. |
| 34b | Companies House accounts filing through the XML Gateway (iXBRL in an XML envelope, FRS 105 micro-entity first). Presenter account issued 2026-09-05 (ID E0000052288, code in the operator's credentials store); test presenter credentials and the accounts specification requested from xml@companieshouse.gov.uk on 2026-09-05, chase 2026-09-21. **Ready when** the credentials arrive; then an Opus design pass and a Sonnet build, with the code reaching the build as a GitHub environment secret. | Issue #15; Cowork research 2026-09-05 | L | Revenue. The April 2027 software-only mandate is paused with no new date, so this is a lead-time bet, not a deadline. |
| 40d | Decided 2026-09-04: rename the modes to `synthetic`, NEXT.md B40d.2. Mode-naming cleanup. The three names are two things: `hmrcAccount` = `sandbox`/`live` (HMRC routing, set in `web/public/developer-mode.js`) and Stripe's `test` flag, which `billingWebhookPost.js:142` folds into the same `qualifiers.sandbox` field; UI copy says "sandbox (test)". "Synthetic" already means synthetic monitoring (`synthetic-test.yml`, synthetic-traffic filters in the detectors and analytics), so renaming the modes to it would collide. **Ready when** the operator picks the target: keep `sandbox`/`live` for HMRC and give the Stripe flag its own name (recommended, smallest change), or rename the modes to `synthetic` and rename the monitoring vocabulary to something else. | Issue #12 (closed; the rename is still open) | S | Hygiene. One name per concept. |

## Tier 3: autonomy (ongoing workstream)

| # | Item | Source | Effort | Value |
|---|---|---|---|---|
| 21a | Classify the last six months of support mail into categories and count how many replies come from a template | Split from #21 | S | Autonomy. Tells us how much of the support load drafting can actually take, and names the categories to cover first. If most threads are one-offs, #21 shrinks. |
| 22 | Parse the monthly HMRC fraud-prevention-header email; alert only on "advisories" or zero-traffic months | HMRC compliance emails | S | Autonomy. A standing legal obligation becomes a silent check that only speaks when action is needed. |
| 24 | Respond to HMRC Assist for VAT engagement (delivery April 2027) | HMRC email 2026-01-08 | S | Revenue. Early input shapes an integration we will need anyway. |
| 23 | Emails-to-articles content pipeline (14 years of support answers into SEO pages) | PLAN_EMAILS_TO_ARTICLES | L | Revenue/Autonomy [DE: text ETL]. Organic acquisition from an asset nobody else has; runs unattended once built. |
| 23a | Take a sample of about 50 support threads from the existing mailbox mirror, hand-classify them, and list the first ten article topics | Split from #23 | S | Revenue. Says whether 14 years of mail really contains articles before an L build assumes it does, and the topic list is useful on its own for the first hand-written pages. |
| 16 | Tighten spreadsheet-to-Submit pairing: file a VAT return from a DIY spreadsheet without re-keying (CSV/digital-link import). The spreadsheets-side export half is tracked in the spreadsheets repo NEXT.md | Market survey positioning | M | Revenue. Our one edge bridging-only rivals cannot copy. Also the MTD digital-links story HMRC wants. |
| 16a | Define the CSV contract: column names and their mapping to the nine VAT boxes, published as a fixture both repos test against | Split from #16 | S | Revenue. The interface spans two repos, so it is the part that cannot be changed cheaply later. Submit has an export path today and no import path, so the contract has to be written before either side builds. |
| 40b | Work the PLAN_REDUCE simplification items | PLAN_REDUCE | S/M | Hygiene. Standing simplification list; behavior-neutral. Good sub-agent filler. |
| 40c | Refresh the TODO inventory: re-scan the tree, drop entries that no longer exist, add new ones | TODO_INVENTORY | S | Hygiene. The inventory only steers work while it matches the code. Good sub-agent filler. |
| 43 | **GCP part is NEXT.md B43a (automated after O1a); renewal and bill checks due from 2026-10-02.** **Due: GCP part now; renewal and bill checks from 2026-10-02 (first monthly renewal of the 2026-09-02 subscription, then the September bill).** Cost optimisation, remainder after `PLAN_COST_OPTIMISATION.md` (all four cuts and the `invoice.paid` fix live in prod since 2026-09-02): confirm the next real renewal refreshes tokens (`subscription-renewed` published); a monthly check that the bill moved the way the plan predicted (steady-state target $64.77/month before VAT); and the GCP billing account holding the GA4 export (budget alert set 2026-08-31, effectiveness unconfirmed; the stray auto-created project `valued-context-507200-m9` needs confirming empty and deleting). Feeds and is fed by #30. | Operator, this session; Cowork 2026-08-31 | S | Hygiene. Closes the loop on the plan's numbers. |
| 47 | **NEXT.md O9.** **Due 2026-09-06 (codeql) and 2026-09-07 (weekly crons).** Confirm the weekly `compliance` and `stack-drift` crons fire on their own on Monday 2026-09-07 06:00 UTC (both revival runs are green); watch `codeql` on 2026-09-06 and revive it the same way if it misses again | Schedule revival, 2026-08-31 | S | Hygiene. A schedule that only runs when poked is not a schedule; one self-fire closes it. |
| 27c | **Ready when** the ICO register's certificate search works again (the ICO posted an error notice on the site, 2026-09-05). Replace the year-old ICO certificate PDF in the repo root with the current one (registration ZB070902, expiry 2027-05-23; the certificate sits behind the fee-payer login), same filename, commit | Split from #27 | S | Trust. The data-protection half of the same commitments. |
| 48 | **Due the week of 2026-11-29.** Manual `certbot renew`: run `aws sso login --sso-session diyaccounting` first, command in `_developers/SETUP.md`. The weekly launchd renew agent is wired, but both AWS profiles it needs are SSO-backed and cannot refresh unattended | Certbot setup | S | Hygiene. The local dev certificate lapses without it; date-gated, operator session needed. |

## Tier 4: hardening and compliance

| # | Item | Source | Effort | Value |
|---|---|---|---|---|
| 15 | Referral and campaign pass system (specced, zero code; prerequisite met) | PLAN_CAMPAIGN_AND_REFERRALS | M | Revenue. The only designed acquisition mechanism beyond the HMRC listing. After #7, its effect is measurable. |
| 27a | External pen test: get quotes, book it, name the designated responsible individual | Split from #27 | S | Trust. External lead time and a budget decision. The automated WCAG and ZAP scans already exist and pass. |
| 33 | CDK migration from Java to TypeScript. Approved. Sequence: backups and a proven restore first (#2, #25), then full CI and prod teardown of the Java-deployed stacks, then fresh TypeScript deploy and data restore | Operator decision, this session | L | Hygiene, committed. Unifies the repo on one language and shares constants app-to-infra (the canary route bug lived in that duplication). The teardown-and-restore path avoids logical-ID surgery entirely and doubles as the first real DR drill. |
| 33a | Rewrite one leaf stack in TypeScript, synthesise it, and diff the template against the Java synth | Split from #33 | S | Hygiene. Nineteen stack classes is a large commitment on an untested assumption. One stack says how faithful the rewrite is and how long the other eighteen will take, without touching a deployment. |
| 36 | Social IdPs: Apple, Microsoft | Issue #14 | L | Revenue, marginal. No evidence login choice is losing users; revisit when funnel data (#13) exists. |
| 37 | Merch (#17): simple storefront link version only | Issue #17 | S | Revenue, negligible. Do the link version if ever; skip the integrated build. |
| 39 | Multi-URL Lighthouse (#13); synthetic-test flakiness (first item: NEXT.md B39.1, the upload-results job) | Issue #13, CI audit | M | Hygiene. Quality gates; not blocking anything today. |
| 41 | Doc hygiene: archive the two stale "in progress" plans that shipped, fix the dangling NEXT.md reference, close out PLAN_FLAGGED | Repo review | S | Hygiene. Stale plans mislead every future session. |
| 46 | Stop the corpus index returning plaintext credentials in search excerpts: `drive/marketing/facebook.txt` came back with a live login verbatim, and two detection passes missed it (enumeration 2026-08-28, keyword scan 2026-08-31) because the file is just an address, a name and a password with no keywords around them. Enumeration is the wrong shape of fix — replace the enumerated exclude list in `index/corpus.toml` (workspace level) with directory-level exclusions covering `facilities/**`, `technology/**` and the service-named notes under `marketing/**`, then purge and re-index. | Cowork, 2026-08-31 | S | Trust. Live credentials in search results; matters more if the directors' assistant ever ships. |



## Why this order

Items 1 to 9 are cheap and either stop data loss, stop lies from monitoring, or stop customer-facing wrongness in the core journey. Nothing strategic can be trusted until they land, and all nine together are days, not weeks.

Items 10 to 19 are the income engine in dependency order: the ITSA bet first because its lead time is external (HMRC recognition), the pricing catalogue and measurement pipeline alongside because subscribers and their behaviour must be visible before growth spend (referrals, videos, pairing) can be judged.

Tier 3 converts operator hours into agent hours, which is the stated aim of the whole service; it runs continuously rather than completing. Tier 4 holds hardening and the genuinely opportunistic items — real risk reduction that mostly waits on Tier 1 outcomes, and work picked up when it fits.

One cross-tier chain is now fixed by operator decision: #2 (PITR and backup fix) then #25 (cross-account vault and a proven restore) then #33 (teardown CI and prod, redeploy on TypeScript CDK, restore data). Backups stop being insurance and become the migration's enabling step.
