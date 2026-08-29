# Usage Data Pipeline

Design for backlog items 13a (Firehose spike), 13 (the lake) and 14 (scheduled ingestion).
The repo has no Firehose, Glue or Athena code today, so all of this is greenfield.

This document is the design. It carries enough detail that each work package can be
implemented without further design decisions. The work package table at the end names
owned paths so packages can run concurrently.

## What we are building

Activity events and DynamoDB table changes stream into a partitioned lake on S3. Glue
catalogues it, Athena queries it, a scheduled Lambda turns the answers into CloudWatch
metrics, and a CloudWatch dashboard shows them. Three nightly jobs add GA4, Stripe and
CloudFront data so the funnel and the revenue sit in the same place as the product events.

```
EventBridge activity bus ──rule──> Firehose ──> s3://lake/curated/activity-events/  (Parquet)
DynamoDB streams (4 tables) ──Lambda──> Firehose x4 ──> s3://lake/curated/tables/<table>/
GA4 Data API      ──nightly Lambda──> s3://lake/curated/ga4/
Stripe API        ──nightly Lambda──> s3://lake/curated/stripe/<entity>/
CloudFront logs   ──logging v2──────> s3://lake/raw/cloudfront/            (Parquet)
                                          │
                              Glue database + tables (partition projection)
                                          │
                              Athena workgroup + views
                                          │
                    scheduled Lambda ──> CloudWatch metrics ──> dashboard
```

## 1. Placement and stack layout

Two new stacks, both environment-scoped.

| Stack | Id | Contents |
|---|---|---|
| `AnalyticsStack` | `{env}-env-AnalyticsStack` | Lake bucket, Athena results bucket, Glue database and tables, Athena workgroup and named queries, the activity-event Firehose and its EventBridge rule, the DynamoDB stream Firehoses and their consumer Lambda, the Glue data quality ruleset, the metrics-publishing Lambda and the analytics dashboard |
| `IngestionStack` | `{env}-env-IngestionStack` | GA4, Stripe and CloudFront ingestion Lambdas, their schedules, DLQs and alarms. Imports the lake bucket and Glue database by name |

Everything here is environment-scoped, not application-scoped. The reason is lifetime: app
stacks are per-deployment and are created and destroyed on every release, while the data has
to outlive them. A per-deployment lake would fragment history at every deploy and lose it at
every teardown. The upstream sources are env-scoped too: the activity bus lives in
`ActivityStack`, the DynamoDB tables live in `DataStack`, and both are `{env}-env-*`.

One resource moves from app scope to env scope: the CloudFront standard-logging bucket,
today created inside `EdgeStack` (`EdgeStack.java:414`) with a CDK-generated name and a
90-day expiry. It dies with the deployment, which makes any catalog over it worthless.
See WP-11.

### Assembly

`SubmitEnvironment` instantiates both, after `ActivityStack` and `DataStack`:

```java
this.analyticsStack = new AnalyticsStack(app, sharedNames.analyticsStackId, ...);
this.analyticsStack.addStackDependency(this.activityStack);
this.analyticsStack.addStackDependency(this.dataStack);

this.ingestionStack = new IngestionStack(app, sharedNames.ingestionStackId, ...);
this.ingestionStack.addStackDependency(this.analyticsStack);
```

Cross-stack wiring follows the repo's existing habit: import by name, not by ARN reference.
`AnalyticsStack` imports the bus with `EventBus.fromEventBusName(this, "ActivityBus",
props.sharedNames().activityBusName)`, exactly as `OpsStack.java:188` does. `IngestionStack`
imports the lake with `Bucket.fromBucketName`. No `crossRegionReferences`, no exported
outputs consumed by another stack. Everything is eu-west-2.

### Deployment

`.github/workflows/deploy-environment.yml` gets two jobs modelled on `deploy-activity`:

```yaml
  deploy-analytics:
    name: 'deploy analytics'
    needs: [names, create-secrets, deploy-activity, deploy-data]
    uses: ./.github/workflows/deploy-cdk-stack.yml
    permissions: {contents: read, packages: read, id-token: write, pages: write, pull-requests: read}
    with:
      stackName: ${{ needs.names.outputs.environment-name }}-env-AnalyticsStack
      force-stack-deployment: 'true'
      environment-name: ${{ needs.names.outputs.environment-name }}
      deployment-name: ${{ needs.names.outputs.environment-name }}
      cdk-application: 'environment'

  deploy-ingestion:
    name: 'deploy ingestion'
    needs: [names, create-secrets, deploy-analytics, deploy-ecr]
    # ... same shape, stackName {env}-env-IngestionStack
```

Both stack paths join the workflow's `paths:` trigger list at the top of the file.
`deploy-ingestion` needs `deploy-ecr` because its Lambdas are Docker-image functions from
the env ECR repository, like every other Lambda in this repo.

## 2. Naming

Added to `SubmitSharedNames`, built from `envResourceNamePrefix` (`{env}-env`) the same way
the table names are (`SubmitSharedNames.java:482`).

| Field | Value | Note |
|---|---|---|
| `analyticsStackId` | `{env}-env-AnalyticsStack` | |
| `ingestionStackId` | `{env}-env-IngestionStack` | |
| `analyticsLakeBucketName` | `{env}-env-analytics-lake-{account}` | account id suffix because S3 names are global |
| `analyticsResultsBucketName` | `{env}-env-analytics-results-{account}` | Athena query results |
| `cloudFrontLogBucketName` | `{env}-env-cloudfront-logs-{account}` | replaces the EdgeStack bucket |
| `glueDatabaseName` | `{env}_env_analytics` | underscores: Glue and Athena identifiers |
| `athenaWorkGroupName` | `{env}-env-analytics` | |
| `activityEventsDeliveryStreamName` | `{env}-env-activity-events` | |
| `tableStreamDeliveryStreamName(table)` | `{env}-env-stream-{table}` | one per streamed table |
| `analyticsDataQualityRulesetName` | `{env}_env_activity_events_dq` | |
| `analyticsDashboardName` | `{env}-env-analytics` | |

Lambda names follow the env-scoped pattern already used for the billing webhook
(`SubmitSharedNames.java:475`), e.g. `{env}-env-ga4-report-pull`, with a handler string of
`app/functions/analytics/ga4ReportPull.handler`.

S3 layout inside the lake bucket:

```
raw/activity-events/year=YYYY/month=MM/day=DD/          spike output, gzipped NDJSON
raw/cloudfront/<distribution-id>/year=.../month=.../day=.../   Parquet, written by CloudFront
curated/activity-events/year=.../month=.../day=.../     Parquet, from WP-3 onward
curated/tables/<table>/year=.../month=.../day=.../      Parquet, DynamoDB change records
curated/ga4/report=<name>/dt=YYYY-MM-DD/                gzipped NDJSON
curated/stripe/<entity>/dt=YYYY-MM-DD/                  gzipped NDJSON
errors/<source>/<error-type>/year=.../month=.../day=.../  Firehose failed records
```

## 3. Cross-cutting decisions

**Encryption: SSE-S3.** Activity events carry hashed subs and masked emails, never raw PII,
VRNs or box values (see the redaction rules in WP-4). The buckets block all public access.
SSE-KMS would add a per-request KMS charge and a key policy that Firehose, Glue, Athena and
five Lambda roles all need to appear in, for no gain over an S3-managed key. Use SSE-KMS if
the lake ever holds unmasked customer data.

**Partitioning: Hive-style `year=/month=/day=` with Glue partition projection.** Projection
means no crawler, no `MSCK REPAIR`, no partition-maintenance job and no Glue crawler bill.
Every table sets `projection.enabled=true` with integer ranges on year, month and day, and a
`storage.location.template`. The date-keyed curated tables (`ga4`, `stripe`) project a single
`dt` key of type `date`.

**Removal policy: DESTROY everywhere, `autoDeleteObjects(true)` on both buckets.** Matches
the repo's teardown philosophy. The lake is derived data. Activity events are also on the
EventBridge bus, receipts and bundles are in DynamoDB with PITR, Stripe and GA4 hold their
own copies. Nothing here is a system of record.

**Lifecycle.**

| Location | prod | ci |
|---|---|---|
| `raw/activity-events/` | expire 90 days (superseded by curated) | expire 14 days |
| `curated/**` | INFREQUENT_ACCESS at 30 days, expire 800 days | expire 30 days |
| `raw/cloudfront/` | INFREQUENT_ACCESS at 30 days, expire 400 days | expire 30 days |
| `errors/**` | expire 30 days | expire 14 days |
| Athena results bucket | expire 14 days | expire 14 days |

The 14-day results expiry matches the existing canary-artifact rule in `OpsStack.java:383`.

**CI gets the full lake.** Same stacks, same tables, same views. A pipeline tested only in
prod is not tested. What differs is retention (above), the Athena per-query scan cap
(1 GB in ci, 10 GB in prod) and the ingestion schedules (WP-9 to WP-11 run daily in prod,
weekly in ci, so third-party API calls stay low).

**Tagging.** Every new stack opens with the same `Tags.of(this).add(...)` block that
`ActivityStack.java:59-66` uses, with `Stack` set to `AnalyticsStack` or `IngestionStack`.
Add `DataClassification` = `internal` and `BackupRequired` = `false`.

**IAM.** No `Resource: "*"` anywhere. Concretely:

| Principal | Grants |
|---|---|
| Firehose delivery role (one per stream) | `s3:AbortMultipartUpload`, `PutObject`, `GetBucketLocation`, `ListBucket`, `ListBucketMultipartUploads` on the lake bucket and its ARN/`*`; `logs:PutLogEvents` on that stream's log group only; `lambda:InvokeFunction` on the transform Lambda alias only; from WP-3, `glue:GetTable`, `GetTableVersion`, `GetTableVersions` on the one table ARN it converts against |
| `dynamoStreamToFirehose` Lambda | `dynamodb:GetRecords`, `GetShardIterator`, `DescribeStream`, `ListStreams` on the four stream ARNs; `firehose:PutRecordBatch` on the four delivery stream ARNs |
| `analyticsMetricsPublish` Lambda | `athena:StartQueryExecution`, `GetQueryExecution`, `GetQueryResults`, `StopQueryExecution` on the one workgroup ARN; `glue:GetDatabase`, `GetTable`, `GetPartitions` on the database and its tables; `s3:GetObject`/`PutObject` on the results bucket; `s3:GetObject`/`ListBucket` on the lake bucket; `cloudwatch:PutMetricData` conditioned on `cloudwatch:namespace` equals `Submit/Analytics` |
| Ingestion Lambdas | `s3:PutObject` on their own lake prefix only; `secretsmanager:GetSecretValue` on their own secret ARN (with the `-*` suffix the repo already appends, `OpsStack.java:250`) |
| CloudFront log delivery | S3 bucket policy allowing `delivery.logs.amazonaws.com` to `s3:PutObject` under `raw/cloudfront/`, conditioned on `aws:SourceAccount` |

**Alarms route through the existing path.** Environment-scoped alarms in this repo carry no
SNS action; `OpsStack`'s default-bus `AlarmStateChangeRule` (`OpsStack.java:297`) catches
every `CloudWatch Alarm State Change` in the account and forwards it to Telegram. New alarms
follow `ObservabilityStack.java:679` and set no action. That keeps the app-scoped alert topic
out of an env-scoped stack, which would otherwise be a cross-scope dependency.

Alarms to create:

| Alarm | Metric | Threshold |
|---|---|---|
| `{env}-env-firehose-delivery-failed` | `AWS/Firehose` `DeliveryToS3.DataFreshness` max, per stream | > 3600 s for 2 periods of 5 min |
| `{env}-env-firehose-put-failed` | `AWS/Firehose` `ThrottledRecords` sum | >= 1 in 15 min |
| `{env}-env-stream-consumer-errors` | `AWS/Lambda` `Errors` on `dynamoStreamToFirehose` | >= 1 in 15 min |
| `{env}-env-data-quality-failed` | `Glue Data Quality` `glue.data.quality.rules.failed` sum | >= 1 in 24 h |
| `{env}-env-ingestion-job-failed` | `AWS/Lambda` `Errors`, one per ingestion Lambda | >= 1 in 24 h |
| `{env}-env-ingestion-dlq-depth` | `AWS/SQS` `ApproximateNumberOfMessagesVisible` per DLQ | >= 1 |

All use `TreatMissingData.NOT_BREACHING`.

## 4. Volume and cost

**Current volume is low and needs measuring, not guessing.** Every activity event today
fans out to an SNS email (`OpsStack.java:191`), which puts a practical ceiling on it: the
operator would notice hundreds a day. Measure it before sizing anything:

```bash
aws --profile submit-prod cloudwatch get-metric-statistics \
  --namespace AWS/Events --metric-name TriggeredRules \
  --dimensions Name=RuleName,Value=prod-<deployment>-app-activity-telegram \
               Name=EventBusName,Value=prod-env-activity-bus \
  --start-time "$(date -u -v-14d +%FT%TZ)" --end-time "$(date -u +%FT%TZ)" \
  --period 86400 --statistics Sum
```

Measured 2026-08-15 to 2026-08-28 (the metric needs both dimensions; take the daily maximum
across the per-deployment rules, since every rule on the bus fires for every event): 24 a day
while only the canaries ran, 255 to 454 a day once deploys and behaviour tests resumed on
2026-08-24, a fourteen-day mean of 141. Everything below assumes 2,000 events/day, which is
still generous by a factor of four.

| Line | Basis | Monthly |
|---|---|---|
| Firehose ingestion, activity events | 2,000/day x 5 KB billed minimum = 0.3 GB/mo at $0.029/GB | $0.01 |
| Firehose ingestion, table streams | ~500 changes/day, same minimum | $0.01 |
| Firehose Parquet conversion (WP-3 on) | $0.018/GB on the same volume | $0.01 |
| Transform Lambda invocations | ~9,000/mo at 128 MB, sub-100 ms | free tier |
| S3 storage | under 1 GB, Parquet | $0.03 |
| S3 PUTs | 300 s buffer = 288 objects/day/stream, 5 streams, ~43k PUT/mo | $0.22 |
| Athena | metrics job: ~20 queries/day scanning under 50 MB each, $5/TB | $0.15 |
| Glue catalog | first million objects free | $0 |
| Glue Data Quality | one daily evaluation run, ~2 DPU-min at $0.44/DPU-hour | $0.45 |
| CloudWatch custom metrics | ~20 metrics at $0.30 | $6.00 |
| CloudWatch dashboard | fourth dashboard in the account | $3.00 |
| GA4 Data API | within free quota | $0 |
| Ingestion Lambdas | 3 jobs x 30 runs | free tier |
| **Total, prod** | | **~$10/month** |

ci is roughly half that: the same fixed CloudWatch lines minus the dashboard, with almost no
data. Against a bill that ran $436 excluding tax in the last measured month
(`AWS_COSTS.md:400`), the whole pipeline is under 3%.

The two lines worth watching are CloudWatch custom metrics and the dashboard, which together
are 90% of the cost and are fixed rather than volume-driven. Keep the published metric count
at or under 20 (WP-7).

---

# WP-1: the Firehose spike (backlog 13a)

One rule, one delivery stream, one table, one query. Proves delivery, IAM, partitioning and
the cost shape before the lake design is committed.

## Format decision: gzipped newline-delimited JSON, not Parquet

The spike lands JSON. Parquet via Firehose record format conversion needs a Glue table with
concrete column types to exist *before* delivery works at all, which locks the event schema
at exactly the moment it is least settled, and it adds a conversion charge and a Glue
`GetTable` call on the delivery path. JSON with an OpenX SerDe table gets a working Athena
query the same day and lets WP-3 pick the Parquet schema from real data.

WP-3 adds Parquet under a second prefix and leaves this table readable. The alternative is
going straight to Parquet in the spike, worth choosing only if the operator wants the
certification artefact in the spike itself rather than a week later.

## Partitioning: arrival time, not event time

The S3 prefix uses Firehose's timestamp namespace, which resolves from the record's
approximate arrival time:

```
raw/activity-events/year=!{timestamp:yyyy}/month=!{timestamp:MM}/day=!{timestamp:dd}/
```

and the error prefix:

```
errors/activity-events/!{firehose:error-output-type}/year=!{timestamp:yyyy}/month=!{timestamp:MM}/day=!{timestamp:dd}/
```

This needs no dynamic partitioning, no inline JQ and no per-GB dynamic-partitioning charge.
Arrival lags event time by at most the buffer interval, so a handful of events either side of
midnight land in the neighbouring day's partition. The `event_ts` column carries the true
event time, so any query that cares filters on it. WP-3 switches to JQ extraction of the
event timestamp when the partitions become the query boundary rather than a file-layout
convenience.

**Do not partition by event type.** There are about twenty event names and the whole day's
data is under a megabyte. Partitioning by type would create twenty tiny objects per buffer
flush and make the small-file problem twenty times worse for no scan saving.

## Resources

All in `AnalyticsStack`. CDK 2.266.0 (`pom.xml:19`).

### Buckets

```java
Bucket lakeBucket = Bucket.Builder.create(this, props.resourceNamePrefix() + "-AnalyticsLake")
        .bucketName(props.sharedNames().analyticsLakeBucketName)
        .encryption(BucketEncryption.S3_MANAGED)
        .blockPublicAccess(BlockPublicAccess.BLOCK_ALL)
        .enforceSsl(true)
        .removalPolicy(RemovalPolicy.DESTROY)
        .autoDeleteObjects(true)
        .lifecycleRules(<per the table in section 3>)
        .build();
```

Same shape for the results bucket with the 14-day expiry rule and no lifecycle transitions.

### Transform Lambda

`app/functions/analytics/activityEventTransform.js`, a Firehose transformation. It exists
because EventBridge hands Firehose a whole envelope with no trailing newline, and Athena's
JSON SerDe needs one JSON object per line. Doing it in a Lambda also flattens the payload,
which makes both the SerDe and the later Parquet schema simple.

Input: `event.records[]`, each with `recordId` and base64 `data` holding the EventBridge
envelope. Output: `{records: [{recordId, result: "Ok"|"Dropped"|"ProcessingFailed", data}]}`.

For each record, decode, then emit one flat object plus `"\n"`, base64-encoded:

```js
{
  event_id: envelope.id,                       // EventBridge event id, the uniqueness key
  event_ts: detail.timestamp,                  // ISO-8601 from activityAlert.js
  ingest_ts: envelope.time,                    // when EventBridge saw it
  event: detail.event,
  site: detail.site,
  summary: detail.summary,
  actor: detail.actor,
  flow: detail.flow,
  outcome: detail.outcome ?? null,             // "failure" on failure events
  failure: detail.failure ?? null,
  request_id: detail.requestId ?? null,
  hashed_sub: detail.hashedSub ?? null,
  bundle_id: detail.bundleId ?? null,
  pass_type_id: detail.passTypeId ?? null,
  subscription_id: detail.subscriptionId ?? null,
  visitor_type: detail.visitorType ?? null,
  country: detail.country ?? null,
  page: detail.page ?? null,
  hmrc_status: detail.hmrcStatus ?? null,
  env: process.env.ENVIRONMENT_NAME,
  detail_json: JSON.stringify(detail)          // everything, for fields not yet promoted
}
```

Records that fail to parse return `result: "ProcessingFailed"` so Firehose routes them to the
error prefix rather than dropping them silently. Do not swallow them.

The Lambda is a Docker-image function from the env ECR repository, built with the `Lambda`
construct exactly like `OpsStack.java:216`, with `ingestProvisionedConcurrency(0)` and a
60-second timeout.

### Delivery stream

L1 `CfnDeliveryStream`. The L2 `DeliveryStream` does not expose record format conversion,
which WP-3 needs, and switching L2 to L1 later would replace the resource.

```java
CfnDeliveryStream activityStream = CfnDeliveryStream.Builder.create(this, prefix + "-ActivityEventsStream")
    .deliveryStreamName(sharedNames.activityEventsDeliveryStreamName)
    .deliveryStreamType("DirectPut")
    .extendedS3DestinationConfiguration(ExtendedS3DestinationConfigurationProperty.builder()
        .bucketArn(lakeBucket.getBucketArn())
        .roleArn(firehoseRole.getRoleArn())
        .prefix("raw/activity-events/year=!{timestamp:yyyy}/month=!{timestamp:MM}/day=!{timestamp:dd}/")
        .errorOutputPrefix("errors/activity-events/!{firehose:error-output-type}/year=!{timestamp:yyyy}/month=!{timestamp:MM}/day=!{timestamp:dd}/")
        .bufferingHints(BufferingHintsProperty.builder()
            .intervalInSeconds(300).sizeInMBs(5).build())
        .compressionFormat("GZIP")
        .cloudWatchLoggingOptions(CloudWatchLoggingOptionsProperty.builder()
            .enabled(true)
            .logGroupName("/aws/kinesisfirehose/" + streamName)
            .logStreamName("S3Delivery").build())
        .processingConfiguration(ProcessingConfigurationProperty.builder()
            .enabled(true)
            .processors(List.of(ProcessorProperty.builder()
                .type("Lambda")
                .parameters(List.of(ProcessorParameterProperty.builder()
                    .parameterName("LambdaArn")
                    .parameterValue(transformLambda.ingestLambdaAliasArn).build()))
                .build()))
            .build())
        .build())
    .build();
```

The log group is created explicitly with `LogGroup.Builder` (retention 30 days, removal
DESTROY) and the stream given `addDependency` on it, so the Firehose role's `logs:PutLogEvents`
grant can be scoped to that one ARN instead of the account.

Buffering at 300 s and 5 MiB means the interval always wins at this volume: 288 objects a day.
That is deliberate for the spike, where a five-minute wait between publishing an event and
querying it is the difference between a working feedback loop and an hour of guessing. WP-3
raises it to 900 s.

### EventBridge rule

```java
IDeliveryStream imported = DeliveryStream.fromDeliveryStreamArn(
        this, "ActivityEventsStreamRef", activityStream.getAttrArn());
Rule activityToLake = Rule.Builder.create(this, "ActivityToLakeRule")
        .ruleName(props.resourceNamePrefix() + "-activity-to-lake")
        .eventBus(activityBus)
        .eventPattern(EventPattern.builder().detailType(List.of("ActivityEvent")).build())
        .targets(List.of(new KinesisFirehoseStreamV2(imported)))
        .build();
activityToLake.getNode().addDependency(activityStream);
```

The explicit `addDependency` is needed because the imported reference hides the L1 resource
from CDK's dependency graph. If `KinesisFirehoseStreamV2` proves awkward against an imported
stream, fall back to `CfnRule` with an explicit `targets[].arn` and `roleArn` pointing at a
role that allows `firehose:PutRecord` and `PutRecordBatch` on the one stream ARN.

The rule matches the same pattern as the two existing rules on this bus, so a published event
now has three consumers: the SNS email proof, the Telegram forwarder and the lake.

### Glue database and table

```java
CfnDatabase db = CfnDatabase.Builder.create(this, prefix + "-GlueDatabase")
    .catalogId(this.getAccount())
    .databaseInput(DatabaseInputProperty.builder()
        .name(sharedNames.glueDatabaseName)
        .description("Usage analytics for " + props.envName())
        .build())
    .build();
```

Table `activity_events_raw`:

- `tableType` = `EXTERNAL_TABLE`
- Columns, all `string` except where noted: `event_id`, `event_ts`, `ingest_ts`, `event`,
  `site`, `summary`, `actor`, `flow`, `outcome`, `failure`, `request_id`, `hashed_sub`,
  `bundle_id`, `pass_type_id`, `subscription_id`, `visitor_type`, `country`, `page`,
  `hmrc_status`, `env`, `detail_json`
- Partition keys: `year` int, `month` int, `day` int
- `location` = `s3://{lake}/raw/activity-events/`
- Input format `org.apache.hadoop.mapred.TextInputFormat`, output format
  `org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat`
- SerDe `org.openx.data.jsonserde.JsonSerDe` with `ignore.malformed.json` = `true`
- Table parameters for projection:

```
projection.enabled            = true
projection.year.type          = integer
projection.year.range         = 2026,2035
projection.month.type         = integer
projection.month.range        = 1,12
projection.month.digits       = 2
projection.day.type           = integer
projection.day.range          = 1,31
projection.day.digits         = 2
storage.location.template     = s3://{lake}/raw/activity-events/year=${year}/month=${month}/day=${day}/
classification                = json
compressionType               = gzip
has_encrypted_data            = false
```

Projection is what removes the crawler. There is no `MSCK REPAIR`, no partition-registration
job and no Glue crawler line on the bill, ever.

### Athena workgroup and named query

```java
CfnWorkGroup wg = CfnWorkGroup.Builder.create(this, prefix + "-AnalyticsWorkGroup")
    .name(sharedNames.athenaWorkGroupName)
    .state("ENABLED")
    .recursiveDeleteOption(true)
    .workGroupConfiguration(WorkGroupConfigurationProperty.builder()
        .enforceWorkGroupConfiguration(true)
        .publishCloudWatchMetricsEnabled(true)
        .bytesScannedCutoffPerQuery(<1_000_000_000L in ci, 10_000_000_000L in prod>)
        .resultConfiguration(ResultConfigurationProperty.builder()
            .outputLocation("s3://" + resultsBucketName + "/athena/")
            .encryptionConfiguration(EncryptionConfigurationProperty.builder()
                .encryptionOption("SSE_S3").build())
            .build())
        .engineVersion(EngineVersionProperty.builder()
            .selectedEngineVersion("Athena engine version 3").build())
        .build())
    .build();
```

`recursiveDeleteOption(true)` matters for teardown: without it, deleting a workgroup that has
named queries fails.

Named query `activity-events-per-day`:

```sql
SELECT date(from_iso8601_timestamp(event_ts)) AS day,
       event,
       actor,
       count(*) AS events
FROM   {env}_env_analytics.activity_events_raw
WHERE  year >= 2026
GROUP  BY 1, 2, 3
ORDER  BY 1 DESC, 4 DESC
```

## Tests

`infra/test/java/co/uk/diyaccounting/submit/SubmitEnvironmentCdkResourceTest.java`, in the
existing `shouldCreateEnvironmentStacksWithResources` method (shared file, see the
serialisation note in the work package table):

- `resourceCountIs("AWS::KinesisFirehose::DeliveryStream", 1)` on the analytics stack
- `resourceCountIs("AWS::Glue::Database", 1)`, `("AWS::Glue::Table", 1)`
- `resourceCountIs("AWS::Athena::WorkGroup", 1)`, `("AWS::Athena::NamedQuery", 1)`
- `resourceCountIs("AWS::S3::Bucket", 2)`
- `hasResourceProperties("AWS::KinesisFirehose::DeliveryStream", Match.objectLike(Map.of(
  "ExtendedS3DestinationConfiguration", Match.objectLike(Map.of("CompressionFormat", "GZIP")))))`
- `hasResourceProperties("AWS::Events::Rule", ...)` asserting the rule's `EventBusName`
  resolves to the activity bus and the pattern's `detail-type` is `["ActivityEvent"]`
- `hasResourceProperties("AWS::Glue::Table", ...)` asserting `projection.enabled` is `true`
- An IAM assertion that no policy in the stack contains `"Resource": "*"`. Read the synthesised
  template JSON and fail on any `AWS::IAM::Policy` statement whose `Resource` is the literal
  string `*`.

`app/unit-tests/analytics/activityEventTransform.test.js`:

- a well-formed EventBridge envelope produces one `Ok` record whose decoded data ends in `\n`
  and parses as a single JSON object
- a failure event (with `outcome` and `failure` in the detail) promotes both columns
- a record whose data is not JSON returns `ProcessingFailed`, not `Ok` and not `Dropped`
- `detail_json` round-trips the original detail
- a batch of 100 records returns 100 records with matching `recordId`s in order

## End-to-end verification after deploy

Run by hand first, then paste into `scripts/verify-analytics-pipeline.sh` so it can be called
from a workflow. Read-only apart from the one test event.

```bash
export AWS_PROFILE=submit-ci
ENV=ci
ACCOUNT=367191799875
BUS="${ENV}-env-activity-bus"
LAKE="${ENV}-env-analytics-lake-${ACCOUNT}"
WG="${ENV}-env-analytics"

# 1. Publish one real event through the same path the app uses.
aws events put-events --entries "[{
  \"EventBusName\": \"${BUS}\",
  \"Source\": \"diy.submit\",
  \"DetailType\": \"ActivityEvent\",
  \"Detail\": \"{\\\"event\\\":\\\"pipeline-verification\\\",\\\"site\\\":\\\"submit\\\",\\\"summary\\\":\\\"pipeline verification\\\",\\\"actor\\\":\\\"synthetic\\\",\\\"flow\\\":\\\"operational\\\",\\\"timestamp\\\":\\\"$(date -u +%FT%TZ)\\\"}\"
}]"

# 2. Wait out the buffer, then confirm an object landed in today's partition.
sleep 330
aws s3 ls "s3://${LAKE}/raw/activity-events/year=$(date -u +%Y)/month=$(date -u +%m)/day=$(date -u +%d)/" --recursive

# 3. Query it.
QID=$(aws athena start-query-execution \
  --work-group "${WG}" \
  --query-string "SELECT event, count(*) c FROM ${ENV}_env_analytics.activity_events_raw WHERE year=$(date -u +%Y) AND month=$(date -u +%-m) AND day=$(date -u +%-d) GROUP BY 1" \
  --query QueryExecutionId --output text)
aws athena get-query-execution --query-execution-id "$QID" --query 'QueryExecution.Status.State'
aws athena get-query-results --query-execution-id "$QID"
```

Step 3 must show the `pipeline-verification` row. If step 2 shows nothing, check the Firehose
log group `/aws/kinesisfirehose/{env}-env-activity-events` first: a transform Lambda that
returns a malformed response shows up there and nowhere else.

Note the partition predicate uses `%-m`/`%-d` (no leading zero) because the projection columns
are integers while the S3 path is zero-padded. The `digits` projection properties reconcile
the two. Getting this backwards is the most likely reason a first query returns zero rows.

## Done criteria

- `./mvnw clean verify` passes with the new assertions
- `npm test` passes with the new transform unit tests
- The stack deploys to ci through `deploy-environment.yml`
- The verification script returns the test event from Athena
- The measured fourteen-day daily event volume is written into section 4 of this file,
  replacing the 2,000/day assumption

---

# WP-2: DynamoDB streams on the tables that matter (backlog 13)

Four tables get streams. Everything downstream of them is WP-4.

| Table | Why | Excluded |
|---|---|---|
| `{env}-env-receipts` | one row per HMRC submission, the core business fact | |
| `{env}-env-bundles` | entitlement grants and expiries | |
| `{env}-env-subscriptions` | subscription state changes, the revenue signal | |
| `{env}-env-passes` | pass issue and redemption | |
| | | `*-async-requests` (five tables): one-hour TTL, pure request scaffolding, no analytic content |
| | | `bundle-capacity`: rewritten wholesale every hour by the reconciler, so a stream would emit noise proportional to nothing |
| | | `hmrc-api-requests`: 28-day audit trail, high volume, already queryable, and the interesting parts are duplicated in receipts |

## The shared-file edit

No table in this repo has a stream today. Tables are created by `KindCdk.ensureTable`
(`KindCdk.java:175`) through an `AwsCustomResource` `CreateTable` call, which takes no
`StreamSpecification` and, importantly, does nothing at all when the table already exists.
Enabling streams therefore needs a second idempotent call, exactly the way PITR and TTL are
handled today.

Add `KindCdk.ensureStream(Stack stack, String id, String tableName, String viewType)`:

- `AwsSdkCall` on service `DynamoDB`, action `updateTable`, parameters
  `{TableName, StreamSpecification: {StreamEnabled: true, StreamViewType: "NEW_AND_OLD_IMAGES"}}`
- `physicalResourceId` of `tableName + "-stream"`
- `ignoreErrorCodesMatching("ValidationException")` so re-enabling an already-streaming table
  is a no-op (DynamoDB rejects a no-change UpdateTable with ValidationException)
- Policy scoped to `dynamodb:UpdateTable` on the one table ARN

Then in `DataStack`, four `ensureStream` calls after the matching `ensureTable`, each with a
`getNode().addDependency` on the table's `-EnsureTable` custom resource, following the pattern
already used for the passes GSI (`DataStack.java:213-218`).

`NEW_AND_OLD_IMAGES` rather than `NEW_IMAGE` because deletes and expiries carry their meaning
in the old image only, and a bundle expiry is a fact worth counting.

Stream ARNs are not returned by `ensureTable`'s imported `ITable`. Build them by name in
`SubmitSharedNames` is impossible (they carry a timestamp suffix). Instead, `DataStack` exposes
`ensureStream`'s returned latest stream ARN as a CloudFormation output per table, and
`AnalyticsStack` reads it with an `AwsCustomResource` `describeTable` call at deploy time,
or the consumer Lambda resolves it at cold start. Prefer the second: the Lambda's event source
mapping needs the ARN at synth time, so use the first, an `AwsCustomResource` in
`AnalyticsStack` calling `dynamodb:DescribeTable` and reading
`Table.LatestStreamArn` via `getResponseField`. Scope its policy to the four table ARNs.

**Cost and impact.** Enabling a stream costs nothing by itself; DynamoDB charges the reader
$0.02 per 100,000 stream read requests beyond a 2.5 million free tier per month. At the
volumes here that is zero. Enabling a stream is an `UpdateTable` that completes in seconds
and does not interrupt reads or writes. It does start a 24-hour rolling buffer, which is the
only recovery window if the consumer breaks, so the consumer's error alarm matters.

**Serialisation.** `DataStack.java` and `KindCdk.java` are edited by this package and by
nothing else in this plan. WP-4 depends on it. Run WP-2 before WP-4 and do not run them
concurrently.

## Tests

- `infra/test/java/co/uk/diyaccounting/submit/utils/KindCdkTest.java`: `ensureStream`
  produces an `AwsSdkCall` with `StreamEnabled: true` and the expected `physicalResourceId`
- `SubmitEnvironmentCdkResourceTest`: the data stack's `Custom::AWS` count rises by 4
  (currently asserted at 30, `SubmitEnvironmentCdkResourceTest.java:83`), and the comment
  above that assertion is updated to say why

## Done criteria

- `./mvnw clean verify` passes
- After deploy to ci, `aws dynamodb describe-table --table-name ci-env-receipts
  --query 'Table.StreamSpecification'` shows `StreamEnabled: true` and
  `StreamViewType: NEW_AND_OLD_IMAGES`, and the same for the other three
- A second deploy of `DataStack` succeeds (proves idempotency)

---

# WP-3: Parquet conversion for activity events (backlog 13)

The spike's JSON stays where it is and stays queryable. This package adds a second output.

## Change

The same delivery stream gains `dataFormatConversionConfiguration` and a new prefix:

```java
.prefix("curated/activity-events/year=!{timestamp:yyyy}/month=!{timestamp:MM}/day=!{timestamp:dd}/")
.bufferingHints(intervalInSeconds(900).sizeInMBs(128))
.compressionFormat("UNCOMPRESSED")   // Parquet carries its own Snappy compression
.dataFormatConversionConfiguration(DataFormatConversionConfigurationProperty.builder()
    .enabled(true)
    .inputFormatConfiguration(InputFormatConfigurationProperty.builder()
        .deserializer(DeserializerProperty.builder()
            .openXJsonSerDe(OpenXJsonSerDeProperty.builder()
                .convertDotsInJsonKeysToUnderscores(false)
                .caseInsensitive(false).build())
            .build())
        .build())
    .outputFormatConfiguration(OutputFormatConfigurationProperty.builder()
        .serializer(SerializerProperty.builder()
            .parquetSerDe(ParquetSerDeProperty.builder()
                .compression("SNAPPY").build())
            .build())
        .build())
    .schemaConfiguration(SchemaConfigurationProperty.builder()
        .catalogId(this.getAccount())
        .databaseName(sharedNames.glueDatabaseName)
        .tableName("activity_events")
        .roleArn(firehoseRole.getRoleArn())
        .versionId("LATEST").build())
    .build())
```

The buffer moves to 900 s / 128 MiB. Parquet's per-file overhead makes many small files
actively bad, and fifteen-minute latency is irrelevant to a daily dashboard. That is 96
objects a day instead of 288.

Compression must be `UNCOMPRESSED` at the destination when format conversion is on. Setting
GZIP as well produces gzipped Parquet that Athena can read but that no engine can predicate-
push-down into.

Note that `bufferingHints` minimums change with format conversion on: the size hint has a
64 MiB floor. Using 128 is safe.

## New Glue table

`activity_events`, same column names as `activity_events_raw` but typed:

| Column | Type |
|---|---|
| `event_id`, `event`, `site`, `summary`, `actor`, `flow`, `outcome`, `failure`, `request_id`, `hashed_sub`, `bundle_id`, `pass_type_id`, `subscription_id`, `visitor_type`, `country`, `page`, `hmrc_status`, `env`, `detail_json` | `string` |
| `event_ts`, `ingest_ts` | `timestamp` |

The transform Lambda changes one thing: `event_ts` and `ingest_ts` are emitted as
`yyyy-MM-dd HH:mm:ss.SSS` rather than ISO-8601 with a `T` and a `Z`, because the OpenX
deserializer feeding Parquet only recognises that form for a timestamp column. Add a unit test
that pins the format. This is the single most likely cause of a stream that delivers nothing
but error records after this package lands.

Table properties: `classification = parquet`, input format
`org.apache.hadoop.hive.ql.io.parquet.MapredParquetInputFormat`, output format
`org.apache.hadoop.hive.ql.io.parquet.MapredParquetOutputFormat`, SerDe
`org.apache.hadoop.hive.ql.io.parquet.serde.ParquetHiveSerDe`, plus the same projection
properties with `storage.location.template` pointing at `curated/activity-events/`.

## Union view

```sql
CREATE OR REPLACE VIEW activity_events_all AS
SELECT event_id, event_ts, ingest_ts, event, site, summary, actor, flow, outcome, failure,
       request_id, hashed_sub, bundle_id, pass_type_id, subscription_id, visitor_type,
       country, page, hmrc_status, env, year, month, day
FROM   activity_events
UNION ALL
SELECT event_id,
       cast(from_iso8601_timestamp(event_ts) AS timestamp),
       cast(from_iso8601_timestamp(ingest_ts) AS timestamp),
       event, site, summary, actor, flow, outcome, failure, request_id, hashed_sub,
       bundle_id, pass_type_id, subscription_id, visitor_type, country, page, hmrc_status,
       env, year, month, day
FROM   activity_events_raw
WHERE  concat(cast(year AS varchar), lpad(cast(month AS varchar), 2, '0'), lpad(cast(day AS varchar), 2, '0'))
       < '<the cutover date, as YYYYMMDD, set at deploy time from a stack parameter>'
```

Every view in WP-6 reads `activity_events_all`, never the two base tables. The cutover date is
a CDK context value `analyticsParquetCutoverDate`, defaulted in `cdk-environment/cdk.json`.

Views are created as `AWS::Glue::Table` resources with `tableType = VIRTUAL_VIEW` and a
base64 `presto_view` payload, which is fiddly to hand-build. Create them instead with a
`CfnNamedQuery` per view plus a one-shot `AwsCustomResource` that calls
`athena:StartQueryExecution` on the `CREATE OR REPLACE VIEW` statement at deploy time. That
keeps the SQL readable in the repo and idempotent on redeploy.

## Tests

- Assertion that the delivery stream has `DataFormatConversionConfiguration.Enabled = true`
  and `CompressionFormat = UNCOMPRESSED`
- Assertion of two Glue tables plus the view-creating custom resource
- Unit test on the transform: `event_ts` matches `/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/`

## Done criteria

- Objects appear under `curated/activity-events/` and are readable by
  `SELECT * FROM activity_events LIMIT 10`
- `SELECT count(*) FROM activity_events_all` returns a number that covers both eras with no
  double count on the cutover day
- The error prefix has no new objects after an hour of traffic

---

# WP-4: DynamoDB change records into the lake (backlog 13)

Depends on WP-2.

## Path decision: a Lambda, not Kinesis Data Streams

Firehose cannot take a DynamoDB stream as a source. The two ways across are:

1. Enable Kinesis Data Streams for DynamoDB on each table, then point Firehose at the Kinesis
   stream. Clean, no code. Costs an on-demand Kinesis stream per table at roughly $0.036/hour,
   about $26/month each, $104/month for four. That is ten times the whole rest of this pipeline.
2. A Lambda on the DynamoDB stream that batches records into Firehose with `PutRecordBatch`.
   Costs invocations, which at this volume are inside the free tier.

Take option 2. It also puts the redaction in code where it can be unit-tested, which matters
more here than anywhere else in the pipeline.

## Four delivery streams, not one with dynamic partitioning

Firehose bills per GB ingested with no per-stream hourly charge, so four streams cost the
same as one. Four streams means four static prefixes, no dynamic partitioning, no inline JQ,
no per-GB dynamic-partitioning charge and four independently alarmable delivery paths.

Streams `{env}-env-stream-receipts`, `-bundles`, `-subscriptions`, `-passes`, each with
prefix `curated/tables/<table>/year=!{timestamp:yyyy}/...`, Parquet conversion against its own
Glue table, 900 s / 128 MiB buffering, and the same error prefix shape.

## Consumer Lambda

`app/functions/analytics/dynamoStreamToFirehose.js`. One function, four event source mappings.

- `batchSize` 100, `maximumBatchingWindow` 60 s, `startingPosition` LATEST,
  `retryAttempts` 3, `bisectBatchOnError` true, `reportBatchItemFailures` true
- Environment: `STREAM_TARGETS` as a JSON map of table name to delivery stream name,
  `ENVIRONMENT_NAME`
- Resolves the table name from `record.eventSourceARN` (the segment after `table/`)
- Unmarshals `NewImage`/`OldImage` with `@aws-sdk/util-dynamodb` `unmarshall`, which is
  already a dependency
- Emits one flat record per DynamoDB record, newline-terminated, and `PutRecordBatch`es up to
  500 at a time
- Returns `{batchItemFailures: [...]}` for records it could not deliver, so the stream retries
  only those

Record shape:

```js
{
  change_ts: new Date(record.dynamodb.ApproximateCreationDateTime * 1000),  // "YYYY-MM-DD HH:mm:ss.SSS"
  change_type: record.eventName,        // INSERT | MODIFY | REMOVE
  source_table: <table>,
  env: process.env.ENVIRONMENT_NAME,
  ...projectFields(table, newImage, oldImage)
}
```

## Redaction whitelists, per table

Only these fields cross into the lake. Everything else is dropped. This is a whitelist, not a
blacklist: a new attribute added to a table later must be added here deliberately.

| Table | Fields kept |
|---|---|
| `receipts` | `hashed_sub`, `receipt_id`, `submitted_at`, `period_key`, `bundle_id`, `hmrc_status`, `processing_date`, `form_bundle_number` |
| `bundles` | `hashed_sub`, `bundle_id`, `granted_at`, `expires_at`, `ttl`, `source` |
| `subscriptions` | `pk` hashed, `bundle_id`, `subscription_id`, `status`, `current_period_end`, `cancel_at_period_end` |
| `passes` | `pk` hashed, `pass_type_id`, `bundle_id`, `issued_by`, `created_at`, `redeemed_at`, `redeemed_by` |

Explicitly excluded: the nine VAT box values, the VRN, raw email addresses, HMRC access and
refresh tokens, Stripe customer ids, and any raw `sub`. The box values are the customer's
financial data and no business question in WP-6 needs them; counting submissions is enough.
Where a field is a raw sub, hash it with the same `hashSub` helper the app uses
(`app/services/subHasher.js`) so lake rows join to activity events.

## Glue tables

One per streamed table, `dynamo_receipts`, `dynamo_bundles`, `dynamo_subscriptions`,
`dynamo_passes`. Parquet, projection on year/month/day, columns matching the whitelists with
`change_ts` as `timestamp` and everything else `string` except `ttl`, `expires_at` and
`current_period_end` as `bigint`.

## Tests

- Unit tests on the projection function: each table's whitelist keeps exactly the named fields
  and drops a probe field that is not on the list; a REMOVE event projects from `OldImage`;
  an unrecognised table name throws rather than passing the whole image through
- Unit test that a raw `sub` in an input image never appears in output, in any field
- Unit test that a `PutRecordBatch` partial failure returns the right `batchItemFailures`
- CDK assertions: 5 delivery streams total in the stack, 4 event source mappings, 5 Glue tables
  beyond the activity ones, and the IAM `Resource: "*"` check still passes

## Done criteria

- A test bundle grant in ci produces a row in `dynamo_bundles` within 20 minutes
- `SELECT * FROM dynamo_receipts LIMIT 5` contains no VRN and no box values
- The consumer Lambda's error alarm is in OK state after a day

---

# WP-5: Glue Data Quality (backlog 13)

A ruleset over `activity_events`, evaluated daily, with failures reaching Telegram through the
existing alarm path.

## Ruleset

`AWS::Glue::DataQualityRuleset`, `TargetTable` = `activity_events` in the analytics database,
`Ruleset` as DQDL:

```
Rules = [
    RowCount > 0,
    IsComplete "event",
    IsComplete "event_ts",
    IsComplete "site",
    Completeness "actor" > 0.99,
    Completeness "flow" > 0.99,
    Uniqueness "event_id" > 0.99,
    ColumnValues "actor" in ["customer","test-user","synthetic","system","visitor","ai-agent"],
    ColumnValues "flow" in ["user-journey","ci-pipeline","infrastructure","operational","unknown"],
    ColumnValues "site" in ["submit"],
    ColumnValues "outcome" in ["failure"] with threshold < 0.2,
    ColumnValues "event_ts" > (now() - 2 days)
]
```

Each rule is there for a reason:

- `RowCount > 0` catches a dead delivery path, which is the failure that matters most and the
  one nothing else notices
- `IsComplete` on `event` and `event_ts` catches a transform regression that stops promoting
  columns, which would otherwise show up as silently empty dashboards
- `Uniqueness "event_id"` catches double delivery, the classic streaming bug
- The `ColumnValues` enumerations catch a new actor or flow value appearing without the
  downstream views being taught about it. The `visitor` and `ai-agent` values are in the list
  because `sessionBeaconPost.js` emits them today even though the documented union in
  `activityAlert.js` does not include them
- `outcome` with a threshold catches a failure spike as a data-quality signal, not just an
  operational one
- The `event_ts` freshness rule catches a stream that is delivering stale or clock-skewed data

## Evaluation

Glue Data Quality on a catalog table runs as a *recommendation or evaluation run*, started by
the `glue:StartDataQualityRulesetEvaluationRun` API. Drive it from an EventBridge rule at
04:00 UTC targeting a small Lambda `app/functions/analytics/dataQualityRun.js` that calls
`StartDataQualityRulesetEvaluationRun` with `AdditionalRunOptions.CloudWatchMetricsEnabled =
true` and `NumberOfWorkers = 2`, `Timeout = 20`.

With CloudWatch metrics enabled, Glue publishes `glue.data.quality.rules.passed` and
`glue.data.quality.rules.failed` in the `Glue Data Quality` namespace, dimensioned by ruleset.
Alarm on `failed >= 1` over 24 hours with no SNS action, and the existing default-bus alarm
rule (`OpsStack.java:297`) forwards the state change to Telegram. No new routing, no new topic.

The alternative is an EventBridge rule on the `aws.glue-dataquality` source with detail-type
`Data Quality Evaluation Results Available`, which carries the failing rule text in the event.
It gives a better message but needs a new rule in the app-scoped `OpsStack` to reach Telegram.
Take it only if the metric alarm proves too vague in practice.

## Tests

- CDK assertion that the ruleset exists, targets `activity_events`, and that the alarm has no
  `AlarmActions`
- Unit test on the run Lambda: it passes `CloudWatchMetricsEnabled: true` and the configured
  ruleset name, and rethrows an API error rather than returning success

## Done criteria

- One evaluation run completes in ci and its result is visible in the Glue console
- The `failed` metric exists in CloudWatch
- Deliberately breaking a rule (publish an event with `actor: "nonsense"`, wait for the next
  run) puts the alarm in ALARM and produces a Telegram message

---

# WP-6: Athena views for the business questions (backlog 13)

Eight views, each answering one question the operator actually asks. All read
`activity_events_all` and the `dynamo_*` tables, never the raw tables directly. All filter
`actor = 'customer'` unless the question is explicitly about test traffic, so CI and synthetic
runs never inflate a number.

Created the same way as the union view in WP-3: SQL in the repo, applied at deploy time by an
`AwsCustomResource` running `CREATE OR REPLACE VIEW`, with a `CfnNamedQuery` per view so each
is one click away in the console.

| View | Question |
|---|---|
| `v_active_users_daily` | How many distinct people used the service each day? |
| `v_submissions_daily` | How many VAT returns went to HMRC each day, split by outcome? |
| `v_login_to_submission_funnel` | Of the people who logged in on a day, how many reached a submission within 7 days? |
| `v_pass_redemptions_daily` | How many passes were issued and how many redeemed, by pass type? |
| `v_revenue_daily` | How much money arrived each day, by product, from Stripe? |
| `v_hmrc_failures_by_class` | Which HMRC failure classes are we hitting, and how often? |
| `v_signup_to_first_submission` | How long does a new account take to file its first return? |
| `v_traffic_by_country_daily` | Where are sessions coming from, and which convert? |

SQL sketches the implementer fills in against real columns:

```sql
CREATE OR REPLACE VIEW v_active_users_daily AS
SELECT date(event_ts) AS day,
       count(DISTINCT hashed_sub) AS active_users,
       count(*) AS events
FROM   activity_events_all
WHERE  actor = 'customer' AND hashed_sub IS NOT NULL
GROUP  BY 1;

CREATE OR REPLACE VIEW v_submissions_daily AS
SELECT date(event_ts) AS day,
       coalesce(outcome, 'success') AS outcome,
       count(*) AS submissions,
       count(DISTINCT hashed_sub) AS submitters
FROM   activity_events_all
WHERE  actor = 'customer' AND event IN ('vat-return-submitted', 'vat-return-failed')
GROUP  BY 1, 2;

CREATE OR REPLACE VIEW v_login_to_submission_funnel AS
WITH logins AS (
  SELECT hashed_sub, min(event_ts) AS first_login, date(min(event_ts)) AS cohort_day
  FROM activity_events_all
  WHERE actor = 'customer' AND event IN ('login', 'new-session') AND hashed_sub IS NOT NULL
  GROUP BY hashed_sub),
subs AS (
  SELECT hashed_sub, min(event_ts) AS first_submission
  FROM activity_events_all
  WHERE actor = 'customer' AND event = 'vat-return-submitted'
  GROUP BY hashed_sub)
SELECT l.cohort_day,
       count(*) AS logged_in,
       count(s.hashed_sub) AS submitted_within_7d,
       cast(count(s.hashed_sub) AS double) / nullif(count(*), 0) AS conversion
FROM   logins l
LEFT JOIN subs s
  ON s.hashed_sub = l.hashed_sub
 AND s.first_submission BETWEEN l.first_login AND l.first_login + interval '7' day
GROUP  BY 1;

CREATE OR REPLACE VIEW v_hmrc_failures_by_class AS
SELECT date(event_ts) AS day,
       coalesce(failure, 'unclassified') AS failure_class,
       coalesce(hmrc_status, 'none') AS hmrc_status,
       count(*) AS failures
FROM   activity_events_all
WHERE  actor = 'customer' AND outcome = 'failure'
GROUP  BY 1, 2, 3;
```

`v_revenue_daily` and `v_traffic_by_country_daily` depend on WP-9 and WP-10 landing first, so
build them last within this package or leave them as named queries until the ingestion tables
exist.

## Tests

- CDK assertion counting the named queries and the view-creation custom resources
- A behaviour-style check in the verification script: every view returns without error, which
  is the only real test of view SQL. Loop the view list, run `SELECT * FROM <view> LIMIT 1`,
  fail on any non-`SUCCEEDED` state

## Done criteria

- All eight views exist in the Glue catalog and each returns rows or an empty result, never
  an error
- The funnel view returns a conversion between 0 and 1 for at least one cohort day

---

# WP-7: the dashboard (backlog 13)

## Decision: CloudWatch, fed by a scheduled Lambda

A scheduled Lambda runs the WP-6 views once a day and publishes the answers as custom metrics
in namespace `Submit/Analytics`. A CloudWatch dashboard reads them.

QuickSight would give better charts and ad-hoc slicing. It costs $9 to $24 per author per
month before any reader, needs its own permissions model over the lake, and adds a console
surface that nothing else in this system uses. The CloudWatch route costs about $9/month all
in (20 custom metrics at $0.30, plus $3 for the fourth dashboard in the account), reuses the
dashboard, alarm and Telegram routing that already exist, and puts the business numbers next
to the operational ones so a drop in submissions and a spike in Lambda errors are on the same
screen. Given the stated aim of low recurring cost, take CloudWatch. Revisit QuickSight when
somebody other than the operator needs to slice the data themselves.

## Lambda

`app/functions/analytics/analyticsMetricsPublish.js`, EventBridge rule at 05:00 UTC (after the
04:00 data quality run), 5-minute timeout, 256 MB.

- Reads a static list of `{view, metricName, valueColumn, dimensionColumns}` definitions
- For each, `StartQueryExecution` against the workgroup for yesterday's row, polls
  `GetQueryExecution` until terminal with a bounded number of attempts, then `GetQueryResults`
- Publishes with `PutMetricData`, timestamped to the day being reported, in batches of 20
- Throws on any query failure. It must not publish a zero for a query that errored: a false
  zero on a business metric is worse than a gap

Metrics published, keeping the total at or under 20:

| Metric | Dimensions |
|---|---|
| `ActiveUsers` | none |
| `Submissions` | `Outcome` |
| `Submitters` | none |
| `LoginToSubmissionConversion` | none |
| `PassesIssued`, `PassesRedeemed` | `PassType` |
| `RevenueGbp` | `Product` |
| `HmrcFailures` | `FailureClass` |
| `NewAccounts` | none |
| `Sessions` | `Country`, top 5 only |

## Dashboard

`{env}-env-analytics`, built with the same `Dashboard.Builder` and `GraphWidget.Builder`
pattern as `ObservabilityStack.java:760`. Six rows: active users and sessions; submissions by
outcome; the login-to-submission conversion as a single value; revenue; passes; HMRC failures
by class. Output the console URL with `cfnOutput` the way the operations dashboard does.

## Tests

- Unit tests on the publish Lambda: a `FAILED` query execution throws; a successful result set
  maps to the right metric name, value, dimensions and timestamp; more than 20 datums batch
  into multiple `PutMetricData` calls
- CDK assertion that the dashboard exists and that the Lambda's IAM policy scopes
  `cloudwatch:PutMetricData` with a `cloudwatch:namespace` condition

## Done criteria

- The dashboard renders with data for at least one day
- `aws cloudwatch list-metrics --namespace Submit/Analytics` lists the expected metrics
- Deliberately dropping a view causes the Lambda to error and raise its alarm, rather than
  publishing zeros

---

# WP-8: orchestration for the scheduled jobs (backlog 14)

## Decision: EventBridge rules with retry and a DLQ, not Step Functions

The three ingestion jobs are independent, single-step, and short. None waits on another's
output, none branches, none needs a human approval or a long timer. A state machine would add
a resource type, an IAM role and an execution history nobody reads, to orchestrate three
things that do not interact.

An EventBridge `Rule` with a `LambdaFunction` target already gives what the requirement asks
for: `retryAttempts` on the target, a `deadLetterQueue` on the target, and a Lambda `Errors`
alarm. It also matches the pattern already in the repo at `AccountStack.java:832`.

EventBridge Scheduler is the alternative, worth taking if flexible time windows or one-off
schedules ever matter. Step Functions earns its place the day a job has to wait on another's
output, for example if CloudFront partitioning moves to a CTAS whose completion gates the
metrics publish.

## Shape, applied to each of WP-9, WP-10, WP-11

```java
Queue dlq = Queue.Builder.create(this, name + "-Dlq")
        .queueName(functionName + "-dlq")
        .retentionPeriod(Duration.days(14))
        .removalPolicy(RemovalPolicy.DESTROY)
        .build();

Rule.Builder.create(this, name + "-Schedule")
        .ruleName(functionName + "-schedule")
        .description(<what it does>)
        .schedule(Schedule.cron(CronOptions.builder().minute("15").hour("2").build()))
        .targets(List.of(LambdaFunction.Builder.create(fn)
                .retryAttempts(3)
                .deadLetterQueue(dlq)
                .maxEventAge(Duration.hours(2))
                .build()))
        .build();
```

Schedules, all UTC, staggered so they do not contend:

| Job | prod | ci |
|---|---|---|
| Stripe reconciliation | 02:15 daily | 02:15 Mondays |
| GA4 report pull | 02:45 daily | 02:45 Mondays |
| CloudFront partition maintenance | 03:15 daily (only if the fallback path is taken) | as prod |
| Data quality run (WP-5) | 04:00 daily | 04:00 daily |
| Metrics publish (WP-7) | 05:00 daily | 05:00 daily |

GA4 runs after Stripe because GA4's previous-day data settles later. Both run well before the
05:00 metrics publish.

Each job also gets the two alarms from section 3: Lambda `Errors >= 1 in 24h` and DLQ depth
`>= 1`.

## Idempotency

Every ingestion job writes to a date-keyed prefix and overwrites. Re-running yesterday
produces the same objects. No job appends, so a retry after a partial write is safe. Each job
takes an optional `date` in its event payload so a backfill is
`aws lambda invoke --payload '{"date":"2026-08-20"}'`, with no code change.

---

# WP-9: Stripe reconciliation (backlog 14)

## Source

The Stripe API, using the secret that already exists. `deploy-environment.yml:211` creates
`{env}/submit/stripe/secret_key` and `{env}/submit/stripe/test_secret_key`. ci uses the test
key, prod uses the live key, selected by env name. The `stripe` npm package is already a
dependency at `^22.1.1`.

## Lambda

`app/functions/analytics/stripeReconcile.js`, 5-minute timeout, 512 MB.

For the target day (yesterday UTC by default), page through and write three entity files:

| Entity | Call | Kept fields |
|---|---|---|
| `balance_transactions` | `stripe.balanceTransactions.list({created: {gte, lt}, limit: 100, expand: ['data.source']})` | `id`, `type`, `amount`, `net`, `fee`, `currency`, `created`, `available_on`, `source_id`, `description` |
| `charges` | `stripe.charges.list({created: {gte, lt}, limit: 100})` | `id`, `amount`, `amount_refunded`, `currency`, `created`, `paid`, `refunded`, `status`, `failure_code`, `customer` hashed, `invoice`, `metadata.bundleId` |
| `subscriptions` | `stripe.subscriptions.list({limit: 100, status: 'all'})`, a full snapshot | `id`, `status`, `created`, `current_period_start`, `current_period_end`, `cancel_at_period_end`, `canceled_at`, `customer` hashed, `items.data[0].price.id`, `items.data[0].price.unit_amount`, `metadata.bundleId` |

Customer ids are hashed with the same `hashSub` helper the rest of the system uses, so lake
rows join to activity events without carrying a Stripe identifier around. Email addresses,
card details, addresses and raw customer objects are never written.

Output: gzipped newline-delimited JSON to
`curated/stripe/<entity>/dt=YYYY-MM-DD/<entity>.json.gz`. NDJSON rather than Parquet because
each day is a few hundred rows and writing Parquet from Node needs a dependency that earns
nothing at this size.

Subscriptions is a full snapshot each day, not a delta, so `dt` reads as "state as at". That
is what a subscription question actually wants and it is small enough to afford.

## Glue tables

`stripe_balance_transactions`, `stripe_charges`, `stripe_subscriptions`. JSON SerDe, gzip,
single partition key `dt` of type `date`, projection:

```
projection.enabled          = true
projection.dt.type          = date
projection.dt.format        = yyyy-MM-dd
projection.dt.range         = 2026-01-01,NOW
projection.dt.interval      = 1
projection.dt.interval.unit = DAYS
storage.location.template   = s3://{lake}/curated/stripe/<entity>/dt=${dt}/
```

Amounts stay in minor units as `bigint`, exactly as Stripe returns them. `v_revenue_daily`
divides by 100 at the view, in one place.

## Tests

- Unit tests with a mocked Stripe client: pagination follows `has_more`; the day window is
  `[00:00:00Z, next 00:00:00Z)` in epoch seconds; a raw customer id never appears in output;
  an explicit `date` in the event overrides the default
- Unit test that the written body is gzip and that each line parses as one JSON object
- CDK assertion that the Lambda's `secretsmanager:GetSecretValue` is scoped to the one secret
  ARN with the `-*` suffix

## Done criteria

- A manual invoke for a known day writes an object under `curated/stripe/charges/dt=.../`
- `SELECT sum(amount)/100.0 FROM stripe_charges WHERE dt = date '<day>' AND paid` returns a
  number that matches the Stripe dashboard for that day

---

# WP-10: GA4 ingestion (backlog 14)

## Decision: the GA4 Data API, not the BigQuery export

Reading the BigQuery export means the operator first turns the export on (BACKLOG 19, still
open), then the data lands in Google's cloud and has to cross to AWS: a scheduled BigQuery
export to GCS, a GCS-to-S3 transfer, and a GCP billing account for both. It gives event-level
detail nothing here needs yet.

The Data API needs one service-account JSON, calls `runReport` directly from a Lambda, is free
within quota, and does not depend on a console action that has not happened. Its limits are
real: aggregated rows rather than events, and sampling on very large properties, which this
property is nowhere near. Take the Data API. Revisit the BigQuery export the day a funnel
question needs event-level joins.

## Secret

New GitHub environment secret `GA4_SERVICE_ACCOUNT_JSON`, holding the service-account key JSON
for a service account granted Viewer on GA4 property `523400333`. A new step in
`deploy-environment.yml`'s `create-secrets` job, copied from the Stripe steps at line 209:

```yaml
      - name: Create secret in AWS from secrets.GA4_SERVICE_ACCOUNT_JSON
        run: |
          SECRET_NAME="${{ needs.names.outputs.environment-name }}/submit/ga4/service_account"
          SECRET_VALUE='${{ secrets.GA4_SERVICE_ACCOUNT_JSON }}'
          if [ -z "$SECRET_VALUE" ]; then
            echo "No GA4_SERVICE_ACCOUNT_JSON in ${{ needs.names.outputs.environment-name }} environment, skipping"
            exit 0
          fi
          if ! aws secretsmanager describe-secret --secret-id "$SECRET_NAME" --region ${{ env.AWS_REGION }} 2>/dev/null; then
            aws secretsmanager create-secret --name "$SECRET_NAME" --secret-string "$SECRET_VALUE" --region ${{ env.AWS_REGION }}
          else
            aws secretsmanager update-secret --secret-id "$SECRET_NAME" --secret-string "$SECRET_VALUE" --region ${{ env.AWS_REGION }}
          fi
```

The property id is not a secret. It goes in `cdk-environment/cdk.json` as `ga4PropertyId` with
the value `523400333`, read through the existing `SubmitEnvironmentProps` reflection loader,
and passed to the Lambda as `GA4_PROPERTY_ID`. The skip-when-empty guard means ci deploys fine
before the operator creates the service account.

## Lambda

`app/functions/analytics/ga4ReportPull.js`, 2-minute timeout, 512 MB. Adds one npm dependency,
`@google-analytics/data`, which is the thin generated client rather than the whole `googleapis`
bundle.

Three reports for the target day, each one `runReport` call:

| Report | Dimensions | Metrics |
|---|---|---|
| `traffic` | `date`, `country`, `sessionDefaultChannelGroup` | `sessions`, `activeUsers`, `newUsers`, `engagedSessions`, `averageSessionDuration` |
| `pages` | `date`, `pagePath`, `hostName` | `screenPageViews`, `activeUsers` |
| `events` | `date`, `eventName` | `eventCount`, `activeUsers`, `eventValue` |

Output: `curated/ga4/report=<name>/dt=YYYY-MM-DD/<name>.json.gz`, gzipped NDJSON, one object
per row with dimension and metric names as keys and metrics cast to numbers.

Three Glue tables `ga4_traffic`, `ga4_pages`, `ga4_events`, same `dt` projection as the Stripe
tables.

Two things to get right: GA4's `date` dimension is `YYYYMMDD` with no separators, and the API
returns every metric value as a string. Cast in the Lambda, not in the view, and unit-test both.

## Tests

- Unit tests with a mocked `BetaAnalyticsDataClient`: the request carries the configured
  property id in `property: "properties/<id>"`; date ranges are the single target day; string
  metrics become numbers; a `YYYYMMDD` date becomes `YYYY-MM-DD`
- Unit test that a missing secret throws rather than writing an empty file
- CDK assertion that the schedule exists with a DLQ and 3 retry attempts

## Done criteria

- A manual invoke writes all three reports for a known day
- `SELECT sum(sessions) FROM ga4_traffic WHERE dt = date '<day>'` is within a few percent of
  the GA4 console for that day
- `v_traffic_by_country_daily` returns rows

---

# WP-11: CloudFront logs in the catalog (backlog 14)

## The problem to fix first

CloudFront standard logging is on and writing to a bucket created inside `EdgeStack`
(`EdgeStack.java:414`) with a CDK-generated name, `cf-standard-logs/` prefix and a 90-day
expiry. `EdgeStack` is an app stack, so that bucket is per-deployment: it is created on every
release and destroyed with the deployment. A catalog table over it would point at a bucket
that stops existing.

Move the bucket to `AnalyticsStack` as `{env}-env-cloudfront-logs-{account}` and change
`EdgeStack` to import it with `Bucket.fromBucketName` and pass it to
`.logBucket(...)` with `logFilePrefix("cf-standard-logs/" + props.deploymentName() + "/")` so
deployments stay distinguishable. The bucket keeps `ObjectOwnership.OBJECT_WRITER` for the same
reason the comment at `EdgeStack.java:411` gives: standard logging writes via an ACL grant to
the AWS log-delivery account.

**`EdgeStack.java` is a shared-file edit** and this is the only package in the plan that
touches it.

## Cataloguing: logging v2 to Hive-partitioned Parquet

CloudFront standard logging v2 delivers through the CloudWatch Logs delivery API, which
supports an S3 destination with a Hive-style `suffixPath` and Parquet output. The repo already
uses delivery sources and destinations for the distribution's CloudWatch logs
(`SubmitSharedNames.java:499-504`), so the API is not new here.

Configure, in `AnalyticsStack`:

- `AWS::Logs::DeliverySource` on the distribution ARN, `logType` = `ACCESS_LOGS`
- `AWS::Logs::DeliveryDestination` of type S3, targeting `arn:aws:s3:::{cf-log-bucket}`,
  `outputFormat` = `parquet`
- `AWS::Logs::Delivery` joining them, with
  `s3DeliveryConfiguration.suffixPath` = `raw/cloudfront/{DistributionId}/year=!{yyyy}/month=!{MM}/day=!{dd}/`
  and `enableHiveCompatiblePath` = `true`

Glue table `cloudfront_requests` over `s3://{lake}/raw/cloudfront/`, Parquet, projection on
`year`/`month`/`day` plus an injected `distribution_id` partition key of type `injected` so a
query names the distribution it wants.

The v2 field set is the standard CloudFront log field set: `date`, `time`, `x_edge_location`,
`sc_bytes`, `c_ip`, `cs_method`, `cs_host`, `cs_uri_stem`, `sc_status`, `cs_referer`,
`cs_user_agent`, `cs_uri_query`, `cs_cookie`, `x_edge_result_type`, `x_edge_request_id`,
`x_host_header`, `cs_protocol`, `cs_bytes`, `time_taken`, `x_forwarded_for`,
`ssl_protocol`, `ssl_cipher`, `x_edge_response_result_type`, `cs_protocol_version`,
`fle_status`, `fle_encrypted_fields`, `c_port`, `time_to_first_byte`,
`x_edge_detailed_result_type`, `sc_content_type`, `sc_content_len`, `sc_range_start`,
`sc_range_end`. Types: `sc_bytes`, `cs_bytes`, `sc_status`, `c_port`, `sc_content_len`,
`sc_range_start`, `sc_range_end` as `bigint`; `time_taken` and `time_to_first_byte` as
`double`; the rest `string`.

`c_ip` is personal data under UK GDPR. Exclude it from every view built on this table, and note
in the table description that raw rows are operational only. The 400-day prod lifecycle in
section 3 is the retention limit on it.

**Firehose is the wrong tool here.** CloudFront writes complete log files to S3 on its own
schedule; there is no stream to put records onto, and routing files through Firehose would mean
reading them back out of S3 only to write them again.

## Fallback if delivery v2 to S3 proves awkward

Keep legacy standard logging into the env bucket at `cf-standard-logs/`. Create
`cloudfront_requests_raw` as a non-partitioned external table over that flat prefix, tab
separated, `skip.header.line.count = 2`, all columns `string`. Then a nightly Lambda
`app/functions/analytics/cloudFrontLogPartition.js` runs one Athena statement:

```sql
INSERT INTO cloudfront_requests
SELECT <typed casts>, year, month, day
FROM   cloudfront_requests_raw
WHERE  date = date '<yesterday>'
```

against a partitioned Parquet table created once by CTAS. That costs a daily Athena scan of the
flat prefix, which grows to 90 days of logs, so add `WHERE "$path" LIKE '%<yesterday>%'` to keep
the scan bounded. Take this path only if the v2 delivery resources cannot be made to work; it is
strictly more moving parts.

## Tests

- CDK assertion that `EdgeStack` creates no `AWS::S3::Bucket` for logs any more and references
  the imported bucket name
- CDK assertion that `AnalyticsStack` creates the log bucket with `OBJECT_WRITER` ownership
- CDK assertion of the three delivery resources and the Glue table
- The existing `SubmitApplicationCdkResourceTest` bucket counts change; update them and the
  comment explaining the count

## Done criteria

- After a deploy and some traffic, objects appear under
  `raw/cloudfront/<dist-id>/year=.../month=.../day=.../`
- `SELECT sc_status, count(*) FROM cloudfront_requests WHERE year=... GROUP BY 1` returns rows
- The old per-deployment log bucket is gone from the next deployment's `EdgeStack`

---

# Work packages

Owned paths mean the package writes those files and no other package does. Shared-file edits
are called out and must be serialised.

| WP | Item | Files to create | Files to edit (shared) | Model | Depends on |
|---|---|---|---|---|---|
| **WP-1** Firehose spike | 13a | `infra/.../stacks/AnalyticsStack.java`, `app/functions/analytics/activityEventTransform.js`, `app/unit-tests/analytics/activityEventTransform.test.js`, `scripts/verify-analytics-pipeline.sh` | `SubmitSharedNames.java`, `SubmitEnvironment.java`, `SubmitEnvironmentCdkResourceTest.java`, `.github/workflows/deploy-environment.yml`, `cdk-environment/cdk.json` | Fable or Opus | none |
| **WP-2** DynamoDB streams | 13 | none | `KindCdk.java`, `DataStack.java`, `KindCdkTest.java`, `SubmitEnvironmentCdkResourceTest.java` | Sonnet | none |
| **WP-3** Parquet conversion | 13 | `infra/.../analytics/views/*.sql` | `AnalyticsStack.java`, `activityEventTransform.js`, `activityEventTransform.test.js`, `cdk-environment/cdk.json` | Sonnet | WP-1 |
| **WP-4** Table change records | 13 | `app/functions/analytics/dynamoStreamToFirehose.js`, `app/unit-tests/analytics/dynamoStreamToFirehose.test.js` | `AnalyticsStack.java`, `SubmitSharedNames.java` | Sonnet | WP-2, WP-3 |
| **WP-5** Data quality | 13 | `app/functions/analytics/dataQualityRun.js`, `app/unit-tests/analytics/dataQualityRun.test.js` | `AnalyticsStack.java` | Sonnet | WP-3 |
| **WP-6** Athena views | 13 | `infra/.../analytics/views/v_*.sql` | `AnalyticsStack.java`, `scripts/verify-analytics-pipeline.sh` | Sonnet | WP-3, WP-4 |
| **WP-7** Dashboard | 13 | `app/functions/analytics/analyticsMetricsPublish.js`, `app/unit-tests/analytics/analyticsMetricsPublish.test.js` | `AnalyticsStack.java` | Sonnet | WP-6 |
| **WP-8** Orchestration | 14 | `infra/.../stacks/IngestionStack.java` | `SubmitSharedNames.java`, `SubmitEnvironment.java`, `SubmitEnvironmentCdkResourceTest.java`, `.github/workflows/deploy-environment.yml` | Sonnet | WP-1 |
| **WP-9** Stripe | 14 | `app/functions/analytics/stripeReconcile.js`, `app/unit-tests/analytics/stripeReconcile.test.js` | `IngestionStack.java`, `AnalyticsStack.java` (Glue tables) | Sonnet | WP-8 |
| **WP-10** GA4 | 14 | `app/functions/analytics/ga4ReportPull.js`, `app/unit-tests/analytics/ga4ReportPull.test.js` | `IngestionStack.java`, `AnalyticsStack.java`, `.github/workflows/deploy-environment.yml`, `cdk-environment/cdk.json`, `package.json` | Sonnet | WP-8 |
| **WP-11** CloudFront logs | 14 | none (fallback path adds `app/functions/analytics/cloudFrontLogPartition.js`) | `EdgeStack.java`, `AnalyticsStack.java`, `SubmitSharedNames.java`, `SubmitApplicationCdkResourceTest.java` | Sonnet | WP-1 |

## Serialisation points

Four files are edited by more than one package. Do not run those packages concurrently against
the same working tree.

- **`AnalyticsStack.java`**: WP-1 creates it; WP-3 through WP-7, WP-9, WP-10 and WP-11 all add
  to it. Run WP-1 alone, then WP-3 alone, then WP-4, WP-5 and WP-11 can run in parallel only
  in separate worktrees with a merge afterwards. The safer sequence is one at a time.
- **`SubmitSharedNames.java`**: WP-1, WP-4, WP-8, WP-11. Each adds fields in a different
  region of the file, so worktree merges are usually clean, but check.
- **`SubmitEnvironmentCdkResourceTest.java`**: WP-1, WP-2, WP-8. Resource counts move, so two
  packages changing the same assertion will conflict semantically even when git merges cleanly.
  Re-run `./mvnw clean verify` after any merge that touches it.
- **`.github/workflows/deploy-environment.yml`**: WP-1, WP-8, WP-10.

## Suggested order

1. WP-1 alone. It settles naming, the bucket layout, the workgroup and the IAM shape that
   everything else copies, and it answers the volume question the cost model assumes.
2. WP-2 and WP-8 in parallel (disjoint files).
3. WP-3.
4. WP-4, WP-5, WP-11 in parallel worktrees, merged one at a time.
5. WP-9 and WP-10 in parallel.
6. WP-6, then WP-7.

WP-1 alone closes backlog 13a. WP-2 to WP-7 close backlog 13. WP-8 to WP-11 close backlog 14.
