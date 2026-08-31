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

## Live status (updated 2026-08-29)

Queued and in-flight state lives on `NEXT.md`; this block mirrors it so the backlog reads
truthfully on its own.

- **Nothing is in flight.** The cross-account backup wiring (25), the usage data pipeline
  (13a, 13) and the scheduled ingestion jobs (14) are merged to `main` (PRs #46, #47, #50)
  and deploying; `NEXT.md` carries each one's verification remainder. PITR is ENABLED on all
  11 tables and the cross-account vault is LIVE in 914216784828. Item 4 (HMRC free-flag
  email) is sent (2026-08-26, servicedrm@hmrc.gov.uk); it closes when "There is a free
  version of this software" appears on the listing, checkable at the 4a text-fragment
  link.
- **Operator-bound**: 9 and 9a (Gmail settings), 17a (demo-video redo — Claude Code
  excluded by operator directive), 19 (analytics console work), the GA4 service-account
  secret for 14, the management-account cross-account-backup switch and backup-account
  bootstrap for 25.
- **Next candidates**: the 10a spike when the operator says go.

## Tier 1: do next

| # | Item | Source | Effort | Value |
|---|---|---|---|---|
| 9 | Fix the dead GitHub link in the support@ Gmail auto-reply (a mailbox setting, not repo code — verified; point it at the spreadsheets repo issues page) | Shutler email; batch 1 verification | S | Hygiene. Every support contact sees a broken link today. |
| 9a | Widen the support autoresponder's sender filter: it replies to automated notifications, not just people — eight replies to AWS SNS subscription-confirmation emails on 2026-08-25 alone, each bouncing at an amazonses address, same defect class as the recorded GitHub-notification bounces | Workspace session, mail-mirror verification | S | Hygiene. One filter fix stops a standing stream of bounce noise in the support mailbox and prevents the autoresponder confirming SNS subscriptions nobody asked for. |
| 14 | Scheduled ingestion jobs: GA4 export, Stripe reconciliation, CloudFront logs, orchestrated with Step Functions/EventBridge | Strategy | M | Insight [DE: orchestration, batch ingestion]. Completes the platform; revenue and funnel land in one queryable place. |
| 20 | Ops alerting uplift: Telegram/Slack fan-out with dedup and auto-raised GitHub issues | Issue #18 | L | Autonomy. Turns alarms into tracked work without an operator watching a channel. |
| 20a | Channel decided: Telegram (operator, 2026-08-31; it already routes alarms — `SLACK_INTEGRATION_PLAN.md` is superseded). Prove one alarm end to end into an auto-raised GitHub issue | Split from #20 | S | Autonomy. Two plans currently describe two channels doing the same job. One alarm through the whole path answers the channel question and sizes the fan-out. |
| 25 | Cross-account backups, remainder: point BackupStack's copy jobs at the LIVE vault (`submit-cross-account-vault` in 914216784828, deployed 2026-08-26), add passes/subscriptions to the backup selection, create `backup-github-actions-role` for unattended workflow runs, then the monthly restore test | Issue #11, PLAN_CROSS_ACCOUNT_BACKUPS | M | Existential, second layer. The destination exists and denies deletion from outside; the restore test is the gate for the TypeScript migration (#33). |
| 28 | Scan detection (#9) and data-theft detection (#10). The IAM half shipped in batch 2: blanket `grantReadData` is gone, per-table per-action grants live | Issues #9, #10; ALARM_VALIDATION_STRATEGY | M/L | Trust. Real exfiltration vectors on customer tables; CloudTrail data events already collect the raw signal. |
| 43 | AWS cost optimisation: a whole-bill review across all six accounts — Cost Explorer per account and service, right-sizing, storage classes and lifecycle rules, orphaned resources (us-east-1 log groups and images have recurred), data-transfer lines, and a monthly check that the bill moved the way the month's changes predicted. Feeds and is fed by #30 (alarms are the known largest CloudWatch line) and 42a (Lambda cost share). | Operator, this session | M | Hygiene, compounding. Nobody has reviewed the whole bill against what runs; every account added since the org split (backup, submit-ci, submit-prod) widened the blind spot. |
| 43a | Enhance all AWS accounts to assist cost analysis: org-wide cost allocation tags activated and a standard tag set applied by CDK (the per-stack tags exist; make them allocation-active), CUR 2.0 / Data Exports to S3 with Athena over it, AWS Budgets with alerts and Cost Anomaly Detection per account, Cost Explorer granularity settings. The instrumentation half of #43 — do first so the review reads real data. | Split from #43 | S/M | Hygiene. Without allocation tags and exports the review is squinting at unattributed totals. |
| 44 | Replace ngrok in the proxy test path: `start-proxy.sh`, `stripe-setup.js`, the Stripe webhook route and `test.yml` all assume an ngrok tunnel with an account token — a paid external dependency and a recurring source of stuck local runs. Swap for cloudflared or an unauthenticated tunnel, or route webhooks at the simulator so no tunnel is needed | Operator, this session | S/M | Hygiene. Every proxy behaviour-test run and every new machine pays the ngrok setup tax. |

## Tier 2: revenue path (start now, runs weeks to months)

| # | Item | Source | Effort | Value |
|---|---|---|---|---|
| 10 | ITSA build, phase 1: sandbox integration with self-employment quarterly update APIs (Business Details, Obligations, SE Business) | Issues #16, #20; strategy | L | Revenue. The strategic bet. Voluntary sign-up is open now and HMRC auto-enrolment starts September 2026. |
| 10a | Subscribe the existing HMRC application to the Self Employment Business API, mint a sandbox test user with `mtd-income-tax` (the `create-hmrc-test-user` workflow already offers it), and make one read-only call | Split from #10 | S | Revenue. Proves whether ITSA needs a separate application and whether our OAuth and fraud headers carry over. Everything in #10 is guesswork until a sandbox call returns. |
| 11 | ITSA build, phase 2: annual summaries, final declaration, then the ITSA recognition application and finder listing | Strategy | L | Revenue. The recognition lead time is HMRC's; starting early is the only control we have over April 2027. |
| 11a | Get HMRC's ITSA minimum functionality standards and the recognition questionnaire, then mark each requirement against what phases 1 and 2 plan to build | Split from #11 | S | Revenue. The standards decide what #10 has to contain. Reading them after the build is how you find out you built the wrong thing. |
| 12 | Catalogue restructure: day pass limits (one per user per day, capped daily total), add `resident-itsa`, keep `resident-vat` and `resident-pro` | Operator decision, this session | M | Revenue. The pricing model the strategy commits to. |
| 13 | Usage data pipeline: Firehose from activity events/DynamoDB streams to partitioned Parquet on S3, Glue catalog + data quality, Athena, dashboard | Strategy, AWS audit | L | Insight [DE: streams, lake storage, cataloguing, quality, analysis]. The core CV/certification project, and the business's reporting backbone. |
| 13a | Firehose spike on one stream: activity events to date-partitioned S3, queried with Athena. No Glue quality rules, no dashboard, one table | Split from #13 | S | Insight [DE: streams]. The repo has no Firehose, Glue or Athena code at all, so #13 is greenfield. One table proves the delivery, IAM and cost shape before the lake design is committed. |
| 17a | Demo videos: redo properly and publish. The first attempt failed — the capture recorded the simulator rather than the main site, and the cuts are mostly blank and not shareable. Operator-owned: per operator directive 2026-08-26, Claude Code is not to work this item. The channel exists and is ready for good uploads: https://www.youtube.com/@DIYAccountingSubmit | Operator directive 2026-08-26 | M | Revenue. A usable walkthrough of the real product is still worth having; the failed attempt is not it. |
| 19 | Analytics console work (operator): GA4 data export on, scheduled Stripe report, mark conversions, retire the old stream and stale remarketing tag. The consent banner and CloudFront logging halves shipped in batch 2 | PLAN_GA4; 14a remainder | S | Insight. Small, finishes an almost-done plan. |

| 34 | Companies House / limited company filing | Issue #15 | L | Revenue. Real demand signal (customers asked when the joint service closed); promoted by the operator 2026-08-31 to sit alongside ITSA rather than behind it. |

## Tier 3: autonomy (ongoing workstream)

| # | Item | Source | Effort | Value |
|---|---|---|---|---|
| 21 | Support reply drafting: agent drafts replies into Gmail for one-click review. Donor thank-yous excluded, they stay human | Operator decision, this session | M | Autonomy. Support is the main recurring human task besides donor thanks. |
| 21a | Classify the last six months of support mail into categories and count how many replies come from a template | Split from #21 | S | Autonomy. Tells us how much of the support load drafting can actually take, and names the categories to cover first. If most threads are one-offs, #21 shrinks. |
| 22 | Parse the monthly HMRC fraud-prevention-header email; alert only on "advisories" or zero-traffic months | HMRC compliance emails | S | Autonomy. A standing legal obligation becomes a silent check that only speaks when action is needed. |
| 24 | Respond to HMRC Assist for VAT engagement (delivery April 2027) | HMRC email 2026-01-08 | S | Revenue. Early input shapes an integration we will need anyway. |

## Tier 4: hardening and compliance

| # | Item | Source | Effort | Value |
|---|---|---|---|---|
| 27 | WCAG 2.2 AA audit and ICO checklist | PLAN_SECURITY_DETECTION_UPLIFT phase 4 | M | Trust. HMRC Terms of Use commitments made in the recognition questionnaires; ITSA recognition will re-ask. The external pen test half moved to 27a in tier 5. |
| 30 | Alarm-count audit (123 per deployment) and canary cadence review | Cost analysis | M | Hygiene. Largest recurring CloudWatch line; worthwhile after #26 settles what should exist. |
| 32a | Cut pipeline run times: ci deploys hit ~30 minutes, prod ~50 | Operator, this session | M | Hygiene, compounding. Every iteration in every workstream pays this tax. Profile the deploy workflow stages, parallelise stacks, cache Docker/Maven layers, and lean on the existing lean-deploy path for app-only changes. The TypeScript migration (#33) is a chance to rebuild the pipeline shape rather than port it. |
| 32b | Apply the specced `requireActivity()` gating to the obligations and view-return endpoints, and check `prod-env-hmrc-api-requests` for whether anyone uses them | Split from #32 (32a is an unrelated item) | S | Trust, then revenue. Two read endpoints are live and ungated today. The usage numbers also say whether three more read-only pages are worth building at all. |



## Tier 5: later or opportunistic
| 15 | Referral and campaign pass system (specced, zero code; prerequisite met) | PLAN_CAMPAIGN_AND_REFERRALS | M | Revenue. The only designed acquisition mechanism beyond the HMRC listing. After #7, its effect is measurable. |
| 16 | Tighten spreadsheet-to-Submit pairing: file a VAT return from a DIY spreadsheet without re-keying (CSV/digital-link import). The spreadsheets-side export half is tracked in the spreadsheets repo NEXT.md | Market survey positioning | M | Revenue. Our one edge bridging-only rivals cannot copy. Also the MTD digital-links story HMRC wants. |
| 16a | Define the CSV contract: column names and their mapping to the nine VAT boxes, published as a fixture both repos test against | Split from #16 | S | Revenue. The interface spans two repos, so it is the part that cannot be changed cheaply later. Submit has an export path today and no import path, so the contract has to be written before either side builds. |
| 23 | Emails-to-articles content pipeline (14 years of support answers into SEO pages) | PLAN_EMAILS_TO_ARTICLES | L | Revenue/Autonomy [DE: text ETL]. Organic acquisition from an asset nobody else has; runs unattended once built. |
| 23a | Take a sample of about 50 support threads from the existing mailbox mirror, hand-classify them, and list the first ten article topics | Split from #23 | S | Revenue. Says whether 14 years of mail really contains articles before an L build assumes it does, and the topic list is useful on its own for the first hand-written pages. |
| 27a | External pen test: get quotes, book it, name the designated responsible individual | Split from #27 | S | Trust. External lead time and a budget decision. The automated WCAG and ZAP scans already exist and pass. |
| 32 | Optional VAT endpoints: liabilities, payments, penalties (#19); entitlement gating on read endpoints | Issue #19, vat-api-operations | M | Revenue, minor. Completes the listed feature set; useful, not urgent. |

| # | Item | Source | Effort | Value |
|---|---|---|---|---|
| 33 | CDK migration from Java to TypeScript. Approved. Sequence: backups and a proven restore first (#2, #25), then full CI and prod teardown of the Java-deployed stacks, then fresh TypeScript deploy and data restore | Operator decision, this session | L | Hygiene, committed. Unifies the repo on one language and shares constants app-to-infra (the canary route bug lived in that duplication). The teardown-and-restore path avoids logical-ID surgery entirely and doubles as the first real DR drill. |
| 33a | Rewrite one leaf stack in TypeScript, synthesise it, and diff the template against the Java synth | Split from #33 | S | Hygiene. Nineteen stack classes is a large commitment on an untested assumption. One stack says how faithful the rewrite is and how long the other eighteen will take, without touching a deployment. |
| 35 | MCP server (design done, zero code) or retire the public "Coming Soon" page | PLAN_MCP_SERVER | L or S | Hygiene now, option later. The page currently promises what does not exist; either build or unpromise. |
| 35a | Take the promise off `web/public/mcp.html`: either give it a date or say the server is not built | Split from #35 | S | Hygiene. The page is live and promises a product with no code behind it. One edit stops the false claim today and leaves the build decision open. |
| 36 | Social IdPs: Apple, Microsoft | Issue #14 | L | Revenue, marginal. No evidence login choice is losing users; revisit when funnel data (#13) exists. |
| 37 | Merch (#17): simple storefront link version only | Issue #17 | S | Revenue, negligible. Do the link version if ever; skip the integrated build. |
| 39 | Multi-URL Lighthouse (#13); synthetic-test flakiness | Issue #13, CI audit | M | Hygiene. Quality gates; not blocking anything today. |
| 40 | Refactor batch: PLAN_REDUCE items, TODO inventory refresh, mode-naming cleanup (#12), and the dead shadowed `submitVat` copy in `submitVat.html` whose friendly-message branches never fire (found fixing B6) | PLAN_REDUCE, TODO_INVENTORY, issue #12 | S/M | Hygiene. Good filler for sub-agents between larger dispatches. |
| 40a | Make behaviour-test ports allocatable: `.env.simulator` hardcodes 3000/9000/9001, so two concurrent local runs (e.g. parallel agent worktrees) silently kill each other's servers | Demo-videos agent, batch 2 | S | Hygiene. Every parallel-agent batch risks a wasted run and a misleading failure until ports are per-run. |
| 41 | Doc hygiene: archive the two stale "in progress" plans that shipped, fix the dangling NEXT.md reference, close out PLAN_FLAGGED | Repo review | S | Hygiene. Stale plans mislead every future session. |
| 42 | Rust translation pipeline: the repo stays the source (annotated where needed) and a pipeline stage produces a native Rust build. Harness design: (a) translation is memoized per module on the hash of its source, so an unchanged module reuses the previous Rust byte-for-byte and "Rust changed where the source did not" fails CI mechanically; (b) the previous translation is supplied to the translator as context; (c) the black-box test tiers (system, behaviour) run against the Rust build over the wire as differential tests, since the interface is unchanged; (d) an LLM review gate checks each version-to-version Rust delta against the source delta for semantic equivalence. Known limits: JS-side unit tests and their mocks do not cross the boundary (Rust-native unit tests or a coverage blind spot), and equivalence is only proven on covered paths, so add property-based differential tests for the hot Lambda. Sequence after the TypeScript migration (#33): strict TS (`strict: true`, explicit interface files at translation boundaries, no `any`) gives the translator typed, frozen interfaces and most of the fidelity benefit jsii discipline would bring. jsii itself is out of scope here: it is a runtime bridge over Node with no Rust target, so it cannot produce the native build this wants; it only becomes relevant if we ever publish a multi-language client library. Prove on one Lambda (hmrc-vat-return-post) with benchmarks before widening. | Operator + design discussion, this session | L | Exploratory, upgraded to a credible staged experiment by the harness design. The business case is still thin (~$100/month AWS, nothing compute-bound), so the near-term value is the engineering showcase and a ready pattern if ITSA scale ever makes compute cost real. |
| 42a | Benchmark `hmrc-vat-return-post` as it runs today: cold start, p50 and p99 duration, and its share of the monthly bill | Split from #42 | S | Exploratory. The business case for #42 rests on numbers nobody has measured. If the Lambda is a rounding error on a $100 monthly bill, the item closes for the price of an afternoon; if not, the same numbers become the benchmark the Rust build is judged against. |

## Why this order

Items 1 to 9 are cheap and either stop data loss, stop lies from monitoring, or stop customer-facing wrongness in the core journey. Nothing strategic can be trusted until they land, and all nine together are days, not weeks.

Items 10 to 19 are the income engine in dependency order: the ITSA bet first because its lead time is external (HMRC recognition), the pricing catalogue and measurement pipeline alongside because subscribers and their behaviour must be visible before growth spend (referrals, videos, pairing) can be judged.

Tier 3 converts operator hours into agent hours, which is the stated aim of the whole service; it runs continuously rather than completing. Tier 4 is real risk reduction that mostly waits on Tier 1 outcomes. Tier 5 is genuinely deferrable, and says so honestly rather than pretending everything is urgent.

One cross-tier chain is now fixed by operator decision: #2 (PITR and backup fix) then #25 (cross-account vault and a proven restore) then #33 (teardown CI and prod, redeploy on TypeScript CDK, restore data). Backups stop being insurance and become the migration's enabling step.
