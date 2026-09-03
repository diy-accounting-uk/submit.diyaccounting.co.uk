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

## Live status (updated 2026-09-03)

Queued and in-flight state lives on `NEXT.md`; this block mirrors it so the backlog reads
truthfully on its own.

- **In flight**: nothing.
- **Tier 1 = `NEXT.md`**: every Tier 1 row below is refined on `NEXT.md` into sub-agent-sized
  items with source, owner (Operator or Claude Code) and model. The GA4 `purchase` residuals
  (G1–G3) are on `NEXT.md` only; they have no backlog row.
- **Date-gated (Tier 3)**: 47 due 2026-09-06/07; 43 due from 2026-10-02 (GCP part now); 48 due the week of 2026-11-29.
- **Blocked in Tier 2**: 10 and 11 wait on the 10a spike; 34 and 40d wait on operator decisions
  named in their rows.

## Tier 1: do next

Refined items live on `NEXT.md` under the labels in the second column.

| # | NEXT.md items | Item | Source | Effort | Value |
|---|---|---|---|---|---|
| 10a | B10a.1–3 | ITSA spike: make the test-user workflow honour `mtd-income-tax` (it silently ignores the input today), subscribe the sandbox app to the ITSA APIs, make one read-only Business Details call through our OAuth and fraud headers | Split from #10 | S | Revenue. Everything in #10 is guesswork until a sandbox call returns. |
| 11a | B11a.1–2 | Map HMRC's ITSA minimum functionality standards and recognition questionnaire against phases 1 and 2 | Split from #11 | S | Revenue. The standards decide what #10 has to contain. |
| 12 | B12a–c | Catalogue: `day-guest` is already the strategy's day pass (one per user, cap 100, P1D, 3 tokens) and only needs the name; add `resident-itsa`; operator creates its Stripe prices | Operator decision; STRATEGY.md | S | Revenue. The pricing model the strategy commits to. |
| 32b | B32b | Activity-level gating on the obligations and view-return endpoints (`requireActivity()` was specced, never built; both call `enforceBundles` only) | Split from #32 | S | Trust. Two live read endpoints with bundle-only checks. |
| 32 | B32.1–3 | Optional VAT endpoints: liabilities, payments, penalties. Demand signal 2026-08-06→31: obligations 616 calls / 208 users, view-return 199 / 122 | Issue #19, vat-api-operations | M | Revenue, minor. Completes the listed feature set. |
| 27d | B27d | Text-spacing (WCAG 1.4.12) clipping regression on all 24 pages | Found during the 44 final gate | S | Trust. A live accessibility regression on every page. |
| 27b | B27b.1–3 | WCAG 2.2 AA audit: automated scans, manual review of the six 2.2 criteria, statement refresh | Split from #27 | M | Trust. HMRC questionnaire commitments; ITSA recognition will re-ask. |
| 27c | B27c.1–2 | ICO checklist and breach template; operator confirms the ICO registration | Split from #27 | S | Trust. The data-protection half of the same commitments. |
| 40e | B40e | Port the two friendly-error branches the dead `submitVat` copy holds, then delete it | Repo find, fixing B6 | S | Hygiene, plus two error messages users never see today. |
| 40a | B40a | Per-run ports for local behaviour tests | Demo-videos agent, batch 2 | S | Hygiene. Parallel agent runs kill each other's servers. |
| 30 | B30a–b | Alarm history audit of the 151 `check-*` alarms and the 15 async extras, then cut and fold; canary cadence against the synthetic cron | Cost analysis; PLAN_ALARM_CONSOLIDATION | M | Hygiene. Largest recurring CloudWatch line after the composite consolidation. |
| 32a | B32a.1–2 | Pipeline profile (ci 23 min, prod 61 min on 2026-09-02), then the three largest cuts | Operator, 2026-09-02 | M | Hygiene, compounding. Every iteration pays this tax. |
| 17a | B17a | Demo videos: redo and publish. Operator-owned; Claude Code excluded by directive 2026-08-26. Channel: https://www.youtube.com/@DIYAccountingSubmit | Operator directive 2026-08-26 | M | Revenue. A usable walkthrough of the real product. |

## Tier 2: revenue path (start now, runs weeks to months)

Each row names what has to happen before it can start.

| # | Item | Source | Effort | Value |
|---|---|---|---|---|
| 10 | ITSA build, phase 1: sandbox integration with self-employment quarterly update APIs (Business Details, Obligations, SE Business). **Ready when** B10a.3's spike report exists (the OAuth scope, application and fraud-header assumptions confirmed against the sandbox) and B11a.1 says which endpoints the minimum standards require, so the phase can be split into one item per endpoint the way B32 is. Design doc: `_developers/backlog/self-employed-api-operations.md`; issue #16 lists nine endpoints and acceptance criteria. | Issues #16, #20; strategy | L | Revenue. The strategic bet. Voluntary sign-up is open now and HMRC auto-enrolment starts September 2026. |
| 11 | ITSA build, phase 2: annual summaries, final declaration, then the ITSA recognition application and finder listing. **Ready when** phase 1 files a quarterly update in the sandbox and B11a.2's questionnaire is in hand; the recognition application itself is an operator submission. | Strategy | L | Revenue. The recognition lead time is HMRC's; starting early is the only control we have over April 2027. |
| 34 | Companies House / limited company filing. No code exists; `plans/issues/PLAN_ISSUE_15_limited_company_endpoints.md` splits it into read-only company lookup (public API key, no accreditation) and accounts filing (Companies House software-filing accreditation, weeks of lead time). **Ready when** the operator decides two things: whether the read-only lookup alone is worth shipping first, and whether to apply for filing accreditation now (an operator application) so the filing half has a date. With those, the lookup half is a Sonnet-sized item. | Issue #15 | L | Revenue. Real demand signal (customers asked when the joint service closed); promoted by the operator 2026-08-31 to sit alongside ITSA rather than behind it. |
| 40d | Mode-naming cleanup. The three names are two things: `hmrcAccount` = `sandbox`/`live` (HMRC routing, set in `web/public/developer-mode.js`) and Stripe's `test` flag, which `billingWebhookPost.js:142` folds into the same `qualifiers.sandbox` field; UI copy says "sandbox (test)". "Synthetic" already means synthetic monitoring (`synthetic-test.yml`, synthetic-traffic filters in the detectors and analytics), so renaming the modes to it would collide. **Ready when** the operator picks the target: keep `sandbox`/`live` for HMRC and give the Stripe flag its own name (recommended, smallest change), or rename the modes to `synthetic` and rename the monitoring vocabulary to something else. | Issue #12 (closed; the rename is still open) | S | Hygiene. One name per concept. |

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
| 43 | **Due: GCP part now; renewal and bill checks from 2026-10-02 (first monthly renewal of the 2026-09-02 subscription, then the September bill).** Cost optimisation, remainder after `PLAN_COST_OPTIMISATION.md` (all four cuts and the `invoice.paid` fix live in prod since 2026-09-02): confirm the next real renewal refreshes tokens (`subscription-renewed` published); a monthly check that the bill moved the way the plan predicted (steady-state target $64.77/month before VAT); and the GCP billing account holding the GA4 export (budget alert set 2026-08-31, effectiveness unconfirmed; the stray auto-created project `valued-context-507200-m9` needs confirming empty and deleting). Feeds and is fed by #30. | Operator, this session; Cowork 2026-08-31 | S | Hygiene. Closes the loop on the plan's numbers. |
| 47 | **Due 2026-09-06 (codeql) and 2026-09-07 (weekly crons).** Confirm the weekly `compliance` and `stack-drift` crons fire on their own on Monday 2026-09-07 06:00 UTC (both revival runs are green); watch `codeql` on 2026-09-06 and revive it the same way if it misses again | Schedule revival, 2026-08-31 | S | Hygiene. A schedule that only runs when poked is not a schedule; one self-fire closes it. |
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
| 39 | Multi-URL Lighthouse (#13); synthetic-test flakiness | Issue #13, CI audit | M | Hygiene. Quality gates; not blocking anything today. |
| 41 | Doc hygiene: archive the two stale "in progress" plans that shipped, fix the dangling NEXT.md reference, close out PLAN_FLAGGED | Repo review | S | Hygiene. Stale plans mislead every future session. |
| 46 | Stop the corpus index returning plaintext credentials in search excerpts: `drive/marketing/facebook.txt` came back with a live login verbatim, and two detection passes missed it (enumeration 2026-08-28, keyword scan 2026-08-31) because the file is just an address, a name and a password with no keywords around them. Enumeration is the wrong shape of fix — replace the enumerated exclude list in `index/corpus.toml` (workspace level) with directory-level exclusions covering `facilities/**`, `technology/**` and the service-named notes under `marketing/**`, then purge and re-index. | Cowork, 2026-08-31 | S | Trust. Live credentials in search results; matters more if the directors' assistant ever ships. |



## Why this order

Items 1 to 9 are cheap and either stop data loss, stop lies from monitoring, or stop customer-facing wrongness in the core journey. Nothing strategic can be trusted until they land, and all nine together are days, not weeks.

Items 10 to 19 are the income engine in dependency order: the ITSA bet first because its lead time is external (HMRC recognition), the pricing catalogue and measurement pipeline alongside because subscribers and their behaviour must be visible before growth spend (referrals, videos, pairing) can be judged.

Tier 3 converts operator hours into agent hours, which is the stated aim of the whole service; it runs continuously rather than completing. Tier 4 holds hardening and the genuinely opportunistic items — real risk reduction that mostly waits on Tier 1 outcomes, and work picked up when it fits.

One cross-tier chain is now fixed by operator decision: #2 (PITR and backup fix) then #25 (cross-account vault and a proven restore) then #33 (teardown CI and prod, redeploy on TypeScript CDK, restore data). Backups stop being insurance and become the migration's enabling step.
