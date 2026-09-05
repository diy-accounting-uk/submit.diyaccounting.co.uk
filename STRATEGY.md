# Strategy

Written 2026-08-25 from a full review: repo state, GitHub issues, customer and HMRC email history, live AWS usage and cost data, and a market survey. Evidence lives in [REPORT_COMPETITOR_ANALYSIS.md](REPORT_COMPETITOR_ANALYSIS.md) and [BACKLOG.md](BACKLOG.md).

## The aim

An income-generating tax filing service that runs with minimal human intervention. The operator's time goes to direction and the few judgement calls that need a person. Everything else is automated: deployment, monitoring, support drafting, content, and reporting.

## Where we stand

**The asset.** A live, HMRC-recognised MTD VAT filing service. Production API credentials granted March 2026. Listed on HMRC's software finder. Passed the fraud prevention header evaluation. Stripe subscription billing works in production. Deployment, teardown, and probe testing are already automated end to end.

**The numbers.** About 30 registered users. A handful of real VAT filers, known by name. June 2026 had zero production HMRC traffic. AWS costs about $100/month across the whole organisation. Revenue is spreadsheet donations, a steady trickle between £1 and £100. Submit subscription revenue is effectively zero.

**The gaps.** Point-in-time recovery is off on all 11 production tables and the backup verifier has failed every daily run since May. We cannot answer "how many customers filed this month" because receipts mix real and test traffic and metric history resets with each deployment. Several alarms lie (canary bugs, fixed in PR #40) or reach nobody (WAF alarms in us-east-1).

## The bet: MTD Income Tax

VAT bridging is a commodity. Two competitors are entirely free. The ceiling on VAT-only revenue is low.

MTD for Income Tax is different. Mandation reached £50k sole traders in April 2026, drops to £30k in April 2027 and £20k in April 2028. HMRC begins auto-enrolling mandated taxpayers in September 2026. The £20k to £30k wave is our historic spreadsheet customer: single trade, Excel-comfortable, price-sensitive. Voluntary sign-up is open now, so the product can launch and season before mandation forces the market. Filing is quarterly, so one customer means four filings a year of recurring engagement, and a subscription that earns its keep.

We hold production HMRC credentials and have been through recognition once. ITSA recognition is a separate application with a higher functionality bar, so the lead time is real. Started now, a recognised ITSA product listed before the April 2027 wave is achievable.

## Pricing

| Tier | Price | What it covers |
|---|---|---|
| Day pass | Free | One per user per day, low limits, capped total per day |
| resident-vat | £0.99/mo | VAT filing |
| resident-itsa | £0.99/mo | Income tax filing (single tax type) |
| resident-pro | £9.99/mo | Everything |

The free day pass keeps the HMRC "free version" listing honest and feeds acquisition. The £0.99 tiers convert habitual filers at a price nobody undercuts meaningfully except fully-free rivals, against whom we differentiate on the spreadsheet pairing. resident-pro is the margin tier for multi-tax filers and agents. At ~$100/month AWS cost, about 100 subscribers at £0.99 covers infrastructure; resident-pro subscribers and ITSA volume are where income beyond that comes from.

## Workstreams

Four run concurrently. One is finite; three are ongoing.

### W1. Trust and stability (finite)

A filing service holding seven years of tax receipts must not be able to lose them. Restore PITR, fix the backup verifier, stand up the cross-account vault, resolve the three-month-old stack drift, and route the silent WAF alarms. Exit criteria: backup verification green for 30 consecutive days, a successful restore test, drift clean, every alarm reaching a channel a human reads.

The proven restore also unlocks a decided change: migrating the CDK from Java to TypeScript by teardown and redeploy rather than in-place surgery. With data safely restorable, CI and prod stacks are torn down, redeployed from the TypeScript CDK, and the data restored. One migration, one real disaster-recovery drill, one language across the repo.

### W2. Measure and monetise (ongoing)

You cannot grow what you cannot see. Tag every receipt and event with its actor class (customer, test-user, probe). Emit business metrics: submissions per day, signups per day, revenue per day. Build the usage data pipeline (below). Get the "free version" flag added to our HMRC listing. Finish GA4 conversions and consent. Then the growth levers: referral and campaign passes (already specced), demo videos, tighter spreadsheet-to-Submit flow so a DIY spreadsheet files without re-keying.

### W3. ITSA build (deadline-driven)

Sandbox integration with the self-employment quarterly update APIs, then annual summaries and final declaration, then the recognition application: fraud prevention header evidence again, the minimum functionality standards, the ITSA software finder listing. Launch to voluntary sign-ups first, priced as resident-itsa. Target: listed and filing real quarterly updates well before April 2027. HMRC Assist for VAT (April 2027) is tracked here too; early engagement is cheap and HMRC invited it.

### W4. Autonomous operations (ongoing)

The minimal-human-intervention part. Alerts flow to Telegram/Slack with deduplication and auto-raised GitHub issues (issue #18). Support replies are drafted by an agent into Gmail for one-click review; donor thank-yous stay fully human, deliberately. Content generation (demo videos, the emails-to-articles pipeline) runs on a schedule. The monthly HMRC fraud-header compliance email is parsed and only surfaces when it needs action.

## The data engineering layer

W2's measurement work is deliberately built as one coherent data platform, shaped to cover the AWS Certified Data Engineer Associate ground and to stand as a portfolio project ("designed and ran the customer-usage data platform for a live HMRC-recognised filing service").

Pipeline: activity events and DynamoDB streams feed Kinesis Firehose into a partitioned Parquet lake on S3. Glue catalogues it and runs data quality rules. Athena queries it. A dashboard (QuickSight or CloudWatch) presents submissions, signups, revenue, and funnel conversion. Step Functions and EventBridge orchestrate scheduled jobs: GA4 export ingestion, Stripe reconciliation, CloudFront log processing. Backlog items carrying this layer are tagged [DE] with the certification domain they exercise.

## Goals

| By | Goal |
|---|---|
| Oct 2026 | W1 exit criteria met. Business dashboard answers filers/week, signups/week, revenue/week from real data. |
| Dec 2026 | ITSA filing working in sandbox. Referral system live. Support drafting live. First paying subscribers measured, not assumed. |
| Apr 2027 | Listed on the HMRC ITSA finder with resident-itsa live, ahead of the £30k mandation wave. AWS costs covered by subscription revenue. |
| Apr 2028 | The £20k wave lands on a two-year-old, proven, near-free, spreadsheet-native product. Income covers costs plus a real margin with the operator hands-off day to day. |

## Risks

- Fully-free competitors (My Tax Digital) chase the same wave. Our answer is the spreadsheet pairing and 20 years of brand, not price alone.
- ITSA recognition lead time is HMRC's, not ours. Starting the application early is the only mitigation.
- Single-operator bus factor. W4 reduces it; documentation and automation are the insurance.
- The June zero-traffic month shows how thin current usage is. Growth work (W2) cannot wait for the ITSA build to finish; they run in parallel.
