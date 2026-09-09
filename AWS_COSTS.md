<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# AWS Costs & Billing

**Last updated:** February 2026
**Region:** eu-west-2 (London) + us-east-1 (edge)

---

## Multi-Account Billing

### Consolidated Billing

AWS Organizations provides a **single bill** for all member accounts. The management account (887764105431) is the **payer account** — one invoice covers everything.

- Management account receives one monthly bill covering all member accounts
- Per-account cost breakdown visible in Cost Explorer and billing dashboard
- Each account's usage is itemised separately
- Volume discounts (e.g., S3 storage tiers) aggregate across the organisation

### Account Cost Profiles

| Account | Expected Cost Profile |
|---------|----------------------|
| 887764105431 (management) | Minimal — Route53 zone ($0.50/month), holding page CloudFront, IAM Identity Center (free) |
| gateway | Low — CloudFront + S3 static site, no compute |
| spreadsheets | Low — CloudFront + S3 static site, package hosting |
| submit-ci | Variable — mirrors prod architecture, only active during CI runs and testing |
| submit-prod | Primary cost — Lambda, DynamoDB, API Gateway, CloudFront, Secrets Manager, Cognito |
| submit-backup | Low — AWS Backup vault storage only |

### Free Tier (shared across organisation)

Free tier is **shared across the entire organisation**, not per-account. Creating 6 accounts does NOT give 6x free tier.

| Service | Monthly Free Tier | Impact |
|---------|-------------------|--------|
| Lambda | 1M requests + 400K GB-s | Shared — likely within limits at current traffic |
| DynamoDB | 25 GB storage + 25 RCU/WCU | On-demand mode bypasses RCU/WCU; 25 GB shared across all tables |
| S3 | 5 GB + 20K GET + 2K PUT | Shared across gateway, spreadsheets, and submit buckets |
| CloudFront | 1 TB transfer + 10M requests | Shared across all distributions |
| API Gateway | 1M REST API calls | Shared across submit-ci and submit-prod |
| Cognito | 50K MAU | Shared — well within limits |
| Secrets Manager | No free tier | $0.40/secret/month — multiplies across accounts |

### Multi-Account Cost Overhead

| Item | Why | Estimated Additional Cost |
|------|-----|--------------------------|
| Secrets Manager | Each account needs its own copies of secrets | ~$5-10/month |
| ACM certificates | Free (no per-cert charge) | $0 |
| Route53 | Single zone in management (not duplicated) | $0 |
| CloudFront | More distributions, but transfer is the cost | Negligible |

### Budget Alerts (planned)

| Budget | Threshold | Action |
|--------|-----------|--------|
| Organisation total | $50/month | Email alert |
| Per-account | $20/month | Email alert |
| Anomaly detection | 50% above baseline | Email alert |

### AWS Best Practices Alignment

| AWS Recommendation | Implementation | Status |
|---|---|---|
| Consolidated billing via Organizations | Management account is payer | Aligned |
| No workloads in management account | 887764105431 has only Route53 + holding page | Aligned |
| Per-account cost visibility | Each account itemised in billing | Aligned |
| Budget alerts | Organisation-level budgets | Planned |
| Cost allocation tags | CDK tags on all resources | Planned |

### Per-Account Actual Costs (Multi-Account, February 2026)

**Context**: Account separation completed February 21 2026. Before this date, all workloads ran in management (887764105431). After separation, workloads are distributed across 5 accounts.

#### Monthly Costs (February 2026, first 22 days)

| Account | ID | Feb 1–22 | Projected Monthly | Main Drivers |
|---------|-----|--------:|------------------:|-------------|
| **management** | 887764105431 | $372.0 | ~$507 | Legacy costs pre-cleanup ($354 in Jan when it hosted everything). Post-cleanup (Feb 21): ~$3/day = ~$90/month projected going forward. |
| **submit-ci** | 367191799875 | $13.6 | ~$19 | Cognito ($2.22), CloudFront ($1.69), CloudTrail ($0.99), CloudWatch ($0.40) |
| **submit-prod** | 972912397388 | $12.0 | ~$16 | Cognito ($3.94), CloudFront ($2.78), CloudWatch ($1.42), Lambda ($0.82) |
| **gateway** | 283165661847 | $0.4 | ~$1 | CloudFront ($0.18), S3 ($0.02) |
| **spreadsheets** | 064390746177 | $0.4 | ~$1 | CloudFront ($0.10), S3 ($0.004) |
| **submit-backup** | 914216784828 | $0.0 | ~$0 | No resources provisioned yet |
| **Total** | | **$398.4** | | |

#### Post-Cleanup Steady-State (extrapolated from Feb 22 daily costs)

On Feb 22, the first full day after management account cleanup:

| Account | Daily Cost | Projected Monthly |
|---------|----------:|------------------:|
| submit-ci | $3.98 | ~$120 |
| submit-prod | $2.92 | ~$88 |
| gateway | $0.18 | ~$6 |
| management | $0.11 | ~$3 |
| spreadsheets | $0.10 | ~$3 |
| **Total** | **$7.29** | **~$220** |

**Note**: Feb 22 was the first day of multi-account operation. Some services (Lambda PC, WAF) had been recently deployed/reconfigured. These numbers will stabilize over the coming weeks.

#### Top Per-Account Per-Service Costs (Feb 21–22, 2 days combined)

| Account | Service | 2-Day Cost |
|---------|---------|----------:|
| submit-prod | Amazon Cognito | $3.94 |
| submit-prod | Amazon CloudFront | $2.78 |
| submit-ci | Amazon Cognito | $2.22 |
| submit-ci | Amazon CloudFront | $1.69 |
| submit-prod | AmazonCloudWatch | $1.42 |
| management | AWS WAF | $1.03 |
| submit-ci | AWS CloudTrail | $0.99 |
| submit-prod | AWS Lambda | $0.82 |
| management | Amazon Cognito | $0.60 |
| submit-prod | AWS WAF | $0.48 |

**Observation**: Management account still shows WAF ($1.03), Cognito ($0.60), ECR ($0.40), and Lambda ($0.21) charges for Feb 21 — these are residual from before the cleanup completed on Feb 21. These costs should not recur after cleanup.

---

## Production Environment — submit-prod (972912397388)

24/7, 720 hours. These estimates reflect the post-optimization target configuration (256MB PC, 51-minute canaries).

| Resource | Details | $/month |
|---|---|---:|
| **Lambda Provisioned Concurrency** | 5 functions x 1 PC x 256MB, 24/7 | **$13.50** |
| **CloudWatch** | ~20 alarms ($2), 1 dashboard ($3), RUM ($1), logs ~2GB ($1) | **$7** |
| **WAF WebACL** | 1 ACL ($5) + 3 rules ($3) + ~1M requests ($0.60) | **$9** |
| **CloudFront** | 5 distributions, low traffic (~50GB transfer) | **$5** |
| **Cognito PLUS** | ~50 MAU x $0.0375 with threat protection FULL | **$4** |
| **DynamoDB** | 11 tables, PAY_PER_REQUEST, ~1GB storage, PITR | **$3** |
| **Security Hub** | CIS Foundations benchmark checks | **$3** |
| **Secrets Manager** | ~6 secrets x $0.40 | **$2.50** |
| **KMS** | 2 keys x $1 | **$2** |
| **GuardDuty** | Management events analysis | **$2** |
| **AWS Backup** | DynamoDB daily/weekly/monthly to vault | **$2** |
| **CloudWatch Synthetics** | 2 canaries x every 51min = ~847 runs each | **$2** |
| **Route53** | 2 hosted zones + queries | **$1.50** |
| **ECR** | 2 repos, ~5GB images | **$1** |
| **S3** | ~9 buckets, minimal storage | **$1** |
| **API Gateway HTTP API** | ~50K requests | **$1** |
| **Lambda on-demand** | ~10K invocations, ~5K GB-seconds | **$0.50** |
| **CloudTrail** | 1 trail (free) + DynamoDB data events | **$1** |
| **SQS/SNS/EventBridge** | All within free tier at this volume | **$0** |
| | **Production subtotal** | **~$61** |

### Provisioned Concurrency Detail

5 out of 28 Lambda functions have PC=1 at 256MB:

| Lambda | Stack | PC | Configured | Peak Used | Avg Used | Avg Duration |
|--------|-------|----|---:|---:|---:|---:|
| cognitoTokenPost | AuthStack | 1 | 256 MB | 155 MB | 146 MB | 546 ms |
| customAuthorizer | AuthStack | 1 | 256 MB | 112 MB | 111 MB | 37 ms |
| bundleGet | AccountStack | 1 | 256 MB | 136 MB | 128 MB | 40 ms |
| hmrcTokenPost | HmrcStack | 1 | 256 MB | 151 MB | 150 MB | 295 ms |
| hmrcVatReturnPost (ingest) | HmrcStack | 1 | 256 MB | 159 MB | 150 MB | 423 ms |

Memory and duration measured from CloudWatch Logs Insights (prod, 7-day window
ending Feb 16 2026). Peak usage is 159MB against 256MB (62% utilisation).
These functions are I/O-bound (DynamoDB, HMRC API, Cognito, SQS) so the reduced
CPU at 256MB (~14.5% of a vCPU) has negligible impact on execution time. Cold
starts are irrelevant — PC keeps them always warm.

The remaining 23 functions (13 sync + 5 async ingest + 5 async worker) use
PC=0 and stay at 1024MB to keep cold starts reasonable for Docker-based Lambdas.

Formula: 5 x 0.25 GB x 2,592,000 s/month x $0.0000041667/GB-s = **$13.50/month**

### Synthetics Canary Detail

2 canaries (health check + API check) run every 51 minutes. This is close to
hourly but avoids clock-aligned gaps — every 60-minute window is guaranteed to
contain at least one check. CloudWatch Synthetics accepts any positive integer
for the `rate()` interval.

Formula: 2 x (30 x 24 x 60 / 51) runs x $0.0012/run = **$2.03/month**

---

## CI Environment Stacks — submit-ci (367191799875)

24/7 baseline. These duplicate per-environment resources. Since account separation, CI and prod no longer share account-level services — each account has its own GuardDuty, Security Hub, CloudTrail, and ECR.

| Resource | Details | $/month |
|---|---|---:|
| DynamoDB | 11 tables, near-zero traffic | $1 |
| Cognito PLUS | ~5 MAU (test users) | $1 |
| KMS | 2 keys | $2 |
| CloudWatch | Dashboard, RUM, env-level logs | $4 |
| AWS Backup | Minimal backup storage | $1 |
| Apex/Simulator CloudFront | Low traffic | $1 |
| | **CI env subtotal** | **~$10** |

---

## CI Application Stacks (actuals from Jan 16 - Feb 16 2026)

### Deployment Activity

Data from `deploy.yml` workflow runs over 30 days:

| Metric | Count |
|--------|------:|
| Total workflow runs | 192 |
| Main branch runs | 36 (15 success, 12 failure, 9 cancelled) |
| Feature branch runs | 156 (38 success, 40 failure, 76 cancelled) |
| Distinct feature branches | 23 |

### Stack-Hours Calculation

Every feature branch run (success, failure, or cancelled) is assumed to have
deployed far enough to create the full app stack. Each run resets a 2-hour
self-destruct timer. Overlapping runs on the same branch share the same stack
window.

| Branch | Runs | Windows | Stack-Hours |
|--------|-----:|--------:|------------:|
| eventandpayment | 14 | 6 | 16.3 |
| claude/ux-fixes-jane-feedback | 13 | 5 | 13.6 |
| second-pass | 21 | 2 | 10.0 |
| nvsubhash | 11 | 3 | 8.0 |
| cleanup | 15 | 1 | 7.8 |
| rootdns | 8 | 3 | 7.7 |
| headers3 | 8 | 1 | 7.6 |
| claude/pre-golive-fixes | 17 | 1 | 7.6 |
| gateway | 8 | 1 | 6.1 |
| leanbuild | 6 | 2 | 5.9 |
| simtest | 8 | 1 | 5.7 |
| refresh | 6 | 1 | 5.6 |
| compy | 7 | 1 | 5.2 |
| refresf | 3 | 2 | 4.4 |
| activate | 2 | 1 | 3.6 |
| hiding | 2 | 1 | 2.3 |
| sub-hash-versioning | 1 | 1 | 2.0 |
| qaprep | 1 | 1 | 2.0 |
| fixbridge | 1 | 1 | 2.0 |
| fixpay | 1 | 1 | 2.0 |
| cognitnow | 1 | 1 | 2.0 |
| login | 1 | 1 | 2.0 |
| claude/paypal-return-flow | 1 | 1 | 2.0 |
| **TOTAL** | **156** | **39** | **131.4** |

"Windows" = distinct create/destroy cycles (gap of >2h between runs starts a
new window). The 156 runs across 23 branches produced 39 stack lifecycles
totalling 131.4 stack-hours.

### CI App Stack Cost (131.4 stack-hours)

Each stack deploys Auth, HMRC, Account, Billing, Api, Ops, Edge, Publish,
and SelfDestruct.

| Resource | Calculation | $/month |
|---|---|---:|
| **Lambda PC** | 5 x 0.25GB x 131.4h x 3600s x $0.0000041667/GB-s | **$2.46** |
| **WAF** | $9/month x (131.4h / 720h) prorated | **$1.64** |
| **CloudWatch** | Alarms + logs for 131.4h across 39 lifecycles | **$1.00** |
| **CloudFront** | Test traffic only | **$0.50** |
| **Lambda invocations** | Test suites hitting the API | **$0.50** |
| **Synthetics** | 2 canaries x (131.4h x 60 / 51) runs x $0.0012 | **$0.37** |
| **API Gateway** | Test traffic | **$0.25** |
| **S3/SQS** | Minimal, ephemeral | **$0.25** |
| | **CI app subtotal** | **~$7** |

---

## Monthly Total (Post-Optimization Target)

| Component | Account | $/month |
|---|---|---:|
| Production (env + app, 24/7) | submit-prod (972912397388) | ~$61 |
| CI environment (24/7 baseline) | submit-ci (367191799875) | ~$10 |
| CI application (131.4 stack-hours, actuals) | submit-ci (367191799875) | ~$7 |
| Gateway static site | gateway (283165661847) | ~$6 |
| Spreadsheets static site | spreadsheets (064390746177) | ~$3 |
| Management (DNS, holding page) | management (887764105431) | ~$3 |
| Backup vault (planned) | submit-backup (914216784828) | ~$5 |
| **Grand Total** | | **~$95** |

**Note**: The $78 single-account estimate from before account separation has increased to ~$95 due to per-account overhead (duplicated Secrets Manager, CloudTrail, ECR in each account). See "Multi-Account Cost Overhead" above.

---

## Cost Scaling with Users

### Per-User Activity Model

Each active user:
- **Checks** 5 times per day (login, view bundles, check obligations/returns)
- **Submits** 2 times per week (VAT return submission)

### What One "Check" Session Triggers

| Step | Lambda Invocations | DynamoDB Ops | Notes |
|------|---:|---:|---|
| Login | 1 | 1 read | cognitoTokenPost (PC, 256MB) |
| Load bundles | 2 | 2 reads | customAuthorizer (PC, 256MB) + bundleGet (PC, 256MB) |
| Check obligations | 3 | 3 reads + 1 write | customAuthorizer (PC, 256MB) + obligationGet ingest + worker (1024MB) |
| Check return | 3 | 3 reads | customAuthorizer (PC, 256MB) + vatReturnGet ingest + worker (1024MB) |
| Session beacon | 1 | 1 write | sessionBeaconPost (1024MB) |
| **Per check session** | **~10** | **~11** | 5 at 256MB, 5 at 1024MB |

### What One "Submit" Triggers

| Step | Lambda Invocations | DynamoDB Ops | Notes |
|------|---:|---:|---|
| Auth | 1 | 1 read | customAuthorizer (PC, 256MB) |
| Submit VAT return | 2 | 5 writes + 2 reads | vatReturnPost ingest (PC, 256MB) + worker (1024MB) |
| Store receipt | 0 | 1 write | Done inside worker |
| **Per submit** | **~3** | **~9** | 2 at 256MB, 1 at 1024MB |

### Monthly Per-User Resource Consumption

| Resource | Calculation | Monthly per user |
|---|---|---:|
| Lambda invocations | (5 x 10 x 30) + (2 x 3 x 4.3) = 1,526 | 1,526 |
| Lambda GB-seconds | ~767 inv x 0.5s x 0.25GB + ~759 inv x 0.5s x 1GB = 476 | 476 GB-s |
| DynamoDB reads | 5 x 10 x 30 = 1,500 | 1,500 RRU |
| DynamoDB writes | (5 x 1 x 30) + (2 x 9 x 4.3) = 227 | 227 WRU |
| CloudFront requests | ~5 page loads/day x 30 = 150 | 150 |
| CloudFront data | 150 x 100KB | 15 MB |
| API Gateway requests | ~1,526 (same as Lambda) | 1,526 |
| CloudWatch RUM events | ~5 pages/day x 10 events x 30 | 1,500 |
| SQS messages | ~7 async ops/day x 30 | 210 |

### Marginal Cost Per User Per Month

| Resource | Rate | Per user |
|---|---|---:|
| **Cognito PLUS** | $0.0375/MAU (first 10K) | **$0.0375** |
| **CloudWatch RUM** | 1,500 events x $0.01/1K | **$0.0150** |
| **Lambda duration** | 476 GB-s x $0.0000166667 | **$0.0079** |
| **CloudFront** | 15MB x $0.085/GB + 150 req x $0.012/10K | **$0.0015** |
| **API Gateway** | 1,526 req x $1.00/1M | **$0.0015** |
| **WAF requests** | 1,526 x $0.60/1M | **$0.0009** |
| **DynamoDB reads** | 1,500 x $0.283/1M RRU | **$0.0004** |
| **DynamoDB writes** | 227 x $1.41/1M WRU | **$0.0003** |
| **Lambda requests** | 1,526 x $0.20/1M | **$0.0003** |
| **SQS** | 210 (free tier covers 1M/month) | **$0** |
| | **Total per user** | **~$0.065** |

### Scaling Table

| Active Users | User Cost | Fixed Cost | Total | % from Users |
|---:|---:|---:|---:|---:|
| 10 | $0.65 | $78 | **$79** | <1% |
| 50 | $3.25 | $78 | **$81** | 4% |
| 100 | $6.50 | $78 | **$85** | 8% |
| 500 | $33 | $78 | **$111** | 29% |
| 1,000 | $65 | $78 | **$143** | 45% |
| 2,000 | $130 | $78 | **$208** | 63% |
| 5,000 | $265 | $78 | **$343** | 77% |
| 10,000 | $390 | $78 | **$468** | 83% |

Note: Cognito drops from $0.0375 to $0.0150/MAU after 10K users,
reducing per-user cost to ~$0.04 at scale.

### Key Takeaways

- **Break-even point ~1,200 users**: Per-user costs equal fixed infrastructure costs
- **$0.065 per user per month**: Extremely cheap per-user marginal cost
- **Fixed costs dominate** until hundreds of active users
- **Cognito PLUS is the largest per-user cost** ($0.0375/MAU = 58% of per-user cost)
- Architecture scales linearly with no step-function cost jumps

---

## Top Cost Drivers

1. **Lambda Provisioned Concurrency ($16)** - 20% of total. Five always-warm functions at 256MB each.
2. **WAF ($11)** - 14%. Fixed monthly cost for WebACL + 3 managed rules (prod + CI prorated).
3. **CI environment baseline ($10)** - 13%. DynamoDB, Cognito, KMS running 24/7.

---

## Memory and Interval Rationale

### Lambda Memory: 256MB for PC, 1024MB for non-PC

The 5 provisioned-concurrency functions run at 256MB. Peak memory usage is 159MB
(62% utilisation at 256MB). At ~14.5% of a vCPU, execution is slightly slower for
CPU work, but these functions are I/O-bound (waiting on DynamoDB, HMRC, Cognito)
so the difference is negligible. Cold starts are irrelevant with PC=1.

The 23 non-PC functions stay at 1024MB. Docker-based Lambda cold starts scale
inversely with memory — at 256MB they would be 3-5 seconds vs 700-1100ms at
1024MB. Since these functions cold-start on every invocation at low traffic, the
user-facing penalty isn't worth the ~$0.25/month saving.

### Canary Interval: 51 minutes

51-minute interval gives near-hourly checks while guaranteeing every 60-minute
window contains at least one check (since 51 < 60, there's always overlap). This
costs $2/month vs $21 at the previous 5-minute interval. For a business
application with low-urgency monitoring, sub-hour detection is sufficient.

---

## Actual AWS Costs (Jan 16 – Feb 16 2026, Pre-Separation)

**Note**: This data is from the **pre-separation era** when all workloads ran in a single account (887764105431). Account separation completed February 21 2026. For post-separation per-account costs, see "Per-Account Actual Costs" above.

**Configuration during this period:** All Lambda functions at 1024MB,
Synthetics canaries running every 5 minutes. The 256MB/51-min optimizations
in the estimates above had not yet been deployed.

Data from AWS Cost Explorer, queried Feb 16 2026. The Jan 16 – Feb 1 period
is finalized; Feb 1 – Feb 16 is estimated and may adjust.

### Service Breakdown (31 days)

| Service | Jan 16–Feb 1 | Feb 1–16 | 31-day Total | Estimate | Variance |
|---|---:|---:|---:|---:|---|
| **AWS Lambda** | $63.63 | $61.33 | **$124.96** | $14 | +$111 — 1024MB PC, not 256MB |
| **Amazon CloudFront** | $32.88 | $34.58 | **$67.46** | $5 | +$62 — invalidation costs |
| **Amazon Cognito** | $9.56 | $51.42 | **$60.98** | $5 | +$56 — CI test users inflate MAUs |
| **AmazonCloudWatch** | $42.94 | $39.98 | **$82.93** | $9 | +$74 — canaries at 5min |
| **AWS CloudTrail** | $18.60 | $21.19 | **$39.79** | $1 | +$39 — CI management events |
| **AWS WAF** | $10.11 | $22.29 | **$32.40** | $9 | +$23 — CI stacks create ACLs |
| **Amazon ECR** | $4.45 | $4.52 | **$8.97** | $1 | +$8 — 193 GB-months stored |
| **AWS KMS** | $2.75 | $2.71 | **$5.46** | $4 | +$1 |
| **Amazon S3** | $2.48 | $2.80 | **$5.28** | $1 | +$4 |
| **AWS Secrets Manager** | $2.11 | $2.51 | **$4.62** | $2.50 | +$2 |
| **Amazon SQS** | $1.52 | $0.93 | **$2.45** | $0 | Over free tier |
| **Amazon Route 53** | $0.01 | $0.52 | **$0.53** | $1.50 | −$1 |
| **Amazon DynamoDB** | $0.10 | $0.35 | **$0.45** | $4 | −$4 — less than estimated |
| **Amazon API Gateway** | $0.05 | $0.09 | **$0.14** | $1 | Close |
| **AWS Backup** | $0.00 | $0.02 | **$0.02** | $2 | −$2 |
| **Tax** | — | $49.04 | **$49.04** | — | Not in estimates |
| Others (GuardDuty, Security Hub, X-Ray, SNS, Glue, Events) | $0 | $0.01 | **$0.01** | $5 | Free tier |
| | | **Subtotal excl tax** | **$436** | **$65** | |
| | | **Total incl tax** | **$485** | | |

### Usage Type Breakdown (Top Items)

| Usage Type | 31-day Cost | Quantity | Notes |
|---|---:|---:|---|
| Lambda-Provisioned-Concurrency-ARM | **$124.85** | 32.3M GB-s | 5 fns × 1024MB × 24/7 |
| CloudFront Invalidations | **$67.45** | 14,491 paths | $0.005/path after first 1,000 free |
| Cognito PLUS MAU | **$60.98** | — | Billed monthly; Feb spike from CI test users |
| CW:Canary-runs | **$58.74** | 39,263 runs | $0.0015/run, every 5min across all stacks |
| CloudTrail PaidEventsRecorded | **$39.21** | 1.96M events | CI deploys generate management API calls |
| WAF WebACL + Rules | **$31.01** | 3.9 ACLs + rules | Prod + CI stacks each create an ACL |
| CW:AlarmMonitorUsage | **$19.62** | 206 alarm-months | CI stacks create transient alarms |
| ECR TimedStorage | **$11.41** | 193 GB-months | Docker images accumulate across deploys |
| S3 Requests-Tier1 | **$3.28** | 7.3M PUTs | Deployment uploads |
| CW:MetricMonitorUsage | **$1.89** | 20 metrics | Custom metrics |
| WAF RequestV2 | **$1.39** | 2.3M requests | Canary + CI traffic |

### Why Actuals Are 6× Higher Than Estimates

The estimate of ~$78/month assumed post-optimization configuration. Actual
spend of ~$436/month (excl tax) is explained by:

| Factor | Actual | Estimated | Difference |
|---|---:|---:|---:|
| Lambda PC at 1024MB (not yet 256MB) | $125 | $14 | **+$111** |
| Canaries at 5min (not yet 51min) | $59 | $2 | **+$57** |
| CloudFront invalidations (missed) | $67 | $0 | **+$67** |
| Cognito MAUs (underestimated) | $61 | $5 | **+$56** |
| CloudTrail CI events (underestimated) | $40 | $1 | **+$39** |
| WAF CI ACLs (underestimated) | $32 | $9 | **+$23** |
| Alarms (CI stacks) | $20 | $7 | **+$13** |
| ECR storage (underestimated) | $9 | $1 | **+$8** |
| Other | $23 | $26 | −$3 |
| **Total** | **$436** | **$65** | **+$371** |

### Projected Savings from 256MB + 51min Optimizations

These two changes (coded but not yet deployed) directly reduce:

| Optimization | Before | After | Monthly Saving |
|---|---:|---:|---:|
| Lambda PC: 1024MB → 256MB | $125 | $31 | **$94** |
| Synthetics: 5min → 51min | $59 | $6 | **$53** |
| **Total** | $184 | $37 | **$147** |

**Projected post-optimization: ~$289/month** (excl tax).

The remaining ~$211 gap vs the $78 estimate comes from costs that were
completely missed or underestimated: CloudFront invalidations ($67), Cognito
MAUs ($56), CloudTrail CI events ($39), WAF CI stacks ($23), and ECR
accumulation ($9). These require separate optimization work.

### Potential Further Reductions

| Item | Current | Action | Est. Saving |
|---|---:|---|---:|
| **CloudFront invalidations** | $67 | Reduce invalidation paths per deploy or use wildcard `/*` (costs $0.005 vs 43 × $0.005 = $0.215) | **$55** |
| **Cognito MAUs** | $61 | Clean up CI test users promptly; reduce test user creation | **$50** |
| **CloudTrail** | $40 | Investigate why 2M management events in 31 days; consider disabling paid management event logging if only trail | **$35** |
| **WAF** | $32 | Remove WAF from CI stacks (low value for ephemeral test envs) | **$20** |
| **ECR** | $9 | Add lifecycle policy to expire old images (keep last N) | **$7** |
| **Alarms** | $20 | Reduce alarm count in CI stacks | **$10** |
| | | **Total potential** | **~$177** |

With all optimizations: ~$289 − $177 = **~$112/month** (excl tax).

### How to Re-Query

Use SSO profiles to query Cost Explorer. The management account sees all accounts; member accounts see only their own costs.

```bash
# Organisation-wide: per-account costs (run from management account)
aws --profile management ce get-cost-and-usage \
  --time-period Start=2026-02-01,End=2026-03-01 \
  --granularity MONTHLY \
  --metrics UnblendedCost \
  --group-by Type=DIMENSION,Key=LINKED_ACCOUNT

# Organisation-wide: per-account per-service (run from management account)
aws --profile management ce get-cost-and-usage \
  --time-period Start=2026-02-21,End=2026-02-23 \
  --granularity DAILY \
  --metrics UnblendedCost \
  --group-by Type=DIMENSION,Key=LINKED_ACCOUNT Type=DIMENSION,Key=SERVICE

# Single account: per-service breakdown
aws --profile submit-prod ce get-cost-and-usage \
  --time-period Start=2026-02-01,End=2026-03-01 \
  --granularity MONTHLY \
  --metrics UnblendedCost \
  --group-by Type=DIMENSION,Key=SERVICE

# Single account: usage type breakdown (shows PC vs on-demand, invalidations, etc.)
aws --profile submit-ci ce get-cost-and-usage \
  --time-period Start=2026-02-01,End=2026-03-01 \
  --granularity MONTHLY \
  --metrics UnblendedCost UsageQuantity \
  --group-by Type=DIMENSION,Key=USAGE_TYPE
```

SSO profiles: `management`, `submit-ci`, `submit-prod`, `gateway`, `spreadsheets`, `submit-backup`. Login with `aws sso login --sso-session diyaccounting`.

---

## Cost-Saving Architecture Choices

- No VPC/NAT Gateway (fully serverless)
- DynamoDB on-demand (PAY_PER_REQUEST)
- HTTP API v2 (not REST API) — $1/million vs $3.50/million
- Short log retention (3 days default)
- SQS/SNS/EventBridge all within free tier at low volume
- ARM64 Lambda architecture (20% cheaper than x86)
- Self-destructing CI stacks (SelfDestructStack tears down after timer)
- 256MB PC functions (measured at 16% memory utilisation at 1024MB)
- 51-minute canary interval (down from 5 minutes)
- Static sites (gateway, spreadsheets) in minimal accounts — CloudFront + S3 only, no compute
- Single Route53 zone in management account — not duplicated per account
- Consolidated billing via Organizations — volume discounts aggregate across accounts
