<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Review of ../developers/submit/archive/PLAN_PRICE_UPDATE.md: breakeven, the funnel as measured, and the models

> Written 2026-09-21 from the nightly export at `analytics/prod/2026-09-20/`, Athena queries in
> workgroup `prod-env-analytics` (database `prod_env_analytics`), Cost Explorer for `submit-prod`
> and `submit-ci`, and the plan's sources. Suggestions only; the operator decides.

## 1. Result

**Breakeven is 31 `resident` subscribers at £39/year** (range 19 to 188 across the cost bases
below), against a fixed cost base of **£98/month** (AWS prod+ci June to August average, $124 at
$1.35/£, plus £6/month of domains and the ICO fee). At the measured funnel (0.28% of human sessions
buy; 2 purchases in September 1 to 20), reaching 31 within 12 months needs **about 1,060 human
sessions a month**; the site has 900 to 1,250 (GB `new-session` events, 2026-09-08 to 09-20).

| Cost base | £/month | Breakeven subscribers (all annual `resident`) | Sessions/month to reach it in 12 months |
| --- | ---: | ---: | ---: |
| Cost plan target (`PLAN_COST_OPTIMISATION.md` $61 prod + $12 ci) + £6 | 60 | 19 | 650 |
| **June to August measured** (prod $90.71, ci $33.55 average) + £6 | **98** | **31** | **1,060** |
| June to August + the operator's Claude subscription (assumed £148) | 246 | 78 | 2,670 |
| September run-rate (prod $232.17 + ci $164.36 in 20 days, ×1.5) + £6 | 447 | 141 | 4,820 |
| September run-rate + Claude subscription | 595 | 188 | 6,430 |

Every $10/month of AWS run-rate moves breakeven by 2.3 annual subscribers. The 3 to 4 existing
`resident-vat` subscribers contribute £2.30 to £3.10/month, 2% to 3% of the June to August base.

## 2. Plan review

Ranked by effect on breakeven. "Cost" is the cost of applying the suggestion.

| # | Section | Change | Evidence | Cost |
| --- | --- | --- | --- | --- |
| 1 | Why; Numbers | Add a cost base and a breakeven count. The plan states revenue at 200 to 500 subscribers and no cost; breakeven is 31 (19 to 188) and the 200 to 500 figure rests on 10,000 active free DIYA-GL users (`PLAN_DIYA_GL_LAUNCH.md` §3) where the spreadsheets GA4 stream shows 69 consented sessions, 6 `book_loaded`, 2 `cloud_sign_in`, 1 `cloud_save` in 20 days (Athena `ga4_bq_events`, stream 13496898428, 2026-08-31 to 09-19) | §1 and §3d here | one paragraph |
| 2 | The offer; Decision 1 | State who buys `resident`. Both September purchasers subscribed to `resident-vat` and filed a VAT return within 15 minutes (2026-09-03 16:29 to 16:47; 2026-09-09 14:06 to 14:40; Athena `activity_events_all`), in the week of the 7 September VAT deadline. A filing-time VAT buyer keeps paying 99p while `resident-vat` stays open, so `resident` at £39 sells to ITSA, Ltd and DIYA-GL users only, of whom none has been measured (`resident-itsa`, `resident-ltd`, `resident-diya-gl` are ci-only; the DIYA-GL Subscribe button is behind `DIYA_GL_RESIDENT_TIER`, off on prod). Either close `resident-vat` at PU-1 (assertion 1 says later) or write that `resident` revenue excludes today's buyer | Athena Q13/Q15; catalogue lines 136 to 194 | one decision |
| 3 | The sandbox | Replace "over 500 sign-ins" with a count the traffic reaches. `cloud_sign_in` is 2 sessions in 20 days (GA4, consented), so 500 takes about 14 years; the launch plan's two triggers ("under 2% after 500 sign-ins", `PLAN_DIYA_GL_HOME.md` §(d)) have the same denominator. Suggest reading `sandbox_expired_seen` per sign-in as a range at 50 sign-ins and again at 200 | Athena `ga4_bq_events` Q12 | one sentence, twice |
| 4 | Task list | Add three measurement tasks before PU-5, so the £39 launch is readable from day one: (a) `stripe_charges.bundle_id` is null on every charge, so `v_revenue_daily` reports every product as `unknown` and mixes £165 of spreadsheets donations with £3.96 of subscriptions (export 2026-09-20); (b) `v_subscription_cancellations_daily` counts 312 canceled `resident-vat` subscriptions in 24 days from probe lanes (Athena `dynamo_subscriptions`; the table carries no actor), so churn, the metric annual billing is meant to move, is unreadable; (c) `v_subscription_renewals_daily` has 0 rows though a renewal happened on 2026-09-06 (`subscription-renewed`, sub e74e1d41), so the view's `current_period_end` comparison misses the real renewal path | §5 here | 3 tasks, Sonnet |
| 5 | Task list | Add an actor-tagging fix: `checkout-session-created` is written as `test-user` for real customers (all three September checkouts, including the two paying ones), and probe lanes 4b100a90 and 35a4fc02 carry `login` as `test-user` but `bundle-granted`, `vat-return-submitted` (11 of September's 13) and `hmrc-token-exchanged` as `customer`. Every customer-actor view (`v_active_users_daily`, `v_login_to_submission_funnel`, `v_submissions_daily`, `v_purchase_reconciliation_daily`) counts probes; the conversion-to-submission objective reads 4 submitters where 2 are human | Athena Q9, Q15 | 1 task, Sonnet |
| 6 | Numbers; task list | Add an `experiments.toml` row for the price change (objective `conversion-to-paid`, lever price, metric purchases per human session, start at PU-5's deploy). The plan asserts the £39 shape "matches the buyer" with no measurement; the only measured purchase rate is at 99p | `experiments.toml` has one row, uptime baseline | 1 row |
| 7 | Why (paid acquisition) | Carry a ceiling on cost per session. At 0.28% session-to-purchase and £127 lifetime contribution (annual, 30% churn), the breakeven cost per session is £0.36; a £2 click costs £714 per subscriber. D17's Ads work should start from this number | §3c, §4 here | one line here or in D17 |
| 8 | Task list | Put the PU rows on `NEXT.md`. The plan says "Ids are shared with `NEXT.md`'s board here"; `NEXT.md` carries no PU row and no reference to the plan | `grep PU- NEXT.md` empty | 9 rows |
| 9 | Task list | PU-8 duplicates DG-6 (`sandbox_expired_seen`, `PLAN_DIYA_GL_HOME.md` task list) and DG-2b's labels; PU-5 lists PU-4 as a precursor though the tier lifts without the 25-day change. Point PU-8 at DG-6 and drop PU-4 from PU-5's precursors | home plan rows DG-2b, DG-6 | edit |
| 10 | Numbers | Assertion 2 says the fee share on £39 is "about 2.3%"; the Numbers paragraph says 2.0%. 0.785/39 = 2.01%. The 2.3% is the launch plan's £24 row (§3) | arithmetic | one word |
| 11 | (d) | `resident-pro` today is `enable = "on-pass"`, `hidden = true`, `allocation = "on-pass-on-subscription"`, 999p (catalogue lines 241 to 256). The table says "unhidden, on-subscription" and "higher token grant"; (d) names neither the `enable` change nor the grant | catalogue | two values |
| 12 | PU-9 | The retire check reads Stripe live, as written; keep it that way. The prod `dynamo_subscriptions` table shows 107 active `resident-diya-gl` and 1 active `resident-ltd`, all probe subscriptions in Stripe test mode | Athena Q1 | note |
| 13 | Open questions | The monthly price on the DIYA-GL page: 2 sign-ins in 20 days means the answer has no measurable effect this quarter; defer until the tier is on prod and `cloud_sign_in` reads 50 | Athena Q12 | none |

## 3. The models

### 3a. The funnel as measured

Human traffic is the GB `new-session` count in `activity_events_all` (the `visitor_type` column
is `human` on every row, including the probes; `v_visitors_by_kind_daily` reads
`sessions_by_host_source_daily`, which has 0 rows, so the `human` split the export was meant to
give does not exist yet). US sessions (1,176 in September, 80 on `/index.html`) are the GitHub
Actions probes plus an unknown human share, and are excluded.

| Stage | Count | Window | Source | Rate | n |
| --- | ---: | --- | --- | --- | ---: |
| Sessions, GB | 508 (36/day; 900 to 1,250/month) | 2026-09-08 to 09-21 | `v_traffic_by_country_daily`, export 2026-09-20; Athena Q14 | | |
| Sessions, GA4 consented, submit stream | 69 sessions, 30 users | 2026-08-31 to 09-19 | Athena `ga4_bq_events` Q5 | 13% of GB sessions consent | |
| Landing page | 502 of 508 GB sessions on `/` | 2026-09-08 to 09-21 | Athena Q11 | | |
| Reached `/bundles.html` | 18 sessions | GA4, 20 days | Athena Q5d | 26% of consented sessions | 69 |
| Reached `/auth/login.html` | 20 sessions; 8 `login` events | GA4, 20 days | Athena Q5c, Q5d | 40% of login-page sessions log in | 20 |
| Login, human | 12 distinct subs (10 with no probe-tagged event, plus the 2 purchasers) | 2026-09-01 to 09-17 | Athena Q13 | 7 of 304 GB sessions = 2.3% | 304 |
| `begin_checkout` | 2 sessions | GA4, 20 days | Athena Q5c | 11% of `/bundles.html` sessions | 18 |
| Purchase | 2 new (2026-09-03, 09-09) + 1 renewal (09-06) + 1 operator test (09-02, refunded 09-13) | 2026-09-01 to 09-20 | Stripe `v_revenue_daily`; Athena Q2b, Q13, Q15 | 2 of ~730 GB sessions = 0.28%; 1 of 304 in the overlapping window = 0.33% | 2 |
| Login to purchase | 2 of 12 | September | Athena Q13 | 10% to 20% | 12 |
| First submission after purchase | 2 of 2, within 18 and 34 minutes | | Athena Q15 | | 2 |
| VAT returns, human | 2 submitted, 2 failed attempts first (sub 0e4d3887) | 2026-09-01 to 09-21 | Athena Q15 | | |
| Returning submitters | 4 submitters in Q3 2026, 0 returning; the receipts table starts 2026-08-29 | `v_returning_submitters_quarterly` | | | |

Rates with fewer than 20 events behind them are ranges. The purchase rate is 2 events; its 90%
interval on 730 sessions is 0.05% to 0.9%.

Spreadsheets referral path: 2 submit sessions in 20 days arrived from
`spreadsheets.diyaccounting.co.uk` and 14 from `diyaccounting.co.uk` (2 users; Athena Q5b,
`page_referrer`). `v_traffic_sources_daily`'s Referral channel is 24 sessions in September with 2
new users and 0 engaged (the view has no source column, so the referrer is not readable there).
The spreadsheets stream itself: 69 consented sessions, 22 donation `begin_checkout`, 2 donation
`purchase`, 16 `file_download`, 3 `runner_download`, 6 `book_loaded`, 2 `cloud_sign_in`, 1
`cloud_save` (Athena Q12, 2026-08-31 to 09-19).

Channels, September, property-wide (`v_traffic_sources_daily`, export 2026-09-20; the GA4 pull is
per property, so this covers all three sites):

| Channel | Sessions | New users | Engaged | Engagement |
| --- | ---: | ---: | ---: | ---: |
| Unassigned | 102 | 0 | 0 | 0% |
| Direct | 71 | 30 | 8 | 11% |
| Organic Search | 25 | 13 | 4 | 16% |
| Referral | 24 | 2 | 0 | 0% |
| Cross-network | 8 | 7 | 3 | 38% |
| AI Assistant | 2 | 2 | 2 | 100% |
| Paid Search | 2 | 2 | 0 | 0% |
| Organic Shopping | 1 | 0 | 0 | 0% |

Export consistency: the 2026-09-15 export's `v_ga4_funnel_daily` shows 19 sessions and 7 checkouts
on 2026-09-08; the 2026-09-20 export shows 3 and 0 for the same day. The view gained the
`stream_id = '13497119809'` filter between the two, so earlier exports of that view count the
spreadsheets donation checkouts. `v_traffic_sources_daily` and `v_revenue_daily` agree across
exports.

### 3b. The segments

| Persona | Returns | Measured | What 25 days means |
| --- | --- | --- | --- |
| Quarterly VAT filer | 4 times a year, in the deadline week | Both September buyers: subscribe, file within 34 minutes, 2 to 6 days before the 7 September deadline. 0 human cancellations in September (the 3 `subscription-canceled` events are the operator's) | Nothing: Submit's VAT path has no sandbox. The price question is 4 × 99p (or 4 × £3.99 = £15.96) against £39 |
| Annual ITSA filer | 4 quarterly updates plus a final declaration from April 2026 (over £50k), April 2027 (over £30k) | 0: ITSA recognition is pending; `resident-itsa` is ci-only | A quarterly saver sees the clock once per quarter and is told; the plan's "seen once" reading holds only if the book is saved again inside 25 days of the next visit |
| DIYA-GL bookkeeper | Monthly or weekly saves | `cloud_save` 1 session, `book_loaded` 6, `cloud_sign_in` 2 in 20 days (consented) | Never sees it; the sandbox is not a lever for this persona, and it is the persona `resident` is priced for |
| Practice | Per client, per filing | 0. `resident-pro` had one subscription, the operator's, canceled 2026-09-13 | Not applicable |

### 3c. Unit economics per bundle

Stripe UK standard 1.5% + 20p (`PLAN_DIYA_GL_LAUNCH.md` §3). Variable cost per subscriber-month:
Cognito Plus $0.02 per MAU (`PLAN_COST_OPTIMISATION.md`, August) = 1.5p; S3 under 0.1p; operator
support budgeted at 1 hour per 50 subscribers per month (launch plan §4), not cash.

fee = price × 0.015 + 0.20; kept = price − fee; contribution/month = kept/months − 0.015.

| Bundle | Price | Fee | Kept | Fee share | Contribution/month | Churn assumption | Expected lifetime | Lifetime contribution |
| --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: |
| `resident` annual | £39.00 | £0.785 | £38.215 | 2.0% | £3.17 | 30%/year (range 20 to 40) | 3.3 years (2.5 to 5) | £127 (£96 to £191) |
| `resident` monthly | £3.99 | £0.26 | £3.73 | 6.5% | £3.72 | 4%/month (3 to 5, launch plan §3) | 25 months (20 to 33) | £93 (£74 to £124) |
| `resident-vat` | £0.99 | £0.215 | £0.775 | 21.7% | £0.76 | 4%/month; or 4 charges a year for a filing-time buyer | 25 months, or £3.10/year | £19, or £3.10 a year |
| `resident-pro` monthly | £19.99 | £0.50 | £19.49 | 2.5% | £19.48 | 4%/month | 25 months | £487 |
| `resident-pro` annual | £199.00 | £3.185 | £195.815 | 1.6% | £16.30 | 30%/year | 3.3 years | £652 |

A monthly `resident` kept for a year yields £44.76 against £38.22 annual; annual wins when the
monthly buyer churns inside 10.3 months (38.22/3.73), which 4%/month churn says half of them do.

### 3d. Breakeven

Fixed cost base (cash; excludes operator time):

| Line | £/month | Source |
| --- | ---: | --- |
| AWS `submit-prod` | 67.2 | Cost Explorer unblended, June $78.47, July $63.32, August $130.33; average $90.71 at $1.35/£. Includes the "Tax" line (UK VAT) |
| AWS `submit-ci` | 24.9 | Cost Explorer, June $12.29, July $12.23, August $76.15; average $33.55 |
| Domain `diyaccounting.co.uk` | 0.6 | Route 53 renewal notice 2026-06-29, $9/year, billed to the management account |
| Domains `diya-gl.co.uk`, `diya-gl.com` | 1.5 | assumption: Route 53 registrar list $9 + $15/year |
| ICO fee | 4.3 | assumption: tier 1, £52/year; the certificate (ZB070902) is in the repo root, the fee is not |
| Companies House presenter, HMRC APIs, Google Cloud (BigQuery export) | 0 | presenter account accepted 2026-09-05 with no fee; no Google Cloud invoice in the mail mirror since June; BigQuery inside the free tier (assumption) |
| **Total** | **98** | |
| Operator's Claude subscription | 148 | assumption: Max at $200/month; the session reports say "inside the subscription", the tier is not recorded. Shown separately in §1 |
| AWS `spreadsheets` account | 43 | Cost Explorer, August $58.35, September to the 20th $53.69. The DIYA-GL site; not in the Submit base |

September's prod run-rate ($348/month) is CloudWatch $47.19, CloudFront $40.05 (invalidations),
Tax $39.87, S3 $37.50, GuardDuty $17.80 in 20 days (Cost Explorer by service). None of those
lines scales with subscribers.

Formulas:

- breakeven N = fixed cost / contribution per subscriber-month. Mid: 98 / 3.17 = 31.
- mix contribution = Σ share × contribution. 70% annual + 30% monthly = 0.7 × 3.17 + 0.3 × 3.72 = £3.33 → N = 30. 65/30/5 with `resident-pro` monthly = 0.65 × 3.17 + 0.3 × 3.72 + 0.05 × 19.48 = £4.15 → N = 24. All `resident-vat` = 98 / 0.76 = 129.
- acquisitions per month to reach N in T months with monthly churn c: a = N × (1/T + c/2). Mid, T = 12, c = 2.5% (30%/year): a = 31 × 0.0958 = 3.0.
- sessions per month = a / p, p = session-to-purchase. p = 0.0028: 3.0 / 0.0028 = 1,060.
- sessions per month to hold N once reached = N × c / p. Mid: 31 × 0.025 / 0.0028 = 280.

Sensitivity, all-annual `resident`, T = 12 months, c = 2.5%/month; cells are sessions/month:

| Cost base | N | p × 0.5 (0.14%) | p × 1 (0.28%) | p × 2 (0.56%) |
| --- | ---: | ---: | ---: | ---: |
| £60 | 19 | 1,300 | 650 | 325 |
| £98 | 31 | 2,120 | 1,060 | 530 |
| £246 (with Claude) | 78 | 5,340 | 2,670 | 1,330 |
| £447 (September run-rate) | 141 | 9,650 | 4,820 | 2,410 |
| £595 | 188 | 12,900 | 6,430 | 3,220 |

Mix and churn, £98 base, p × 1:

| Mix | Contribution | N | Monthly churn | a | Sessions/month | Sessions/month to hold N |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| All annual, 20%/year | £3.17 | 31 | 1.7% | 2.8 | 1,010 | 190 |
| All annual, 30%/year | £3.17 | 31 | 2.5% | 3.0 | 1,060 | 280 |
| All annual, 50%/year | £3.17 | 31 | 4.2% | 3.2 | 1,150 | 460 |
| 70/30 annual/monthly | £3.33 | 30 | 3.0% | 3.0 | 1,060 | 320 |
| All monthly, 4% | £3.72 | 27 | 4.0% | 2.8 | 1,000 | 390 |
| All monthly, 5% | £3.72 | 27 | 5.0% | 2.9 | 1,040 | 480 |

The price response is the missing term: p is measured at 99p. If £39 halves it, the £98 base
needs 2,120 sessions/month, twice today's traffic.

Assumptions:

| Assumption | Value | Source |
| --- | --- | --- |
| Human sessions = GB `new-session` events | 508 in 14 days | probes run from GitHub Actions (US); `sessions_by_host_source_daily` empty |
| Session-to-purchase | 0.28% (2 of ~730) | Stripe charges and `activity_events_all`, September 1 to 20; n = 2 |
| Purchase rate unchanged from 99p to £39 | ×1 (table shows ×0.5, ×2) | no measurement; suggestion 6 |
| Annual renewal | 70% (60 to 80) | no renewal has happened; SMB SaaS annual renewal, estimated |
| Monthly churn | 4% (3 to 5) | `PLAN_DIYA_GL_LAUNCH.md` §3, Churnkey benchmark |
| USD to GBP | 1.35 | estimated, September 2026 |
| Cognito per MAU | $0.02 | `PLAN_COST_OPTIMISATION.md`, August 546 MAU |
| ICO fee | £52/year | estimated, tier 1 |
| Two new domains | $24/year | estimated, Route 53 registrar prices |
| Claude subscription | $200/month | estimated; the tier is not recorded in the repo |
| Support time | 1 hour per 50 subscribers per month | `PLAN_DIYA_GL_LAUNCH.md` §4; 0.6 hours at breakeven, not cash |
| Not VAT registered | prices are the charged amounts | launch plan decision 7 |

## 4. How to get there

Ranked by sessions per pound where a cost is known; the free levers first.

| Lever | Measured | Sessions it adds | Cost |
| --- | --- | --- | --- |
| The login page | 20 GA4 sessions reached `/auth/login.html`, 8 logged in (40%); login-to-purchase is 10% to 20% (n = 12) | Each extra 10 logins/month at the measured rate is 1 to 2 purchases: the same as 360 to 720 new sessions | one page; 0 |
| `/bundles.html` to checkout | 18 sessions on the page, 2 checkouts (11%), 2 of 2 completed | Doubling the page's checkout rate equals doubling traffic | one page; 0 |
| Organic Search | 25 sessions, 13 new users, 16% engaged, September | The channel with the most new users after Direct; content for "submit VAT return free" and the ITSA quarterly update terms | writing; 0 |
| Cross-network and AI Assistant | 8 and 2 sessions; 38% and 100% engaged | Small and the best engagement; the three YouTube videos went public 2026-09-07 and `youtube.com` appears as a referrer | already spent |
| The spreadsheets referral | 2 sessions in 20 days from `spreadsheets.diyaccounting.co.uk`; the DIYA-GL Subscribe button is off on prod (`DIYA_GL_RESIDENT_TIER`) | The spreadsheets stream has 69 consented sessions and 16 file downloads in 20 days; a link on the download and donation pages at the gateway's 14-session rate adds ~20/month | PU-5 and one link; 0 |
| Paid search | 2 sessions in September (`google / cpc`), no Ads account, no cost per click recorded | At 0.28% and £127 lifetime, breakeven cost per session is £0.36 (formula: lifetime × p). At an assumed £2 per click, 1,000 sessions cost £2,000 and return 2.8 subscribers worth £356 | £2,000 per 1,000 sessions, assumed; only after suggestion 7's ceiling |

## 5. What to measure next

1. **The human session count.** `v_visitors_by_kind_daily` exists and returns 0 rows because
   `sessions_by_host_source_daily` is empty, and `activity_events_all.visitor_type` is `human` on
   the probes. The denominator of every rate above is a GB-only proxy; the true figure lies between
   508 and 1,735 sessions for the same 14 days (×3.4 on p).
2. **Churn and renewal by bundle.** `v_subscription_renewals_daily` has 0 rows and
   `v_subscription_cancellations_daily` counts probe subscriptions (312 of 313). `dynamo_subscriptions`
   needs an actor or lane column, or a probe-sub exclusion, and the renewal view needs the
   `subscription-renewed` event as a second source. The annual renewal rate is the widest
   assumption in §3c (£96 to £191 lifetime).
3. **Revenue by bundle.** `stripe_charges.bundle_id` is null on every charge, so `v_revenue_daily`
   reports one product, `unknown`, and £165 of donations sit beside £3.96 of subscriptions. The
   Checkout session's metadata or a join through `dynamo_subscriptions.subscription_id` gives the
   bundle; until then the mix in §3d cannot be read.
