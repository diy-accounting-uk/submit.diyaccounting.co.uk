# Cost optimisation, submit prod steady state

Review document for the operator. Analysis only. Nothing in this file has been applied, and no
AWS resource was changed to produce it. Every figure comes from read-only Cost Explorer,
CloudWatch and describe/list calls against account 972912397388 on 2026-09-02, plus public
eu-west-2 rates.

Scope set by the operator: submit prod in a steady state. Costs from this week's deployment
churn sit in their own section and stay out of the baseline.

## Summary

Prod's run rate is now about **$253 a month before VAT ($304 with UK VAT)** for one deployment.
That is not what any past bill shows. July came in at $53 before tax. The jump happened on
2026-08-29, when CloudTrail started recording DynamoDB data events for every table and shipping
them to CloudWatch Logs. Almost all of that traffic is `GetRecords` from the DynamoDB Streams
poller, which carries no security signal and which no metric filter reads. That pipeline costs
$171.99 a month and excluding `GetRecords` recovers **$165.24** of it. With the other changes
below, prod comes to **$65 a month before VAT ($78 with VAT)**.

Two numbers to hold on to: **$253 if nothing changes, $65 after the four changes in scope.**
Provisioned concurrency stays, on the operator's decision, and holds $12.70 a month inside that
after figure.

Separately, each `prod-*-app-*` stack set standing beyond the one that serves costs **$46.88 a
month**.

## How the baseline was derived

August's daily total splits into three clean phases.

| Days | Daily total | What was running |
|---|---|---|
| 2026-08-02 to 08-23 | $1.43 | env stacks only, no app deployment, no CloudFront traffic |
| 2026-08-24 to 08-28 | $3.62 to $7.19 | first app deployments of the month |
| 2026-08-29 to 09-01 | $5.84 to $21.55 | CloudTrail data events on, plus the merge burst |

Neither the quiet days nor the burst days give a steady-state figure on their own. The quiet
days predate the app deployment and the analytics, ingestion and security-detection stacks. The
burst days carry churn. So the baseline below is built resource by resource, from the current
inventory and public rates, with each unit rate derived from a measured Cost Explorer line where
one exists.

Unit rates derived from the bill, not looked up:

- Lambda provisioned concurrency, arm64: July charged $12.94 for 3,348,000 GB-seconds, so
  **$0.000003865 per GB-second**. The quantity checks out exactly: 5 configs x 0.25 GB x
  2,678,400 seconds = 3,348,000.
- CloudWatch Logs ingestion: August charged $12.15 for 20.89 GB, so **$0.5816 per GB**.
- CloudWatch alarms: August charged $17.49 for 183.91 alarm-months, so **$0.0951 per alarm-month**
  against a list price of $0.10. Composite alarms are $0.50 (`PLAN_ALARM_CONSOLIDATION.md`).
- CloudTrail data events: 2026-09-01 charged $1.29 for 1,289,680 events, so **$0.10 per 100,000**.
- Cognito Plus: August charged $10.92 for 546 MAU, so **$0.02 per MAU** with no free allowance
  applied.
- Synthetics: July charged $2.48 for 1,750 runs, so **$0.001417 per run**.

## Steady-state monthly spend, do nothing

One deployment plus the env stacks. US dollars, excluding VAT.

| Line | $/month | Derivation |
|---|---:|---|
| CloudWatch Logs ingestion | 132.42 | 7.5 GB/day measured on `/aws/cloudtrail/prod-env-cloud-trail` (AWS/Logs IncomingBytes, 29 Aug to 2 Sep) x 30.44 x $0.5816 |
| CloudTrail data events | 39.57 | 1.30M events/day x 30.44 x $0.10 per 100k |
| CloudWatch alarms | 28.10 | (111 eu-west-2 + 9 us-east-1 + 31 env) x $0.10, plus (23 + 3) composite x $0.50 |
| Lambda provisioned concurrency | 12.70 | 5 configs x 1 x 0.25 GB x 2,629,440 s x $0.000003865 |
| CloudWatch custom metrics | 10.35 | $0.34/day measured 31 Aug x 30.44 (about 35 billable series) |
| Cognito Plus MAU | 9.80 | 490 MAU average of July (431) and August (546) x $0.02 |
| WAF | 8.17 | 1 web ACL $5.00 + 3 rules $3.00 + 340k requests $0.17 |
| Secrets Manager | 4.45 | 11 secrets x $0.40 + API requests $0.05 |
| Synthetics canary runs | 2.48 | 2 canaries x 28.24 runs/day x 30.44 x $0.001417 |
| KMS | 2.05 | 2 customer-managed keys x $1.00 + requests |
| Security Hub | 0.99 | 992 paid compliance checks, July |
| S3 | 0.60 | trail bucket 4.96 GB, CDK assets 1.50 GB, analytics lake 8.4 MB, plus requests |
| GuardDuty | 0.35 | July baseline |
| ECR | 0.26 | 100 images eu-west-2, 74 us-east-1 |
| DynamoDB | 0.17 | on-demand reads and writes, 10.4 MB across 12 tables, PITR |
| SQS | 0.17 | worker queues |
| AWS Backup, prod | 0.11 | 179 recovery points |
| submit-backup account | 0.18 | KMS in 914216784828; the vault's storage bills at $0 |
| Glue | 0.07 | nightly catalog |
| API Gateway | 0.02 | HTTP API requests |
| CloudFront | 0.00 | traffic sits inside the 1 TB free allowance; August's $14.19 was invalidations |
| Athena | 0.00 | the lake is 8.4 MB, one nightly run |
| Kinesis Firehose | 0.00 | 5 streams, no billed volume |
| RUM | 0.00 | inside the free allowance |
| Route 53 | 0.00 | no hosted zones in this account; DNS lives in management |
| **Total** | **253.01** | **$303.61 with UK VAT at 20%** |

Two lines in that table have never appeared on a bill. The 26 composite alarms ($13.00) were
created on 2026-09-02. The CloudWatch Logs and CloudTrail data-event lines began on 2026-08-29
and have four days of history. The budget's $152.69 forecast for submit-prod predates both.

## Optimisations

Sorted by saving. Effort is S (under a day), M (a few days), L (longer).

| # | Change | Now $/mo | After $/mo | Saving | Risk | Effort | How |
|---|---|---:|---:|---:|---|---|---|
| 1 | Stop logging DynamoDB Streams `GetRecords` as CloudTrail data events | 171.99 | 6.75 | **165.24** | Low. See "What we lose" below. | S | `ObservabilityStack.java:205-219` replaces `setEventSelectors` with `setAdvancedEventSelectors`, keeping the `AWS::DynamoDB::Table` resource type and adding a `NotEquals` field selector on `eventName` for `GetRecords`. |
| 2 | Reuse one durable Cognito test user instead of creating one per run | 9.80 | 0.80 | **9.00** | Low. Tests share a fixed identity, so one failing run can leave state behind for the next. | S/M | `scripts/enable-cognito-native-test.js` and `scripts/disable-cognito-native-test.js` create and delete a user per run. Keep one user and rotate its password instead. |
| 3 | Move to one composite alarm per stack instead of one per function | 28.10 | 19.10 | **9.00** | Low. The Telegram title names the stack rather than the function, so you read `state.reason` to find which function broke. | M | `PLAN_ALARM_CONSOLIDATION.md` already sets out this option and its trade-off; follow the alternative it names. See the alarm arithmetic below. |
| 4 | Stop keying the behaviour-test metric namespace on the per-commit deployment name | 10.35 | 5.35 | **5.00 (estimate)** | None to the service. The dashboard loses its per-commit split. | S | The `prod-submit.diyaccounting.co.uk` namespace already holds 504 series, dimensioned `deployment-name` x `test`. Every prod deploy adds up to 13 more, for ever. Drop `deployment-name` from the dimension set, or move it to a log field. |
| | **Total** | **220.24** | **31.00** | **188.24** | | | |

### Alarm arithmetic behind item 3

Live today for one deployment plus the env stacks: 151 standard alarms (111 eu-west-2, 9
us-east-1, 31 env) at $0.10, and 26 composite alarms (23 app, 3 env) at $0.50. That is $15.10 +
$13.00 = $28.10. The per-function composites went in on 2026-09-02 and no bill has shown them
yet.

Per-stack composites collapse those 26 to 8, so $15.10 + $4.00 = $19.10.

Item 6's saving is small today and large if item 1 is not done. Without item 1 the log group
ingests 228 GB a month with no expiry, so storage alone climbs by about $6.80 a month, every
month.

### Why item 1 is the whole story

The trail's event selector reads `Type: AWS::DynamoDB::Table`, `Values: ["arn:aws:dynamodb"]`,
`ReadWriteType: All`. That matches every table in the account, including the stream shards.

A 15-minute sample of the log group returned 340 events. All 340 were `GetRecords`, and all 340
came from `prod-env-AnalyticsStack-prodenvTableChangeDelivery...`, the Lambda event-source
mapping that polls the `bundles`, `passes` and `receipts` streams. Lambda polls each shard about
four times a second whether or not records are waiting, so the volume is a constant 1.3M events
a day and does not move with traffic or with deployment count.

The comment at `ObservabilityStack.java:222` names the query the selector exists to serve:
`eventSource = dynamodb.amazonaws.com and eventName = Scan`. `GetRecords` was never wanted.

A one-hour sample of 8,000 events measures the residual. `GetRecords` is 7,307 of them and
94.93% of the bytes. Everything else is management events (`sts`, `s3`, `monitoring`, `lambda`,
`kms`, `ecr`, `logs`, `cloudformation`), which CloudTrail delivers free on the first trail but
which CloudWatch Logs still charges to ingest. So the log group keeps about 5% of its volume,
$6.71 a month, and that sample hour ran two destroy workflows, so 5% is on the high side.

#### What we lose

The change excludes one `eventName`. It does not turn DynamoDB data events off.

| | |
|---|---|
| **Gone** | `GetRecords` on the DynamoDB Streams shards, about 4 calls per second per shard, made by the AnalyticsStack event-source mapping's own Lambda role. No human principal appears in any of the 7,307 sampled records. Both copies go: the CloudWatch log group and the trail's S3 bucket shrink by the same 95%. |
| **Kept** | Every `GetItem`, `Query`, `Scan`, `PutItem`, `UpdateItem`, `DeleteItem` and `BatchGetItem` on every table, each with its principal and source IP. All management events, unchanged. |
| **Detectors** | None loses input. The three consumers of this log group are in `SecurityDetectionStack.java` at lines 131, 165 and 210, and they match `Scan`, `GetItem` and `GetSecretValue`. |
| **CDK mechanics** | Advanced event selectors replace basic ones outright, so management events have to be re-declared in the same selector list. Use `CfnTrail.AdvancedEventSelectorProperty` with a field selector of `eventName` `NotEquals` `GetRecords` alongside the `AWS::DynamoDB::Table` resource-type selector. |
| **The blunter alternative** | Turning DynamoDB data events off entirely saves under $0.05 a month more: the sample held 7 non-`GetRecords` DynamoDB events in 8,000, all `DescribeStream`. It blinds the B28 `Scan` and `GetItem` detectors. Not worth it. |

## Steady-state monthly spend after the four changes in scope

| Line | $/month |
|---|---:|
| CloudWatch alarms | 19.10 |
| Lambda provisioned concurrency | 12.70 |
| WAF | 8.17 |
| CloudWatch Logs ingestion | 6.71 |
| CloudWatch custom metrics | 5.35 |
| Secrets Manager | 4.45 |
| Synthetics canary runs | 2.48 |
| KMS | 2.05 |
| Security Hub | 0.99 |
| Cognito Plus MAU | 0.80 |
| S3 | 0.60 |
| GuardDuty | 0.35 |
| ECR | 0.26 |
| submit-backup account | 0.18 |
| DynamoDB | 0.17 |
| SQS | 0.17 |
| AWS Backup, prod | 0.11 |
| Glue | 0.07 |
| CloudTrail data events | 0.04 |
| API Gateway | 0.02 |
| CloudFront, Athena, Firehose, RUM, Route 53 | 0.00 |
| **Total** | **64.77** |

$77.72 with UK VAT. Total saving $188.24.

Provisioned concurrency stays at $12.70 in that total, second only to alarms.

**If only the changes that alter no behaviour** (items 1 and 4): saving $170.24, leaving
**$82.77 a month before VAT ($99.32 with VAT)**. Items 2 and 3 each trade something real:
test isolation and per-function alarm attribution.

## Cost of each stale prod stack set

Excluded from the baseline above. This is what one `prod-*-app-*` set beyond the serving one
costs per month while it stands. The figure holds for future churn whatever today's sets do.

| Line | $/month |
|---|---:|
| CloudWatch alarms, 120 metric + 23 composite | 23.50 |
| Lambda provisioned concurrency, 5 configs | 12.70 |
| WAF, 1 web ACL + 3 rules | 8.00 |
| Synthetics canary runs, 2 canaries | 2.48 |
| Hourly `bundle-capacity-reconcile` and its DynamoDB reads | 0.10 |
| Canary artifacts bucket, API Gateway, SQS | 0.10 |
| **Total per stale set** | **46.88** |

One set stands: `prod-112b1ce`, which holds the `submit.diyaccounting.co.uk` alias on
distribution E2OXL53711PV70. The set that carries the live alias changes with each merge to
main, and nothing tears the previous one down automatically; `destroy-prod.yml` in sweep mode
only takes sets older than eight hours, so a burst of merges in one day leaves its stale sets
standing until someone names them.

## Deployment churn, excluded from the baseline

Recorded here because it explains August's shape, not because it belongs in a steady-state
figure.

- **CloudFront invalidations, $14.19 in August.** All of CloudFront's August spend. About 2,840
  paid paths beyond the 1,000-a-month free allowance. PublishStack invalidates 43 paths per
  deploy; `/*` counts as a single path. At one deploy a week the current design costs nothing.
  At this week's cadence it costs $14 a month.
- **CloudTrail management events and S3 request volume** rose with the merge count and fall back
  on their own.
- **Cognito MAU** is partly churn. 546 billable MAU in August against 40 users in the pool.
  Item 2 addresses it.

## Considered and rejected

| Candidate | Number that rejected it |
|---|---|
| Drop Lambda provisioned concurrency to zero | Would save $12.70, the second-largest controllable line. August used 2,411 provisioned GB-seconds against 4,710,844 provisioned, so it runs idle 99.95% of the time. Operator decision: cold starts on the auth and token path are not acceptable. Out of scope. |
| Turn DynamoDB data events off entirely | Under $0.05 beyond the `GetRecords` exclusion, and it blinds the `Scan` and `GetItem` detectors. |
| Delete the three test and sandbox secrets from the prod account | Saves $1.20. Operator decision: out of scope for this pass. |
| Set retention on the CloudTrail log group and a lifecycle rule on its S3 bucket | Saves $0.20. Operator decision: out of scope for this pass. |
| Add a tagged-image rule to the two ECR repositories | Saves $0.16. Operator decision: out of scope for this pass. |
| DynamoDB PITR on the 12 tables | All 12 tables together hold 10.4 MB. PITR at $0.20/GB-month is $0.002 a month. Eight of the twelve are empty. |
| Canary cadence, 51 minutes to 2 hours | Saves $1.43. Doubling the worst-case time to notice an outage is not worth it. |
| Cognito Plus down to Essentials | Saves $2.73 at 546 MAU ($0.02 to $0.015). Loses threat protection. |
| KMS customer-managed keys | $2.00 for two keys. One encrypts the backup vault, one encrypts the salt. Both load-bearing. |
| Security Hub and GuardDuty | $1.34 combined. Both are security controls at under $1 each. |
| Athena scan volume from the nightly job | The lake is 8.4 MB and the job runs once a night. $0.00 in August. |
| RUM sample rate of 1.0 | $0.00 today, inside the free allowance. RUM bills $1 per 100,000 events, so 100% sampling starts to cost money at roughly 2,000 sessions a month. Worth revisiting then, not now. |
| The 104 orphaned log groups with `NEVER` retention | They hold 50 MB between them, about $0.0015 a month. Hygiene, not cost. |
| Firehose writing `UNCOMPRESSED` to S3 | $0.00 at current volume. It inflates future Athena scans, so it is worth fixing on its own merits. |
| `scan-detect-404` every 5 minutes | 8,760 invocations a month of a 512 MB Lambda, about $0.07. |
| Holding and simulator CloudFront distributions | CloudFront charges nothing for an idle distribution. $0.00. |
| Route 53 and NAT gateways | Neither exists in this account. $0.00. |
| S3 storage class on the analytics lake | 8.4 MB. Lifecycle rules already expire raw events, GA4 exports, errors and CloudFront logs. |
| us-east-1 Lambda@Edge | No distribution has any Lambda@Edge or CloudFront Function association on any cache behaviour. There is nothing to right-size. |

## What could not be measured

- **The $10.35 custom-metric line, attributed to individual series.** Cost Explorer stops at
  `EUW2-CW:MetricMonitorUsage`. `list-metrics --recently-active PT3H` returns 195 non-AWS series
  against a billed count near 35, so the two do not reconcile. The `behaviour-test` namespace
  and its 504 accumulated series is the identified growth risk, and item 4's $5.00 saving is an
  estimate rather than a measurement.
- **Whether the 546 August Cognito MAU are test users.** The pool holds 40. MAU counts anyone
  active at any point in the month, and deleted users still count, so the gap fits test-user
  churn. Cognito exposes no per-user MAU history to prove it.
- **The Cognito Lite rate for eu-west-2 and whether it carries a free allowance.** Not verified
  against a live source, so the Plus-to-Lite saving is unquantified. The Essentials figure in the
  rejected table is safe.
- **A single-deployment day for the CloudTrail data-event rate.** Data events only started on
  2026-08-29, and every day since has had two or three app stack sets live. The `GetRecords`
  volume is env-level and should not move with deployment count, but there is no quiet day to
  confirm that against.
- **Any split of the bill by stack or deployment.** Cost allocation tags are known to billing but
  none is active (`PLAN_COST_INSTRUMENTATION.md`). Every per-deployment figure here is built from
  resource counts and rates, not from billing data. Activating those tags would let the next
  review check these numbers instead of rebuilding them.
- **Steady-state traffic.** Prod carried no user traffic during the measured window. CloudFront
  transfer, Lambda invocation, API Gateway and DynamoDB request costs are all near zero and will
  move with real usage.

Sibling accounts are out of this lane. The spreadsheets account's Bedrock line and the management
account's us-east-1 CDK bootstrap ECR repository are both in backlog row 43.
