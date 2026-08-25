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

## Tier 1: do next

| # | Item | Source | Effort | Value |
|---|---|---|---|---|
| 1 | Merge PR #40 (canary IAM + API route). Confirm health/api alarms clear | This review | S | Trust. The live deployment's two headline alarms are false; every day they stay red teaches us to ignore ALARM. |
| 2 | Fix `verify-backups.yml` vault-name bug, then re-enable PITR on all 11 prod tables (fix the `KindCdk.ensureTable` onDelete/PITR gap or return to CDK `Table`) | Issue #11, PLAN_BACKUP_STRATEGY | S then L | Existential. Seven-year HMRC receipts with no point-in-time recovery. The verifier has correctly reported this 69 runs in a row. |
| 3 | Verify tomorrow's scheduled sweep removed the three duplicate prod deployments; if not, run `destroy-prod` per deployment | AWS audit | S | Hygiene. ~$67/month and triple alarm noise if the sweep misses them. Likely self-resolving; verification only. |
| 4 | Email HMRC (SDST/Sam Evans thread) to add the "free version" flag to our software-finder listing | Market survey | S | Revenue. Our target customer filters by "free version" and currently never sees us. One email. |
| 5 | Investigate and clear the 3-month-old `stack-drift` failure; raise a tracking issue | CI audit (no existing issue) | M | Trust. Weekly red for three months with no owner; drift means CloudFormation no longer describes prod. |
| 6 | Fix VAT obligation/period-key matching (valid quarter rejected; HMRC accepted the return while the app showed an error) and make error messages persist on screen | Shutler emails, 2026-05-11 | M | Existential-adjacent. The core journey told our first real customer his accepted filing had failed. Worst possible trust failure for a filing service. |
| 7 | Tag receipts and activity events with actor class (customer / test / synthetic); emit business metrics on submission success, failure, and signup; add failure-path activity event in `hmrcVatReturnPost.js` | AWS audit | M | Insight [DE: ingestion]. Unblocks "how many customers filed this month", which no current data can answer. Foundation for everything in W2. |
| 8 | Route WAF alarm state changes to Telegram (us-east-1 EventBridge rule or SNS forward) | AWS audit, EdgeStack TODO | S | Trust. Three attack-detection alarms currently reach nobody. |
| 9 | Fix dead GitHub discussion link in the support auto-reply | Shutler email | S | Hygiene. Every support contact sees a broken link today. |

## Tier 2: revenue path (start now, runs weeks to months)

| # | Item | Source | Effort | Value |
|---|---|---|---|---|
| 10 | ITSA build, phase 1: sandbox integration with self-employment quarterly update APIs (Business Details, Obligations, SE Business) | Issues #16, #20; strategy | L | Revenue. The strategic bet. Voluntary sign-up is open now and HMRC auto-enrolment starts September 2026. |
| 11 | ITSA build, phase 2: annual summaries, final declaration, then the ITSA recognition application and finder listing | Strategy | L | Revenue. The recognition lead time is HMRC's; starting early is the only control we have over April 2027. |
| 12 | Catalogue restructure: day pass limits (one per user per day, capped daily total), add `resident-itsa`, keep `resident-vat` and `resident-pro` | Operator decision, this session | M | Revenue. The pricing model the strategy commits to. |
| 13 | Usage data pipeline: Firehose from activity events/DynamoDB streams to partitioned Parquet on S3, Glue catalog + data quality, Athena, dashboard | Strategy, AWS audit | L | Insight [DE: streams, lake storage, cataloguing, quality, analysis]. The core CV/certification project, and the business's reporting backbone. |
| 14 | Scheduled ingestion jobs: GA4 export, Stripe reconciliation, CloudFront logs, orchestrated with Step Functions/EventBridge | Strategy | M | Insight [DE: orchestration, batch ingestion]. Completes the platform; revenue and funnel land in one queryable place. |
| 15 | Referral and campaign pass system (specced, zero code; prerequisite met) | PLAN_CAMPAIGN_AND_REFERRALS | M | Revenue. The only designed acquisition mechanism beyond the HMRC listing. After #7, its effect is measurable. |
| 16 | Tighten spreadsheet-to-Submit pairing: file a VAT return from a DIY spreadsheet without re-keying (CSV/digital-link import) | Market survey positioning | M | Revenue. Our one edge bridging-only rivals cannot copy. Also the MTD digital-links story HMRC wants. |
| 17 | Demo videos: validate the capture test, produce the three journey videos | PLAN_DEMO_VIDEOS | S | Revenue. Cheap conversion asset; infrastructure already exists. |
| 18 | Fix the spreadsheets VATQtr1 dropdown (wrong-year figures) | Clavier emails (spreadsheets repo) | M | Existential-adjacent. A correctness bug that could put last year's numbers in a customer's VAT return. |
| 19 | GA4 leftovers: conversions, old stream retirement, cookie consent banner | PLAN_GA4 | S | Insight. Small, finishes an almost-done plan. |

## Tier 3: autonomy (ongoing workstream)

| # | Item | Source | Effort | Value |
|---|---|---|---|---|
| 20 | Ops alerting uplift: Telegram/Slack fan-out with dedup and auto-raised GitHub issues | Issue #18 | L | Autonomy. Turns alarms into tracked work without an operator watching a channel. |
| 21 | Support reply drafting: agent drafts replies into Gmail for one-click review. Donor thank-yous excluded, they stay human | Operator decision, this session | M | Autonomy. Support is the main recurring human task besides donor thanks. |
| 22 | Parse the monthly HMRC fraud-prevention-header email; alert only on "advisories" or zero-traffic months | HMRC compliance emails | S | Autonomy. A standing legal obligation becomes a silent check that only speaks when action is needed. |
| 23 | Emails-to-articles content pipeline (14 years of support answers into SEO pages) | PLAN_EMAILS_TO_ARTICLES | L | Revenue/Autonomy [DE: text ETL]. Organic acquisition from an asset nobody else has; runs unattended once built. |
| 24 | Respond to HMRC Assist for VAT engagement (delivery April 2027) | HMRC email 2026-01-08 | S | Revenue. Early input shapes an integration we will need anyway. |

## Tier 4: hardening and compliance

| # | Item | Source | Effort | Value |
|---|---|---|---|---|
| 25 | Cross-account backups: provision the `submit-backup` vault, copy jobs, monthly restore test | Issue #11, PLAN_CROSS_ACCOUNT_BACKUPS | L | Existential, second layer. Depends on #2, and the proven restore is the gate for the approved CDK TypeScript migration (#33). |
| 26 | Missing alarms batch: HMRC error rate, cert expiry, SQS age, JWT errors, PITR-disabled; plus the worker-alarm `treatMissingData` one-liner | ALARM_VALIDATION_STRATEGY, AWS audit | M | Trust. The audit's confirmed gaps, specs already written. |
| 27 | WCAG 2.2 AA audit, ICO checklist, annual pen test | PLAN_SECURITY_DETECTION_UPLIFT phase 4 | M/L | Trust. HMRC Terms of Use commitments made in the recognition questionnaires; ITSA recognition will re-ask. |
| 28 | Scan detection (#9), data-theft detection (#10), DynamoDB IAM tightening from `grantReadData` | Issues #9, #10; ALARM_VALIDATION_STRATEGY | M/L | Trust. Real exfiltration vectors on customer tables; CloudTrail data events already collect the raw signal. |
| 29 | Legacy ECR repo in the old management account: lifecycle rule or delete (4,253 images, ~$8.50/month, serves nothing) | Cost analysis | S | Hygiene. The one confirmed standing cost leak. Needs an approved write in the management account. |
| 30 | Alarm-count audit (123 per deployment) and canary cadence review | Cost analysis | M | Hygiene. Largest recurring CloudWatch line; worthwhile after #26 settles what should exist. |
| 31 | Small UI batch: issues #3, #4, #5, #6, #7, #8 (links, mobile visibility, pass navigation, logout event) | Issues #3 to #8 | S each | Hygiene. Real user-facing rough edges; good sub-agent batch work. |
| 32 | Optional VAT endpoints: liabilities, payments, penalties (#19); entitlement gating on read endpoints | Issue #19, vat-api-operations | M | Revenue, minor. Completes the listed feature set; useful, not urgent. |
| 32a | Cut pipeline run times: ci deploys hit ~30 minutes, prod ~50 | Operator, this session | M | Hygiene, compounding. Every iteration in every workstream pays this tax. Profile the deploy workflow stages, parallelise stacks, cache Docker/Maven layers, and lean on the existing lean-deploy path for app-only changes. The TypeScript migration (#33) is a chance to rebuild the pipeline shape rather than port it. |

## Tier 5: later or opportunistic

| # | Item | Source | Effort | Value |
|---|---|---|---|---|
| 33 | CDK migration from Java to TypeScript. Approved. Sequence: backups and a proven restore first (#2, #25), then full CI and prod teardown of the Java-deployed stacks, then fresh TypeScript deploy and data restore | Operator decision, this session | L | Hygiene, committed. Unifies the repo on one language and shares constants app-to-infra (the canary route bug lived in that duplication). The teardown-and-restore path avoids logical-ID surgery entirely and doubles as the first real DR drill. |
| 34 | Companies House / limited company filing | Issue #15 | L | Revenue, later wave. Real demand signal (customers asked when the joint service closed), but ITSA is the bigger, nearer wave. |
| 35 | MCP server (design done, zero code) or retire the public "Coming Soon" page | PLAN_MCP_SERVER | L or S | Hygiene now, option later. The page currently promises what does not exist; either build or unpromise. |
| 36 | Social IdPs: Apple, Microsoft | Issue #14 | L | Revenue, marginal. No evidence login choice is losing users; revisit when funnel data (#13) exists. |
| 37 | Merch (#17): simple storefront link version only | Issue #17 | S | Revenue, negligible. Do the link version if ever; skip the integrated build. |
| 38 | Spreadsheets repo: roundtrip fidelity S1 to S7; packages-to-archive migration (paused by choice) | Spreadsheets PLAN docs | M/L | Hygiene. Product-quality work for the spreadsheet line; resume when W2 shows spreadsheet demand justifies it. |
| 39 | Multi-URL Lighthouse (#13); synthetic-test flakiness | Issue #13, CI audit | M | Hygiene. Quality gates; not blocking anything today. |
| 40 | Refactor batch: PLAN_REDUCE items, TODO inventory refresh, mode-naming cleanup (#12) | PLAN_REDUCE, TODO_INVENTORY, issue #12 | S/M | Hygiene. Good filler for sub-agents between larger dispatches. |
| 41 | Doc hygiene: archive the two stale "in progress" plans that shipped, fix the dangling NEXT.md reference, close out PLAN_FLAGGED | Repo review | S | Hygiene. Stale plans mislead every future session. |
| 42 | Rust transpile experiment: keep the JS repo as the source (annotated where needed) and generate a Rust build in the pipeline | Operator, this session | L | Exploratory. Possible payoffs are Lambda cold start, memory, and compute cost; the honest read is that at ~30 users the AWS bill is ~$100/month and none of it is compute-bound, so this earns its place as a learning project or a future scale lever, not near-term product work. Sequence after the TypeScript migration (#33) settles what the source of truth is, and prove it on one hot Lambda (hmrc-vat-return-post) before widening. |

## Why this order

Items 1 to 9 are cheap and either stop data loss, stop lies from monitoring, or stop customer-facing wrongness in the core journey. Nothing strategic can be trusted until they land, and all nine together are days, not weeks.

Items 10 to 19 are the income engine in dependency order: the ITSA bet first because its lead time is external (HMRC recognition), the pricing catalogue and measurement pipeline alongside because subscribers and their behaviour must be visible before growth spend (referrals, videos, pairing) can be judged.

Tier 3 converts operator hours into agent hours, which is the stated aim of the whole service; it runs continuously rather than completing. Tier 4 is real risk reduction that mostly waits on Tier 1 outcomes. Tier 5 is genuinely deferrable, and says so honestly rather than pretending everything is urgent.

One cross-tier chain is now fixed by operator decision: #2 (PITR and backup fix) then #25 (cross-account vault and a proven restore) then #33 (teardown CI and prod, redeploy on TypeScript CDK, restore data). Backups stop being insurance and become the migration's enabling step.
