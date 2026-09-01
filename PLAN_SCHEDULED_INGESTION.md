# Scheduled ingestion jobs

Design for backlog item 14. It supersedes WP-8 to WP-11 in `PLAN_USAGE_DATA_PIPELINE.md`,
which those work packages have already shipped.

The goal from `STRATEGY.md` is one queryable place holding revenue and funnel data. Most of
the plumbing is built and deployed. This plan covers the five things that remain: proving
what shipped, adding the GA4 BigQuery export as an event-level source, replacing five
independent crons with one orchestrated run, joining the three revenue sources into a
reconciliation view, and stopping the duplicate CloudFront log delivery.

## What already runs

Read this before writing any code. All of it is deployed and the `deploy environment`
workflow is green on `deploy analytics` and `deploy ingestion`.

| Piece | Where | Schedule |
|---|---|---|
| Activity events into the lake | `AnalyticsStack`, Firehose + `activityEventTransform.js` | continuous |
| DynamoDB table changes | `analytics/TableChangeDelivery.java`, `dynamoStreamToFirehose.js` | continuous |
| Stripe reconciliation | `IngestionStack`, `stripeReconcile.js` | 02:15 daily prod, Mondays ci |
| GA4 aggregate reports | `IngestionStack`, `ga4ReportPull.js` (Data API) | 03:15 daily prod, Mondays ci |
| CloudFront access logs, v2 Parquet | `EdgeStack.java:601`, `analytics/CloudFrontAccessLogs.java` | continuous |
| Glue data quality run | `analytics/DataQuality.java`, `dataQualityRun.js` | 04:00 daily |
| Metrics publish and dashboard | `analytics/AnalyticsDashboard.java`, `analyticsMetricsPublish.js` | 05:00 daily |
| Business views | `infra/main/resources/analytics/views/*.sql` | on deploy |

The `GA4_SERVICE_ACCOUNT_JSON` secret exists in both the `ci` and `prod` GitHub
environments and reaches the Lambda through `{env}/submit/ga4/service_account` in Secrets
Manager.

## Decisions

**Landing store and query surface: S3 plus Glue plus Athena. Unchanged.** The lake is
already there, partition projection means no crawler, and the questions are
scan-and-aggregate over date ranges. DynamoDB answers point lookups by key, which is the
wrong shape for "how many people filed last month". Nothing in this plan revisits it.

**Orchestration: one Step Functions state machine, started by one EventBridge Scheduler
schedule.** Today five EventBridge rules fire at fixed offsets and hope. The metrics
publish at 05:00 runs whether or not the ingestion jobs succeeded, so a failed Stripe pull
puts a false zero on the dashboard and only the Lambda errors alarm says otherwise. The
jobs now do interact: data quality and the metrics publish both read what the ingestion
jobs wrote. `PLAN_USAGE_DATA_PIPELINE.md:1122` named this exact trigger for moving to Step
Functions, and it has arrived. One machine also collapses five DLQs and five rules into
one execution history and one failure alarm.

**GA4 source: keep the Data API job and add a BigQuery export job.** They answer different
questions. The Data API returns Google's own modelled aggregates, which is the number that
matches the GA4 console, so it stays the source of record for sessions and active users.
The BigQuery export gives one row per event with a session id, which is the only way to
build a funnel or to join GA4 behaviour to our own activity events.
`v_traffic_by_country_daily` already names the gap in its header comment: sessions cannot
be joined to what they went on to do. The BigQuery job closes it.

**Idempotency and replay: date-keyed prefixes, overwrite, no appends.** Every job writes
`.../dt=YYYY-MM-DD/<name>.json.gz` and replaces the object. Re-running a day produces the
same object. Each job takes an optional `date` in its event payload, so a backfill is one
state machine execution with `{"date": "2026-08-20"}`. The state machine passes its input
to every task, so an empty input means each job uses its own default offset and an explicit
date overrides all of them. Replay needs no code change and no DLQ.

**Failure alerting: alarms with no SNS action, caught by the OpsStack forwarder.** Every
alarm in the account reaches Telegram through `OpsStack.java:297`, so env-scoped alarms
set no action. That is the existing pattern and this plan follows it. The state machine
adds one `ExecutionsFailed` alarm; each job Lambda keeps its own `Errors` alarm so the
Telegram message names which job broke.

## Operator prerequisites

Each line is a separate action. Phase 6 has no prerequisite (2026-09-01 decision above).

- [x] **Google Cloud project.** `diyaccounting-ga4` (958354756046).
- [x] **Dataset location.** `europe-west2` (London), confirmed.
- [x] **Grant the existing GA4 service account BigQuery access.** Done 2026-09-01 by a Cowork
      console session (`../BRIEF_GA4_BIGQUERY_IAM.md`). `ga4-report-pull@diyaccounting-ga4.iam.gserviceaccount.com`
      holds `roles/bigquery.jobUser` on project `diyaccounting-ga4` and `roles/bigquery.dataViewer`
      on the `analytics_523400333` dataset only, both verified in the console. The dataset already
      holds daily export tables with no expiration (`events_20260830`, `events_20260831`), so
      phase 2's first query has real data to read once the IAM policy finishes propagating.
- [x] **Table expiration.** Billing is attached to `diyaccounting-ga4`, so BigQuery is out of
      sandbox and export tables no longer expire after 60 days.
- [ ] **Have AWS SSO live for phase 1.** `aws sso login --sso-session diyaccounting`. Phase
      1 reads prod S3 and Athena and cannot run without it.

All phase 2 operator prerequisites are now met. Phase 2 code can be written and verified
against real data.

## Cost

Step Functions Standard runs about 900 state transitions a month against a 4,000 free tier,
so nothing. One EventBridge Scheduler schedule against a 14 million free tier, nothing. The
BigQuery job scans one small daily table per run, well inside the 1 TiB monthly on-demand
free tier. One extra Lambda stays in the free tier.

The one line to watch is CloudWatch custom metrics, which `PLAN_USAGE_DATA_PIPELINE.md`
capped at 20 for a reason. Phase 4 adds three. Count them before adding a fourth.

Phase 5 removes a duplicate copy of every CloudFront access log, so it saves money.

---

# Phase 1: prove the shipped pipeline

**Model: Sonnet.** Reading and reporting, with a script to write.

Nothing here has been shown to produce data. Every downstream phase assumes it does.

## Files owned

- `scripts/verify-ingestion-jobs.sh` (new)
- `scripts/verify-analytics-pipeline.sh` (edit: nothing, unless phase 1 finds a bug in it)

## What the script does

Takes an environment name, defaults to `ci`, same shape and argument style as
`scripts/verify-analytics-pipeline.sh`. Read-only. For each of the six sources below it
runs one Athena query in the `{env}-env-analytics` workgroup and prints a row count per day
for the last seven days.

| Source | Table | Expected |
|---|---|---|
| Activity events | `activity_events_all` | rows every day |
| Table changes | `dynamo_receipts`, `dynamo_bundles`, `dynamo_subscriptions`, `dynamo_passes` | rows on days with writes |
| Stripe charges | `stripe_charges` | a `dt` partition per scheduled run, rows may be zero |
| Stripe subscriptions | `stripe_subscriptions` | a `dt` partition per scheduled run, rows non-zero |
| GA4 traffic | `ga4_traffic` | a `dt` partition per scheduled run, rows non-zero |
| CloudFront requests | `cloudfront_requests` | rows every day |

A missing partition and a present-but-empty partition are different failures, so report
them differently. A missing partition means the job did not run or did not write. An empty
partition means it ran and found nothing, which is correct for Stripe charges on a day with
no sales and wrong for GA4 traffic on any day.

The script exits non-zero if any source has no partition at all in the last seven days.

## Test strategy

Unit tier: none. This is a shell script over live AWS, and mocking the AWS CLI would test
the mock.

Verification is the run itself, in both environments.

## Verification criterion

`AWS_PROFILE=submit-prod scripts/verify-ingestion-jobs.sh prod` exits 0 and prints a
non-zero row count for activity events, GA4 traffic, Stripe subscriptions and CloudFront
requests. Any source that fails is this phase's remainder: diagnose it from the job's
CloudWatch logs and fix it here, not in a later phase.

---

# Phase 2: GA4 BigQuery event export

**Status: code done 2026-09-01, unit and CDK tests green.** Live-data verification
(`aws lambda invoke` against a deployed `ga4-event-export-pull`) needs a deploy, which
happens after this branch merges.

**Model: Sonnet.** The SQL and the schema are written out below.

## Files owned

- `app/functions/analytics/ga4EventExportPull.js` (new)
- `app/unit-tests/analytics/ga4EventExportPull.test.js` (new)
- `infra/main/java/co/uk/diyaccounting/submit/stacks/analytics/Ga4Tables.java` (edit)
- `infra/test/java/co/uk/diyaccounting/submit/stacks/analytics/Ga4TablesTest.java` (edit)
- `infra/main/java/co/uk/diyaccounting/submit/stacks/IngestionStack.java` (edit)
- `infra/test/java/co/uk/diyaccounting/submit/stacks/IngestionStackTest.java` (edit)
- `infra/main/java/co/uk/diyaccounting/submit/SubmitEnvironment.java` (edit)
- `infra/main/java/co/uk/diyaccounting/submit/stacks/AnalyticsStack.java` (edit: one
  lifecycle rule)
- `cdk-environment/cdk.json` (edit)
- `package.json` (edit)

## Config

Three new context values in `cdk-environment/cdk.json`, read through the same reflection
loader `ga4PropertyId` uses in `SubmitEnvironment.java:171`, and passed to
`IngestionStack` as props:

| Key | Value |
|---|---|
| `ga4BigQueryProjectId` | from the operator prerequisite |
| `ga4BigQueryDatasetId` | `analytics_523400333` |
| `ga4BigQueryLocation` | `europe-west2` unless the operator says otherwise |

Follow the guard `IngestionStack.java:256` already uses for `ga4PropertyId`: a blank value
in prod throws at synth. Blank in ci deploys fine and the job errors at invoke time.

## Lambda

`app/functions/analytics/ga4EventExportPull.js`, 5-minute timeout, 1024 MB, ARM64, Docker
image from the env ECR repository, `cmd` of
`app/functions/analytics/ga4EventExportPull.handler`. Same log-group treatment as the other
two jobs: `ensureLogGroupWithDependency`, because the function name is env-scoped and
stable.

New dependency `@google-cloud/bigquery`. It reads the same service-account JSON
`ga4ReportPull.js` reads, through the same env-var-then-Secrets-Manager precedence.

**Target day is D-2, not D-1.** GA4's daily export table for a day usually lands within 24
hours of that day ending, so at 03:15 the D-1 table may not exist yet. D-2 is about 27
hours of margin. Export `defaultTargetDate()` so the unit test can assert the offset.

Before querying, check the table exists with
`dataset.table('events_' + yyyymmdd).exists()`. If it does not, throw. Do not write an
empty object and do not fall back to `events_intraday_*`. A missing table means the export
lagged or broke, and the Telegram alarm is the right outcome. Recovery is one state machine
execution with an explicit `date`.

Create the query job with `location` set from `GA4_BIGQUERY_LOCATION`. A BigQuery job in
the wrong location fails with a dataset-not-found error that reads like a permissions
problem, so this is the first thing to check when it breaks.

## Query

One query per run, against `events_YYYYMMDD` for the target day.

```sql
SELECT
  FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%SZ', TIMESTAMP_MICROS(event_timestamp))          AS event_ts,
  event_name,
  user_pseudo_id,
  (SELECT value.int_value    FROM UNNEST(event_params) WHERE key = 'ga_session_id')     AS ga_session_id,
  (SELECT value.int_value    FROM UNNEST(event_params) WHERE key = 'ga_session_number') AS ga_session_number,
  (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_location')     AS page_location,
  (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_referrer')     AS page_referrer,
  (SELECT value.int_value    FROM UNNEST(event_params) WHERE key = 'engagement_time_msec') AS engagement_time_msec,
  (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'transaction_id')    AS transaction_id,
  COALESCE(
    (SELECT value.double_value            FROM UNNEST(event_params) WHERE key = 'value'),
    (SELECT CAST(value.int_value AS FLOAT64) FROM UNNEST(event_params) WHERE key = 'value')
  )                                                                                     AS event_value,
  (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'currency')          AS currency,
  device.category                        AS device_category,
  device.operating_system                AS device_os,
  geo.country                            AS country,
  traffic_source.source                  AS traffic_source,
  traffic_source.medium                  AS traffic_medium,
  traffic_source.name                    AS traffic_campaign,
  stream_id,
  platform
FROM `<project>.analytics_523400333.events_<yyyymmdd>`
```

The table name carries the date, so it cannot be a query parameter. Build it by string
concatenation from a value the Lambda has already validated against `^\d{8}$`. Validate,
then concatenate. Do not skip the validation.

`page_location` holds the full URL, so the host is derived in Athena rather than stored
twice.

## Output and Glue table

`curated/ga4_bq/events/dt=YYYY-MM-DD/events.json.gz`, gzipped NDJSON, one JSON object per
line, the same format the other two jobs write.

New Glue table `ga4_bq_events` in `Ga4Tables.java`. The name `ga4_events` is already taken
by the Data API's aggregated event-name report, so do not reuse it.

JSON SerDe, gzip, one partition key `dt` of type `date`, the same projection block the
existing three GA4 tables use, with
`storage.location.template = s3://{lake}/curated/ga4_bq/events/dt=${dt}/`.

Columns: `event_ts` string, `event_name` string, `user_pseudo_id` string, `ga_session_id`
bigint, `ga_session_number` bigint, `page_location` string, `page_referrer` string,
`engagement_time_msec` bigint, `transaction_id` string, `event_value` double, `currency`
string, `device_category` string, `device_os` string, `country` string, `traffic_source`
string, `traffic_medium` string, `traffic_campaign` string, `stream_id` string, `platform`
string.

## Privacy and retention

`user_pseudo_id` is a pseudonymous identifier and counts as personal data under UK GDPR.
It stays because counting users and stitching sessions needs it. Add a dedicated lifecycle
rule on the lake bucket in `AnalyticsStack.java` for prefix `curated/ga4_bq/`: expire at
400 days in prod, 30 days in ci. That matches the CloudFront raw log retention and is
shorter than the 800-day default on the rest of `curated/`.

Say so in the Glue table description, the way `CloudFrontAccessLogs.java` does for `c_ip`.

## IAM

`s3:PutObject` on `{lake}/curated/ga4_bq/*` and nothing wider.
`secretsmanager:GetSecretValue` on the GA4 secret ARN with the `-*` suffix, reusing the
same prop `IngestionStack` already threads through for `ga4ReportPull`.

## Test strategy

Unit tier (`app/unit-tests/analytics/ga4EventExportPull.test.js`), with a mocked BigQuery
client:

- The query targets `events_YYYYMMDD` for D-2 by default
- An explicit `date` in the event payload overrides the default
- A date that is not eight digits throws before any query is built
- A missing table throws, and no `PutObject` is issued
- The job is created with the configured location
- Metric values come back as numbers, not strings
- The written body is gzip, and every line parses as one JSON object
- No `user_id` field reaches the output

CDK tier (`Ga4TablesTest`, `IngestionStackTest`): the fourth Glue table exists with the
right location template; the Lambda's `s3:PutObject` is scoped to `curated/ga4_bq/*`; a
blank project id in prod throws at synth.

System, browser and behaviour tiers: nothing. This job has no HTTP surface and no UI.

## Verification criterion

`aws lambda invoke --function-name prod-env-ga4-event-export-pull --payload '{"date":"<a
known day>"}'` writes an object under `curated/ga4_bq/events/dt=<day>/`, and
`SELECT event_name, count(*) FROM ga4_bq_events WHERE dt = date '<day>' GROUP BY 1` returns
rows whose `page_view` count is within a few percent of the GA4 console's page views for
that day.

---

# Phase 3: Step Functions orchestration

**Status: code done 2026-09-01, CDK tests green.** Live verification (a real state
machine execution reaching `SUCCEEDED`, then the next scheduled run) needs a deploy.

**Model: Sonnet.**

Replace five EventBridge rules and five DLQs with one state machine and one schedule.

## Files owned

- `infra/main/java/co/uk/diyaccounting/submit/stacks/analytics/NightlyIngestionWorkflow.java` (new)
- `infra/test/java/co/uk/diyaccounting/submit/stacks/analytics/NightlyIngestionWorkflowTest.java` (new)
- `infra/main/java/co/uk/diyaccounting/submit/stacks/IngestionStack.java` (edit)
- `infra/test/java/co/uk/diyaccounting/submit/stacks/IngestionStackTest.java` (edit)
- `infra/main/java/co/uk/diyaccounting/submit/stacks/analytics/DataQuality.java` (edit)
- `infra/test/java/co/uk/diyaccounting/submit/stacks/analytics/DataQualityTest.java` (edit)
- `infra/main/java/co/uk/diyaccounting/submit/stacks/analytics/AnalyticsDashboard.java` (edit)
- `infra/test/java/co/uk/diyaccounting/submit/stacks/analytics/AnalyticsDashboardTest.java` (edit)
- `infra/main/java/co/uk/diyaccounting/submit/SubmitSharedNames.java` (edit)
- `infra/test/java/co/uk/diyaccounting/submit/SubmitEnvironmentCdkResourceTest.java` (edit)

## Shape

The state machine lives in `IngestionStack`, which is the orchestration stack.
`DataQuality` and `AnalyticsDashboard` live in `AnalyticsStack`, so `IngestionStack`
imports their two Lambdas with `Function.fromFunctionName`, the same import-by-name habit
the rest of the repo uses. `IngestionStack` already depends on `AnalyticsStack`.

Definition, in order:

1. `Parallel` branch with three `LambdaInvoke` tasks: Stripe reconcile, GA4 report pull,
   GA4 event export pull. They share no data and run at once.
2. `LambdaInvoke` on the data quality run.
3. `LambdaInvoke` on the metrics publish.
4. `Succeed`.

Every task gets `.retryOnServiceExceptions(true)`, plus an explicit retry on
`States.TaskFailed` with two attempts, a 60-second interval and a backoff rate of 2. A
failure anywhere ends the execution in `Failed`. There is no `Catch` that swallows and
carries on. A failed ingestion must stop the metrics publish, which is the entire reason
for this phase.

Use `.payloadResponseOnly(true)` on each `LambdaInvoke` so the state passed on is the
Lambda's own return value, not the invoke envelope. Set `.inputPath("$")` so an explicit
`{"date": "..."}` reaches every task and an empty input lets each job use its own default.

State machine type `STANDARD`, name `{env}-env-analytics-nightly`, tracing off, logging to
a `LogGroup` created with `ensureLogGroupWithDependency` at `ERROR` level with execution
data off. Execution data would put the input payload in logs for no benefit.

Add a `stateMachineName` field to `SubmitSharedNames` next to the existing analytics names,
built from `envResourceNamePrefix` the same way.

## Schedule

One `software.amazon.awscdk.services.scheduler.Schedule` with a
`targets.StepFunctionsStartExecution` target. Both are stable L2 constructs in CDK 2.266.0.

- prod: `cron(15 2 * * ? *)`, timezone `UTC`
- ci: `cron(15 2 ? * MON *)`, timezone `UTC`, keeping the weekly cadence the third-party
  calls have today

Flexible time window off. The schedule's role needs `states:StartExecution` on the one
state machine ARN.

## What goes away

- `IngestionStack.registerScheduledJob` becomes `registerIngestionJob`. It keeps the
  Lambda `Errors` alarm and drops the DLQ and the `Rule`.
- `DataQuality.java` drops `this.schedule` and `this.dlq` and keeps its `Errors` alarm.
- `AnalyticsDashboard.java` drops `this.scheduleRule` and `this.deadLetterQueue` and keeps
  its `Errors` alarm.
- All five `*-dlq-depth` alarms go.

Delete these outright. Do not leave the rules disabled or the DLQs orphaned.

Replay is now a state machine execution with an explicit date, which is strictly better
than a DLQ: it re-runs the whole chain in order rather than one job in isolation.

## New alarm

`{env}-env-analytics-nightly-failed`: `AWS/States` `ExecutionsFailed` on the state machine,
sum over 24 hours, threshold 1, `TreatMissingData.NOT_BREACHING`, no SNS action.

Also add `{env}-env-analytics-nightly-missed`: `ExecutionsStarted` sum over 26 hours in
prod, `LESS_THAN_THRESHOLD` 1, `TreatMissingData.BREACHING`. This catches the schedule
silently not firing, which the current design cannot see at all. Skip this alarm in ci,
where the cadence is weekly.

## Test strategy

Unit tier: none. This phase writes no application code.

CDK tier: the state machine exists with the five tasks in the right order; the parallel
branch holds exactly three; the metrics publish task is downstream of every ingestion task;
no `AWS::Events::Rule` remains for any of the five jobs; no `AWS::SQS::Queue` remains for
them; the scheduler target points at the state machine ARN; both alarms exist with no
`AlarmActions`. `SubmitEnvironmentCdkResourceTest` resource counts move, so update the
counts and the comment that explains them.

System, browser and behaviour tiers: nothing.

## Verification criterion

`aws stepfunctions start-execution --state-machine-arn <prod arn> --input '{}'` reaches
`SUCCEEDED`, and the execution history shows all five tasks succeeded. Then the next
morning's scheduled run also shows `SUCCEEDED` with no manual start.

---

# Phase 4: cross-source reconciliation

**Status: code done 2026-09-01, unit and CDK tests green.** Live verification
(`v_purchase_reconciliation_daily` returning rows, the three new metrics appearing
in the `Submit/Analytics` namespace) needs a deploy and a nightly run.

**Model: Sonnet.**

Three independent sources now hold a count of the same thing: GA4 says how many purchases
the browser saw, Stripe says how many charges were paid, and our own activity events say
how many checkouts completed. Putting them side by side is what "one queryable place"
buys.

## Files owned

- `infra/main/resources/analytics/views/v_ga4_funnel_daily.sql` (new)
- `infra/main/resources/analytics/views/v_purchase_reconciliation_daily.sql` (new)
- `infra/main/java/co/uk/diyaccounting/submit/stacks/analytics/BusinessViews.java` (edit)
- `infra/test/java/co/uk/diyaccounting/submit/stacks/analytics/BusinessViewsTest.java` (edit)
- `app/functions/analytics/analyticsMetricsPublish.js` (edit)
- `app/unit-tests/analytics/analyticsMetricsPublish.test.js` (edit)
- `infra/main/java/co/uk/diyaccounting/submit/stacks/analytics/AnalyticsDashboard.java` (edit)

## Views

`v_ga4_funnel_daily`, one row per day, counting distinct sessions that reached each step. A
session key is `user_pseudo_id` and `ga_session_id` joined, because `ga_session_id` alone
repeats across users.

```sql
CREATE OR REPLACE VIEW v_ga4_funnel_daily AS
SELECT dt AS day,
       count(distinct if(event_name = 'session_start',   session_key, null)) AS sessions,
       count(distinct if(event_name = 'login',           session_key, null)) AS logins,
       count(distinct if(event_name = 'begin_checkout',  session_key, null)) AS checkouts,
       count(distinct if(event_name = 'purchase',        session_key, null)) AS purchases
FROM   (SELECT dt, event_name,
               concat(user_pseudo_id, '.', cast(ga_session_id as varchar)) AS session_key
        FROM   ga4_bq_events)
GROUP  BY 1
```

`v_purchase_reconciliation_daily`, one row per day, three counts and the two gaps.

```sql
CREATE OR REPLACE VIEW v_purchase_reconciliation_daily AS
WITH ga4 AS (
  SELECT day, purchases FROM v_ga4_funnel_daily
),
stripe AS (
  SELECT date(from_unixtime(created)) AS day, count(*) AS paid_charges
  FROM   stripe_charges WHERE paid = true GROUP BY 1
),
activity AS (
  SELECT date(event_ts) AS day, count(*) AS subscriptions_activated
  FROM   activity_events_all
  WHERE  event = 'subscription-activated' AND actor = 'customer'
  GROUP  BY 1
)
SELECT coalesce(ga4.day, stripe.day, activity.day)          AS day,
       coalesce(ga4.purchases, 0)                           AS ga4_purchases,
       coalesce(stripe.paid_charges, 0)                     AS stripe_paid_charges,
       coalesce(activity.subscriptions_activated, 0)        AS activity_activations,
       coalesce(ga4.purchases, 0) - coalesce(stripe.paid_charges, 0)   AS ga4_minus_stripe,
       coalesce(activity.subscriptions_activated, 0) - coalesce(stripe.paid_charges, 0) AS activity_minus_stripe
FROM        ga4
FULL JOIN   stripe   ON ga4.day = stripe.day
FULL JOIN   activity ON coalesce(ga4.day, stripe.day) = activity.day
```

The three numbers will not match exactly and are not meant to. GA4 misses consented-out
visitors, Stripe counts renewals that no browser session produced, and our activity events
count only what the webhook processed. The gaps are the signal. A day where Stripe has
charges and activity has none means the webhook path broke.

The `actor = 'customer'` filter matches `billingWebhookPost.js:164`, which sets `customer`
for real traffic and `test-user` for test traffic.

## Metrics

Three new entries in `METRIC_DEFINITIONS` in `analyticsMetricsPublish.js`, reading
`v_purchase_reconciliation_daily`: `Ga4Purchases`, `StripePaidCharges`,
`ActivityActivations`. Do not publish the two gap columns as metrics. A gap is meaningful
against its two sides, and a difference metric alone reads as noise on a dashboard.

That takes the namespace to 23 metrics. The 20-metric guidance in
`PLAN_USAGE_DATA_PIPELINE.md` was a cost guard at $0.30 per metric, so this adds $0.90 a
month. Record the new count in the comment above `METRIC_DEFINITIONS`.

Add one dashboard widget in `AnalyticsDashboard.java` plotting the three together, so a
divergence is visible without a query.

## Test strategy

Unit tier: the three new metric definitions parse their Athena result rows correctly,
including a day where a source returns no row and the metric must be zero rather than
absent.

CDK tier: `BusinessViewsTest` asserts the two new view resources exist and that their SQL
resources load.

System, browser and behaviour tiers: nothing.

## Verification criterion

`SELECT * FROM v_purchase_reconciliation_daily ORDER BY day DESC LIMIT 14` returns rows,
and the `Submit/Analytics` namespace shows the three new metrics after the next nightly
run.

---

# Phase 5: stop the duplicate CloudFront delivery

**Model: Sonnet.** Small, and independent of phases 2 to 4.

Every CloudFront access log is delivered twice today. `EdgeStack.java:578` enables classic
standard logging into the env log bucket under `cf-standard-logs/<deployment>/` as gzipped
TSV, and `EdgeStack.java:601` sets up v2 delivery of the same records into the lake as
Parquet. Only the Parquet copy has a Glue table. Nothing reads the TSV copy.

## Files owned

- `infra/main/java/co/uk/diyaccounting/submit/stacks/EdgeStack.java` (edit)
- `infra/main/java/co/uk/diyaccounting/submit/stacks/analytics/CloudFrontAccessLogs.java` (edit)
- `infra/test/java/co/uk/diyaccounting/submit/stacks/analytics/CloudFrontAccessLogsTest.java` (edit)
- `infra/test/java/co/uk/diyaccounting/submit/SubmitApplicationCdkResourceTest.java` (edit)

## What changes

Drop `.enableLogging(true)`, `.logBucket(...)` and `.logFilePrefix(...)` from the
`Distribution` builder. Drop the `Bucket.fromBucketName` import of the classic log bucket
from `EdgeStack`. In `CloudFrontAccessLogs.java`, delete the classic ACL-enabled bucket and
the comment explaining its `OBJECT_WRITER` ownership, and keep the lake bucket policy, the
Glue table and the delivery wiring.

Update the comment at `EdgeStack.java:601` that calls the v2 path "complementing" the
classic one. It is now the only path.

**Gate this phase on phase 1.** Do not delete the classic path until phase 1 has shown
`cloudfront_requests` returning rows for the last seven days in prod. If phase 1 shows the
v2 delivery is not working, fixing that is phase 1's remainder and this phase waits.

## Test strategy

CDK tier: `SubmitApplicationCdkResourceTest` asserts the distribution has no `Logging`
property; `CloudFrontAccessLogsTest` asserts no `AWS::S3::Bucket` with
`ObjectOwnership: ObjectWriter` remains. Bucket counts in both resource tests move, so
update them and the comments explaining the counts.

Behaviour tier: run `npm run test:submitVatBehaviour-ci` after the ci deploy. Changing a
`Distribution` property replaces nothing but does trigger a distribution update, and the
behaviour suite is the check that the site still serves.

## Verification criterion

After a ci deploy, no new objects appear under `cf-standard-logs/` in the env log bucket,
and `SELECT count(*) FROM cloudfront_requests WHERE year = ... AND month = ... AND day = ...`
still returns a non-zero count for the day after the deploy.

---

# Phase 6: Stripe reconciliation

**Status: verified 2026-09-01, no code change needed.** `stripeReconcile.js` already
calls the shared `getStripeClient()` from `app/lib/stripeClient.js` (the same
resolver `billingWebhookPost.js`/`billingCheckoutPost.js`/`billingPortalGet.js`
use), and `IngestionStack`/`BillingWebhookStack` already receive the identical
`stripeSecretKeyArn`/`stripeTestSecretKeyArn` from `SubmitEnvironment.java` with
the same `secretsmanager:GetSecretValue` wildcard-suffix grant shape. The "What
changes" section below already describes the shipped state; the existing unit
test (`mockGetStripeClient` called with `{test: true/false}`) and CDK test
(`stripeReconciliationGetsScopedSecretAndSaltGrantsOnlyWhenArnsAreConfigured`)
already cover it. 20/20 and 1/1 rerun green.

**Model: Sonnet.** No longer gated on the operator — reuses the existing key.

Operator decision 2026-09-01: reuse the existing full `STRIPE_SECRET_KEY_ARN` /
`STRIPE_TEST_SECRET_KEY_ARN` (the same key the billing Lambdas use to create checkout
sessions and cancel subscriptions) rather than minting narrower read-only restricted keys.
Accepted risk, to avoid adding two more keys to rotate manually.

## Files owned

- `infra/main/java/co/uk/diyaccounting/submit/stacks/IngestionStack.java` (edit)
- `infra/test/java/co/uk/diyaccounting/submit/stacks/IngestionStackTest.java` (edit)
- `app/functions/analytics/stripeReconcile.js` (edit)
- `app/unit-tests/analytics/stripeReconcile.test.js` (edit)

## What changes

`IngestionStack` wires the reconciliation Lambda to the same `stripeSecretKeyArn` /
`stripeTestSecretKeyArn` props already granted to the billing Lambdas — no new secret, no
new `create-secrets` step, no prop rename.

`stripeReconcile.js` reads `STRIPE_SECRET_KEY_ARN` / `STRIPE_TEST_SECRET_KEY_ARN`, the same
env vars the billing path already resolves. Check whether `app/lib/stripeClient.js` already
exposes a shared resolver before adding a new one.

## Test strategy

Unit tier: the job resolves the same ARN the billing path uses.

CDK tier: the reconciliation Lambda's `secretsmanager:GetSecretValue` grant matches the
billing Lambdas' (same secret, read-only API calls made against it — no write scope check
needed since the key already has write capability by design).

## Verification criterion

A manual invoke of `prod-env-stripe-reconcile` writes the same three entity files it wrote
before the change.

---

# Order and serialisation

`IngestionStack.java` is edited by phases 2, 3 and 6. `AnalyticsDashboard.java` is edited
by phases 3 and 4. Run those in sequence, not in parallel worktrees.

1. **Phase 1** alone. It gates phase 5 and tells every later phase whether its assumptions
   hold.
2. **Phase 2**, then **phase 3**, then **phase 4**, in sequence. Phase 4 needs phase 2's
   table and phase 3's ordering.
3. **Phase 5** in a parallel worktree once phase 1 is green. It shares no files with 2, 3
   or 4.
4. **Phase 6** can run any time — no operator gate.

Run `./mvnw clean verify` after every merge that touches
`SubmitEnvironmentCdkResourceTest.java` or `SubmitApplicationCdkResourceTest.java`. Their
resource counts move in phases 2, 3 and 5, and two phases changing the same assertion
conflict semantically even when git merges cleanly.
