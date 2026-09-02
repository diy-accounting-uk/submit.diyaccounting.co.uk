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

## Live status (updated 2026-09-02)

Queued and in-flight state lives on `NEXT.md`; this block mirrors it so the backlog reads
truthfully on its own.

- **In flight**: 43 (cost optimisation): analysis only, `PLAN_COST_OPTIMISATION.md` for
  operator review before any change.
- **Closed 2026-09-01/02, dropped from Tier 1**: 14 (scheduled ingestion: all six phases
  live in ci and prod; a real live payment on 2026-09-02 reached Athena as
  `activity_activations = 1` within 15 minutes), 20/20a (ops alerting, alarm→issue path
  proven live in ci: creates on first ALARM, comments not duplicates on the next), 25
  (cross-account backups: `submit-backup` stacks deployed, `restore-test.yml` succeeded),
  28 (scan and data-theft detection: both stacks live in ci and prod, burst detector fired
  once at threshold in a real ci test).
- **Verification remainders on NEXT.md**: the weekly-cron self-fire proofs and a first
  `purchase` event.
- **Operator-bound**: 17a (demo-video redo — Claude Code excluded by operator directive).
- **Next candidates**: the 10a spike when the operator says go.

## Tier 1: do next

| # | Item | Source | Effort | Value |
|---|---|---|---|---|
| 43 | Cost optimisation, entry point changed 2026-09-01: AWS Budgets already exist per-account plus org-wide (not new — pre-dating this item), with real actual/forecast data flowing, and two are already over forecast: `submit-prod` ($152.69 forecast vs $120 limit) and the org total ($261.14 vs $200). Start by explaining those two, not a blind six-account sweep. `submit-prod`'s cause is confirmed: this session's own merge cadence (5 code merges to main in ~2 hours) each auto-triggered a full prod deployment with no teardown of the previous one — 3 live duplicate `prod-*-app-*` stack sets accumulated within 2 hours, CloudFront stuck pointing at the oldest because the later deploys' cutover step hit a CloudFront API rate limit (observed directly, 2026-09-01). The org total's cause is partly confirmed: the spreadsheets account's Cost Explorer shows "Claude Opus 5 (Amazon Bedrock Edition)" at $43.25 for August, the single largest line in that account by a wide margin — an LLM-as-judge cost, not AWS infrastructure; out of this repo's lane to fix, but real. Once those two are addressed, the rest of the original scope still stands: Cost Explorer per account and service, right-sizing, storage classes and lifecycle rules, orphaned resources (us-east-1 log groups and images have recurred), data-transfer lines, a monthly check that the bill moved the way predicted, and the GCP billing account holding the GA4 export (budget alert set 2026-08-31, effectiveness not yet confirmed — `gcloud`'s billing API needs an interactive re-login to check; the stray auto-created `My First Project`, `valued-context-507200-m9`, still needs confirming empty and deleting). Feeds and is fed by #30 (alarms are the known largest CloudWatch line). Also feeds a process lesson for future coordinator sessions: batch merges to main into one push at the end of a session rather than merging each landed item individually, since every code push to main is a real prod deployment with no automatic teardown. | Operator, this session; Cowork 2026-08-31 | M | Hygiene, compounding. Nobody had reviewed the whole bill against what runs; the budget telemetry already existed but nothing was reading it — two accounts are over-forecast right now with a known, confirmed cause each. |

## Tier 2: revenue path (start now, runs weeks to months)

| # | Item | Source | Effort | Value |
|---|---|---|---|---|
| 10 | ITSA build, phase 1: sandbox integration with self-employment quarterly update APIs (Business Details, Obligations, SE Business) | Issues #16, #20; strategy | L | Revenue. The strategic bet. Voluntary sign-up is open now and HMRC auto-enrolment starts September 2026. |
| 10a | Subscribe the existing HMRC application to the Self Employment Business API, mint a sandbox test user with `mtd-income-tax` (the `create-hmrc-test-user` workflow already offers it), and make one read-only call | Split from #10 | S | Revenue. Proves whether ITSA needs a separate application and whether our OAuth and fraud headers carry over. Everything in #10 is guesswork until a sandbox call returns. |
| 11 | ITSA build, phase 2: annual summaries, final declaration, then the ITSA recognition application and finder listing | Strategy | L | Revenue. The recognition lead time is HMRC's; starting early is the only control we have over April 2027. |
| 11a | Get HMRC's ITSA minimum functionality standards and the recognition questionnaire, then mark each requirement against what phases 1 and 2 plan to build | Split from #11 | S | Revenue. The standards decide what #10 has to contain. Reading them after the build is how you find out you built the wrong thing. |
| 12 | Catalogue restructure: day pass limits (one per user per day, capped daily total), add `resident-itsa`, keep `resident-vat` and `resident-pro` | Operator decision, this session | M | Revenue. The pricing model the strategy commits to. |
| 34 | Companies House / limited company filing | Issue #15 | L | Revenue. Real demand signal (customers asked when the joint service closed); promoted by the operator 2026-08-31 to sit alongside ITSA rather than behind it. |
| 17a | Demo videos: redo properly and publish. The first attempt failed — the capture recorded the simulator rather than the main site, and the cuts are mostly blank and not shareable. Operator-owned: per operator directive 2026-08-26, Claude Code is not to work this item. The channel exists and is ready for good uploads: https://www.youtube.com/@DIYAccountingSubmit | Operator directive 2026-08-26 | M | Revenue. A usable walkthrough of the real product is still worth having; the failed attempt is not it. |
| 32 | Optional VAT endpoints: liabilities, payments, penalties (#19). Demand signal from prod (2026-08-06→31, synthetic traffic included): obligations 616 calls / 208 distinct users, view-return 199 / 122 — the existing read pages are used, so these are worth building | Issue #19, vat-api-operations | M | Revenue, minor. Completes the listed feature set; useful, not urgent. |
| 30 | Alarm-count audit (123 per deployment) and canary cadence review | Cost analysis | M | Hygiene. Largest recurring CloudWatch line; worthwhile after #26 settles what should exist. |
| 32a | Cut pipeline run times: ci deploys hit ~30 minutes, prod ~50 | Operator, this session | M | Hygiene, compounding. Every iteration in every workstream pays this tax. Profile the deploy workflow stages, parallelise stacks, cache Docker/Maven layers, and lean on the existing lean-deploy path for app-only changes. The TypeScript migration (#33) is a chance to rebuild the pipeline shape rather than port it. |
| 32b | Apply the specced `requireActivity()` gating to the obligations and view-return endpoints, and check `prod-env-hmrc-api-requests` for whether anyone uses them | Split from #32 (32a is an unrelated item) | S | Trust, then revenue. Two read endpoints are live and ungated today. The usage numbers also say whether three more read-only pages are worth building at all. |
| 40a | Make behaviour-test ports allocatable: `.env.simulator` hardcodes 3000/9000/9001, so two concurrent local runs (e.g. parallel agent worktrees) silently kill each other's servers | Demo-videos agent, batch 2 | S | Hygiene. Every parallel-agent batch risks a wasted run and a misleading failure until ports are per-run. |
| 27b | WCAG 2.2 AA audit | Split from #27; PLAN_SECURITY_DETECTION_UPLIFT phase 4 | M | Trust. HMRC Terms of Use commitments made in the recognition questionnaires; ITSA recognition will re-ask. |
| 27c | ICO checklist | Split from #27; PLAN_SECURITY_DETECTION_UPLIFT phase 4 | S | Trust. The data-protection half of the same commitments. |
| 27d | Fix the text-spacing (WCAG 1.4.12) clipping regression: `scripts/text-spacing-test.js` fails all 25 pages with `body (X overflow)` on production today, while the committed February baseline passed — a CSS change since then clips content when the WCAG spacing overrides are applied | Found during the 44 final gate, 2026-08-31 | S | Trust. A live accessibility regression on every page; the HMRC questionnaire commitments assume this passes. |
| 40d | Mode-naming cleanup: rename the sandbox/test/live "developer options" modes to "synthetic" consistently across code and UI | Issue #12 | S | Hygiene. One name per concept; the current three-way naming misleads every new reader. |
| 40e | Delete the dead shadowed `submitVat` copy in `submitVat.html` — its friendly-error-message branches can never fire (found fixing B6) | Repo find, fixing B6 | S | Hygiene. Dead code that looks live; behavior-neutral removal. |

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
